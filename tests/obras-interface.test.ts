/**
 * Interface de Obras (lista, somente leitura): rótulos, derivações factuais, permissões de UI e
 * a leitura de `carregarObras` com cliente falso (sem banco). Cobre que `operacao` só lê pela RPC
 * `obras_operacao`, que o comercial lê `obras` sob RLS, que a lista nunca carrega dado pessoal
 * e que nenhum percentual/progresso é derivado.
 */
import { describe, expect, it } from "vitest";
import { carregarObras, type ObraListaVM } from "@/lib/obras/dados";
import { alertasObra, estadoSetor, filtrarObras, normalizarBusca, setorConcluido, situacaoObra } from "@/lib/obras/derivados";
import { fonteDadosObras, podeVerObras } from "@/lib/obras/permissoes-ui";
import {
  AGUARDANDO_OBRA,
  ROTULO_ALERTA_OBRA,
  ROTULO_SETOR,
  ROTULO_SITUACAO_OBRA,
  SETORES_OBRA,
  STATUS_POR_SETOR,
  rotuloAguardando,
  rotuloStatus,
} from "@/lib/obras/rotulos";
import type { SupabaseServidor } from "@/lib/supabase/server";

// --- rótulos -------------------------------------------------------------------

describe("rótulos de Obras", () => {
  it("todo status válido de cada setor tem rótulo próprio (diferente do código)", () => {
    for (const setor of SETORES_OBRA) {
      for (const status of STATUS_POR_SETOR[setor]) {
        const rotulo = rotuloStatus(setor, status);
        expect(rotulo, `${setor}/${status}`).not.toBe(status);
        expect(rotulo).not.toMatch(/_/);
      }
    }
  });

  it("rótulos em português simples", () => {
    expect(rotuloStatus("compras", "faturado_fornecedor")).toBe("Faturado pelo fornecedor");
    expect(rotuloStatus("engenharia", "enviado_concessionaria")).toBe("Enviado à concessionária");
    expect(rotuloStatus("operacional", "liberada_agendamento")).toBe("Liberada para agendamento");
    expect(ROTULO_SETOR).toEqual({ compras: "Compras", engenharia: "Engenharia", operacional: "Operacional" });
  });

  it("status desconhecido devolve o código cru, sem quebrar", () => {
    expect(rotuloStatus("compras", "inventado")).toBe("inventado");
    expect(rotuloStatus("engenharia", "constructor")).toBe("constructor");
    expect(rotuloStatus("operacional", "")).toBe("");
  });

  it("todo 'aguardando' tem rótulo; desconhecido mantém o código", () => {
    expect(AGUARDANDO_OBRA.map(rotuloAguardando)).toEqual([
      "Aguardando cliente",
      "Aguardando fornecedor",
      "Aguardando concessionária",
      "Aguardando transportadora",
      "Aguardando equipe de campo",
    ]);
    expect(rotuloAguardando("novo")).toBe("Aguardando novo");
  });

  it("situações e alertas têm rótulo", () => {
    expect(Object.values(ROTULO_SITUACAO_OBRA)).toEqual(["Em andamento", "Concluída", "Pausada", "Cancelada"]);
    expect(Object.keys(ROTULO_ALERTA_OBRA).sort()).toEqual(["aguardando", "estorno", "parado", "venda_alterada"]);
  });
});

// --- derivados -----------------------------------------------------------------

const FLUXOS_FINAIS = [
  { setor: "compras", status: "faturado_fornecedor" },
  { setor: "engenharia", status: "concluido" },
  { setor: "operacional", status: "concluido" },
] as const;

describe("derivados de Obras", () => {
  it("status final por setor", () => {
    expect(setorConcluido("compras", "faturado_fornecedor")).toBe(true);
    expect(setorConcluido("compras", "concluido")).toBe(false);
    expect(setorConcluido("engenharia", "concluido")).toBe(true);
    expect(setorConcluido("engenharia", "aprovado")).toBe(false);
    expect(setorConcluido("operacional", "concluido")).toBe(true);
    expect(setorConcluido("operacional", "instalacao_concluida")).toBe(false);
    expect(setorConcluido("operacional", null)).toBe(false);
  });

  it("estado do setor: concluído > parado > aguardando > em andamento", () => {
    const base = { setor: "engenharia", status: "aprovado", parado: false, aguardando: null } as const;
    expect(estadoSetor(base)).toBe("em_andamento");
    expect(estadoSetor({ ...base, aguardando: "cliente" })).toBe("aguardando");
    expect(estadoSetor({ ...base, aguardando: "cliente", parado: true })).toBe("parado");
    expect(estadoSetor({ ...base, status: "concluido", parado: true, aguardando: "cliente" })).toBe("concluido");
    expect(estadoSetor({ setor: "compras", status: "faturado_fornecedor", parado: false, aguardando: null })).toBe("concluido");
  });

  const marcosOk = [{ status: "concluido" }, { status: "nao_se_aplica" }];
  const entrada = { canceladaEm: null, pausadaEm: null, fluxos: FLUXOS_FINAIS, marcos: marcosOk };

  it("situação: concluída exige 3 setores finais e marcos resolvidos", () => {
    expect(situacaoObra(entrada)).toBe("concluida");
    expect(situacaoObra({ ...entrada, marcos: [{ status: "concluido" }, { status: "pendente" }] })).toBe("em_andamento");
    expect(situacaoObra({ ...entrada, fluxos: [FLUXOS_FINAIS[0], FLUXOS_FINAIS[1], { setor: "operacional", status: "agendada" }] })).toBe("em_andamento");
    expect(situacaoObra({ ...entrada, fluxos: FLUXOS_FINAIS.slice(0, 2) })).toBe("em_andamento");
  });

  it("situação: cancelada > pausada > concluída > em andamento", () => {
    const t = "2026-10-01T00:00:00Z";
    expect(situacaoObra({ ...entrada, canceladaEm: t, pausadaEm: t })).toBe("cancelada");
    expect(situacaoObra({ ...entrada, pausadaEm: t })).toBe("pausada");
    expect(situacaoObra({ ...entrada, pausadaEm: t, fluxos: [], marcos: [] })).toBe("pausada");
    expect(situacaoObra({ ...entrada, fluxos: [], marcos: [] })).toBe("em_andamento");
  });

  it("alertas factuais", () => {
    const sem = { alertaPagamentoEstornadoEm: null, vendaAlteradaEm: null, estadosSetores: ["em_andamento", "concluido", "concluido"] as const };
    expect(alertasObra(sem)).toEqual([]);
    expect(
      alertasObra({
        alertaPagamentoEstornadoEm: "2026-10-01",
        vendaAlteradaEm: "2026-10-02",
        estadosSetores: ["parado", "aguardando", "concluido"],
      }),
    ).toEqual(["estorno", "venda_alterada", "parado", "aguardando"]);
    expect(alertasObra({ ...sem, estadosSetores: ["aguardando", "em_andamento", "concluido"] })).toEqual(["aguardando"]);
  });

  it("normalização da busca ignora acento e caixa", () => {
    expect(normalizarBusca("  JOÃO Conceição ")).toBe("joao conceicao");
  });
});

// --- permissões de UI ----------------------------------------------------------

describe("permissões de UI de Obras", () => {
  it("fonte de dados por papel", () => {
    expect(fonteDadosObras("operacao")).toBe("rpc_operacao");
    for (const papel of ["admin", "gestor", "vendedor", "sdr"]) expect(fonteDadosObras(papel)).toBe("tabelas_comerciais");
  });

  it("papel desconhecido ou ausente não tem fonte", () => {
    for (const papel of ["visitante", "", undefined, null]) {
      expect(fonteDadosObras(papel)).toBeNull();
      expect(podeVerObras(papel)).toBe(false);
    }
    expect(podeVerObras("operacao")).toBe(true);
    expect(podeVerObras("sdr")).toBe(true);
  });
});

// --- carregarObras com cliente falso -------------------------------------------

type Linha = Record<string, unknown>;

/** Cliente encadeável e "thenable" que registra `.from(tabela)` e `.rpc(nome)` e aplica eq/in/is nas linhas. */
function criarFake(dados: { tabelas?: Record<string, Linha[]>; rpcs?: Record<string, Linha[]> }) {
  const chamadas: string[] = [];
  const selects: Record<string, string> = {};
  const from = (tabela: string) => {
    chamadas.push(`from:${tabela}`);
    let linhas = dados.tabelas?.[tabela] ?? [];
    const q = {
      select: (colunas: string) => {
        selects[tabela] = colunas;
        return q;
      },
      eq: (col: string, valor: unknown) => ((linhas = linhas.filter((l) => l[col] === valor)), q),
      in: (col: string, valores: unknown[]) => ((linhas = linhas.filter((l) => valores.includes(l[col]))), q),
      is: (col: string, valor: unknown) => ((linhas = linhas.filter((l) => (l[col] ?? null) === valor)), q),
      order: (col: string, { ascending = true }: { ascending?: boolean } = {}) => {
        linhas = [...linhas].sort((x, y) => (Number(x[col]) - Number(y[col])) * (ascending ? 1 : -1));
        return q;
      },
      limit: () => q,
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok, falha),
    };
    return q;
  };
  const rpc = (nome: string) => {
    chamadas.push(`rpc:${nome}`);
    return Promise.resolve({ data: dados.rpcs?.[nome] ?? [], error: null });
  };
  return { cliente: { from, rpc } as unknown as SupabaseServidor, chamadas, selects };
}

const EMPRESA = "emp-1";
const OUTRA = "emp-2";

const obraTabela = (id: string, numero: number, extra: Linha = {}): Linha => ({
  id,
  empresa_id: EMPRESA,
  numero,
  cliente_nome: `Cliente ${numero}`,
  cidade: "Cascavel",
  uf: "PR",
  potencia_kwp: 5.4,
  pausada_em: null,
  cancelada_em: null,
  alerta_pagamento_estornado_em: null,
  venda_alterada_em: null,
  created_at: "2026-10-01T00:00:00Z",
  // Dados que NUNCA devem chegar ao view model, mesmo que a fonte os devolva.
  snapshot: { cliente: { telefone: "45999990000" } },
  cliente_telefone: "45999990000",
  cliente_documento: "123.456.789-00",
  cliente_endereco: "Rua Secreta, 10",
  pausa_motivo: "motivo-pausa-secreto",
  cancelamento_motivo: "motivo-cancelamento-secreto",
  ...extra,
});

const obraRpc = (id: string, numero: number, empresa = EMPRESA): Linha => {
  // A RPC devolve `obra_id` (não `id`) e as colunas pessoais/sensíveis que o app deve descartar.
  const linha = obraTabela(id, numero);
  delete linha.id;
  return { ...linha, obra_id: id, empresa_id: empresa };
};

const fluxo = (obra: string, setor: string, status: string, extra: Linha = {}): Linha => ({
  obra_id: obra,
  empresa_id: EMPRESA,
  setor,
  status,
  parado: false,
  parado_motivo: "parado-motivo-secreto",
  aguardando: null,
  ...extra,
});

const tabelasFilhas = {
  obra_fluxos: [
    fluxo("o1", "compras", "faturado_fornecedor"),
    fluxo("o1", "engenharia", "aprovado", { parado: true }),
    fluxo("o1", "operacional", "agendada", { aguardando: "cliente" }),
    fluxo("o2", "compras", "faturado_fornecedor"),
    fluxo("o2", "engenharia", "concluido"),
    fluxo("o2", "operacional", "concluido"),
  ],
  obra_marcos: [
    { obra_id: "o1", empresa_id: EMPRESA, marco: "nf_cliente", status: "pendente" },
    { obra_id: "o2", empresa_id: EMPRESA, marco: "nf_cliente", status: "concluido" },
    { obra_id: "o2", empresa_id: EMPRESA, marco: "garantia", status: "nao_se_aplica" },
  ],
  obra_participantes: [
    { obra_id: "o1", empresa_id: EMPRESA, setor: "engenharia", membro_id: "m-ana", principal: true, fim: null },
    { obra_id: "o1", empresa_id: EMPRESA, setor: "compras", membro_id: "m-bia", principal: true, fim: "2026-10-02" },
    { obra_id: "o1", empresa_id: EMPRESA, setor: "operacional", membro_id: "m-caio", principal: false, fim: null },
  ],
};
const identidades = [
  { membro_id: "m-ana", nome: "Ana", avatar_caminho: "x/ana.png" },
  { membro_id: "m-bia", nome: "Bia", avatar_caminho: "x/bia.png" },
  { membro_id: "m-caio", nome: "Caio", avatar_caminho: "x/caio.png" },
];

describe("carregarObras", () => {
  it("papel sem acesso não faz nenhuma chamada", async () => {
    const f = criarFake({});
    for (const papel of ["visitante", undefined, null]) {
      expect(await carregarObras(f.cliente, { empresaId: EMPRESA, papel })).toMatchObject({ obras: [], kpis: { total: 0 } });
    }
    expect(f.chamadas).toEqual([]);
  });

  it("operacao lê pela RPC obras_operacao e nunca consulta a tabela obras", async () => {
    const f = criarFake({
      rpcs: { obras_operacao: [obraRpc("o1", 1), obraRpc("o2", 2)], identidade_membros: identidades },
      tabelas: tabelasFilhas,
    });
    const { obras } = await carregarObras(f.cliente, { empresaId: EMPRESA, papel: "operacao" });
    expect(f.chamadas).toContain("rpc:obras_operacao");
    expect(f.chamadas).not.toContain("from:obras");
    expect(f.chamadas).toEqual(expect.arrayContaining(["from:obra_fluxos", "from:obra_marcos", "from:obra_participantes", "rpc:identidade_membros"]));
    expect(obras.map((o) => o.numero)).toEqual([2, 1]);
  });

  it("operacao descarta obras de outra empresa", async () => {
    const f = criarFake({
      rpcs: { obras_operacao: [obraRpc("o1", 1), obraRpc("x9", 9, OUTRA)], identidade_membros: identidades },
      tabelas: tabelasFilhas,
    });
    const { obras, kpis } = await carregarObras(f.cliente, { empresaId: EMPRESA, papel: "operacao" });
    expect(obras.map((o) => o.id)).toEqual(["o1"]);
    expect(kpis.total).toBe(1);
  });

  it("operacao com só obras de outra empresa não consulta as tabelas filhas", async () => {
    const f = criarFake({ rpcs: { obras_operacao: [obraRpc("x9", 9, OUTRA)] } });
    const { obras } = await carregarObras(f.cliente, { empresaId: EMPRESA, papel: "operacao" });
    expect(obras).toEqual([]);
    expect(f.chamadas).toEqual(["rpc:obras_operacao"]);
  });

  it.each(["admin", "gestor", "vendedor", "sdr"])("%s lê from('obras') sob RLS, sem snapshot, e não chama obras_operacao", async (papel) => {
    const f = criarFake({
      tabelas: { obras: [obraTabela("o1", 1), obraTabela("o2", 2), obraTabela("x9", 9, { empresa_id: OUTRA })], ...tabelasFilhas },
      rpcs: { identidade_membros: identidades },
    });
    const { obras } = await carregarObras(f.cliente, { empresaId: EMPRESA, papel });
    expect(f.chamadas).toContain("from:obras");
    expect(f.chamadas).not.toContain("rpc:obras_operacao");
    expect(f.selects.obras).not.toMatch(/snapshot|\*|telefone|documento|endereco|motivo/);
    expect(obras.map((o) => o.numero)).toEqual([2, 1]);
  });

  it("sem obras não consulta as tabelas filhas", async () => {
    const f = criarFake({ tabelas: { obras: [] } });
    const r = await carregarObras(f.cliente, { empresaId: EMPRESA, papel: "admin" });
    expect(r.obras).toEqual([]);
    expect(f.chamadas).toEqual(["from:obras"]);
  });

  it("monta setores, responsável principal, situação, alertas e KPIs", async () => {
    const f = criarFake({
      tabelas: {
        obras: [obraTabela("o1", 1, { alerta_pagamento_estornado_em: "2026-10-03T00:00:00Z" }), obraTabela("o2", 2)],
        ...tabelasFilhas,
      },
      rpcs: { identidade_membros: identidades },
    });
    const { obras, kpis } = await carregarObras(f.cliente, { empresaId: EMPRESA, papel: "gestor" });
    const [o2, o1] = obras;

    expect(o1.setores.map((s) => s.setor)).toEqual(["compras", "engenharia", "operacional"]);
    expect(o1.setores.map((s) => s.statusRotulo)).toEqual(["Faturado pelo fornecedor", "Aprovado", "Agendada"]);
    expect(o1.setores.map((s) => s.estado)).toEqual(["concluido", "parado", "aguardando"]);
    expect(o1.setores[2].aguardando).toBe("Aguardando cliente");
    // Só o principal ativo vale: Bia encerrada e Caio não principal ficam de fora.
    expect(o1.setores.map((s) => s.principalNome)).toEqual([null, "Ana", null]);
    expect(o1.situacao).toBe("em_andamento");
    expect(o1.alertas).toEqual(["estorno", "parado", "aguardando"]);
    expect(o1.potenciaKwp).toBe(5.4);

    expect(o2.situacao).toBe("concluida");
    expect(o2.alertas).toEqual([]);

    expect(kpis).toEqual({
      total: 2,
      emAndamento: 1,
      concluidas: 1,
      pausadas: 0,
      canceladas: 0,
      comEstorno: 1,
      comVendaAlterada: 0,
      comSetorParado: 1,
      comSetorAguardando: 1,
    });
  });

  it("o VM não contém snapshot nem dados pessoais, mesmo que a fonte os devolva (comercial e operacao)", async () => {
    const proibidos = [
      "snapshot",
      "45999990000",
      "123.456.789-00",
      "Rua Secreta",
      "secreto",
      "telefone",
      "documento",
      "endereco",
      "motivo",
      "m-ana",
      "membro_id",
      "membroId",
    ];
    const comercial = criarFake({
      tabelas: { obras: [obraTabela("o1", 1)], ...tabelasFilhas },
      rpcs: { identidade_membros: identidades },
    });
    const operacao = criarFake({
      rpcs: { obras_operacao: [obraRpc("o1", 1)], identidade_membros: identidades },
      tabelas: tabelasFilhas,
    });
    for (const [f, papel] of [
      [comercial, "admin"],
      [operacao, "operacao"],
    ] as const) {
      const json = JSON.stringify(await carregarObras(f.cliente, { empresaId: EMPRESA, papel }));
      for (const p of proibidos) expect(json, `${papel}: ${p}`).not.toContain(p);
      expect(json).toContain("Cliente 1");
      expect(json).toContain("Ana");
    }
  });

  it("nenhum VM, setor ou KPI carrega percentual, progresso, SLA ou atraso", async () => {
    const f = criarFake({ tabelas: { obras: [obraTabela("o1", 1)], ...tabelasFilhas }, rpcs: { identidade_membros: identidades } });
    const { obras, kpis } = await carregarObras(f.cliente, { empresaId: EMPRESA, papel: "admin" });
    const chaves = [...Object.keys(obras[0]), ...Object.keys(obras[0].setores[0]), ...Object.keys(kpis)];
    expect(chaves.length).toBeGreaterThan(10);
    for (const chave of chaves) expect(chave).not.toMatch(/percent|progresso|sla|atraso|dias|semaforo|cor/i);
  });
});

// --- filtros -------------------------------------------------------------------

describe("filtrarObras", () => {
  const vm = (numero: number, clienteNome: string, extra: Partial<ObraListaVM> = {}): ObraListaVM => ({
    id: `id-${numero}`,
    numero,
    clienteNome,
    cidade: null,
    uf: null,
    potenciaKwp: null,
    situacao: "em_andamento",
    alertas: [],
    setores: SETORES_OBRA.map((setor) => ({ setor, status: null, statusRotulo: "", estado: "em_andamento", aguardando: null, principalNome: null })),
    criadaEm: "2026-10-01T00:00:00Z",
    ...extra,
  });
  const comEstado = (compras: "parado" | "em_andamento", engenharia: "concluido" | "em_andamento") =>
    vm(0, "").setores.map((s) => ({ ...s, estado: s.setor === "compras" ? compras : s.setor === "engenharia" ? engenharia : s.estado }));

  const lista = [
    vm(12, "João da Conceição"),
    vm(105, "Maria Souza", { situacao: "pausada", alertas: ["estorno"] }),
    vm(7, "Ana Lima", { situacao: "concluida", alertas: ["parado", "venda_alterada"], setores: comEstado("parado", "concluido") }),
  ];
  const nums = (f: Parameters<typeof filtrarObras>[1]) => filtrarObras(lista, f).map((o) => o.numero);

  it("sem filtros devolve tudo", () => {
    expect(nums({})).toEqual([12, 105, 7]);
  });

  it("busca por número (com ou sem #) ou nome, sem acento e caixa", () => {
    expect(nums({ busca: "105" })).toEqual([105]);
    expect(nums({ busca: "#12" })).toEqual([12]);
    expect(nums({ busca: "joao da conceicao" })).toEqual([12]);
    expect(nums({ busca: "MARIA" })).toEqual([105]);
    expect(nums({ busca: "zzz" })).toEqual([]);
  });

  it("situação, alerta e setor + estado", () => {
    expect(nums({ situacao: "pausada" })).toEqual([105]);
    expect(nums({ alerta: "venda_alterada" })).toEqual([7]);
    expect(nums({ setor: "compras", estado: "parado" })).toEqual([7]);
    expect(nums({ setor: "engenharia", estado: "parado" })).toEqual([]);
    expect(nums({ estado: "concluido" })).toEqual([7]);
    expect(nums({ setor: "compras" })).toEqual([12, 105, 7]);
  });

  it("combina filtros (E)", () => {
    expect(nums({ situacao: "concluida", alerta: "parado", busca: "ana" })).toEqual([7]);
    expect(nums({ situacao: "concluida", busca: "maria" })).toEqual([]);
  });
});
