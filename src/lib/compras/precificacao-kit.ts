import { custosInternosEstimados, potenciaKitPersonalizadoKwp, type ParametrosCustosInternos } from "@/lib/calculadora";
import type { TipoComponenteKit } from "@/lib/tipos";
import { vendaSugerida, type MargensCategoria } from "./margens";
import { DIAS_PRECO_ANTIGO, diasDesde, type CategoriaMaterial } from "./precos";

/*
 * Compras P4b: preço de venda do kit pela tabela de preços (20261201100000_kit_pela_tabela.sql). Regra pura, sem banco:
 * preço sugerido = Σ (venda sugerida de cada item × quantidade) + custos internos + comissão, pela mesma fórmula de
 * `custosInternosEstimados`. Venda sugerida do item = melhor custo atual × (1 + margem da categoria); item sem material
 * ou sem preço na tabela usa o preço de venda informado à mão. Faltando o preço de algum item, não há sugerido.
 */

export type ItemPrecificacao = {
  tipo: TipoComponenteKit;
  descricao: string;
  quantidade: number;
  potenciaW: number | null;
  materialId: string | null;
  /** Preço de venda por unidade informado pelo vendedor (item fora da tabela ou sem preço nela). */
  precoVendaManual: number | null;
};

/** Melhor custo atual de um material (menor preço entre os fornecedores). */
export type CustoMaterial = {
  categoria: CategoriaMaterial;
  custo: number;
  fornecedor: string;
  dataPreco: string;
  /** Validade da tabela de onde veio o preço (nulo = sem validade ou lançado à mão). */
  validoAte?: string | null;
};

/** O que o vendedor pode ver: sem custo nem margem. */
export type AvisoPreco =
  | { tipo: "sem_preco"; descricao: string }
  | { tipo: "preco_antigo"; descricao: string; dias: number }
  | { tipo: "tabela_vencida"; descricao: string };

/** Avisos de preço velho e de tabela vencida, em uma frase cada (o preço é usado mesmo assim). */
export function textoAvisosPreco(avisos: AvisoPreco[], { incluirAntigo }: { incluirAntigo: boolean }): string {
  return avisos
    .map((a) => (a.tipo === "tabela_vencida" ? `Tabela vencida: ${a.descricao}.` : a.tipo === "preco_antigo" && incluirAntigo ? `Preço de ${a.dias} dias: ${a.descricao}.` : ""))
    .filter(Boolean)
    .join(" ");
}

export type ItemCusto = { materialId: string; descricao: string; quantidade: number; custoUnitario: number; fornecedor: string; dataPreco: string };

export type PrecificacaoKit = {
  /** Nulo = algum item sem preço (nem na tabela, nem à mão). */
  sugerido: number | null;
  /** Custo dos itens com preço na tabela (o retrato que vai para o previsto da obra). */
  custoItens: number;
  /** Algum item entrou sem custo da tabela (preço à mão ou sem preço). */
  parcial: boolean;
  itensCusto: ItemCusto[];
  avisos: AvisoPreco[];
};

const centavos = (v: number) => Math.round(v * 100) / 100;

export function precificarKit({
  itens,
  custos,
  margens,
  parametros,
  hoje,
}: {
  itens: ItemPrecificacao[];
  custos: ReadonlyMap<string, CustoMaterial>;
  margens: MargensCategoria;
  parametros: ParametrosCustosInternos;
  hoje: string;
}): PrecificacaoKit {
  let venda = 0;
  let custoItens = 0;
  let completo = itens.length > 0;
  let parcial = false;
  const itensCusto: ItemCusto[] = [];
  const avisos: AvisoPreco[] = [];

  for (const item of itens) {
    const custo = item.materialId ? custos.get(item.materialId) : undefined;
    if (custo) {
      venda += vendaSugerida(custo.custo, margens[custo.categoria]) * item.quantidade;
      custoItens += custo.custo * item.quantidade;
      itensCusto.push({
        materialId: item.materialId!,
        descricao: item.descricao,
        quantidade: item.quantidade,
        custoUnitario: custo.custo,
        fornecedor: custo.fornecedor,
        dataPreco: custo.dataPreco,
      });
      const dias = diasDesde(custo.dataPreco, hoje);
      if (custo.validoAte != null && custo.validoAte < hoje) avisos.push({ tipo: "tabela_vencida", descricao: item.descricao });
      else if (dias > DIAS_PRECO_ANTIGO) avisos.push({ tipo: "preco_antigo", descricao: item.descricao, dias });
      continue;
    }
    parcial = true;
    if (item.precoVendaManual != null && item.precoVendaManual > 0) {
      venda += item.precoVendaManual * item.quantidade;
    } else {
      completo = false;
      avisos.push({ tipo: "sem_preco", descricao: item.descricao });
    }
  }

  const quantidadeModulos = itens.filter((i) => i.tipo === "modulo").reduce((s, i) => s + i.quantidade, 0);
  const potenciaKwp = potenciaKitPersonalizadoKwp(itens);
  return {
    sugerido: completo ? custosInternosEstimados(centavos(venda), quantidadeModulos, potenciaKwp, parametros).total : null,
    custoItens: centavos(custoItens),
    parcial,
    itensCusto,
    avisos,
  };
}

/** Categoria do material que combina com o tipo do item do kit (o que o vendedor pode escolher em cada linha). */
export function categoriasDoTipo(tipo: TipoComponenteKit): CategoriaMaterial[] {
  if (tipo === "modulo") return ["modulos"];
  if (tipo === "inversor") return ["inversores"];
  if (tipo === "bateria") return ["baterias"];
  return ["estrutura", "cabos_protecao", "outros"];
}

/** Módulo e inversor só entram com potência cadastrada (é com ela que o cálculo acha kWp e geração). */
export function materialServeAoTipo(material: { categoria: CategoriaMaterial; potenciaW: number | null }, tipo: TipoComponenteKit) {
  if (!categoriasDoTipo(tipo).includes(material.categoria)) return false;
  return (tipo !== "modulo" && tipo !== "inversor") || material.potenciaW != null;
}

/**
 * Melhor custo de cada material a partir das linhas de preço (mais recentes primeiro): o preço atual de cada fornecedor
 * é o de data mais recente; o melhor custo é o menor entre os fornecedores.
 */
export function melhoresCustos(
  linhas: {
    materialId: string;
    categoria: CategoriaMaterial;
    fornecedorChave: string;
    fornecedor: string;
    preco: number;
    dataPreco: string;
    validoAte?: string | null;
  }[],
): Map<string, CustoMaterial> {
  const atual = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) {
    const k = `${l.materialId}|${l.fornecedorChave}`;
    if (!atual.has(k)) atual.set(k, l);
  }
  const melhor = new Map<string, CustoMaterial>();
  for (const l of atual.values()) {
    const m = melhor.get(l.materialId);
    if (!m || l.preco < m.custo || (l.preco === m.custo && l.dataPreco > m.dataPreco)) {
      melhor.set(l.materialId, { categoria: l.categoria, custo: l.preco, fornecedor: l.fornecedor, dataPreco: l.dataPreco, validoAte: l.validoAte ?? null });
    }
  }
  return melhor;
}

/** Material como o vendedor vê ao montar o kit (`materiais_para_kit`): sem custo nem margem. */
export type MaterialKitVM = {
  id: string;
  nome: string;
  categoria: CategoriaMaterial;
  unidade: string;
  potenciaW: number | null;
  temPreco: boolean;
  dataPreco: string | null;
};
