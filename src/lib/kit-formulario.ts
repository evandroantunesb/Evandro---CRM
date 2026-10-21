import type { LinhaComponente } from "@/components/kit-componentes";
import { consumoSalvoDoNegocio } from "@/lib/consumo-estimado";
import { formatarNumeroBr } from "@/lib/formatacao";
import type { TipoComponenteKit, TipoLigacao } from "@/lib/tipos";

/** O que está gravado do kit do negócio (itens, cálculo e dados do negócio usados no formulário). */
export type KitSalvo = {
  componentesSalvos: { tipo: TipoComponenteKit; descricao: string; potenciaW: number | null; quantidade: number }[];
  calculo: { tipoLigacao: TipoLigacao; consumoMedioKwh: number; valorFaturaMedio: number | null; tarifaKwh: number } | null;
  estruturaTelhado: string | null;
  consumoMedioKwhPadrao: number | null;
  valorFaturaMedioPadrao: number | null;
  /** Estimativa registrada no negócio (colunas `consumo_estimado_kwh` e `tarifa_efetiva_kwh`); nulas em negócios antigos. */
  consumoEstimadoKwhPadrao?: number | null;
  tarifaEfetivaKwhPadrao?: number | null;
};

export type EstadoFormularioKit = {
  linhas: LinhaComponente[];
  estrutura: string;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: string;
  valorFaturaMedio: string;
  /** Tarifa EFETIVA (estima o consumo); separada da tarifa base `tarifaKwh`. */
  tarifaEfetivaKwh: string;
  tarifaKwh: string;
};

// Inverso exato de `lerNumeroBr`: reabrir e salvar sem editar não muda nenhum valor (antes, 1200
// reabria como "1.200" e voltava como 1,2; a tarifa com 4 casas perdia as duas últimas).
const numeroBr = formatarNumeroBr;

/**
 * Estado do formulário do kit exatamente como está gravado. Usado ao abrir o cartão e no
 * Cancelar: sem kit salvo, volta tudo vazio (descarta os itens não gravados); com kit salvo,
 * volta aos dados persistidos. Consumo e valor da conta vêm do cálculo ou, sem ele, do negócio.
 */
export function estadoSalvoDoKit(k: KitSalvo): EstadoFormularioKit {
  const fatura = k.calculo ? k.calculo.valorFaturaMedio : k.valorFaturaMedioPadrao;
  // Consumo estimado NÃO volta como kWh informado: o campo de kWh fica vazio e a tarifa efetiva volta no campo próprio.
  // Origem desconhecida (kit anterior ao registro) também não volta como kWh informado: o usuário informa o kWh da
  // fatura ou a tarifa efetiva antes de recalcular.
  const salvoConsumo = consumoSalvoDoNegocio({
    consumoMedioKwh: k.consumoMedioKwhPadrao,
    consumoEstimadoKwh: k.consumoEstimadoKwhPadrao ?? null,
    tarifaEfetivaKwh: k.tarifaEfetivaKwhPadrao ?? null,
    calculo: k.calculo,
  });
  const estimado = salvoConsumo?.origem === "estimado" ? salvoConsumo : null;
  const semOrigem = salvoConsumo?.origem === "desconhecida";
  const consumo = estimado || semOrigem ? null : k.calculo ? k.calculo.consumoMedioKwh : k.consumoMedioKwhPadrao;
  return {
    linhas: k.componentesSalvos.map((c) => ({
      tipo: c.tipo,
      descricao: c.descricao,
      potenciaW: c.potenciaW != null ? numeroBr(c.potenciaW) : "",
      quantidade: String(c.quantidade),
    })),
    estrutura: k.estruturaTelhado ?? "",
    tipoLigacao: k.calculo?.tipoLigacao ?? "trifasico",
    consumoMedioKwh: consumo != null ? numeroBr(consumo) : "",
    valorFaturaMedio: fatura != null ? numeroBr(fatura) : "",
    tarifaEfetivaKwh: estimado ? numeroBr(estimado.tarifaEfetiva) : "",
    tarifaKwh: k.calculo ? numeroBr(k.calculo.tarifaKwh) : "",
  };
}
