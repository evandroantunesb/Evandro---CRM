/** Item 5, opção A: leitura da potência, prévia da tabela de preços com potência e lista de equipamentos (puro). */
import { describe, expect, it } from "vitest";
import { adivinharMapaLista, categoriaDaLinha, decisaoPadraoLista, itensLista, montarPreviaLista } from "@/lib/compras/equipamentos";
import { lerPotenciaCelula, palpiteCategoria, situacaoPotencia } from "@/lib/compras/potencia";
import { adivinharMapa, ehMapaColunas, itensImportacao, montarPrevia, type MaterialVM } from "@/lib/compras/precos";

const MATERIAIS: MaterialVM[] = [
  { id: "m1", nome: "Módulo Jinko 620W", categoria: "modulos", unidade: "un", potenciaW: null },
  { id: "m2", nome: "Módulo Canadian 575W", categoria: "modulos", unidade: "un", potenciaW: 575 },
  { id: "m3", nome: "Inversor Growatt 5kW", categoria: "inversores", unidade: "un", potenciaW: 5000 },
];

describe("potência de uma célula (em W; kW × 1.000)", () => {
  it("lê número, texto com W/Wp/kW e recusa o resto", () => {
    expect(lerPotenciaCelula(620)).toBe(620);
    expect(lerPotenciaCelula("620")).toBe(620);
    expect(lerPotenciaCelula("620 W")).toBe(620);
    expect(lerPotenciaCelula("620Wp")).toBe(620);
    expect(lerPotenciaCelula("5 kW")).toBe(5000);
    expect(lerPotenciaCelula("5,5kW")).toBe(5500);
    expect(lerPotenciaCelula("5.5 kWp")).toBe(5500);
    expect(lerPotenciaCelula("1.000")).toBe(1000);
    expect(lerPotenciaCelula("")).toBeNull();
    expect(lerPotenciaCelula(null)).toBeNull();
    for (const ruim of ["seiscentos", "620 V", "0", -5, "2000 kW"]) expect(lerPotenciaCelula(ruim as never)).toBeNaN();
  });

  it("situação: a cadastrada nunca é trocada", () => {
    expect(situacaoPotencia(null, MATERIAIS[0])).toBe("sem");
    expect(situacaoPotencia(Number.NaN, MATERIAIS[0])).toBe("ilegivel");
    expect(situacaoPotencia(620, undefined)).toBe("nova");
    expect(situacaoPotencia(620, MATERIAIS[0])).toBe("preenche");
    expect(situacaoPotencia(575, MATERIAIS[1])).toBe("ja");
    expect(situacaoPotencia(580, MATERIAIS[1])).toBe("diferente");
  });

  it("palpite de categoria pelo texto", () => {
    expect(palpiteCategoria("MÓDULO JINKO 620W")).toBe("modulos");
    expect(palpiteCategoria("Microinversor Hoymiles")).toBe("inversores");
    expect(palpiteCategoria("String box 2E/2S")).toBe("cabos_protecao");
    expect(palpiteCategoria("Perfil de alumínio 4,2 m")).toBe("estrutura");
    expect(palpiteCategoria("Bateria lítio 5 kWh")).toBe("baterias");
    expect(palpiteCategoria("Frete")).toBe("outros");
  });
});

describe("tabela de preços com a coluna de potência", () => {
  const planilha = [
    ["Cód.", "Descrição", "Potência", "Valor"],
    ["A1", "Módulo Jinko 620W", "620 W", "612,00"],
    ["A2", "Módulo Canadian 575W", "580", "590,00"],
    ["A3", "Microinversor Hoymiles HMS-2000", "2 kW", "2.450,00"],
    ["A4", "Perfil de alumínio", "", "96,00"],
    ["A5", "Módulo XYZ", "seiscentos", "600,00"],
  ];

  it("reconhece a coluna pelo cabeçalho; mapa antigo, sem a potência, continua válido", () => {
    expect(adivinharMapa(planilha)).toEqual({ cabecalho: 0, material: 1, codigo: 0, unidade: null, preco: 3, potencia: 2 });
    expect(ehMapaColunas({ cabecalho: 0, material: 1, codigo: 0, unidade: null, preco: 3 })).toBe(true);
    expect(ehMapaColunas({ cabecalho: 0, material: 1, codigo: 0, unidade: null, preco: 3, potencia: "x" })).toBe(false);
  });

  it("prévia e itens levam a potência; ilegível não derruba o preço", () => {
    const mapa = adivinharMapa(planilha)!;
    const previa = montarPrevia({ linhas: planilha, mapa, materiais: MATERIAIS, vinculos: [], precosAtuais: [] });
    expect(previa.map((l) => [l.descricao, l.potencia, l.potenciaSituacao])).toEqual([
      ["Módulo Jinko 620W", 620, "preenche"],
      ["Módulo Canadian 575W", 580, "diferente"],
      ["Microinversor Hoymiles HMS-2000", 2000, "nova"],
      ["Perfil de alumínio", null, "sem"],
      ["Módulo XYZ", Number.NaN, "ilegivel"],
    ]);
    // "seiscentos" fica sem potência, mas o preço da linha segue.
    expect(previa[4].situacao).toBe("novo");
    const r = itensImportacao(previa, { 2: { tipo: "ligar", materialId: "m1" }, 3: { tipo: "ligar", materialId: "m2" }, 4: { tipo: "criar", nome: "Microinversor Hoymiles HMS-2000", categoria: "inversores", unidade: "un" }, 5: { tipo: "criar", nome: "Perfil de alumínio", categoria: "estrutura", unidade: "un" }, 6: { tipo: "criar", nome: "Módulo XYZ", categoria: "modulos", unidade: "un" } });
    expect("itens" in r).toBe(true);
    const itens = (r as { itens: Record<string, unknown>[] }).itens;
    expect(itens.map((i) => i.potencia_w)).toEqual([620, 580, 2000, undefined, undefined]);
    expect(itens.every((i) => typeof i.preco === "number")).toBe(true);
  });
});

describe("lista de equipamentos (sem preço)", () => {
  const lista = [
    ["Modelo", "Tipo", "Potência (W)"],
    ["Módulo Jinko 620W", "Módulo", "620"],
    ["Inversor Deye SUN-8K", "Inversor", "8 kW"],
    ["String box 2E/2S", "", ""],
    ["módulo jinko 620w", "Módulo", "620"],
    ["", "Módulo", "500"],
  ];

  it("colunas, categoria, potência, repetidos e decisão padrão", () => {
    const mapa = adivinharMapaLista(lista)!;
    expect(mapa).toEqual({ cabecalho: 0, material: 0, categoria: 1, unidade: null, potencia: 2 });
    const previa = montarPreviaLista({ linhas: lista, mapa, materiais: MATERIAIS });
    expect(previa.map((l) => [l.categoria, l.potencia, l.materialId, l.problema])).toEqual([
      ["modulos", 620, "m1", null],
      ["inversores", 8000, null, null],
      ["cabos_protecao", null, null, null],
      ["modulos", 620, null, "Repetido (linha 2)"],
      ["modulos", 500, null, "Sem equipamento"],
    ]);
    expect(decisaoPadraoLista(previa[0])).toEqual({ tipo: "ligar", materialId: "m1" });
    expect(decisaoPadraoLista(previa[1])).toMatchObject({ tipo: "criar", categoria: "inversores", unidade: "un" });
    const r = itensLista(previa, decisaoPadraoLista);
    expect(r).toEqual({
      itens: [
        { material_id: "m1", descricao: "Módulo Jinko 620W", potencia_w: 620 },
        { novo: { nome: "Inversor Deye SUN-8K", categoria: "inversores", unidade: "un" }, descricao: "Inversor Deye SUN-8K", potencia_w: 8000 },
        { novo: { nome: "String box 2E/2S", categoria: "cabos_protecao", unidade: "un" }, descricao: "String box 2E/2S" },
      ],
    });
  });

  it("categoria escrita como na lista do Raion é aceita", () => {
    expect(categoriaDaLinha("cabos protecao", "Qualquer")).toBe("cabos_protecao");
    expect(categoriaDaLinha("", "Inversor X")).toBe("inversores");
  });

  it("duas linhas no mesmo equipamento: erro", () => {
    const previa = montarPreviaLista({ linhas: lista.slice(0, 3), mapa: adivinharMapaLista(lista)!, materiais: MATERIAIS });
    expect(itensLista(previa, () => ({ tipo: "ligar", materialId: "m1" }))).toEqual({
      erro: "As linhas 2 e 3 ficaram com o mesmo equipamento. Ligue cada linha a um equipamento diferente.",
    });
  });
});
