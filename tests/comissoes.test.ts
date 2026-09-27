/** Comissões (gamificação): faixas de resultado e cálculo do valor — funções puras. */
import { describe, expect, it } from "vitest";
import { calcularValorComissao, encontrarFaixa, type FaixaComissao } from "@/lib/comissoes";

const faixas: FaixaComissao[] = [
  { resultado_minimo: 0, resultado_maximo: 10000, valor: 3 },
  { resultado_minimo: 10000, resultado_maximo: 20000, valor: 5 },
  { resultado_minimo: 20000, resultado_maximo: null, valor: 8 },
];

describe("encontrarFaixa", () => {
  it("encontra a primeira faixa quando o resultado está no início", () => {
    expect(encontrarFaixa(faixas, 0)?.valor).toBe(3);
  });

  it("o limite superior é exclusivo: a faixa seguinte assume no ponto exato", () => {
    expect(encontrarFaixa(faixas, 10000)?.valor).toBe(5);
  });

  it("encontra a última faixa (sem teto) para resultados altos", () => {
    expect(encontrarFaixa(faixas, 999999)?.valor).toBe(8);
  });

  it("retorna null quando nenhuma faixa cobre o resultado (ex.: negativo)", () => {
    expect(encontrarFaixa(faixas, -1)).toBeNull();
  });

  it("retorna null quando não há faixas configuradas", () => {
    expect(encontrarFaixa([], 5000)).toBeNull();
  });
});

describe("calcularValorComissao", () => {
  it("percentual: aplica o valor da faixa como porcentagem do resultado", () => {
    const faixa = { resultado_minimo: 10000, resultado_maximo: 20000, valor: 5 };
    expect(calcularValorComissao("percentual", faixa, 15000)).toBe(750);
  });

  it("multiplicador: aplica o valor da faixa diretamente sobre o resultado", () => {
    const faixa = { resultado_minimo: 0, resultado_maximo: null, valor: 0.1 };
    expect(calcularValorComissao("multiplicador", faixa, 15000)).toBe(1500);
  });

  it("sem faixa aplicável, a comissão é zero", () => {
    expect(calcularValorComissao("percentual", null, 15000)).toBe(0);
  });
});
