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
 *
 * Fase 3 da reconciliação (Evandro, 2026-10-01) acrescenta o gate de rede elétrica: o motor
 * nunca assume monofásico/bifásico/trifásico nem a tensão da rede por conta própria — ver
 * `RedeEletricaConfirmada` e `avaliarRedeEletrica` mais abaixo.
 */

import type { TipoLigacao } from "./tipos";
import { ROTULO_TIPO_LIGACAO } from "./tipos";

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
  /** Fases do lado CA do inversor, como cadastrado no catálogo. O enum do banco só tem
   * "monofasico"/"trifasico" — ligação bifásica do cliente usa o mesmo inversor monofásico
   * (prática do setor: o inversor só "vê" 2 fios na saída CA independente de a concessionária
   * chamar a ligação de mono ou bifásica). Ver `avaliarRedeEletrica`. */
  fasesCa?: FasesCaInversor | null;
  /** Tensão CA nominal do inversor (V), quando cadastrada. */
  tensaoAcV?: number | null;
};

/** Fases do lado CA de um inversor — mesmo enum de `fases_ca_equipamento` no banco. */
export type FasesCaInversor = "monofasico" | "trifasico";

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
  /** Opcionais (ausentes em `EquipamentoEmpresaRegistro` de módulo e em dados antigos de teste)
   * pra não quebrar quem já monta esse registro sem esses dois campos. */
  fases_ca?: FasesCaInversor | null;
  tensao_ac_v?: number | null;
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
    fasesCa: e.fases_ca,
    tensaoAcV: e.tensao_ac_v,
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
  /** Compatibilidade do inversor com a rede do cliente (fases/tensão) — independente da
   * validação de string acima. 'pendente_confirmacao_rede': `tipoLigacao` ainda não foi
   * confirmado pelo vendedor, então o motor não arrisca aprovar nem reprovar o inversor nesse
   * quesito. 'nao_verificado': rede confirmada, mas o catálogo não tem `fasesCa` cadastrado pro
   * inversor. 'incompativel': rede confirmada e incompatível — ver `motivoIncompatibilidadeRede`.
   * 'valido': rede confirmada e compatível (Evandro, 2026-10-01). */
  validacaoRede: "pendente_confirmacao_rede" | "valido" | "nao_verificado" | "incompativel";
  /** Preenchido só quando `validacaoRede === "incompativel"`. */
  motivoIncompatibilidadeRede?: string;
};

/**
 * Tipo de ligação (e, opcionalmente, tensão nominal) da rede do cliente, já confirmados pelo
 * vendedor — nunca um valor assumido pelo sistema. Passar `undefined` (ou omitir) pra
 * `dimensionarSistemaAutomatico`/`avaliarCombinacaoEscolhida` sinaliza "ainda não confirmado":
 * o motor calcula potência DC e quantidade de módulos normalmente (não dependem da rede), mas
 * marca `validacaoRede: "pendente_confirmacao_rede"` em vez de validar o inversor contra uma
 * suposição (Evandro, 2026-10-01 — pedido explícito pra nunca assumir mono/bi/trifásico
 * silenciosamente).
 */
export type RedeEletricaConfirmada = {
  tipoLigacao: TipoLigacao;
  /** Tensão nominal informada pelo vendedor (ex.: 127, 220, 380), quando já souber. Quando
   * ausente, só o número de fases é conferido contra o inversor. */
  tensaoRedeV?: number | null;
};

/**
 * Mapeia `tipoLigacao` (como o vendedor confirma, com bifásico como opção própria) pro enum
 * `fases_ca_equipamento` do catálogo (que só tem monofásico/trifásico). Bifásico mapeia pra
 * "monofasico" porque, na prática do setor, o mesmo inversor monofásico atende ligações mono e
 * bifásicas (a diferença de fiação é da concessionária, não do inversor) — **essa equivalência é
 * uma decisão técnica da calculadora solar e deve ser confirmada pelo Evandro antes de virar
 * regra definitiva** (CLAUDE.md: "nunca decida sozinho dado técnico da calculadora solar").
 */
const FASES_CA_ESPERADA_POR_TIPO_LIGACAO: Record<TipoLigacao, FasesCaInversor> = {
  monofasico: "monofasico",
  bifasico: "monofasico",
  trifasico: "trifasico",
};

/**
 * Confere se o inversor é compatível com a rede do cliente. Roda independente da validação de
 * string (DC): um inversor pode ter string eletricamente válida e mesmo assim ser o tipo errado
 * de fase pra rede do cliente, ou vice-versa.
 */
export function avaliarRedeEletrica(
  inversor: EquipamentoAtivo,
  redeEletrica: RedeEletricaConfirmada | null | undefined,
): { validacaoRede: OpcaoSistemaAutomatico["validacaoRede"]; motivoIncompatibilidadeRede?: string } {
  if (!redeEletrica) return { validacaoRede: "pendente_confirmacao_rede" };

  if (inversor.fasesCa == null) return { validacaoRede: "nao_verificado" };

  const fasesEsperadas = FASES_CA_ESPERADA_POR_TIPO_LIGACAO[redeEletrica.tipoLigacao];
  if (inversor.fasesCa !== fasesEsperadas) {
    return {
      validacaoRede: "incompativel",
      motivoIncompatibilidadeRede: `Ligação ${ROTULO_TIPO_LIGACAO[redeEletrica.tipoLigacao]} precisa de um inversor ${fasesEsperadas}, mas o inversor cadastrado é ${inversor.fasesCa}.`,
    };
  }

  if (redeEletrica.tensaoRedeV != null && inversor.tensaoAcV != null && redeEletrica.tensaoRedeV !== inversor.tensaoAcV) {
    return {
      validacaoRede: "incompativel",
      motivoIncompatibilidadeRede: `Tensão da rede informada (${redeEletrica.tensaoRedeV}V) não bate com a tensão CA cadastrada no inversor (${inversor.tensaoAcV}V).`,
    };
  }

  return { validacaoRede: "valido" };
}

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
  redeEletrica: RedeEletricaConfirmada | null | undefined,
): OpcaoSistemaAutomatico {
  const potenciaDcKwp = arredondar((quantidadeModulos * modulo.potenciaW) / 1000, 2);
  const potenciaAcKw = arredondar(inversor.potenciaW / 1000, 2);
  const dcAcRatio = arredondar((potenciaDcKwp * 1000) / inversor.potenciaW, 4);
  const overloadPct = arredondar(dcAcRatio - 1, 4);

  const resultado = encontrarConfiguracaoString(modulo, inversor, quantidadeModulos, temperaturaMinimaProjetoC);
  const { validacaoRede, motivoIncompatibilidadeRede } = avaliarRedeEletrica(inversor, redeEletrica);

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
    validacaoRede,
    motivoIncompatibilidadeRede,
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
  redeEletrica: RedeEletricaConfirmada | null | undefined,
): OpcaoSistemaAutomatico {
  const quantidadeModulos = Math.max(1, Math.ceil((potenciaAlvoKwp * 1000) / modulo.potenciaW));
  return montarOpcao(modulo, inversor, quantidadeModulos, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC, redeEletrica);
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
 *
 * `redeEletrica` é opcional e, quando omitido/`undefined`, deixa `validacaoRede` como
 * `"pendente_confirmacao_rede"` — ver `RedeEletricaConfirmada` (Fase 3, 2026-10-01: o motor
 * nunca assume o tipo de ligação do cliente).
 */
export function avaliarCombinacaoEscolhida(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  quantidadeModulos: number,
  overloadMaximoPct: number,
  overloadCriticoPct: number,
  temperaturaMinimaProjetoC: number,
  redeEletrica?: RedeEletricaConfirmada | null,
): OpcaoSistemaAutomatico | null {
  if (!Number.isInteger(quantidadeModulos) || quantidadeModulos <= 0) return null;
  return montarOpcao(modulo, inversor, quantidadeModulos, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC, redeEletrica);
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
 *
 * `redeEletrica`, quando omitido (rede ainda não confirmada pelo vendedor), não é motivo pra
 * reprovar combinação nenhuma: potência DC e quantidade de módulos não dependem da rede, então
 * o cálculo segue normal, só sem aprovar o inversor pelo critério de rede (`validacaoRede:
 * "pendente_confirmacao_rede"`, ver `avaliarRedeEletrica`). Só uma incompatibilidade de rede
 * CONFIRMADA (`validacaoRede === "incompativel"`) é tratada como a incompatibilidade elétrica
 * de string: nunca entra como sugestão automática.
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
  redeEletrica?: RedeEletricaConfirmada | null;
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
    redeEletrica,
  } = params;
  if (consumoMedioKwh <= 0 || produtividadeKwhKwpMes <= 0 || !modulos.length || !inversores.length) return [];

  const potenciaAlvoKwp = (consumoMedioKwh * (1 + margemPct)) / produtividadeKwhKwpMes;

  const opcoes = modulos.flatMap((modulo) =>
    inversores
      .map((inversor) =>
        avaliarCombinacao(modulo, inversor, potenciaAlvoKwp, overloadMaximoPct, overloadCriticoPct, temperaturaMinimaProjetoC, redeEletrica),
      )
      .filter(
        (opcao) =>
          opcao.validacao === "valido" && opcao.validacaoEletrica !== "incompativel" && opcao.validacaoRede !== "incompativel",
      ),
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
