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
  overloadPct: number;
  validacao: "valido" | "valido_com_alerta";
  validacaoEletrica: "valido" | "nao_verificado";
  stringConfig: ConfiguracaoString | null;
};

const OVERLOAD_ALVO_PCT = 0.15;
const TEMPERATURA_REFERENCIA_STC_C = 25;

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * Procura um arranjo de módulos em série (string) compatível com o inversor:
 * Voc no frio dentro do limite de tensão DC, e Vmp da string dentro da faixa
 * de MPPT. Prefere o maior número de módulos por string que ainda cumpre os
 * dois limites (menos strings, menos conectores/fusíveis). Quando corrente
 * máxima de entrada e quantidade de MPPTs também estão cadastradas, exige
 * que as strings caibam nas entradas sem estourar a corrente.
 *
 * Retorna `undefined` quando falta algum dado elétrico pra verificar
 * (catálogo incompleto), e `null` quando os dados existem mas nenhum
 * arranjo é eletricamente compatível.
 */
function encontrarConfiguracaoString(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  quantidadeModulos: number,
  temperaturaMinimaProjetoC: number,
): ConfiguracaoString | null | undefined {
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
    return undefined;
  }

  const fatorTemperatura = 1 + (coefTempVocPctC / 100) * (temperaturaMinimaProjetoC - TEMPERATURA_REFERENCIA_STC_C);

  let melhor: ConfiguracaoString | null = null;
  for (let modulosPorString = quantidadeModulos; modulosPorString >= 1; modulosPorString--) {
    const vocFrioV = arredondar(vocV * fatorTemperatura * modulosPorString, 2);
    const vmpStringV = arredondar(vmpV * modulosPorString, 2);
    if (vocFrioV > tensaoMaxDcV) continue;
    if (vmpStringV < mpptMinV || vmpStringV > mpptMaxV) continue;

    const quantidadeStrings = Math.ceil(quantidadeModulos / modulosPorString);
    if (inversor.correnteMaxEntradaA != null && inversor.quantidadeMppt != null && modulo.impA != null) {
      const stringsPorMppt = Math.ceil(quantidadeStrings / inversor.quantidadeMppt);
      if (modulo.impA * stringsPorMppt > inversor.correnteMaxEntradaA) continue;
    }

    melhor = { modulosPorString, quantidadeStrings, vocFrioV, vmpStringV };
    break;
  }
  return melhor;
}

function montarOpcao(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  quantidadeModulos: number,
  overloadMaximoPct: number,
  temperaturaMinimaProjetoC: number,
): OpcaoSistemaAutomatico | null {
  const potenciaDcKwp = arredondar((quantidadeModulos * modulo.potenciaW) / 1000, 2);
  const potenciaAcKw = arredondar(inversor.potenciaW / 1000, 2);
  const overloadPct = arredondar((potenciaDcKwp * 1000) / inversor.potenciaW - 1, 4);

  const configuracaoString = encontrarConfiguracaoString(modulo, inversor, quantidadeModulos, temperaturaMinimaProjetoC);
  if (configuracaoString === null) return null; // dados elétricos existem, mas nenhum arranjo é seguro — descarta a combinação.

  return {
    modulo,
    inversor,
    quantidadeModulos,
    potenciaDcKwp,
    potenciaAcKw,
    overloadPct,
    validacao: overloadPct <= overloadMaximoPct ? "valido" : "valido_com_alerta",
    validacaoEletrica: configuracaoString === undefined ? "nao_verificado" : "valido",
    stringConfig: configuracaoString ?? null,
  };
}

function avaliarCombinacao(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  potenciaAlvoKwp: number,
  overloadMaximoPct: number,
  temperaturaMinimaProjetoC: number,
): OpcaoSistemaAutomatico | null {
  const quantidadeModulos = Math.max(1, Math.ceil((potenciaAlvoKwp * 1000) / modulo.potenciaW));
  return montarOpcao(modulo, inversor, quantidadeModulos, overloadMaximoPct, temperaturaMinimaProjetoC);
}

/**
 * Valida uma combinação módulo+inversor+quantidade escolhida (ou ajustada) manualmente
 * pelo vendedor — na criação (troca a opção sugerida) ou na edição do sistema — pelas
 * mesmas regras elétricas do motor automático (Voc no frio, faixa de MPPT, corrente,
 * overload). É a mesma fonte de verdade usada por `dimensionarSistemaAutomatico`, só que
 * sem derivar a quantidade a partir do consumo: quem decide a quantidade aqui é o vendedor,
 * não a meta de potência. Retorna `null` quando a quantidade é inválida (≤ 0) ou quando o
 * arranjo elétrico não é seguro.
 */
export function avaliarCombinacaoEscolhida(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  quantidadeModulos: number,
  overloadMaximoPct: number,
  temperaturaMinimaProjetoC: number,
): OpcaoSistemaAutomatico | null {
  if (!Number.isInteger(quantidadeModulos) || quantidadeModulos <= 0) return null;
  return montarOpcao(modulo, inversor, quantidadeModulos, overloadMaximoPct, temperaturaMinimaProjetoC);
}

/**
 * Retorna até 3 opções (1 recomendada + até 2 alternativas), ranqueadas por:
 * dentro do overload automático primeiro, depois prioridade comercial do
 * equipamento (maior primeiro), depois overload mais próximo de um "ponto
 * ideal" (nem sistema subdimensionado, nem inversor superdimensionado à toa).
 */
export function dimensionarSistemaAutomatico(params: {
  consumoMedioKwh: number;
  margemPct: number;
  produtividadeKwhKwpMes: number;
  modulos: EquipamentoAtivo[];
  inversores: EquipamentoAtivo[];
  overloadMaximoPct: number;
  temperaturaMinimaProjetoC: number;
}): OpcaoSistemaAutomatico[] {
  const {
    consumoMedioKwh,
    margemPct,
    produtividadeKwhKwpMes,
    modulos,
    inversores,
    overloadMaximoPct,
    temperaturaMinimaProjetoC,
  } = params;
  if (consumoMedioKwh <= 0 || produtividadeKwhKwpMes <= 0 || !modulos.length || !inversores.length) return [];

  const potenciaAlvoKwp = (consumoMedioKwh * (1 + margemPct)) / produtividadeKwhKwpMes;

  const opcoes = modulos.flatMap((modulo) =>
    inversores
      .map((inversor) =>
        avaliarCombinacao(modulo, inversor, potenciaAlvoKwp, overloadMaximoPct, temperaturaMinimaProjetoC),
      )
      .filter((opcao): opcao is OpcaoSistemaAutomatico => opcao !== null),
  );

  opcoes.sort((a, b) => {
    if (a.validacao !== b.validacao) return a.validacao === "valido" ? -1 : 1;
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
