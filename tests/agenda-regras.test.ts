/** Agenda operacional: período (semana e mês), navegação, títulos, eventos do dia e filtros. */
import { describe, expect, it } from "vitest";
import {
  diaDaInstalacao,
  diasDoPeriodo,
  ehDataValida,
  eventosDoDia,
  filtrarEventos,
  inicioSemana,
  navegar,
  tiposDaUrl,
  tituloPeriodo,
  type EventoAgenda,
} from "@/lib/obras/agenda-regras";

const evento = (e: Partial<EventoAgenda>): EventoAgenda => ({
  tipo: "instalacao",
  obraId: "o1",
  obraNumero: 1,
  clienteNome: "Cliente",
  inicio: "2026-11-17",
  fim: "2026-11-19",
  detalhe: "Equipe Sol",
  equipeId: "e1",
  situacao: "agendada",
  alerta: false,
  ...e,
});

describe("período", () => {
  it("semana começa na segunda, inclusive a partir de domingo", () => {
    expect(inicioSemana("2026-11-18")).toBe("2026-11-16");
    expect(inicioSemana("2026-11-22")).toBe("2026-11-16");
    expect(inicioSemana("2026-11-16")).toBe("2026-11-16");
    expect(diasDoPeriodo("semana", "2026-11-18")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
  });

  it("mês em semanas inteiras, de segunda a domingo (cabe na consulta de até 62 dias)", () => {
    const nov = diasDoPeriodo("mes", "2026-11-18");
    expect(nov[0]).toBe("2026-10-26");
    expect(nov.at(-1)).toBe("2026-12-06");
    expect(nov.length % 7).toBe(0);
    const fev = diasDoPeriodo("mes", "2027-02-10");
    expect(fev[0]).toBe("2027-02-01");
    expect(fev.at(-1)).toBe("2027-02-28");
  });

  it("navega por semana e por mês, inclusive na virada do ano", () => {
    expect(navegar("semana", "2026-11-18", 1)).toBe("2026-11-23");
    expect(navegar("semana", "2026-11-18", -1)).toBe("2026-11-09");
    expect(navegar("mes", "2026-12-31", 1)).toBe("2027-01-01");
    expect(navegar("mes", "2026-01-15", -1)).toBe("2025-12-01");
  });

  it("títulos", () => {
    expect(tituloPeriodo("semana", "2026-11-18")).toBe("16 a 22 de novembro");
    expect(tituloPeriodo("semana", "2026-10-29")).toBe("26 de outubro a 1 de novembro");
    expect(tituloPeriodo("mes", "2026-11-18")).toBe("Novembro de 2026");
  });

  it("data da URL só no formato e com dia que existe", () => {
    expect(ehDataValida("2026-11-18")).toBe(true);
    for (const ruim of ["2026-02-30", "18/11/2026", "", undefined, ["2026-11-18"]]) expect(ehDataValida(ruim)).toBe(false);
  });
});

describe("eventos", () => {
  it("instalação aparece em todos os dias do agendamento, com a posição do dia", () => {
    const e = evento({});
    expect(eventosDoDia([e], "2026-11-16")).toEqual([]);
    expect(eventosDoDia([e], "2026-11-18")).toEqual([e]);
    expect(diaDaInstalacao(e, "2026-11-18")).toBe("2º de 3 dias");
    expect(diaDaInstalacao(evento({ tipo: "vistoria", inicio: "2026-11-18", fim: "2026-11-18" }), "2026-11-18")).toBeNull();
  });

  it("no dia: instalações primeiro, depois por tipo e cliente", () => {
    const lista = [
      evento({ tipo: "entrega_contratada", obraId: "a", clienteNome: "Beatriz", inicio: "2026-11-18", fim: "2026-11-18" }),
      evento({ tipo: "vistoria", obraId: "b", clienteNome: "Ana", inicio: "2026-11-18", fim: "2026-11-18" }),
      evento({ obraId: "c", clienteNome: "Zé" }),
    ];
    expect(eventosDoDia(lista, "2026-11-18").map((e) => e.obraId)).toEqual(["c", "b", "a"]);
  });

  it("filtros por tipo e por equipe (a equipe só filtra instalações)", () => {
    const lista = [evento({ obraId: "a", equipeId: "e1" }), evento({ obraId: "b", equipeId: "e2" }), evento({ tipo: "vistoria", obraId: "c", equipeId: null })];
    expect(filtrarEventos(lista, { tipos: [], equipe: null })).toHaveLength(3);
    expect(filtrarEventos(lista, { tipos: ["vistoria"], equipe: null }).map((e) => e.obraId)).toEqual(["c"]);
    expect(filtrarEventos(lista, { tipos: [], equipe: "e2" }).map((e) => e.obraId)).toEqual(["b", "c"]);
    expect(tiposDaUrl("vistoria,xyz,instalacao")).toEqual(["instalacao", "vistoria"]);
    expect(tiposDaUrl(undefined)).toEqual([]);
  });
});
