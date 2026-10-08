import type { LinhaComponente } from "@/components/kit-componentes";
import type { TipoComponenteKit, TipoLigacao } from "@/lib/tipos";

/** O que está gravado do kit do negócio (itens, cálculo e dados do negócio usados no formulário). */
export type KitSalvo = {
  componentesSalvos: { tipo: TipoComponenteKit; descricao: string; potenciaW: number | null; quantidade: number }[];
  calculo: { tipoLigacao: TipoLigacao; consumoMedioKwh: number; valorFaturaMedio: number | null; tarifaKwh: number } | null;
  estruturaTelhado: string | null;
  consumoMedioKwhPadrao: number | null;
  valorFaturaMedioPadrao: number | null;
};

export type EstadoFormularioKit = {
  linhas: LinhaComponente[];
  estrutura: string;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: string;
  valorFaturaMedio: string;
  tarifaKwh: string;
};

const numeroBr = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * Estado do formulário do kit exatamente como está gravado. Usado ao abrir o cartão e no
 * Cancelar: sem kit salvo, volta tudo vazio (descarta os itens não gravados); com kit salvo,
 * volta aos dados persistidos. Consumo e valor da conta vêm do cálculo ou, sem ele, do negócio.
 */
export function estadoSalvoDoKit(k: KitSalvo): EstadoFormularioKit {
  const fatura = k.calculo ? k.calculo.valorFaturaMedio : k.valorFaturaMedioPadrao;
  const consumo = k.calculo ? k.calculo.consumoMedioKwh : k.consumoMedioKwhPadrao;
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
    tarifaKwh: k.calculo ? numeroBr(k.calculo.tarifaKwh) : "",
  };
}
