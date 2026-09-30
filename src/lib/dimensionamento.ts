/**
 * Dimensionamento automático do kit (fase 1 do redesenho do "Adicionar
 * negócio" — ver especificação V2 enviada pelo Evandro em 2026-09-30).
 *
 * Escopo desta fase: escolhe módulo + inversor entre os equipamentos ativos
 * da empresa (`equipamentos_empresa`) a partir do consumo informado, e
 * calcula o overload (relação DC/AC) de cada combinação. Só valida overload
 * — ainda não valida string/MPPT/tensão (isso depende do catálogo ganhar
 * campos elétricos completos, fase seguinte do plano). Por isso a opção
 * acima do limite não é bloqueada, só marcada como "precisa de confirmação".
 */

export type EquipamentoAtivo = {
  id: string;
  fabricante: string;
  modelo: string;
  potenciaW: number;
  prioridade: number;
};

export type OpcaoSistemaAutomatico = {
  modulo: EquipamentoAtivo;
  inversor: EquipamentoAtivo;
  quantidadeModulos: number;
  potenciaDcKwp: number;
  potenciaAcKw: number;
  overloadPct: number;
  validacao: "valido" | "valido_com_alerta";
};

const OVERLOAD_ALVO_PCT = 0.15;

function arredondar(valor: number, casas: number) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function avaliarCombinacao(
  modulo: EquipamentoAtivo,
  inversor: EquipamentoAtivo,
  potenciaAlvoKwp: number,
  overloadMaximoPct: number,
): OpcaoSistemaAutomatico {
  const quantidadeModulos = Math.max(1, Math.ceil((potenciaAlvoKwp * 1000) / modulo.potenciaW));
  const potenciaDcKwp = arredondar((quantidadeModulos * modulo.potenciaW) / 1000, 2);
  const potenciaAcKw = arredondar(inversor.potenciaW / 1000, 2);
  const overloadPct = arredondar((potenciaDcKwp * 1000) / inversor.potenciaW - 1, 4);
  return {
    modulo,
    inversor,
    quantidadeModulos,
    potenciaDcKwp,
    potenciaAcKw,
    overloadPct,
    validacao: overloadPct <= overloadMaximoPct ? "valido" : "valido_com_alerta",
  };
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
}): OpcaoSistemaAutomatico[] {
  const { consumoMedioKwh, margemPct, produtividadeKwhKwpMes, modulos, inversores, overloadMaximoPct } = params;
  if (consumoMedioKwh <= 0 || produtividadeKwhKwpMes <= 0 || !modulos.length || !inversores.length) return [];

  const potenciaAlvoKwp = (consumoMedioKwh * (1 + margemPct)) / produtividadeKwhKwpMes;

  const opcoes = modulos.flatMap((modulo) =>
    inversores.map((inversor) => avaliarCombinacao(modulo, inversor, potenciaAlvoKwp, overloadMaximoPct)),
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
