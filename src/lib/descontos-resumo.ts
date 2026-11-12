import { custosInternosEstimados, potenciaKitPersonalizadoKwp, type ParametrosCustosInternos } from "@/lib/calculadora";
import type { TipoComponenteKit } from "@/lib/tipos";

/*
 * Compras P4c: o que o gestor (ou o admin) vê ao decidir um desconto sobre o preço sugerido (quadro
 * `P4AprovarDesconto`). Só para quem vê a tabela de preços: o vendedor nunca recebe custo, comissão nem sobra.
 * Decisão do Evandro de 10/11/2026: a comissão é calculada sobre o valor pedido (o que o cliente vai pagar).
 */

export type ResumoDescontoGestor = {
  sugerido: number;
  valorPedido: number;
  /** Custo dos itens pela tabela de preços (retrato do kit, `negocio_custo_kit`). */
  custoItens: number;
  /** Algum item do kit entrou sem custo da tabela (preço à mão): o custo é só dos itens com preço. */
  custoParcial: boolean;
  /** Instalação por módulo + material CA por kWp + engenharia. */
  custosInternos: number;
  comissaoPercentual: number;
  comissao: number;
  sobra: number;
  /** Sobra sobre o valor pedido, em %, com 1 casa. */
  sobraPercentual: number;
};

const reais = (v: number) => Math.round(v * 100) / 100;

export function resumoDescontoGestor({
  sugerido,
  percentual,
  custoItens,
  custoParcial,
  kit,
  parametros,
}: {
  sugerido: number;
  /** Desconto pedido, em % sobre o sugerido. */
  percentual: number;
  custoItens: number;
  custoParcial: boolean;
  kit: { tipo: TipoComponenteKit; quantidade: number; potenciaW: number | null }[];
  parametros: ParametrosCustosInternos;
}): ResumoDescontoGestor {
  const valorPedido = reais(sugerido * (1 - percentual / 100));
  const modulos = kit.filter((k) => k.tipo === "modulo").reduce((s, k) => s + k.quantidade, 0);
  const internos = custosInternosEstimados(0, modulos, potenciaKitPersonalizadoKwp(kit), parametros);
  const custosInternos = reais(internos.custoInstalacao + internos.custoMaterialCa + internos.custoEngenharia);
  const comissao = reais(valorPedido * parametros.comissaoPercentual);
  const sobra = reais(valorPedido - custoItens - custosInternos - comissao);
  return {
    sugerido,
    valorPedido,
    custoItens,
    custoParcial,
    custosInternos,
    comissaoPercentual: parametros.comissaoPercentual,
    comissao,
    sobra,
    sobraPercentual: valorPedido > 0 ? Math.round((sobra / valorPedido) * 1000) / 10 : 0,
  };
}
