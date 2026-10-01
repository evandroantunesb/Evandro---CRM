/**
 * Dimensionamento automático do kit (fase 1 do redesenho do "Adicionar
 * negócio" — ver especificação V2 enviada pelo Evandro em 2026-09-30).
 *
 * Escopo desta fase: escolhe módulo + inversor entre os equipamentos ativos
 * da empresa (`equipamentos_empresa`) a partir do consumo informado, calcula
 * o overload (relação DC/AC) de cada combinação e, quando o catálogo tem os
 * campos elétricos (Voc/Isc/Vmp/Imp, faixa de MPPT), valida também o
 * arranjo de strings: tensão de circuito aberto no frio dentro do limite do
 * inversor e tensão de MPPT da string dentro da faixa de operação. Overload
 * acima do limite não bloqueia (é decisão comercial, só alerta); string
 * eletricamente incompatível bloqueia (é risco de queimar equipamento).
 * Sem os campos elétricos, a opção fica marcada como "não verificada" e
 * segue disponível — não trava quem ainda não cadastrou datasheet completo.
 */

export type EquipamentoAtivo = {
  id: string;
  fabricante: string;
  modelo: string;
  potenciaW: number;
  prioridade: number;
  // Módulo — datasheet em STC.
  vocV?: number | null;
  iscA?: number | null;
  vmpV?: number | null;
  impA?: number | null;
  coefTempVocPctC?: number | null;
  // Inversor.
  tensaoMaxDcV?: number | null;
  mpptMinV?: number | null;
  mpptMaxV?: number | null;
  correnteMaxEntradaA?: number | null;
  quantidadeMppt?: number | null;
};

/** Formato de `equipamentos_empresa` como vem do Supabase (snake_case). */
export type EquipamentoEmpresaRegistro = {
  id: string;
  fabricante: string;
  modelo: string;
  potencia_w: number;
  prioridade: number;
  voc_v: number | null;
  isc_a: number | null;
  vmp_v: number | null;
  imp_a: number | null;
  coef_temp_voc_pct_c: number | null;
  tensao_max_dc_v: number | null;
  mppt_min_v: number | null;
  mppt_max_v: number | null;
  corrente_max_entrada_a: number | null;
  quantidade_mppt: number | null;
};

/** Converte um registro de `equipamentos_empresa` pro formato que o motor de dimensionamento espera. */
export function paraEquipamentoAtivo(e: EquipamentoEmpresaRegistro): EquipamentoAtivo {
  return {
    id: e.id,
    fabricante: e.fabricante,
    modelo: e.modelo,
    potenciaW: e.potencia_w,
    prioridade: e.prioridade,
    vocV: e.voc_v,
    iscA: e.isc_a,
    vmpV: e.vmp_v,
    impA: e.imp_a,
    coefTempVocPctC: e.coef_temp_voc_pct_c,
    tensaoMaxDcV: e.tensao_max_dc_v,
    mpptMinV: e.mppt_min_v,
    mpptMaxV: e.mppt_max_v,
    correnteMaxEntradaA: e.corrente_max_entrada_a,
    quantidadeMppt: e.quantidade_mppt,
  };
}

export type ConfiguracaoString = {
  modulosPorString: number;
  quantidadeStrings: number;
  vocFrioV: number;
  vmpStringV: number;
};

export type OpcaoSistemaAutomatico = {
  modulo: EquipamentoAtivo;
  inversor: EquipamentoAtivo;
  quantidadeModulos: number;
  potenciaDcKwp: number;
  potenciaAcKw: number;
  /** Pdc/Pac puro (ex.: 2,108 para 10,54 kWp num inversor de 5 kW) — não confundir com `overloadPct`. */
  dcAcRatio: number;
  /** `dcAcRatio - 1` (ex.: 1,108 = 110,8% de overload) — Evandro achou (2026-09-30) a UI mostrando
   * `dcAcRatio` sob o rótulo "overload"; os dois ficam separados aqui pra não repetir a confusão. */
  overloadPct: number;
  /** 'valido' (≤ `overloadMaximoPct`), 'alerta' (entre os dois limites) ou 'critico' (acima
   * de `overloadCriticoPct`) — nenhuma das três bloqueia a escolha manual, só muda a
   * sinalização visual (Evandro, 2026-10-01). */
  validacao: "valido" | "alerta" | "critico";
  /** 'nao_verificado': catálogo sem dados elétricos suficientes pra checar a string.
   * 'incompativel': dados elétricos existem, mas nenhum arranjo de string é seguro —
   * ver `motivoIncompatibilidade` (Evandro, 2026-10-01: expor o motivo em vez de só
   * descartar em silêncio, pra uso futuro na UI de escolha manual). */
  validacaoEletrica: "valido" | "nao_verificado" | "incompativel";
  /** Preenchido só quando `validacaoEletrica === "incompativel"`: razão curta e específica
   * (limite de tensão do inversor, faixa de MPPT, corrente de entrada etc.). */
  motivoIncompatibilidade?: string;
  stringConfig: ConfiguracaoString | null;
};

const OVERLOAD_ALVO_PCT = 0.15;
const TEMPERATURA_REFERENCIA_STC_C = 25;

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

type ResultadoConfiguracaoString =
  | { tipo: "ok"; config: ConfiguracaoString }
  | { tipo: "nao_verificado" }
  | { tipo: "incompativel"; motivo: string };

/**
 * Procura um arranjo de módulos em série (string) compatível com o inversor:
 * Voc no frio dentro do limite de tensão DC, e Vmp da string dentro da faixa
 * de MPPT. Prefere o maior número de módulos por string que ainda cumpre os
 * dois limites (menos strings, menos conectores/fusíveis). Quando corrente
 * máxima de entrada e quantidade de MPPTs também estão cadastradas, exige
 * que as strings caibam nas entradas sem estourar a corrente.
 *
 * Retorna `{ tipo: "nao_verificado" }` quando falta algum dado elétrico pra
 * verificar (catálogo incompleto), e `{ tipo: "incompativel", motivo }` quando
 * os dados existem mas nenhum arranjo é eletricamente compatível — o motivo
 * identifica qual limite (tensão do inversor, faixa de MPPT ou corrente) foi
 * o responsável, pra exibir ao vendedor em vez de só reprovar em silêncio
 * (Evandro, 2026-10-01).
 */
function encontrarConfiguracaoString(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  quantidadeModulos: number,
  temperaturaMinimaProjetoC: number,
): ResultadoConfiguracaoString {
  const { vocV, vmpV, coefTempVocPctC } = modulo;
  const { tensaoMaxDcV, mpptMinV, mpptMaxV } = inversor;
  if (
    vocV == null ||
    vmpV == null ||
    coefTempVocPctC == null ||
    tensaoMaxDcV == null ||
    mpptMinV == null ||
    mpptMaxV == null
  ) {
    return { tipo: "nao_verificado" };
  }

  const fatorTemperatura = 1 + (coefTempVocPctC / 100) * (temperaturaMinimaProjetoC - TEMPERATURA_REFERENCIA_STC_C);

  let melhor: ConfiguracaoString | null = null;
  let correnteExcedida = false;
  for (let modulosPorString = quantidadeModulos; modulosPorString >= 1; modulosPorString--) {
    const vocFrioV = arredondar(vocV * fatorTemperatura * modulosPorString, 2);
    const vmpStringV = arredondar(vmpV * modulosPorString, 2);
    if (vocFrioV > tensaoMaxDcV) continue;
    if (vmpStringV < mpptMinV || vmpStringV > mpptMaxV) continue;

    const quantidadeStrings = Math.ceil(quantidadeModulos / modulosPorString);
    if (inversor.correnteMaxEntradaA != null && inversor.quantidadeMppt != null && modulo.impA != null) {
      const stringsPorMppt = Math.ceil(quantidadeStrings / inversor.quantidadeMppt);
      if (modulo.impA * stringsPorMppt > inversor.correnteMaxEntradaA) {
        correnteExcedida = true;
        continue;
      }
    }

    melhor = { modulosPorString, quantidadeStrings, vocFrioV, vmpStringV };
    break;
  }

  if (melhor) return { tipo: "ok", config: melhor };

  // Nenhum arranjo passou — identifica o motivo mais específico pra reportar.
  const vocFrioComUmModulo = arredondar(vocV * fatorTemperatura, 2);
  if (vocFrioComUmModulo > tensaoMaxDcV) {
    return {
      tipo: "incompativel",
      motivo: `Tensão Voc a frio (${vocFrioComUmModulo}V, mesmo com 1 módulo por string) excede o limite de tensão DC do inversor (${tensaoMaxDcV}V).`,
    };
  }

  const maxModulosPorStringPelaVoc = Math.floor(tensaoMaxDcV / (vocV * fatorTemperatura));
  const vmpNoLimiteDeVoc = arredondar(vmpV * Math.max(maxModulosPorStringPelaVoc, 1), 2);
  if (vmpV > mpptMaxV) {
    return {
      tipo: "incompativel",
      motivo: `Tensão da string excede a faixa de MPPT do inversor (${mpptMinV}–${mpptMaxV}V) mesmo com 1 módulo por string.`,
    };
  }
  if (vmpNoLimiteDeVoc < mpptMinV) {
    return {
      tipo: "incompativel",
      motivo: `Tensão da string (${vmpNoLimiteDeVoc}V no máximo de módulos permitido pela tensão Voc) fica abaixo da faixa de MPPT do inversor (${mpptMinV}–${mpptMaxV}V).`,
    };
  }
  if (correnteExcedida) {
    return {
      tipo: "incompativel",
      motivo: `Corrente de entrada do MPPT excedida (limite de ${inversor.correnteMaxEntradaA}A por MPPT) para o número de strings necessário.`,
    };
  }
  return {
    tipo: "incompativel",
    motivo: "Nenhum arranjo de módulos por string fica dentro da faixa de tensão do MPPT do inversor.",
  };
}

const CAMPOS_TECNICOS_MODULO: { chave: keyof EquipamentoAtivo; rotulo: string }[] = [
  { chave: "vocV", rotulo: "Voc (V)" },
  { chave: "vmpV", rotulo: "Vmp (V)" },
  { chave: "iscA", rotulo: "Isc (A)" },
  { chave: "impA", rotulo: "Imp (A)" },
  { chave: "coefTempVocPctC", rotulo: "Coeficiente de temperatura do Voc (%/°C)" },
];

const CAMPOS_TECNICOS_INVERSOR: { chave: keyof EquipamentoAtivo; rotulo: string }[] = [
  { chave: "tensaoMaxDcV", rotulo: "Tensão DC máxima (V)" },
  { chave: "mpptMinV", rotulo: "MPPT mínimo (V)" },
  { chave: "mpptMaxV", rotulo: "MPPT máximo (V)" },
  { chave: "correnteMaxEntradaA", rotulo: "Corrente máxima por MPPT (A)" },
  { chave: "quantidadeMppt", rotulo: "Quantidade de MPPTs" },
];

/**
 * Evandro pediu (2026-09-30) que "String/MPPT não verificados" diga quais campos
 * específicos faltam, em vez de só apontar que falta algo. Mesma lista de campos que
 * `encontrarConfiguracaoString` usa pra decidir "não verificado" (mais os opcionais de
 * corrente/MPPT usados na checagem extra), então o rótulo nunca aponta um campo que o
 * motor não confere de verdade.
 */
export function camposTecnicosFaltantes(modulo: EquipamentoAtivo, inversor: EquipamentoAtivo): string[] {
  const faltantes: string[] = [];
  for (const { chave, rotulo } of CAMPOS_TECNICOS_MODULO) {
    if (modulo[chave] == null) faltantes.push(rotulo);
  }
  for (const { chave, rotulo } of CAMPOS_TECNICOS_INVERSOR) {
    if (inversor[chave] == null) faltantes.push(rotulo);
  }
  return faltantes;
}

function montarOpcao(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  quantidadeModulos: number,
  overloadMaximoPct: number,
  overloadCriticoPct: number,
  temperaturaMinimaProjetoC: number,
): OpcaoSistemaAutomatico {
  const potenciaDcKwp = arredondar((quantidadeModulos * modulo.potenciaW) / 1000, 2);
  const potenciaAcKw = arredondar(inversor.potenciaW / 1000, 2);
  const dcAcRatio = arredondar((potenciaDcKwp * 1000) / inversor.potenciaW, 4);
  const overloadPct = arredondar(dcAcRatio - 1, 4);

  const resultado = encontrarConfiguracaoString(modulo, inversor, quantidadeModulos, temperaturaMinimaProjetoC);

  const validacao: OpcaoSistemaAutomatico["validacao"] =
    overloadPct <= overloadMaximoPct ? "valido" : overloadPct <= overloadCriticoPct ? "alerta" : "critico";

  const base = {
    modulo,
    inversor,
    quantidadeModulos,
    potenciaDcKwp,
    potenciaAcKw,
    dcAcRatio,
    overloadPct,
    validacao,
  };

  if (resultado.tipo === "incompativel") {
    return {
      ...base,
      validacaoEletrica: "incompativel",
      motivoIncompatibilidade: resultado.motivo,
      stringConfig: null,
    };
  }

  return {
    ...base,
    validacaoEletrica: resultado.tipo === "ok" ? "valido" : "nao_verificado",
    stringConfig: resultado.tipo === "ok" ? resultado.config : null,
  };
}

function avaliarCombinacao(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  potenciaAlvoKwp: number,
  overloadMaximoPct: number,
  overloadCriticoPct: number,
  temperaturaMinimaProjetoC: number,
): OpcaoSistemaAutomatico {
  const quantidadeModulos = Math.max(1, Math.ceil((potenciaAlvoKwp * 1000) / modulo.potenciaW));
  return montarOpcao(modulo, inversor, quantidadeModulos, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC);
}

/**
 * Valida uma combinação módulo+inversor+quantidade escolhida (ou ajustada) manualmente
 * pelo vendedor — na criação (troca a opção sugerida) ou na edição do sistema — pelas
 * mesmas regras elétricas do motor automático (Voc no frio, faixa de MPPT, corrente,
 * overload). É a mesma fonte de verdade usada por `dimensionarSistemaAutomatico`, só que
 * sem derivar a quantidade a partir do consumo: quem decide a quantidade aqui é o vendedor,
 * não a meta de potência. Retorna `null` só quando a quantidade é inválida (≤ 0); quando o
 * arranjo elétrico não é seguro, retorna a opção mesmo assim, com `validacaoEletrica:
 * "incompativel"` e `motivoIncompatibilidade` preenchido, pra quem chama decidir o que
 * mostrar (Evandro, 2026-10-01 — antes isso só retornava `null`, sem dizer o motivo).
 */
export function avaliarCombinacaoEscolhida(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  quantidadeModulos: number,
  overloadMaximoPct: number,
  overloadCriticoPct: number,
  temperaturaMinimaProjetoC: number,
): OpcaoSistemaAutomatico | null {
  if (!Number.isInteger(quantidadeModulos) || quantidadeModulos <= 0) return null;
  return montarOpcao(modulo, inversor, quantidadeModulos, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC);
}

/**
 * Retorna até 3 opções (1 recomendada + até 2 alternativas), ranqueadas por:
 * prioridade comercial do equipamento (maior primeiro), depois overload mais
 * próximo de um "ponto ideal" (nem sistema subdimensionado, nem inversor
 * superdimensionado à toa). Combinações acima de `overloadMaximoPct` ou
 * eletricamente incompatíveis NUNCA entram aqui (Evandro, 2026-09-30: overload
 * acima do limite é risco de engenharia, não preferência — só pode existir
 * como override manual explícito, nunca como sugestão automática). Quando
 * nenhuma combinação passa no limite, retorna `[]`; quem chama mostra que não
 * há kit automático pra esse consumo com o catálogo atual.
 */
export function dimensionarSistemaAutomatico(params: {
  consumoMedioKwh: number;
  margemPct: number;
  produtividadeKwhKwpMes: number;
  modulos: EquipamentoAtivo[];
  inversores: EquipamentoAtivo[];
  overloadMaximoPct: number;
  overloadCriticoPct: number;
  temperaturaMinimaProjetoC: number;
}): OpcaoSistemaAutomatico[] {
  const {
    consumoMedioKwh,
    margemPct,
    produtividadeKwhKwpMes,
    modulos,
    inversores,
    overloadMaximoPct,
    overloadCriticoPct,
    temperaturaMinimaProjetoC,
  } = params;
  if (consumoMedioKwh <= 0 || produtividadeKwhKwpMes <= 0 || !modulos.length || !inversores.length) return [];

  const potenciaAlvoKwp = (consumoMedioKwh * (1 + margemPct)) / produtividadeKwhKwpMes;

  const opcoes = modulos.flatMap((modulo) =>
    inversores
      .map((inversor) =>
        avaliarCombinacao(modulo, inversor, potenciaAlvoKwp, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC),
      )
      .filter((opcao) => opcao.validacao === "valido" && opcao.validacaoEletrica !== "incompativel"),
  );

  opcoes.sort((a, b) => {
    const prioridade = b.modulo.prioridade + b.inversor.prioridade - (a.modulo.prioridade + a.inversor.prioridade);
    if (prioridade !== 0) return prioridade;
    return Math.abs(a.overloadPct - OVERLOAD_ALVO_PCT) - Math.abs(b.overloadPct - OVERLOAD_ALVO_PCT);
  });

  // No máximo 1 alternativa por módulo (evita 3 opções que só trocam o
  // inversor e parecem redundantes pro vendedor).
  const escolhidas: OpcaoSistemaAutomatico[] = [];
  for (const opcao of opcoes) {
    if (escolhidas.some((e) => e.modulo.id === opcao.modulo.id)) continue;
    escolhidas.push(opcao);
    if (escolhidas.length === 3) break;
  }
  return escolhidas;
}
