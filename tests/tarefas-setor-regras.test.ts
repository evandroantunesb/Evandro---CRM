/** Regras puras das tarefas de setor: prazo em dias úteis, hoje em Brasília e data no formato brasileiro. */
import { describe, expect, it } from "vitest";
import {
  contarAbertasPorAba,
  contarPendenciasDoSetor,
  dataBr,
  hojeBrasilia,
  PRAZO_PADRAO_DIAS_UTEIS,
  somarDiasUteis,
} from "@/lib/tarefas-setor-regras";

describe("dias úteis", () => {
  it("pula sábado e domingo", () => {
    // 29/10/2026 é quinta-feira.
    expect(somarDiasUteis("2026-10-29", 1)).toBe("2026-10-30");
    expect(somarDiasUteis("2026-10-29", 2)).toBe("2026-11-02");
    expect(somarDiasUteis("2026-10-31", 1)).toBe("2026-11-02");
    expect(somarDiasUteis("2026-10-29", 0)).toBe("2026-10-29");
  });

  it("prazo padrão é de 2 dias úteis", () => {
    expect(PRAZO_PADRAO_DIAS_UTEIS).toBe(2);
  });
});

describe("datas", () => {
  it("hoje no fuso de Brasília, mesmo de madrugada em UTC", () => {
    expect(hojeBrasilia(new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29");
    expect(hojeBrasilia(new Date("2026-10-30T03:00:00Z"))).toBe("2026-10-30");
  });

  it("AAAA-MM-DD vira DD/MM/AAAA", () => {
    expect(dataBr("2026-11-02")).toBe("02/11/2026");
  });
});

describe("contagens das abas e do sininho", () => {
  const eu = "m1";
  const linhas = [
    { responsavel_id: eu, criado_por: "v1", setor: "engenharia" },
    { responsavel_id: null, criado_por: "v1", setor: "engenharia" },
    { responsavel_id: null, criado_por: eu, setor: "compras" },
    { responsavel_id: "m2", criado_por: "v1", setor: "engenharia" },
  ];

  it("cada aba conta as abertas que mostra", () => {
    expect(contarAbertasPorAba(linhas, eu)).toEqual({ abertas: 4, minhas: 1, fila: 2, pedidas: 1 });
    expect(contarAbertasPorAba([], eu)).toEqual({ abertas: 0, minhas: 0, fila: 0, pedidas: 0 });
  });

  it("pendências de quem executa: as suas e a fila dos seus setores, não o que pediu a outro setor", () => {
    expect(contarPendenciasDoSetor(linhas, eu, ["engenharia"])).toBe(2);
    expect(contarPendenciasDoSetor(linhas, eu, ["engenharia", "compras"])).toBe(3);
    expect(contarPendenciasDoSetor(linhas, eu, [])).toBe(1);
  });
});
