import { describe, expect, it } from "vitest";
import { MARGENS_ZERADAS } from "@/lib/compras/margens";
import { categoriasDoTipo, materialServeAoTipo, melhoresCustos, precificarKit, textoAvisosPreco, type CustoMaterial, type ItemPrecificacao } from "@/lib/compras/precificacao-kit";

// Exemplo da prévia aprovada "Compras P4 · Kit pela tabela de preços": 5,5 kWp → R$ 22.771,56.
const margens = { ...MARGENS_ZERADAS, modulos: 0.18, inversores: 0.15, estrutura: 0.25, cabos_protecao: 0.3 };
const parametros = { custoInstalacaoPorModulo: 150, custoMaterialCaPorKwp: 120, custoEngenharia: 1200, comissaoPercentual: 0.05 };
const HOJE = "2026-11-09";
const custos = new Map([
  ["mod", { categoria: "modulos" as const, custo: 780, fornecedor: "Solar Sul", dataPreco: "2026-11-03" }],
  ["inv", { categoria: "inversores" as const, custo: 5900, fornecedor: "Solar Sul", dataPreco: "2026-10-06" }],
  ["est", { categoria: "estrutura" as const, custo: 92, fornecedor: "Ferragens", dataPreco: "2026-11-02" }],
  ["cabo", { categoria: "cabos_protecao" as const, custo: 9.8, fornecedor: "Ferragens", dataPreco: "2026-11-01" }],
]);
const item = (extra: Partial<ItemPrecificacao>): ItemPrecificacao => ({
  tipo: "outro",
  descricao: "Item",
  quantidade: 1,
  potenciaW: null,
  materialId: null,
  precoVendaManual: null,
  ...extra,
});
const kit: ItemPrecificacao[] = [
  item({ tipo: "modulo", descricao: "Módulo 550 W", quantidade: 10, potenciaW: 550, materialId: "mod" }),
  item({ tipo: "inversor", descricao: "Inversor 5 kW", potenciaW: 5000, materialId: "inv" }),
  item({ descricao: "Estrutura telhado cerâmico", quantidade: 10, materialId: "est" }),
  item({ descricao: "Cabo solar 6 mm²", quantidade: 30, materialId: "cabo" }),
  item({ descricao: "String box 2E/2S", precoVendaManual: 806 }),
];

describe("preço do kit pela tabela (P4b)", () => {
  it("o exemplo da prévia: itens + margens + custos internos + comissão", () => {
    const r = precificarKit({ itens: kit, custos, margens, parametros, hoje: HOJE });
    expect(r.sugerido).toBe(22771.56);
    expect(r.custoItens).toBe(14914);
    expect(r.parcial).toBe(true);
    expect(r.itensCusto.map((i) => i.materialId)).toEqual(["mod", "inv", "est", "cabo"]);
    expect(r.avisos).toEqual([{ tipo: "preco_antigo", descricao: "Inversor 5 kW", dias: 34 }]);
  });

  it("item sem preço (nem na tabela, nem à mão): sem sugerido, com aviso", () => {
    const r = precificarKit({ itens: [...kit.slice(0, 4), item({ descricao: "String box" })], custos, margens, parametros, hoje: HOJE });
    expect(r.sugerido).toBeNull();
    expect(r.avisos).toContainEqual({ tipo: "sem_preco", descricao: "String box" });
  });

  it("kit vazio não tem sugerido; tudo pela tabela não é parcial", () => {
    expect(precificarKit({ itens: [], custos, margens, parametros, hoje: HOJE }).sugerido).toBeNull();
    const r = precificarKit({ itens: kit.slice(0, 2), custos, margens, parametros, hoje: HOJE });
    expect(r.parcial).toBe(false);
    expect(r.sugerido).not.toBeNull();
  });

  it("material sem preço na tabela usa o preço à mão", () => {
    const r = precificarKit({ itens: [item({ descricao: "Novo", materialId: "sem-preco", precoVendaManual: 100 })], custos, margens, parametros, hoje: HOJE });
    expect(r.parcial).toBe(true);
    expect(r.custoItens).toBe(0);
    expect(r.sugerido).toBe(1365); // (100 + 1200 de engenharia) × 1,05
  });

  it("melhor custo: preço atual de cada fornecedor, depois o menor", () => {
    const m = melhoresCustos([
      { materialId: "mod", categoria: "modulos", fornecedorChave: "sul", fornecedor: "Sul", preco: 800, dataPreco: "2026-11-03" },
      { materialId: "mod", categoria: "modulos", fornecedorChave: "sul", fornecedor: "Sul", preco: 700, dataPreco: "2026-10-01" },
      { materialId: "mod", categoria: "modulos", fornecedorChave: "atacado", fornecedor: "Atacado", preco: 795, dataPreco: "2026-11-01" },
    ]);
    expect(m.get("mod")).toEqual({ categoria: "modulos", custo: 795, fornecedor: "Atacado", dataPreco: "2026-11-01", validoAte: null });
  });

  it("preço de tabela vencida é usado, com aviso (no lugar do aviso de preço velho)", () => {
    const vencidos = new Map<string, CustoMaterial>([
      ...custos,
      ["inv", { ...custos.get("inv")!, validoAte: "2026-11-08" }],
      ["mod", { ...custos.get("mod")!, validoAte: "2026-11-09" }],
    ]);
    const r = precificarKit({ itens: kit, custos: vencidos, margens, parametros, hoje: HOJE });
    expect(r.sugerido).toBe(22771.56);
    expect(r.avisos).toEqual([{ tipo: "tabela_vencida", descricao: "Inversor 5 kW" }]);
    expect(textoAvisosPreco(r.avisos, { incluirAntigo: false })).toBe("Tabela vencida: Inversor 5 kW.");
  });

  it("texto dos avisos: preço velho só quando pedido", () => {
    const avisos = [
      { tipo: "preco_antigo" as const, descricao: "Inversor", dias: 40 },
      { tipo: "sem_preco" as const, descricao: "String box" },
      { tipo: "tabela_vencida" as const, descricao: "Módulo" },
    ];
    expect(textoAvisosPreco(avisos, { incluirAntigo: true })).toBe("Preço de 40 dias: Inversor. Tabela vencida: Módulo.");
    expect(textoAvisosPreco(avisos, { incluirAntigo: false })).toBe("Tabela vencida: Módulo.");
  });

  it("o que cada linha do kit aceita", () => {
    expect(categoriasDoTipo("outro")).toEqual(["estrutura", "cabos_protecao", "outros"]);
    expect(materialServeAoTipo({ categoria: "modulos", potenciaW: null }, "modulo")).toBe(false);
    expect(materialServeAoTipo({ categoria: "modulos", potenciaW: 550 }, "modulo")).toBe(true);
    expect(materialServeAoTipo({ categoria: "estrutura", potenciaW: null }, "outro")).toBe(true);
    expect(materialServeAoTipo({ categoria: "estrutura", potenciaW: null }, "modulo")).toBe(false);
  });
});
