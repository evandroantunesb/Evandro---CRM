/**
 * OPR 3B — Apresentação de Obras, sem banco: cálculos (custos, margem sobre o custo FINAL
 * projetado, escala do Gantt), a trava da demonstração local (só com a variável E Supabase
 * local) e o carregamento por papel — dinheiro nunca sai do servidor para quem não pode ver.
 */
import { describe, expect, it } from "vitest";
import {
  atividadeAtrasada,
  desvioCusto,
  escalaCronograma,
  inconsistenciasFinanceiro,
  posicaoAtividade,
  resultadoFinanceiro,
  totaisCustos,
} from "@/lib/obras/apresentacao/calculos";
import { carregarApresentacaoObra } from "@/lib/obras/apresentacao/dados";
import { demonstracaoAtiva, planejamentoDemonstracao } from "@/lib/obras/apresentacao/demo";
import type { AtividadeCronograma } from "@/lib/obras/apresentacao/tipos";
import type { SupabaseServidor } from "@/lib/supabase/server";

const LOCAL = { RAION_DEMO_APRESENTACAO: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
const HOJE = "2026-10-14";
const FAZENDA = "Usina Solar Fazenda Modelo (fictícia)";

describe("cálculos financeiros", () => {
  it("desvio por categoria (positivo = acima do orçado) e totais", () => {
    expect(desvioCusto({ categoria: "material_ca", orcado: 14_000, realizado: 16_000 })).toMatchObject({ desvio: 2_000 });
    expect(desvioCusto({ categoria: "material_ca", orcado: 14_000, realizado: 16_000 }).desvioPct).toBeCloseTo(14.2857, 3);
    expect(desvioCusto({ categoria: "servicos", orcado: 0, realizado: 100 }).desvioPct).toBeNull();
    expect(totaisCustos([{ categoria: "material_ca", orcado: 1, realizado: 2 }, { categoria: "logistica", orcado: 3, realizado: 4 }])).toEqual({ orcado: 4, realizado: 6 });
  });

  it("margem é receita líquida − custo FINAL projetado (nunca − gasto até hoje)", () => {
    const r = resultadoFinanceiro({ receitaLiquida: 180_000, custoOrcado: 130_000, custoRealizado: 92_000, custoFinalProjetado: 135_000, margemPlanejadaPct: (50_000 / 180_000) * 100 });
    expect(r.margemLiquida).toBe(45_000);
    expect(r.margemLiquidaPct).toBeCloseTo(25, 10);
    expect(r.margemLiquida).not.toBe(180_000 - 92_000);
    expect(r.aRealizar).toBe(43_000);
    expect(r.desvioProjetado).toBe(5_000);
    expect(r.variacaoMargemPp).toBeCloseTo(-2.7778, 3);
  });

  it("inconsistências bloqueiam o resultado", () => {
    const custos = [{ categoria: "material_ca" as const, orcado: 100, realizado: 50 }];
    const base = { receitaLiquida: 200, custoOrcado: 100, custoRealizado: 50, custoFinalProjetado: 120, margemPlanejadaPct: null };
    expect(inconsistenciasFinanceiro(base, custos)).toEqual([]);
    expect(inconsistenciasFinanceiro({ ...base, custoOrcado: 99 }, custos)).toContain("custo orçado ≠ soma das categorias");
    expect(inconsistenciasFinanceiro({ ...base, custoRealizado: 51 }, custos)).toContain("custo realizado ≠ soma das categorias");
    expect(inconsistenciasFinanceiro({ ...base, custoFinalProjetado: 40 }, custos)).toContain("custo final projetado menor que o já realizado");
    expect(inconsistenciasFinanceiro({ ...base, receitaLiquida: -1 }, custos)).toContain("valor negativo ou inválido");
  });
});

describe("cronograma", () => {
  const atividades: AtividadeCronograma[] = [
    { id: "a", nome: "A", setor: "engenharia", inicio: "2026-10-05", fim: "2026-10-09", progresso: 100 },
    { id: "b", nome: "B", setor: "operacional", inicio: "2026-10-12", fim: "2026-10-20", progresso: 30 },
    { id: "c", nome: "C", setor: null, inicio: "2026-10-22", fim: "2026-10-22", progresso: 0, marco: true },
  ];

  it("escala com folga de 1 dia, semanas na segunda e hoje", () => {
    const e = escalaCronograma(atividades, HOJE)!;
    expect(e.inicio).toBe("2026-10-04");
    expect(e.fim).toBe("2026-10-23");
    expect(e.totalDias).toBe(20);
    expect(e.semanas.map((s) => s.inicio)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(e.hoje).toBe(10);
    expect(escalaCronograma(atividades, "2027-01-01")!.hoje).toBeNull();
    expect(escalaCronograma([], HOJE)).toBeNull();
  });

  it("posição e duração inclusivas; atraso só com fim no passado e < 100%", () => {
    const e = escalaCronograma(atividades, HOJE)!;
    expect(posicaoAtividade(atividades[1], e)).toEqual({ deslocamento: 8, duracao: 9 });
    expect(posicaoAtividade(atividades[2], e)).toEqual({ deslocamento: 18, duracao: 1 });
    expect(atividadeAtrasada(atividades[0], HOJE)).toBe(false);
    expect(atividadeAtrasada(atividades[1], HOJE)).toBe(false);
    expect(atividadeAtrasada(atividades[1], "2026-10-21")).toBe(true);
  });
});

describe("demonstração local (dados fictícios)", () => {
  it("só liga com a variável E Supabase local", () => {
    expect(demonstracaoAtiva({})).toBe(false);
    expect(demonstracaoAtiva({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false);
    expect(demonstracaoAtiva({ RAION_DEMO_APRESENTACAO: "1", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" })).toBe(false);
    expect(demonstracaoAtiva({ RAION_DEMO_APRESENTACAO: "true", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false);
    expect(demonstracaoAtiva({ RAION_DEMO_APRESENTACAO: "1", NEXT_PUBLIC_SUPABASE_URL: "lixo" })).toBe(false);
    expect(demonstracaoAtiva(LOCAL)).toBe(true);
    expect(demonstracaoAtiva({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBe(true);
  });

  it("sem a demonstração, nenhuma obra recebe planejamento", () => {
    expect(planejamentoDemonstracao(FAZENDA, HOJE, {})).toBeNull();
    expect(planejamentoDemonstracao(FAZENDA, HOJE, { ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
  });

  it("Fazenda Modelo: números pedidos e coerentes", () => {
    const p = planejamentoDemonstracao(FAZENDA, HOJE, LOCAL)!;
    expect(p.avancoFisico).toBe(68);
    expect(p.custos.find((c) => c.categoria === "material_ca")).toMatchObject({ orcado: 14_000, realizado: 16_000 });
    expect(inconsistenciasFinanceiro(p.financeiro!, p.custos)).toEqual([]);
    const r = resultadoFinanceiro(p.financeiro!);
    expect(r.receitaLiquida).toBe(180_000);
    expect(r.custoFinalProjetado).toBe(135_000);
    expect(r.margemLiquida).toBe(45_000);
    expect(r.margemLiquidaPct).toBeCloseTo(25, 10);
    // Cronograma em volta de hoje (a linha "Hoje" sempre aparece).
    expect(escalaCronograma(p.cronograma, HOJE)!.hoje).not.toBeNull();
  });

  it("todas as obras demonstrativas são coerentes", () => {
    for (const nome of [FAZENDA, "Mercado Bom Preço (fictício)", "Clínica Vida (fictícia)"]) {
      const p = planejamentoDemonstracao(nome, HOJE, LOCAL)!;
      expect(p, nome).not.toBeNull();
      expect(inconsistenciasFinanceiro(p.financeiro!, p.custos), nome).toEqual([]);
      for (const a of p.cronograma) expect(a.inicio <= a.fim, `${nome}: ${a.nome}`).toBe(true);
    }
    expect(planejamentoDemonstracao("Cliente qualquer", HOJE, LOCAL)).toBeNull();
  });
});

// --- carregarApresentacaoObra com cliente falso --------------------------------------

type Linha = Record<string, unknown>;

function criarFake(dados: { tabelas?: Record<string, Linha[]>; rpcs?: Record<string, Linha[]> }) {
  const chamadas: string[] = [];
  const from = (tabela: string) => {
    chamadas.push(`from:${tabela}`);
    let linhas = dados.tabelas?.[tabela] ?? [];
    const q = {
      select: () => q,
      eq: (col: string, valor: unknown) => ((linhas = linhas.filter((l) => l[col] === valor)), q),
      in: (col: string, valores: unknown[]) => ((linhas = linhas.filter((l) => valores.includes(l[col]))), q),
      is: (col: string, valor: unknown) => ((linhas = linhas.filter((l) => (l[col] ?? null) === valor)), q),
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok, falha),
    };
    return q;
  };
  const rpc = (nome: string) => {
    chamadas.push(`rpc:${nome}`);
    return Promise.resolve({ data: dados.rpcs?.[nome] ?? [], error: null });
  };
  return { cliente: { from, rpc } as unknown as SupabaseServidor, chamadas };
}

const EMPRESA = "emp-1";
const OBRA = "22222222-2222-4222-8222-222222222222";
const linhaObra: Linha = {
  id: OBRA,
  empresa_id: EMPRESA,
  numero: 6,
  negocio_id: "neg-1",
  cliente_nome: FAZENDA,
  cidade: "Toledo",
  uf: "PR",
  potencia_kwp: 75,
  tipo_ligacao: null,
  unidade_consumidora: null,
  snapshot: {},
  pausada_em: null,
  pausa_motivo: null,
  cancelada_em: null,
  cancelamento_motivo: null,
  alerta_pagamento_estornado_em: null,
  venda_alterada_em: null,
  created_at: "2026-10-01T00:00:00Z",
};
// Todos os setores concluídos: mesmo assim o avanço físico NÃO pode ser derivado disso.
const fluxos = [
  ["compras", "faturado_fornecedor"],
  ["engenharia", "concluido"],
  ["operacional", "concluido"],
].map(([setor, status]) => ({ obra_id: OBRA, empresa_id: EMPRESA, setor, status, status_desde: null, parado: false, parado_motivo: null, aguardando: null }));

function cenario(papel: "admin" | "operacao" | "sdr", { comValor }: { comValor: boolean }) {
  return criarFake({
    tabelas: {
      obras: papel === "operacao" ? [] : [linhaObra],
      obra_fluxos: fluxos,
      obra_marcos: [],
      obra_participantes: [],
      obra_historico: [],
      // A RLS de obra_dados_comerciais só devolve a linha a quem pode ver dinheiro.
      obra_dados_comerciais: comValor ? [{ obra_id: OBRA, empresa_id: EMPRESA, valor_vendido: 175_000 }] : [],
    },
    rpcs: { identidade_membros: [], obras_operacao: [{ ...linhaObra, obra_id: OBRA }] },
  });
}

const DINHEIRO = /180000|135000|45000|175000|receitaLiquida|custoFinalProjetado|valorVendido|custos/;

describe("carregarApresentacaoObra", () => {
  it("sem demonstração: planejamento vazio e avanço NÃO derivado dos setores concluídos", async () => {
    const vm = await carregarApresentacaoObra(cenario("admin", { comValor: true }).cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE, env: {} });
    expect(vm).toMatchObject({ avancoFisico: null, prazo: null, cronograma: null, demonstracao: false, potenciaKwp: 75, local: "Toledo/PR" });
    expect(vm?.financeiro).toEqual({ estado: "sem_dados", valorVendido: 175_000 });
  });

  it("admin com demonstração: custos e resultado disponíveis", async () => {
    const vm = await carregarApresentacaoObra(cenario("admin", { comValor: true }).cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE, env: LOCAL });
    expect(vm?.demonstracao).toBe(true);
    expect(vm?.avancoFisico).toBe(68);
    expect(vm?.financeiro.estado).toBe("disponivel");
  });

  it("operacao e SDR: nenhum valor em dinheiro sai do servidor, mesmo com demonstração", async () => {
    for (const papel of ["operacao", "sdr"] as const) {
      const vm = await carregarApresentacaoObra(cenario(papel, { comValor: false }).cliente, { empresaId: EMPRESA, papel, obraId: OBRA, hojeIso: HOJE, env: LOCAL });
      expect(vm?.financeiro, papel).toEqual({ estado: "sem_permissao" });
      expect(JSON.stringify(vm), papel).not.toMatch(DINHEIRO);
    }
  });

  it("operacao nunca consulta obra_dados_comerciais; Apresentação não monta gestão", async () => {
    const { cliente, chamadas } = cenario("operacao", { comValor: false });
    await carregarApresentacaoObra(cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA, hojeIso: HOJE, env: LOCAL });
    expect(chamadas).not.toContain("from:obra_dados_comerciais");
    expect(chamadas).not.toContain("from:membro_setores_obra");
  });

  it("obra inexistente ou sem acesso: null", async () => {
    const { cliente } = criarFake({ tabelas: { obras: [] } });
    expect(await carregarApresentacaoObra(cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE, env: LOCAL })).toBeNull();
  });
});
