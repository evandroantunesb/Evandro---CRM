import { describe, expect, it } from "vitest";
import { agendaPrazos, cargaPorResponsavel, dataCurta, montarMeuDia, resumoFaixa } from "@/lib/engenharia-inicio";
import type { PrazoObra } from "@/lib/engenharia-prazos-regras";
import type { ObraNaEngenharia } from "@/lib/engenharia-regras";
import type { TarefaSetorVM } from "@/lib/tarefas-setor-regras";

const HOJE = "2026-11-03";

const obra = (numero: number, extra: Partial<ObraNaEngenharia> = {}): ObraNaEngenharia => ({
  id: `o${numero}`,
  numero,
  clienteNome: `Cliente ${numero}`,
  cidadeUf: "Curitiba/PR",
  potenciaKwp: 8.2,
  status: "projeto_em_elaboracao",
  statusRotulo: "Projeto em elaboração",
  estado: "em_andamento",
  aguardando: null,
  principalNome: "Lucas",
  souPrincipal: true,
  proximaAcao: "Concluir projeto e documentação",
  comTerceiro: false,
  desde: "2026-10-20T12:00:00Z",
  ...extra,
});

const tarefa = (id: string, prazo: string, extra: Partial<TarefaSetorVM> = {}): TarefaSetorVM =>
  ({
    id,
    titulo: `Tarefa ${id}`,
    prazo,
    atrasada: false,
    responsavel: { id: "eu", nome: "Lucas" },
    pedidoPor: "Rafael",
    referencia: { rotulo: "Obra #214", href: "/engenharia/o214" },
    ...extra,
  }) as TarefaSetorVM;

const prazo = (diasRestantes: number, limite: string, chave: PrazoObra["chave"] = "projeto_em_elaboracao"): PrazoObra => ({ chave, limite, diasRestantes });

describe("dataCurta", () => {
  it("dia da semana e data, sem fuso", () => {
    expect(dataCurta("2026-11-06")).toBe("sex, 06/11");
    expect(dataCurta("2026-11-03T23:59:00Z")).toBe("ter, 03/11");
  });
});

describe("montarMeuDia", () => {
  it("separa por urgência: prazo vencido, hoje e o resto da semana; obra sem prazo vai para a semana", () => {
    const dia = montarMeuDia({
      acoes: [obra(211), obra(216), obra(207)],
      tarefas: [tarefa("a", HOJE), tarefa("b", "2026-11-01", { atrasada: true }), tarefa("c", "2026-11-05", { responsavel: null })],
      novas: [obra(219, { principalNome: null, souPrincipal: false })],
      justificativas: [{ id: "j1", obraId: "o216", obra: "Obra #216 · Cliente 216", etapa: "Projeto", prazo: HOJE }],
      prazos: new Map([
        ["o211", [prazo(-1, "2026-11-02")]],
        ["o216", [prazo(3, "2026-11-06")]],
      ]),
      hoje: HOJE,
    });
    expect(dia.atrasado.map((i) => i.chave)).toEqual(["t-b", "o-o211"]);
    expect(dia.hoje.map((i) => i.chave)).toEqual(["j-j1", "t-a", "n-o219"]);
    expect(dia.semana.map((i) => i.chave)).toEqual(["t-c", "o-o216", "o-o207"]);
    expect(dia.total).toBe(8);
    expect(dia.hoje[0]).toMatchObject({ titulo: "Justificar atraso · Projeto", href: "/obras/o216#atrasos", selo: { texto: "Responder até hoje", tom: "atencao" } });
    expect(dia.semana[2].selo).toEqual({ texto: "Sem prazo definido", tom: "neutro" });
    expect(dia.semana[0].detalhe).toBe("Na fila do setor · Obra #214");
    expect(dia.hoje[2].obraId).toBe("o219");
  });

  it("obras novas: só as 3 que esperam há mais tempo; o resto vira \"e mais N\"", () => {
    const novas = [1, 2, 3, 4, 5].map((n) => obra(n, { principalNome: null, souPrincipal: false }));
    const dia = montarMeuDia({ acoes: [], tarefas: [], novas, justificativas: [], prazos: new Map(), hoje: HOJE });
    expect(dia.hoje.map((i) => i.chave)).toEqual(["n-o1", "n-o2", "n-o3"]);
    expect(dia.maisNaFila).toBe(2);
    expect(dia.total).toBe(5);
  });

  it("sem nada pendente, vazio", () => {
    expect(montarMeuDia({ acoes: [], tarefas: [], novas: [], justificativas: [], prazos: new Map(), hoje: HOJE }).total).toBe(0);
  });
});

describe("agendaPrazos", () => {
  it("só de hoje até N dias úteis à frente, agrupado por data; vencidos ficam de fora", () => {
    const agenda = agendaPrazos(
      [obra(209), obra(207), obra(216)],
      new Map([
        ["o209", [prazo(-2, "2026-10-30"), prazo(1, "2026-11-04", "exigencia")]],
        ["o207", [prazo(1, "2026-11-04", "distribuidora_analise")]],
        ["o216", [prazo(9, "2026-11-16")]],
      ]),
      7,
    );
    expect(agenda.map((d) => d.data)).toEqual(["2026-11-04"]);
    expect(agenda[0].itens.map((i) => i.obra)).toEqual(["Obra #207 · Cliente 207", "Obra #209 · Cliente 209"]);
  });
});

describe("resumoFaixa", () => {
  it("só as partes com algo a dizer", () => {
    expect(resumoFaixa({ acoes: 2, vencemAmanha: 1, novas: 1 }, true)).toBe(
      "2 obras pedem sua ação · 1 prazo vence no próximo dia útil · 1 obra nova na fila.",
    );
    expect(resumoFaixa({ acoes: 1, vencidos: 2, novas: 0 }, false)).toBe("1 obra pede ação · 2 prazos vencidos.");
    expect(resumoFaixa({ acoes: 0, novas: 0 }, true)).toBe("Nada pendente com você agora.");
  });
});

describe("cargaPorResponsavel", () => {
  it("maior carga primeiro; sem responsável no fim", () => {
    const carga = cargaPorResponsavel([
      obra(1, { principalNome: "Ana" }),
      obra(2, { principalNome: null }),
      obra(3, { principalNome: "Lucas" }),
      obra(4, { principalNome: "Lucas" }),
    ]);
    expect(carga).toEqual([
      { nome: "Lucas", total: 2 },
      { nome: "Ana", total: 1 },
      { nome: null, total: 1 },
    ]);
  });
});
