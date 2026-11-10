import { describe, expect, it } from "vitest";
import { adivinharMapa, chaveFornecedor, diasDesde, erroMapa, historicoComMudancas, itensImportacao, letraColuna, lerCsv, lerPrecoCelula, montarPrevia, normalizarUnidade, precoSugerido, resumoPrevia, variacao, type MapaColunas, type MaterialVM } from "@/lib/compras/precos";
import { lerMargemPercentual, margemEmTexto, vendaSugerida } from "@/lib/compras/margens";

describe("leitura da planilha", () => {
  it("CSV com ponto e vírgula, aspas, BOM e CRLF", () => {
    expect(lerCsv('﻿Cód.;Descrição;Preço\r\n44102;"MOD 550W ""MONO""";780,00\r\n44130;"A;B";905\r\n')).toEqual([
      ["Cód.", "Descrição", "Preço"],
      ["44102", 'MOD 550W "MONO"', "780,00"],
      ["44130", "A;B", "905"],
    ]);
  });

  it("CSV com vírgula e sem quebra no fim", () => {
    expect(lerCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preço em número, texto brasileiro, R$ e ponto decimal", () => {
    expect(lerPrecoCelula(780)).toBe(780);
    expect(lerPrecoCelula(10.404)).toBe(10.4);
    expect(lerPrecoCelula("R$ 1.234,56")).toBe(1234.56);
    expect(lerPrecoCelula("5.900,00")).toBe(5900);
    expect(lerPrecoCelula("780.5")).toBe(780.5);
    expect(lerPrecoCelula("")).toBeNull();
    expect(lerPrecoCelula(null)).toBeNull();
    expect(lerPrecoCelula("sob consulta")).toBeNaN();
  });

  it("letra da coluna", () => {
    expect([0, 4, 25, 26, 27].map(letraColuna)).toEqual(["A", "E", "Z", "AA", "AB"]);
  });

  it("palpite das colunas acha o cabeçalho depois das linhas de título", () => {
    const linhas = [["Tabela Solar Sul — novembro"], [], ["Cód.", "Descrição", "Un", "NCM", "Preço c/ IPI"], ["44102", "MOD 550W", "un", "x", 780]];
    expect(adivinharMapa(linhas)).toEqual({ cabecalho: 2, codigo: 0, material: 1, unidade: 2, preco: 4 });
    expect(adivinharMapa([["a", "b"]])).toBeNull();
  });

  it("mapa inválido com coluna repetida", () => {
    expect(erroMapa({ cabecalho: 0, material: 1, preco: 1, codigo: null, unidade: null })).toMatch(/diferentes/);
    expect(erroMapa({ cabecalho: 0, material: 1, preco: 2, codigo: 2, unidade: null })).toMatch(/um significado/);
    expect(erroMapa({ cabecalho: 0, material: 1, preco: 2, codigo: 0, unidade: null })).toBeNull();
  });

  it("unidade no padrão do Raion", () => {
    expect(normalizarUnidade("UN")).toBe("un");
    expect(normalizarUnidade("Peça")).toBe("un");
    expect(normalizarUnidade("Metro")).toBe("m");
    expect(normalizarUnidade(null)).toBe("un");
    expect(normalizarUnidade("kg")).toBe("kg");
  });
});

describe("prévia da importação", () => {
  const mapa: MapaColunas = { cabecalho: 0, codigo: 0, material: 1, unidade: 2, preco: 3 };
  const materiais: MaterialVM[] = [
    { id: "mod", nome: "Módulo 550 W", categoria: "modulos", unidade: "un", potenciaW: 550 },
    { id: "inv", nome: "Inversor 5 kW", categoria: "inversores", unidade: "un", potenciaW: 5000 },
    { id: "sb", nome: "String box", categoria: "cabos_protecao", unidade: "un", potenciaW: null },
    { id: "cabo", nome: "Cabo solar 6 mm²", categoria: "cabos_protecao", unidade: "m", potenciaW: null },
  ];
  const vinculos = [
    { materialId: "mod", codigo: "44102", descricao: "MOD 550W MONO" },
    { materialId: "inv", codigo: null, descricao: "INV 5K MONOF" },
    { materialId: "cabo", codigo: "70016", descricao: "CABO SOLAR 6MM PT" },
  ];
  const precosAtuais = [
    { materialId: "mod", preco: 780, dataPreco: "2026-10-03" },
    { materialId: "inv", preco: 5900, dataPreco: "2026-10-03" },
    { materialId: "cabo", preco: 9.8, dataPreco: "2026-10-03" },
  ];
  const linhas = [
    ["Cód.", "Descrição", "Un", "Preço"],
    ["44102", "Mod 550w mono (novo nome)", "un", "800,00"],
    ["51007", "inv 5k monof", "un", 5820],
    ["44130", "MOD 610W BIFACIAL", "un", 905],
    ["60211", "String box", "un", 640],
    ["70016", "CABO SOLAR 6MM PT", "m", ""],
    [],
    ["70016", "CABO SOLAR 6MM PT", "m", "9,80"],
    ["44102", "MOD 550W MONO", "un", 799],
  ];
  const previa = montarPrevia({ linhas, mapa, materiais, vinculos, precosAtuais });

  it("classifica por código, descrição e nome; pula linha vazia", () => {
    expect(previa.map((l) => [l.numero, l.situacao, l.materialId])).toEqual([
      [2, "subiu", "mod"],
      [3, "baixou", "inv"],
      [4, "novo", null],
      [5, "novo", "sb"],
      [6, "problema", null],
      [8, "igual", "cabo"],
      [9, "problema", null],
    ]);
    expect(previa[4].problema).toBe("Sem preço");
    expect(previa[6].problema).toBe("Repetido (linha 2)");
    expect(previa[0].precoAnterior).toBe(780);
    expect(resumoPrevia(previa)).toEqual({ iguais: 1, subiram: 1, baixaram: 1, novos: 2, problemas: 2 });
  });

  it("itens da importação: todas as linhas válidas, novas pela decisão", () => {
    expect(itensImportacao(previa, {})).toEqual({ erro: 'Escolha o material da linha 4 ("MOD 610W BIFACIAL").' });
    const r = itensImportacao(previa, {
      4: { tipo: "criar", nome: "  Módulo  610 W bifacial ", categoria: "modulos", unidade: "un" },
      5: { tipo: "ligar", materialId: "sb" },
    });
    expect(r).toEqual({
      itens: [
        { material_id: "mod", codigo: "44102", descricao: "Mod 550w mono (novo nome)", preco: 800 },
        { material_id: "inv", codigo: "51007", descricao: "inv 5k monof", preco: 5820 },
        { novo: { nome: "Módulo 610 W bifacial", categoria: "modulos", unidade: "un" }, codigo: "44130", descricao: "MOD 610W BIFACIAL", preco: 905 },
        { material_id: "sb", codigo: "60211", descricao: "String box", preco: 640 },
        { material_id: "cabo", codigo: "70016", descricao: "CABO SOLAR 6MM PT", preco: 9.8 },
      ],
    });
  });

  it("recusa duas linhas no mesmo material", () => {
    const r = itensImportacao(previa, { 4: { tipo: "ligar", materialId: "mod" }, 5: { tipo: "ligar", materialId: "sb" } });
    expect(r).toEqual({ erro: "As linhas 2 e 4 ficaram com o mesmo material. Ligue cada linha a um material diferente." });
  });
});

describe("histórico e preço sugerido", () => {
  it("histórico mostra só as mudanças, por fornecedor", () => {
    const h = historicoComMudancas([
      { fornecedor: "Solar Sul", preco: 780, dataPreco: "2026-10-01", criadoEm: "2026-10-01T10:00:00Z", manual: false, lancadoPor: null },
      { fornecedor: "solar  sul", preco: 780, dataPreco: "2026-10-15", criadoEm: "2026-10-15T10:00:00Z", manual: false, lancadoPor: null },
      { fornecedor: "Atacado", preco: 795, dataPreco: "2026-10-20", criadoEm: "2026-10-20T10:00:00Z", manual: true, lancadoPor: null },
      { fornecedor: "Solar Sul", preco: 800, dataPreco: "2026-11-03", criadoEm: "2026-11-03T10:00:00Z", manual: false, lancadoPor: null },
    ]);
    expect(h.map((x) => [x.fornecedor, x.preco, x.anterior])).toEqual([
      ["Solar Sul", 800, 780],
      ["Atacado", 795, null],
      ["Solar Sul", 780, null],
    ]);
  });

  it("preço do fornecedor do pedido; senão o melhor", () => {
    const precos = [
      { fornecedor: "Solar Sul", preco: 800, dataPreco: "2026-11-03" },
      { fornecedor: "Atacado Energia", preco: 795, dataPreco: "2026-11-01" },
    ];
    expect(precoSugerido(precos, " solar sul ")).toEqual({ ...precos[0], doFornecedor: true });
    expect(precoSugerido(precos, "Outro")).toEqual({ ...precos[1], doFornecedor: false });
    expect(precoSugerido(precos, "")).toEqual({ ...precos[1], doFornecedor: false });
    expect(precoSugerido([], "x")).toBeNull();
  });

  it("variação, dias e chave do fornecedor", () => {
    expect(variacao(780, 800)).toBe(2.6);
    expect(variacao(5900, 5820)).toBe(-1.4);
    expect(diasDesde("2026-10-06", "2026-11-09")).toBe(34);
    expect(chaveFornecedor("  Solar   SUL ")).toBe("solar sul");
  });
});

describe("margem por categoria (P4a)", () => {
  it("venda sugerida = custo × (1 + margem), em centavos", () => {
    expect(vendaSugerida(780, 0.18)).toBe(920.4);
    expect(vendaSugerida(9.8, 0.3)).toBe(12.74);
    expect(vendaSugerida(5900, 0)).toBe(5900);
  });

  it("margem digitada em %, com vírgula ou ponto", () => {
    expect(lerMargemPercentual("18")).toBe(0.18);
    expect(lerMargemPercentual("18,5")).toBe(0.185);
    expect(lerMargemPercentual("18.5%")).toBe(0.185);
    expect(lerMargemPercentual("0")).toBe(0);
    expect(lerMargemPercentual("")).toBeNull();
    expect(lerMargemPercentual("-1")).toBeNull();
    expect(lerMargemPercentual("501")).toBeNull();
    expect(lerMargemPercentual("abc")).toBeNull();
    expect(margemEmTexto(0.185)).toBe("18,5");
    expect(margemEmTexto(0)).toBe("0");
  });
});
