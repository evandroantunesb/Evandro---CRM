/** Exibição da projeção de 25 anos (proposta completa, PR 2b-2). Puro, dados fictícios. */
import { describe, expect, it } from "vitest";
import type { AnoProjecao } from "@/lib/projecao-financeira";
import { anoDoPayback, anosDaProjecaoSalva, barrasDoSaldo, ehMotivoSemPayback, textoPaybackAnosMeses } from "@/lib/projecao-exibicao";

const ano = (n: number, saldo: number | null, troca = 0): AnoProjecao => ({
  ano: n,
  anoCivilInicio: 2025 + n,
  geracaoKwh: 9000,
  contaSemSolar: 7000,
  contaComSolar: 2000,
  economia: 5000,
  trocaInversor: troca,
  saldoAcumulado: saldo,
});

describe("textoPaybackAnosMeses", () => {
  it("anos e meses, com singular e plural", () => {
    expect(textoPaybackAnosMeses(55)).toBe("4 anos e 7 meses");
    expect(textoPaybackAnosMeses(13)).toBe("1 ano e 1 mês");
    expect(textoPaybackAnosMeses(60)).toBe("5 anos");
    expect(textoPaybackAnosMeses(11)).toBe("11 meses");
    expect(textoPaybackAnosMeses(1)).toBe("1 mês");
  });
  it("nunca '0 meses': nulo, zero, negativo ou inválido = nulo", () => {
    for (const v of [null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(textoPaybackAnosMeses(v)).toBeNull();
  });
});

describe("anoDoPayback", () => {
  it("o ano em que o mês cai", () => {
    expect(anoDoPayback(12)).toBe(1);
    expect(anoDoPayback(13)).toBe(2);
    expect(anoDoPayback(55)).toBe(5);
    expect(anoDoPayback(null)).toBeNull();
    expect(anoDoPayback(0)).toBeNull();
  });
});

describe("ehMotivoSemPayback", () => {
  it("só os três motivos gravados pelo banco", () => {
    expect(ehMotivoSemPayback("inversor_sem_preco")).toBe(true);
    expect(ehMotivoSemPayback("sem_investimento")).toBe(true);
    expect(ehMotivoSemPayback("nao_se_paga_no_horizonte")).toBe(true);
    expect(ehMotivoSemPayback("outro")).toBe(false);
    expect(ehMotivoSemPayback(null)).toBe(false);
  });
});

describe("anosDaProjecaoSalva", () => {
  const anos = [ano(1, -15000), ano(2, -10000), ano(3, -5000)];
  it("lê a projeção gravada", () => {
    expect(anosDaProjecaoSalva({ premissas: {}, anos })).toEqual(anos);
  });
  it("aceita saldo nulo (inversor sem preço)", () => {
    expect(anosDaProjecaoSalva({ anos: [ano(1, null)] })).toEqual([ano(1, null)]);
  });
  it("qualquer forma inesperada = nulo (nunca desenha dado que não confere)", () => {
    expect(anosDaProjecaoSalva(null)).toBeNull();
    expect(anosDaProjecaoSalva({})).toBeNull();
    expect(anosDaProjecaoSalva({ anos: [] })).toBeNull();
    expect(anosDaProjecaoSalva({ anos: [{ ...ano(1, 0), economia: "5000" }] })).toBeNull();
    expect(anosDaProjecaoSalva({ anos: [ano(2, 0)] })).toBeNull();
    expect(anosDaProjecaoSalva({ anos: [ano(1, 0), ano(3, 0)] })).toBeNull();
  });
});

describe("barrasDoSaldo", () => {
  it("negativo fica abaixo da linha do zero e positivo acima, na mesma escala", () => {
    const g = barrasDoSaldo([ano(1, -30000), ano(2, 0), ano(3, 10000)])!;
    expect(g.zeroPct).toBeCloseTo(25);
    expect(g.barras[0]).toMatchObject({ positivo: false, topoPct: 25 });
    expect(g.barras[0]!.alturaPct).toBeCloseTo(75);
    expect(g.barras[2]).toMatchObject({ positivo: true });
    expect(g.barras[2]!.topoPct).toBeCloseTo(0);
    expect(g.barras[2]!.alturaPct).toBeCloseTo(25);
  });
  it("saldo zero ainda tem um fio visível", () => {
    expect(barrasDoSaldo([ano(1, -100), ano(2, 0)])!.barras[1]!.alturaPct).toBeGreaterThan(0);
  });
  it("todo negativo (não se paga): zero no topo, tudo cinza", () => {
    const g = barrasDoSaldo([ano(1, -30000), ano(2, -20000)])!;
    expect(g.zeroPct).toBe(0);
    expect(g.barras.every((b) => !b.positivo)).toBe(true);
  });
  it("sem saldo (inversor sem preço) não há gráfico", () => {
    expect(barrasDoSaldo([ano(1, null)])).toBeNull();
    expect(barrasDoSaldo([])).toBeNull();
  });
});
