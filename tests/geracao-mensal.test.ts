import { describe, expect, it } from "vitest";
import {
  algumMesPresente,
  distribuirGeracaoMensal,
  escalaDoGrafico,
  lerDozeMeses,
  MESES_ABREV,
  MESES_NOMES,
  mediaDosMeses,
} from "@/lib/geracao-mensal";

const CURVA = [5.9, 5.7, 5.3, 4.6, 3.8, 3.4, 3.6, 4.5, 4.7, 5.4, 6, 6.1];
const soma = (v: readonly number[]) => v.reduce((a, b) => a + b, 0);
const doze = (prefixo: string, valores: string[]) =>
  Object.fromEntries(valores.map((v, i) => [`${prefixo}${String(i + 1).padStart(2, "0")}`, v]));

describe("meses", () => {
  it("tem os 12 nomes e abreviações", () => {
    expect(MESES_ABREV).toEqual(["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]);
    expect(MESES_NOMES[2]).toBe("Março");
    expect(MESES_NOMES).toHaveLength(12);
  });
});

describe("distribuirGeracaoMensal", () => {
  it("redistribui o ano pela curva, em kWh inteiros, sem mudar o total", () => {
    const g = distribuirGeracaoMensal(732, CURVA)!;
    expect(g).toHaveLength(12);
    expect(soma(g)).toBe(8784);
    expect(g[11]).toBe(908);
    expect(g[5]).toBe(506);
    expect(g.every(Number.isInteger)).toBe(true);
  });

  it("curva muito desigual: soma exata e nenhum mês negativo", () => {
    const g = distribuirGeracaoMensal(100, [100, ...Array(11).fill(0.001)])!;
    expect(soma(g)).toBe(1200);
    expect(g.every((v) => v >= 0)).toBe(true);
  });

  it("geração quebrada: soma igual ao total do ano arredondado", () => {
    expect(soma(distribuirGeracaoMensal(732.37, CURVA)!)).toBe(Math.round(732.37 * 12));
  });

  it("recusa curva inválida e geração sem valor", () => {
    expect(distribuirGeracaoMensal(732, CURVA.slice(0, 11))).toBeNull();
    expect(distribuirGeracaoMensal(732, [0, ...CURVA.slice(1)])).toBeNull();
    expect(distribuirGeracaoMensal(732, [Number.NaN, ...CURVA.slice(1)])).toBeNull();
    expect(distribuirGeracaoMensal(0, CURVA)).toBeNull();
  });
});

describe("lerDozeMeses", () => {
  const consumo = ["720", "700", "680", "630", "600", "600", "610", "620", "630", "650", "680", "700"];

  it("lê os 12 meses no formato brasileiro", () => {
    expect(lerDozeMeses(doze("c", consumo), "c", "zero_ou_mais", "consumo")).toEqual({ ok: true, valores: consumo.map(Number) });
    const curva = lerDozeMeses(doze("c", ["5,9", ...consumo.slice(1)]), "c", "positivo", "curva");
    expect(curva.ok && curva.valores?.[0]).toBe(5.9);
  });

  it("todos vazios ou ausentes: nenhum", () => {
    expect(lerDozeMeses(doze("c", Array(12).fill("")), "c", "zero_ou_mais", "consumo")).toEqual({ ok: true, valores: null });
    expect(lerDozeMeses({}, "c", "zero_ou_mais", "consumo")).toEqual({ ok: true, valores: null });
  });

  it("meses faltando: recusa e diz quais", () => {
    const r = lerDozeMeses(doze("c", [...consumo.slice(0, 9), "", "", ""]), "c", "zero_ou_mais", "consumo mês a mês");
    expect(r).toEqual({ ok: false, mensagem: "Faltam 3 meses de consumo mês a mês (Out, Nov, Dez). Preencha os 12 ou deixe todos vazios." });
  });

  it("valor fora do mínimo ou inválido: recusa citando o mês", () => {
    const comZero = doze("c", ["5", "5", "0", ...Array(9).fill("5")]);
    expect(lerDozeMeses(comZero, "c", "zero_ou_mais", "consumo").ok).toBe(true);
    expect(lerDozeMeses(comZero, "c", "positivo", "curva de geração")).toEqual({ ok: false, mensagem: "curva de geração: valor inválido em Março." });
    expect(lerDozeMeses(doze("c", ["-5", ...consumo.slice(1)]), "c", "zero_ou_mais", "consumo").ok).toBe(false);
    expect(lerDozeMeses(doze("c", ["abc", ...consumo.slice(1)]), "c", "zero_ou_mais", "consumo").ok).toBe(false);
  });
});

describe("auxiliares", () => {
  it("algumMesPresente olha só se o campo veio", () => {
    expect(algumMesPresente({}, "c")).toBe(false);
    expect(algumMesPresente({ c03: "" }, "c")).toBe(true);
  });

  it("média dos meses em kWh inteiros", () => {
    expect(mediaDosMeses([720, 700, 680, 630, 600, 600, 610, 620, 630, 650, 680, 700])).toBe(652);
  });

  it("escala do gráfico em degraus de 250, cobrindo o maior valor", () => {
    expect(escalaDoGrafico([908, 720])).toEqual({ maximo: 1000, marcas: [1000, 750, 500, 250, 0] });
    expect(escalaDoGrafico([2000, 400]).maximo).toBe(2000);
    expect(escalaDoGrafico([0])).toEqual({ maximo: 250, marcas: [250, 187.5, 125, 62.5, 0] });
  });
});
