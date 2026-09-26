/** Metas (gamificação): progresso puro a partir de um "realizado" já calculado — dias, projeção, % e faltante. */
import { describe, expect, it } from "vitest";
import { calcularProgresso } from "@/lib/metas";

describe("calcularProgresso", () => {
  it("no meio do período, projeta o final a partir da média diária", () => {
    // Período de 10 dias (inclusive), hoje é o 5º dia (4 já passaram + hoje = 5 dias decorridos).
    const r = calcularProgresso(1000, 400, "2026-01-01", "2026-01-10", new Date("2026-01-05T12:00:00Z"));
    expect(r.diasTotais).toBe(10);
    expect(r.diasPassados).toBe(5);
    expect(r.diasRestantes).toBe(5);
    expect(r.mediaDiariaRealizada).toBe(80);
    expect(r.faltante).toBe(600);
    expect(r.necessarioPorDiaRestante).toBe(120);
    expect(r.projecaoFinal).toBe(800);
    expect(r.percentual).toBe(40);
  });

  it("antes do início do período, não conta nenhum dia decorrido", () => {
    const r = calcularProgresso(1000, 0, "2026-02-01", "2026-02-10", new Date("2026-01-20T00:00:00Z"));
    expect(r.diasPassados).toBe(0);
    expect(r.diasRestantes).toBe(10);
    expect(r.mediaDiariaRealizada).toBe(0);
    expect(r.necessarioPorDiaRestante).toBe(100);
  });

  it("depois do fim do período, não sobra dia restante e a meta é dada como encerrada", () => {
    const r = calcularProgresso(1000, 900, "2026-01-01", "2026-01-10", new Date("2026-02-01T00:00:00Z"));
    expect(r.diasPassados).toBe(10);
    expect(r.diasRestantes).toBe(0);
    expect(r.necessarioPorDiaRestante).toBeNull();
    expect(r.faltante).toBe(100);
  });

  it("meta batida: faltante fica em zero, mesmo tendo ultrapassado o alvo", () => {
    const r = calcularProgresso(500, 700, "2026-01-01", "2026-01-10", new Date("2026-01-05T00:00:00Z"));
    expect(r.faltante).toBe(0);
    expect(r.percentual).toBe(140);
  });

  it("período de um único dia", () => {
    const r = calcularProgresso(100, 30, "2026-03-01", "2026-03-01", new Date("2026-03-01T23:00:00Z"));
    expect(r.diasTotais).toBe(1);
    expect(r.diasPassados).toBe(1);
    expect(r.diasRestantes).toBe(0);
    expect(r.mediaDiariaRealizada).toBe(30);
  });
});
