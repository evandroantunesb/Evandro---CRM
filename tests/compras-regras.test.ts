import { describe, expect, it } from "vitest";
import {
  abaCompras,
  entregaAtrasada,
  filtrarPedidos,
  kitComprado,
  kitDaObra,
  kpisCompras,
  numeroPedido,
  pedidoEditavel,
  pedidosDaAba,
  situacaoPedido,
  totalDoPedido,
  type PedidoVM,
} from "@/lib/compras/regras";

const pedido = (p: Partial<PedidoVM> = {}): PedidoVM => ({
  id: "p1",
  obraId: "o1",
  numero: 1,
  fornecedor: "Distribuidora Solar Sul",
  categoria: "equipamentos",
  entregaPrevista: "2026-11-12",
  vencimento: "2026-11-20",
  numeroFornecedor: null,
  frete: 0,
  valorTotal: 1000,
  nfNumero: null,
  nfValor: null,
  temNf: false,
  cancelado: false,
  motivoCancelamento: null,
  criadoEm: "2026-11-05T10:00:00Z",
  itens: [{ id: "i1", kitIndice: 0, descricao: "Módulo", unidade: "un", quantidade: 10, valorUnitario: 100, quantidadeRecebida: 0 }],
  ...p,
});
const item = (q: number, recebido: number, kitIndice: number | null = 0) => ({
  id: `i${q}${recebido}`,
  kitIndice,
  descricao: "x",
  unidade: "un",
  quantidade: q,
  valorUnitario: 1,
  quantidadeRecebida: recebido,
});

describe("Compras: regras", () => {
  it("numera P-0001", () => {
    expect(numeroPedido(1)).toBe("P-0001");
    expect(numeroPedido(12345)).toBe("P-12345");
  });

  it("kit da obra guarda a posição original, sem deslocar quando um item é inválido", () => {
    const kit = kitDaObra({ kit: [{ descricao: "Módulo", quantidade: 10 }, { descricao: "" }, "lixo", { descricao: "Inversor", quantidade: 1, tipo: "inversor" }] });
    expect(kit.map((k) => [k.indice, k.descricao, k.quantidade])).toEqual([
      [0, "Módulo", 10],
      [3, "Inversor", 1],
    ]);
    expect(kitDaObra(null)).toEqual([]);
    expect(kitDaObra({ kit: "x" })).toEqual([]);
  });

  it("situação: aguardando NF, faturado, recebido em parte, recebido, cancelado", () => {
    expect(situacaoPedido(pedido())).toBe("aguardando_nf");
    expect(situacaoPedido(pedido({ temNf: true }))).toBe("faturado");
    expect(situacaoPedido(pedido({ itens: [item(10, 4)] }))).toBe("recebido_parcial");
    expect(situacaoPedido(pedido({ itens: [item(10, 10)] }))).toBe("recebido");
    expect(situacaoPedido(pedido({ cancelado: true, itens: [item(10, 10)] }))).toBe("cancelado");
  });

  it("edita só sem nota e sem nada recebido", () => {
    expect(pedidoEditavel(pedido())).toBe(true);
    expect(pedidoEditavel(pedido({ temNf: true }))).toBe(false);
    expect(pedidoEditavel(pedido({ itens: [item(10, 1)] }))).toBe(false);
    expect(pedidoEditavel(pedido({ cancelado: true }))).toBe(false);
  });

  it("entrega atrasada só enquanto falta receber", () => {
    expect(entregaAtrasada(pedido(), "2026-11-13")).toBe(true);
    expect(entregaAtrasada(pedido(), "2026-11-12")).toBe(false);
    expect(entregaAtrasada(pedido({ itens: [item(10, 10)] }), "2026-11-13")).toBe(false);
  });

  it("total como o banco: cada item em centavos, mais o frete", () => {
    expect(totalDoPedido([{ quantidade: 3, valorUnitario: 0.335 }], 0)).toBe(1.01);
    expect(totalDoPedido([{ quantidade: 10, valorUnitario: 780 }, { quantidade: 1, valorUnitario: 5900 }], 120)).toBe(13820);
  });

  it("kit vendido × comprado ignora pedidos cancelados e itens fora do kit", () => {
    const kit = kitDaObra({ kit: [{ descricao: "Módulo", quantidade: 10 }, { descricao: "Inversor", quantidade: 1 }] });
    const linhas = kitComprado(kit, [
      pedido({ itens: [item(6, 2, 0), item(5, 0, null)] }),
      pedido({ id: "p2", numero: 2, itens: [item(4, 4, 0)] }),
      pedido({ id: "p3", numero: 3, cancelado: true, itens: [item(1, 0, 1)] }),
    ]);
    expect(linhas.map((l) => [l.vendido, l.pedido, l.recebido, l.pedidos.length])).toEqual([
      [10, 10, 6, 2],
      [1, 0, 0, 0],
    ]);
  });

  it("abas e indicadores", () => {
    const lista = [pedido(), pedido({ id: "b", numero: 2, itens: [item(1, 1)] }), pedido({ id: "c", numero: 3, cancelado: true })];
    expect(abaCompras("x")).toBe("em-aberto");
    expect(pedidosDaAba(lista, "em-aberto").map((p) => p.id)).toEqual(["p1"]);
    expect(pedidosDaAba(lista, "recebidos").map((p) => p.id)).toEqual(["b"]);
    expect(pedidosDaAba(lista, "todos")).toHaveLength(3);
    const k = kpisCompras({ pedidos: lista, aComprar: 2, hoje: "2026-11-13" });
    expect(k.aguardandoNf).toEqual({ valor: 1000, quantidade: 1 });
    expect(k.entregas7).toEqual({ quantidade: 1, atrasadas: 1 });
    expect(k.compradoMes.quantidade).toBe(2);
  });

  it("busca por fornecedor, cliente, obra e pedido, sem acento", () => {
    const linhas = [
      { fornecedor: "Ferragens Campinas", numero: 7, clienteNome: "Sônia Ribeiro", obraNumero: 1059 },
      { fornecedor: "Distribuidora Solar Sul", numero: 8, clienteNome: "Ana Lima", obraNumero: 1051 },
    ];
    expect(filtrarPedidos(linhas, "sonia")).toHaveLength(1);
    expect(filtrarPedidos(linhas, "P-0008")[0].numero).toBe(8);
    expect(filtrarPedidos(linhas, "#1051")[0].numero).toBe(8);
    expect(filtrarPedidos(linhas, "")).toHaveLength(2);
  });
});
