/**
 * Obras OPR — semáforo da visão Completa, sem banco: as regras do desenho aprovado ("Como o semáforo decide"), o
 * motivo exibido, a ordem (vermelhas primeiro) e os filtros da URL.
 */
import { describe, expect, it } from "vitest";
import { montarCustos } from "@/lib/obras/custos";
import { filtrarCompleta, filtrosCompletaDeParams, ordemSemaforo, prazosDaLinha, queryCompleta, semaforoObra, usaVisaoCompleta, type PrazosObra } from "@/lib/obras/semaforo";

const PRAZOS: PrazosObra = {
  etapaAtual: "homologacao",
  entregaContratada: "2026-12-10",
  entregaPrevista: "2026-12-10",
  atrasoEntrega: 0,
  maiorAtraso: 0,
  maiorAtrasoEtapa: null,
  venceEm: 8,
  venceEtapa: "homologacao",
  progresso: 30,
  etapasConcluidas: ["projeto"],
  concluidaEm: null,
};

const custos = (realizadoEquipamentos: number, concluidas: string[] = []) =>
  montarCustos({
    orcamento: [
      { categoria: "equipamentos", planejado: 10_000 },
      { categoria: "mao_de_obra", planejado: 5_000 },
    ],
    lancamentos: [{ categoria: "equipamentos", valor: realizadoEquipamentos }],
    etapasConcluidas: new Set(concluidas),
  });

const cor = (p: Partial<PrazosObra>, extra: { custos?: ReturnType<typeof custos> | null; margem?: number | null } = {}) =>
  semaforoObra({ prazos: { ...PRAZOS, ...p }, custos: extra.custos ?? null, margemProjetadaPct: extra.margem ?? 20 });

describe("semáforo", () => {
  it("verde: no prazo e custo abaixo de 90% do planejado", () => {
    expect(cor({}, { custos: custos(8_900) })).toEqual({ cor: "verde", motivo: null });
  });

  it("vermelha: entrega prevista mais de 5 dias úteis após a contratada", () => {
    expect(cor({ atrasoEntrega: 6 })).toEqual({ cor: "vermelha", motivo: "Entrega prevista após o contratado" });
    expect(cor({ atrasoEntrega: 5 }).cor).toBe("amarela");
  });

  it("vermelha: margem projetada negativa, com a categoria acima do planejado no motivo", () => {
    expect(cor({}, { custos: custos(12_000), margem: -2.4 })).toEqual({ cor: "vermelha", motivo: "Custo de equipamentos acima do planejado" });
    expect(cor({}, { margem: -1 })).toEqual({ cor: "vermelha", motivo: "Margem projetada negativa" });
  });

  it("amarela: atraso de até 5 dias úteis, na entrega ou numa etapa", () => {
    expect(cor({ atrasoEntrega: 2 })).toEqual({ cor: "amarela", motivo: "Entrega prevista 2 dias úteis após o contratado" });
    expect(cor({ maiorAtraso: 1, maiorAtrasoEtapa: "vistoria" })).toEqual({ cor: "amarela", motivo: "Atraso de 1 dia útil em vistoria" });
  });

  it("amarela: categoria ainda em andamento a partir de 90% do planejado; encerrada não conta", () => {
    expect(cor({}, { custos: custos(9_000) })).toEqual({ cor: "amarela", motivo: "Custo de equipamentos perto do limite" });
    expect(cor({}, { custos: custos(9_500, ["compra"]) }).cor).toBe("verde");
  });

  it("amarela: prazo de etapa ou da entrega vencendo em até 3 dias úteis", () => {
    expect(cor({ venceEm: 2, venceEtapa: "projeto" }).motivo).toBe("Prazo de chegada e projeto vence em 2 dias úteis");
    expect(cor({ venceEm: 0, venceEtapa: null }).motivo).toBe("Entrega contratada vence hoje");
    expect(cor({ venceEm: 4 }).cor).toBe("verde");
  });

  it("vale a pior cor: atraso grande na entrega vence o custo perto do limite", () => {
    expect(cor({ atrasoEntrega: 9 }, { custos: custos(9_500) }).cor).toBe("vermelha");
  });

  it("linha do banco: etapas desconhecidas são ignoradas e nulos viram zero", () => {
    const p = prazosDaLinha({
      etapa_atual: "outra",
      entrega_contratada: "2026-12-10",
      entrega_prevista: "2026-12-12",
      atraso_entrega: 2,
      maior_atraso: 2,
      maior_atraso_etapa: "compra",
      vence_em: null,
      vence_etapa: null,
      progresso: 55,
      etapas_concluidas: ["projeto", "xyz"],
      concluida_em: null,
    });
    expect(p).toMatchObject({ etapaAtual: null, maiorAtrasoEtapa: "compra", etapasConcluidas: ["projeto"], progresso: 55 });
  });
});

describe("lista da Completa", () => {
  const obras = [
    { numero: 207, clienteNome: "Sérgio Nogueira", concluida: false, cor: "amarela" as const },
    { numero: 211, clienteNome: "Clínica Bem Viver", concluida: false, cor: "vermelha" as const },
    { numero: 209, clienteNome: "Ricardo Menezes", concluida: false, cor: "verde" as const },
    { numero: 203, clienteNome: "Supermercado Avenida", concluida: false, cor: "vermelha" as const },
    { numero: 190, clienteNome: "Antiga", concluida: true, cor: "verde" as const },
  ];

  it("vermelhas primeiro, depois amarelas e verdes; dentro da cor, a obra mais nova", () => {
    expect([...obras].sort(ordemSemaforo).map((o) => o.numero)).toEqual([211, 203, 207, 209, 190]);
  });

  it("sem filtro: só as em execução; por cor; concluídas à parte; busca por nome sem acento ou nº", () => {
    expect(filtrarCompleta(obras, {}).map((o) => o.numero)).toEqual([207, 211, 209, 203]);
    expect(filtrarCompleta(obras, { cor: "vermelha" }).map((o) => o.numero)).toEqual([211, 203]);
    expect(filtrarCompleta(obras, { cor: "concluidas" }).map((o) => o.numero)).toEqual([190]);
    expect(filtrarCompleta(obras, { busca: "sergio" }).map((o) => o.numero)).toEqual([207]);
    expect(filtrarCompleta(obras, { busca: "#211" }).map((o) => o.numero)).toEqual([211]);
  });

  it("filtros da URL: valor desconhecido é ignorado; a query volta na ordem fixa", () => {
    expect(filtrosCompletaDeParams({ cor: "roxa", q: "  avenida " })).toEqual({ cor: undefined, busca: "avenida" });
    expect(filtrosCompletaDeParams({ cor: "concluidas" })).toEqual({ cor: "concluidas", busca: undefined });
    expect(queryCompleta({ cor: "amarela", busca: "rafa" })).toBe("q=rafa&cor=amarela");
    expect(queryCompleta({})).toBe("");
  });
});

describe("qual visão vale", () => {
  it("admin e gestor na Completa, salvo com a lista por setor pedida ou um filtro dela na URL", () => {
    expect(usaVisaoCompleta(true, {})).toBe(true);
    expect(usaVisaoCompleta(true, { cor: "vermelha", q: "x" })).toBe(true);
    expect(usaVisaoCompleta(true, { visao: "setores" })).toBe(false);
    expect(usaVisaoCompleta(true, { situacao: "pausada" })).toBe(false);
    expect(usaVisaoCompleta(false, {})).toBe(false);
  });
});
