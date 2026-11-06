import { CATEGORIAS_CUSTO_OBRA, type CategoriaCustoObra } from "@/lib/obras/custos";

/**
 * Regras puras de Compras (20261125100000_compras_pedidos.sql): situação do pedido, totais, kit vendido × comprado,
 * indicadores e abas da tela /compras. O banco decide de novo tudo o que grava; aqui é só leitura e exibição.
 */

export const numeroPedido = (n: number) => `P-${String(n).padStart(4, "0")}`;

/** Item do kit vendido, pela posição no kit gravado na obra (`obras.snapshot -> 'kit'`), que é a chave do pedido. */
export type ItemKitCompra = { indice: number; descricao: string; quantidade: number; tipo: string | null };

const ehRegistro = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Kit da obra com a posição ORIGINAL de cada item (itens sem descrição ficam de fora, mas não deslocam os demais). */
export function kitDaObra(snapshot: unknown): ItemKitCompra[] {
  const kit = ehRegistro(snapshot) && Object.hasOwn(snapshot, "kit") ? snapshot.kit : null;
  if (!Array.isArray(kit)) return [];
  return kit.flatMap((item, indice): ItemKitCompra[] => {
    if (!ehRegistro(item)) return [];
    const descricao = typeof item.descricao === "string" ? item.descricao.trim() : "";
    if (!descricao) return [];
    const q = Number(item.quantidade);
    return [{ indice, descricao, quantidade: Number.isFinite(q) && q > 0 ? q : 1, tipo: typeof item.tipo === "string" ? item.tipo : null }];
  });
}

export type ItemPedidoVM = {
  id: string;
  kitIndice: number | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  quantidadeRecebida: number;
};

export type PedidoVM = {
  id: string;
  obraId: string;
  numero: number;
  fornecedor: string;
  categoria: CategoriaCustoObra;
  entregaPrevista: string;
  vencimento: string;
  numeroFornecedor: string | null;
  frete: number;
  valorTotal: number;
  nfNumero: string | null;
  nfValor: number | null;
  temNf: boolean;
  cancelado: boolean;
  motivoCancelamento: string | null;
  criadoEm: string;
  itens: ItemPedidoVM[];
};

export type SituacaoPedido = "cancelado" | "recebido" | "recebido_parcial" | "faturado" | "aguardando_nf";

export const ROTULO_SITUACAO_PEDIDO: Record<SituacaoPedido, string> = {
  aguardando_nf: "Aguardando NF",
  faturado: "Faturado",
  recebido_parcial: "Recebido em parte",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

export const totalRecebido = (p: Pick<PedidoVM, "itens">) => ({
  itens: p.itens.length,
  completos: p.itens.filter((i) => i.quantidadeRecebida >= i.quantidade).length,
  algum: p.itens.some((i) => i.quantidadeRecebida > 0),
});

export function situacaoPedido(p: Pick<PedidoVM, "cancelado" | "temNf" | "itens">): SituacaoPedido {
  if (p.cancelado) return "cancelado";
  const r = totalRecebido(p);
  if (r.itens > 0 && r.completos === r.itens) return "recebido";
  if (r.algum) return "recebido_parcial";
  return p.temNf ? "faturado" : "aguardando_nf";
}

/** Pedido sem nota e sem nada recebido: ainda se edita e se cancela (o banco confere de novo). */
export const pedidoEditavel = (p: Pick<PedidoVM, "cancelado" | "temNf" | "itens">) => !p.cancelado && !p.temNf && !totalRecebido(p).algum;

/** Entrega atrasada: data passou e ainda falta receber. */
export const entregaAtrasada = (p: Pick<PedidoVM, "cancelado" | "temNf" | "itens" | "entregaPrevista">, hoje: string) => {
  const s = situacaoPedido(p);
  return (s === "aguardando_nf" || s === "faturado" || s === "recebido_parcial") && p.entregaPrevista < hoje;
};

/** Dias corridos entre duas datas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Total do pedido como o banco calcula: cada item arredondado em centavos, mais o frete. */
export function totalDoPedido(itens: readonly { quantidade: number; valorUnitario: number }[], frete: number): number {
  const centavos = itens.reduce((s, i) => s + Math.round(i.quantidade * i.valorUnitario * 100), 0) + Math.round(frete * 100);
  return centavos / 100;
}

export type LinhaKitComprado = { indice: number; descricao: string; vendido: number; pedido: number; recebido: number; pedidos: string[] };

/** Kit vendido × comprado × recebido (pedidos cancelados não contam). */
export function kitComprado(kit: readonly ItemKitCompra[], pedidos: readonly PedidoVM[]): LinhaKitComprado[] {
  return kit.map((k) => {
    let pedido = 0;
    let recebido = 0;
    const nomes = new Set<string>();
    for (const p of pedidos) {
      if (p.cancelado) continue;
      for (const i of p.itens) {
        if (i.kitIndice !== k.indice) continue;
        pedido += i.quantidade;
        recebido += i.quantidadeRecebida;
        nomes.add(`${numeroPedido(p.numero)} · ${p.fornecedor}`);
      }
    }
    return { indice: k.indice, descricao: k.descricao, vendido: k.quantidade, pedido, recebido, pedidos: [...nomes] };
  });
}

export const ehCategoria = (v: string): v is CategoriaCustoObra => (CATEGORIAS_CUSTO_OBRA as readonly string[]).includes(v);

// --- Tela /compras ---------------------------------------------------------------

export const ABAS_COMPRAS = [
  { valor: "a-comprar", rotulo: "A comprar" },
  { valor: "em-aberto", rotulo: "Em aberto" },
  { valor: "recebidos", rotulo: "Recebidos" },
  { valor: "todos", rotulo: "Todos" },
] as const;
export type AbaCompras = (typeof ABAS_COMPRAS)[number]["valor"];

export function abaCompras(valor: unknown): AbaCompras {
  return ABAS_COMPRAS.some((a) => a.valor === valor) ? (valor as AbaCompras) : "em-aberto";
}

export const pedidoEmAberto = (p: PedidoVM) => {
  const s = situacaoPedido(p);
  return s === "aguardando_nf" || s === "faturado" || s === "recebido_parcial";
};

export function pedidosDaAba<T extends PedidoVM>(pedidos: readonly T[], aba: AbaCompras): T[] {
  if (aba === "em-aberto") return pedidos.filter(pedidoEmAberto);
  if (aba === "recebidos") return pedidos.filter((p) => situacaoPedido(p) === "recebido");
  if (aba === "todos") return [...pedidos];
  return [];
}

/** Obra esperando Compras: Aguardando Compras ou Em cotação, em curso. */
export type ObraAComprarVM = {
  obraId: string;
  numero: number;
  clienteNome: string;
  cidade: string | null;
  potenciaKwp: number | null;
  status: "a_comprar" | "cotando";
  desde: string | null;
  responsavel: string | null;
  souResponsavel: boolean;
};

export function kpisCompras({ pedidos, aComprar, hoje }: { pedidos: readonly PedidoVM[]; aComprar: number; hoje: string }) {
  const ativos = pedidos.filter((p) => !p.cancelado);
  const semNf = ativos.filter((p) => !p.temNf && pedidoEmAberto(p));
  const ate7 = ativos.filter((p) => pedidoEmAberto(p) && situacaoPedido(p) !== "recebido" && diasEntre(hoje, p.entregaPrevista) <= 7);
  const mes = hoje.slice(0, 7);
  const doMes = ativos.filter((p) => p.criadoEm.slice(0, 7) === mes);
  return {
    aComprar,
    aguardandoNf: { valor: semNf.reduce((s, p) => s + p.valorTotal, 0), quantidade: semNf.length },
    entregas7: { quantidade: ate7.length, atrasadas: ate7.filter((p) => entregaAtrasada(p, hoje)).length },
    compradoMes: { valor: doMes.reduce((s, p) => s + p.valorTotal, 0), quantidade: doMes.length },
  };
}

/** Busca por fornecedor, cliente, número da obra ou do pedido (sem acento, sem caixa). */
export function filtrarPedidos<T extends { fornecedor: string; numero: number; clienteNome?: string | null; obraNumero?: number | null }>(
  linhas: readonly T[],
  busca: string,
): T[] {
  const termo = normalizar(busca);
  if (!termo) return [...linhas];
  return linhas.filter((l) =>
    [l.fornecedor, l.clienteNome ?? "", numeroPedido(l.numero), String(l.numero), l.obraNumero != null ? `#${l.obraNumero}` : ""]
      .map(normalizar)
      .some((c) => c.includes(termo)),
  );
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
