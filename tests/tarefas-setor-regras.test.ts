/** Regras puras das tarefas de setor: prazo em dias úteis, hoje em Brasília e data no formato brasileiro. */
import { describe, expect, it } from "vitest";
import {
  contarAbertasPorAba,
  contarPendenciasDoSetor,
  dataBr,
  hojeBrasilia,
  PRAZO_PADRAO_DIAS_UTEIS,
  somarDiasUteis,
  substituicaoDaTarefa,
  type Substituicao,
} from "@/lib/tarefas-setor-regras";
import { atrasosDaObra, type JustificativaVM } from "@/lib/obras/justificativas";

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

describe("substituto por obra (20261123100000)", () => {
  const eu = "m-eu";
  const subs: Substituicao[] = [
    { obraId: "o1", setor: "compras", principalId: "m-ana" },
    { obraId: "o2", setor: "engenharia", principalId: null },
  ];

  it("a tarefa é comigo quando está com o principal que eu substituo, naquela obra e setor", () => {
    expect(substituicaoDaTarefa({ obra_id: "o1", setor: "compras", responsavel_id: "m-ana" }, subs)).toEqual(subs[0]);
    // Outro responsável, outro setor, outra obra, na fila ou sem principal: não.
    expect(substituicaoDaTarefa({ obra_id: "o1", setor: "compras", responsavel_id: "m-bia" }, subs)).toBeNull();
    expect(substituicaoDaTarefa({ obra_id: "o1", setor: "engenharia", responsavel_id: "m-ana" }, subs)).toBeNull();
    expect(substituicaoDaTarefa({ obra_id: "o3", setor: "compras", responsavel_id: "m-ana" }, subs)).toBeNull();
    expect(substituicaoDaTarefa({ obra_id: "o1", setor: "compras", responsavel_id: null }, subs)).toBeNull();
    expect(substituicaoDaTarefa({ obra_id: null, setor: "compras", responsavel_id: "m-ana" }, subs)).toBeNull();
    expect(substituicaoDaTarefa({ obra_id: "o2", setor: "engenharia", responsavel_id: "m-ana" }, subs)).toBeNull();
  });

  it("as contagens de \"Comigo\" e do sininho incluem as do principal que eu substituo", () => {
    const linhas = [
      { responsavel_id: eu, criado_por: null, setor: "engenharia", obra_id: "o9" },
      { responsavel_id: "m-ana", criado_por: null, setor: "compras", obra_id: "o1" },
      { responsavel_id: "m-ana", criado_por: null, setor: "compras", obra_id: "o5" },
    ];
    expect(contarAbertasPorAba(linhas, eu, subs).minhas).toBe(2);
    expect(contarAbertasPorAba(linhas, eu).minhas).toBe(1);
    expect(contarPendenciasDoSetor(linhas, eu, [], subs)).toBe(2);
  });

  it("justificativa: o substituto do setor da etapa responde; de outro setor, não", () => {
    const justificativa: JustificativaVM = {
      id: "j1",
      etapa: "compra",
      pedidoA: "Ana",
      pedidoAId: "m-ana",
      pedidoEm: "2026-11-01T12:00:00Z",
      cobradoEm: null,
      prazo: "2026-11-05",
      texto: null,
      respondidoPor: null,
      respondidoEm: null,
    };
    const montar = (substituo: (setor: string) => boolean) =>
      atrasosDaObra({
        etapas: [{ etapa: "compra", atraso_proprio: 3 }],
        justificativas: new Map([["compra", justificativa]]),
        membroId: eu,
        autorizacao: () => "executar",
        substituo,
      })[0].justificativa?.podeResponder;
    expect(montar((s) => s === "compras")).toBe(true);
    expect(montar((s) => s === "engenharia")).toBe(false);
  });
});
