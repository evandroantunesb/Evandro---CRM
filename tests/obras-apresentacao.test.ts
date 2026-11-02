/**
 * OPR 3B — Apresentação de Obras, sem banco: cálculos (custos, margem sobre o custo FINAL
 * projetado), as linhas do Gantt a partir do cronograma do banco, a trava da demonstração local (só com a variável E Supabase
 * local) e o carregamento por papel — dinheiro nunca sai do servidor para quem não pode ver.
 */
import { describe, expect, it } from "vitest";
import { desvioCusto, inconsistenciasFinanceiro, resultadoFinanceiro, totaisCustos } from "@/lib/obras/apresentacao/calculos";
import { carregarApresentacaoObra } from "@/lib/obras/apresentacao/dados";
import { demonstracaoAtiva, planejamentoDemonstracao } from "@/lib/obras/apresentacao/demo";
import { montarCronograma, tomAtraso, type LinhaCronograma } from "@/lib/obras/cronograma";
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

/** Linha do cronograma como o banco devolve; o padrão é etapa a iniciar, sem atraso. */
const linha = (ordem: number, etapa: string, extra: Partial<LinhaCronograma> = {}): LinhaCronograma =>
  ({
    ordem,
    etapa,
    previsto_inicio: "2026-10-01",
    previsto_fim: "2026-10-10",
    real_inicio: null,
    real_fim: null,
    previsao_inicio: "2026-10-01",
    previsao_fim: "2026-10-10",
    situacao: "a_iniciar",
    dias_na_etapa: null,
    atraso_dias: 0,
    atraso_proprio: 0,
    causa_etapa: null,
    entrega_contratada: "2026-12-10",
    entrega_material_prevista: null,
    ...extra,
  }) as LinhaCronograma;

describe("cronograma (linhas do Gantt)", () => {
  const linhas = [
    linha(1, "projeto", { situacao: "concluida", real_inicio: "2026-10-01", real_fim: "2026-10-13", previsao_fim: "2026-10-13", dias_na_etapa: 8, atraso_dias: 3, atraso_proprio: 3 }),
    linha(2, "homologacao", { situacao: "andamento", previsto_inicio: "2026-10-10", previsto_fim: "2026-10-20", real_inicio: "2026-10-13", previsao_inicio: "2026-10-13", previsao_fim: "2026-10-23", dias_na_etapa: 1, atraso_dias: 3 }),
    linha(3, "compra", { previsto_inicio: "2026-10-20", previsto_fim: "2026-11-30", previsao_inicio: "2026-10-23", previsao_fim: "2026-12-14", atraso_dias: 2, causa_etapa: "projeto" }),
    linha(9, "desconhecida"),
  ];
  const vm = montarCronograma(linhas, { hoje: HOJE, entregaContratada: "2026-12-10", subtitulo: (e) => `sub ${e}` })!;

  it("meses inteiros do primeiro ao último dia, hoje e entrega contratada em % da faixa", () => {
    expect(vm.meses.map((m) => m.rotulo)).toEqual(["Outubro", "Novembro", "Dezembro"]);
    expect(vm.meses.reduce((t, m) => t + m.largura, 0)).toBeCloseTo(100, 10);
    expect(vm.hoje).toBeCloseTo((13 / 92) * 100, 10);
    expect(vm.contratada.pos).toBeCloseTo((70 / 92) * 100, 10);
    expect(vm.entregaPrevista).toBe("2026-12-14");
  });

  it("etapa desconhecida some; texto de tempo e desvio por situação", () => {
    expect(vm.etapas.map((e) => [e.nome, e.estado, e.tempo, e.desvio.texto, e.sub])).toEqual([
      ["Chegada na Engenharia e projeto", "ok", "8 dias", "+3 dias", "sub projeto"],
      ["Homologação na concessionária", "and", "há 1 dia", "+3 dias prev.", "sub homologacao"],
      ["Compra de equipamentos", "pend", "a iniciar", "prev. 14/12 · +2 dias", "sub compra"],
    ]);
  });

  it("em andamento: realizado até hoje e previsão daí em diante; atraso herdado mostra a causa", () => {
    const [projeto, homologacao, compra] = vm.etapas;
    expect(projeto.previsao).toBeNull();
    expect(homologacao.real![0]).toBeCloseTo((12 / 92) * 100, 10);
    expect(homologacao.previsao![0]).toBeCloseTo(vm.hoje!, 10);
    expect(compra.real).toBeNull();
    expect([projeto.motivo, compra.motivo]).toEqual([null, "Consequência do atraso na etapa 1 (chegada e projeto)."]);
  });

  it("tom do atraso pela régua do semáforo e sem linhas não há cronograma", () => {
    expect([0, 1, 5, 6].map(tomAtraso)).toEqual(["ok", "atencao", "atencao", "erro"]);
    expect(montarCronograma([], { hoje: HOJE, entregaContratada: "2026-12-10" })).toBeNull();
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
    expect(planejamentoDemonstracao(FAZENDA, {})).toBeNull();
    expect(planejamentoDemonstracao(FAZENDA, { ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
  });

  it("Fazenda Modelo: números pedidos e coerentes", () => {
    const p = planejamentoDemonstracao(FAZENDA, LOCAL)!;
    expect(p.avancoFisico).toBe(68);
    expect(p.custos.find((c) => c.categoria === "material_ca")).toMatchObject({ orcado: 14_000, realizado: 16_000 });
    expect(inconsistenciasFinanceiro(p.financeiro!, p.custos)).toEqual([]);
    const r = resultadoFinanceiro(p.financeiro!);
    expect(r.receitaLiquida).toBe(180_000);
    expect(r.custoFinalProjetado).toBe(135_000);
    expect(r.margemLiquida).toBe(45_000);
    expect(r.margemLiquidaPct).toBeCloseTo(25, 10);
  });

  it("todas as obras demonstrativas são coerentes", () => {
    for (const nome of [FAZENDA, "Mercado Bom Preço (fictício)", "Clínica Vida (fictícia)"]) {
      const p = planejamentoDemonstracao(nome, LOCAL)!;
      expect(p, nome).not.toBeNull();
      expect(inconsistenciasFinanceiro(p.financeiro!, p.custos), nome).toEqual([]);
    }
    expect(planejamentoDemonstracao("Cliente qualquer", LOCAL)).toBeNull();
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
  ["compras", "material_entregue"],
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
    expect(vm).toMatchObject({ avancoFisico: null, entregaContratada: null, cronograma: null, demonstracao: false, potenciaKwp: 75, local: "Toledo/PR" });
    expect(vm?.financeiro).toEqual({ estado: "sem_dados", valorVendido: 175_000 });
  });

  it("cronograma e entrega contratada vêm do banco, com o setor e o responsável em cada etapa", async () => {
    const { cliente } = criarFake({
      tabelas: { obras: [linhaObra], obra_fluxos: fluxos, obra_marcos: [], obra_participantes: [], obra_historico: [], obra_dados_comerciais: [] },
      rpcs: { identidade_membros: [], cronograma_obra: [linha(1, "projeto", { situacao: "andamento", real_inicio: "2026-10-01" }), linha(7, "conexao")] },
    });
    const vm = await carregarApresentacaoObra(cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE, env: {} });
    expect(vm).toMatchObject({ entregaContratada: "2026-12-10", entregaPrevista: "2026-10-10", demonstracao: false });
    expect(vm?.cronograma?.etapas.map((e) => e.sub)).toEqual(["Engenharia", "Engenharia · contratada 10/12"]);
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
