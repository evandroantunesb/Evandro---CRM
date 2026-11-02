/**
 * OPR 3B — Apresentação de Obras, sem banco: custos e lucro pela lógica do desenho (custo
 * projetado por categoria encerrada ou em andamento, lucro depois de impostos e comissões), as linhas do Gantt a
 * partir do cronograma do banco (com as justificativas de atraso) e o carregamento por papel — dinheiro nunca sai do
 * servidor para quem não pode ver.
 */
import { describe, expect, it } from "vitest";
import { carregarApresentacaoObra } from "@/lib/obras/apresentacao/dados";
import { montarCronograma, tomAtraso, type LinhaCronograma } from "@/lib/obras/cronograma";
import { montarCustos, resultadoObra } from "@/lib/obras/custos";
import type { SupabaseServidor } from "@/lib/supabase/server";

const HOJE = "2026-10-14";
const FAZENDA = "Usina Solar Fazenda Modelo (fictícia)";

// Obra #211 do desenho aprovado: compra e homologação concluídas (equipamentos, estrutura e homologação encerradas);
// mão de obra e frete em andamento.
const CUSTOS_211 = {
  orcamento: [
    { categoria: "equipamentos", planejado: 31_000 },
    { categoria: "estrutura_materiais", planejado: 9_800 },
    { categoria: "mao_de_obra", planejado: 12_000 },
    { categoria: "homologacao", planejado: 3_500 },
    { categoria: "frete", planejado: 2_200 },
  ],
  lancamentos: [
    { categoria: "equipamentos", valor: 33_000 },
    { categoria: "equipamentos", valor: 234.3 },
    { categoria: "estrutura_materiais", valor: 9_212 },
    { categoria: "mao_de_obra", valor: 8_280 },
    { categoria: "homologacao", valor: 4_270 },
    { categoria: "frete", valor: 1_500 },
    { categoria: "frete", valor: -268 }, // estorno parcial de um lançamento errado
  ],
  etapasConcluidas: new Set(["projeto", "homologacao", "compra"]),
};

describe("custos e lucro (lógica do desenho)", () => {
  const custos = montarCustos(CUSTOS_211);

  it("encerrada vale o realizado; em andamento, o maior entre planejado e realizado", () => {
    expect(custos.categorias.map((c) => [c.categoria, c.realizado, c.encerrada, c.projetado])).toEqual([
      ["equipamentos", 33_234.3, true, 33_234.3],
      ["estrutura_materiais", 9_212, true, 9_212],
      ["mao_de_obra", 8_280, false, 12_000],
      ["homologacao", 4_270, true, 4_270],
      ["frete", 1_232, false, 2_200],
    ]);
    expect([custos.planejado, custos.realizado, custos.projetado]).toEqual([58_500, 56_228.3, 60_916.3]);
    expect(custos.realizadoPct).toBeCloseTo(96.12, 2);
  });

  it("barra do desenho: planejado em 85% da trilha, realizado proporcional e no máximo 100%; desvio só encerrada", () => {
    const [equip, , mao, homolog] = custos.categorias;
    expect(equip.largura).toBeCloseTo(91.13, 2);
    expect(mao.largura).toBeCloseTo(58.65, 2);
    expect(homolog.largura).toBe(100);
    expect([equip.desvioPct, mao.desvioPct]).toEqual([expect.closeTo(7.21, 2), null]);
    expect([equip.acima, mao.acima]).toEqual([true, false]);
  });

  it("lucro = venda − custo projetado − impostos e comissões; diferença para o planejado e margens", () => {
    const r = resultadoObra(76_500, custos, 11);
    expect(r).toMatchObject({ deducoes: 8_415, lucro: 7_168.7, lucroPlanejado: 9_585, diferenca: -2_416.3 });
    expect(r.lucroPct).toBeCloseTo(9.37, 2);
    expect(r.margemProjetadaPct).toBeCloseTo(20.37, 2);
    expect(r.margemPlanejadaPct).toBeCloseTo(23.53, 2);
    expect(resultadoObra(0, custos, 0).lucroPct).toBeNull();
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
    expect(projeto.dica).toBeNull();
    expect(compra.dica).toEqual({
      titulo: "Motivo",
      texto: "Consequência do atraso na etapa 1 (chegada e projeto).",
      rodape: "Calculado pelo sistema",
      pendente: false,
    });
  });

  it("tom do atraso pela régua do semáforo e sem linhas não há cronograma", () => {
    expect([0, 1, 5, 6].map(tomAtraso)).toEqual(["ok", "atencao", "atencao", "erro"]);
    expect(montarCronograma([], { hoje: HOJE, entregaContratada: "2026-12-10" })).toBeNull();
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
// Todos os setores concluídos: mesmo assim o progresso NÃO pode ser derivado disso.
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
      // A RLS do orçamento e dos lançamentos só devolve linhas a quem vê os custos da obra.
      obra_orcamento: comValor ? [{ obra_id: OBRA, categoria: "equipamentos", planejado: 100_000 }, { obra_id: OBRA, categoria: "frete", planejado: 5_000 }] : [],
      obra_custos: comValor ? [{ obra_id: OBRA, categoria: "equipamentos", valor: 20_000 }] : [],
      obra_deducoes: [{ empresa_id: EMPRESA, impostos_percentual: 8, comissoes_percentual: 2 }],
    },
    rpcs: { identidade_membros: [], obras_operacao: [{ ...linhaObra, obra_id: OBRA }] },
  });
}

const DINHEIRO = /180000|135000|45000|175000|receitaLiquida|custoFinalProjetado|valorVendido|custos/;

describe("carregarApresentacaoObra", () => {
  it("sem cronograma: progresso vazio, NÃO derivado dos setores concluídos", async () => {
    const vm = await carregarApresentacaoObra(cenario("admin", { comValor: true }).cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE });
    expect(vm).toMatchObject({ progresso: null, entregaContratada: null, cronograma: null, potenciaKwp: 75, local: "Toledo/PR" });
    // Sem cronograma nenhuma categoria encerra: projetado = maior entre planejado e realizado (100.000 + 5.000).
    expect(vm?.financeiro.estado === "disponivel" && vm.financeiro.resultado).toMatchObject({ venda: 175_000, custoProjetado: 105_000, deducoes: 17_500, lucro: 52_500 });
  });

  it("cronograma e entrega contratada vêm do banco, com o setor e o responsável em cada etapa", async () => {
    const { cliente } = criarFake({
      tabelas: { obras: [linhaObra], obra_fluxos: fluxos, obra_marcos: [], obra_participantes: [], obra_historico: [], obra_dados_comerciais: [] },
      rpcs: { identidade_membros: [], cronograma_obra: [linha(1, "projeto", { situacao: "andamento", real_inicio: "2026-10-01" }), linha(7, "conexao")] },
    });
    const vm = await carregarApresentacaoObra(cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE });
    expect(vm).toMatchObject({ entregaContratada: "2026-12-10", entregaPrevista: "2026-10-10" });
    expect(vm?.cronograma?.etapas.map((e) => e.sub)).toEqual(["Engenharia", "Engenharia · contratada 10/12"]);
  });

  it("progresso e justificativas de atraso vêm do banco", async () => {
    const PEDIDO = "33333333-3333-4333-8333-333333333333";
    const { cliente } = criarFake({
      tabelas: {
        obras: [linhaObra],
        obra_fluxos: fluxos,
        obra_marcos: [],
        obra_participantes: [],
        obra_historico: [],
        obra_dados_comerciais: [],
        obra_justificativas_atraso: [
          { obra_id: OBRA, id: "j1", etapa: "projeto", pedido_a: PEDIDO, pedido_em: "2026-10-05T12:00:00Z", cobrado_em: null, prazo: "2026-10-07", texto: "Cliente atrasou a documentação.", respondido_por: PEDIDO, respondido_em: "2026-10-06T12:00:00Z" },
          { obra_id: OBRA, id: "j2", etapa: "homologacao", pedido_a: PEDIDO, pedido_em: "2026-10-13T12:00:00Z", cobrado_em: null, prazo: "2026-10-15", texto: null, respondido_por: null, respondido_em: null },
        ],
      },
      rpcs: {
        identidade_membros: [{ membro_id: PEDIDO, nome: "Lucas Prado" }],
        prazos_obras: [{ obra_id: OBRA, progresso: 42 }],
        cronograma_obra: [
          linha(1, "projeto", { situacao: "concluida", real_inicio: "2026-10-01", real_fim: "2026-10-12", atraso_dias: 3, atraso_proprio: 3 }),
          linha(2, "homologacao", { situacao: "andamento", real_inicio: "2026-10-12", atraso_dias: 5, atraso_proprio: 2 }),
          linha(7, "conexao"),
        ],
      },
    });
    const vm = await carregarApresentacaoObra(cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE });
    expect(vm?.progresso).toBe(42);
    const [projeto, homologacao] = vm!.cronograma!.etapas;
    expect(projeto.dica).toMatchObject({ titulo: "Justificativa", texto: "Cliente atrasou a documentação.", rodape: "Lucas Prado · respondeu em 06/10", pendente: false });
    expect(homologacao.dica).toMatchObject({
      titulo: "Justificativa pendente",
      texto: "Pedida a Lucas Prado (Engenharia) em 13/10. Ainda sem resposta.",
      rodape: "Prazo para responder: 15/10",
      pendente: true,
    });
  });

  it("operacao e SDR: nenhum valor em dinheiro sai do servidor", async () => {
    for (const papel of ["operacao", "sdr"] as const) {
      const vm = await carregarApresentacaoObra(cenario(papel, { comValor: false }).cliente, { empresaId: EMPRESA, papel, obraId: OBRA, hojeIso: HOJE });
      expect(vm?.financeiro, papel).toEqual({ estado: "sem_permissao" });
      expect(JSON.stringify(vm), papel).not.toMatch(DINHEIRO);
    }
  });

  it("operacao nunca consulta obra_dados_comerciais; Apresentação não monta gestão", async () => {
    const { cliente, chamadas } = cenario("operacao", { comValor: false });
    await carregarApresentacaoObra(cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA, hojeIso: HOJE });
    expect(chamadas).not.toContain("from:obra_dados_comerciais");
    expect(chamadas).not.toContain("from:membro_setores_obra");
  });

  it("obra inexistente ou sem acesso: null", async () => {
    const { cliente } = criarFake({ tabelas: { obras: [] } });
    expect(await carregarApresentacaoObra(cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, hojeIso: HOJE })).toBeNull();
  });
});
