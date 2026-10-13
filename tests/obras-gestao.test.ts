/**
 * OPR 3A — modo Gestão de Obras, sem banco: o espelho de autorização usado só pela interface
 * (`autorizacao_setor_obra` da 3b-3), a navegação sequencial entre obras e o bloco `gestao` de
 * `carregarDetalheObra` com cliente falso. A autorização de fato é das RPCs (testada em
 * tests/obras-escrita-db.test.ts, no Supabase local).
 */
import { describe, expect, it } from "vitest";
import { carregarObras } from "@/lib/obras/dados";
import { carregarDetalheObra } from "@/lib/obras/detalhe";
import { autorizacaoSetor, bloqueioDaObra, permissoesSetor, podeAtualizarMarcos, type EntradaAutorizacao } from "@/lib/obras/gestao";
import { filtrosDeParams, hrefObra, montarNavegacao, queryDosFiltros, temFiltroAtivo } from "@/lib/obras/navegacao";
import { GERIR_OBRAS, OBRAS, pode } from "@/lib/permissoes";
import type { SupabaseServidor } from "@/lib/supabase/server";

// --- Espelho de autorização ------------------------------------------------------

const ATIVA = { cancelada: false, pausada: false };
const entrada = (e: Partial<EntradaAutorizacao>): EntradaAutorizacao => ({ papel: null, setoresDoMembro: [], setoresParticipando: [], ...e });

describe("autorizacaoSetor (espelho de autorizacao_setor_obra)", () => {
  it("admin atua em qualquer setor operacional, sem precisar de setor nem participação", () => {
    for (const setor of ["compras", "engenharia", "operacional"] as const) {
      expect(autorizacaoSetor(entrada({ papel: "admin" }), setor)).toBe("admin");
    }
  });

  it("gestor, vendedor, SDR e papel ausente nunca atuam, mesmo com setor/participação nos dados", () => {
    for (const papel of ["gestor", "vendedor", "sdr", null, undefined, "desconhecido"]) {
      const e = entrada({ papel, setoresDoMembro: [{ setor: "engenharia", capacidade: "coordenar" }], setoresParticipando: ["engenharia"] });
      expect(autorizacaoSetor(e, "engenharia"), String(papel)).toBeNull();
    }
  });

  it("operacao coordenador atua no próprio setor mesmo sem participar, e só nele", () => {
    const e = entrada({ papel: "operacao", setoresDoMembro: [{ setor: "engenharia", capacidade: "coordenar" }] });
    expect(autorizacaoSetor(e, "engenharia")).toBe("coordenar");
    expect(autorizacaoSetor(e, "compras")).toBeNull();
    expect(autorizacaoSetor(e, "operacional")).toBeNull();
  });

  it("operacao executor só atua no setor que tem E em que participa ativamente", () => {
    const comSetor = entrada({ papel: "operacao", setoresDoMembro: [{ setor: "operacional", capacidade: "executar" }] });
    expect(autorizacaoSetor(comSetor, "operacional")).toBeNull();
    expect(autorizacaoSetor({ ...comSetor, setoresParticipando: ["operacional"] }, "operacional")).toBe("executar");
    // Participa, mas não tem o setor (foi retirado): nada.
    expect(autorizacaoSetor(entrada({ papel: "operacao", setoresParticipando: ["operacional"] }), "operacional")).toBeNull();
    // Participa de outro setor: nada neste.
    expect(autorizacaoSetor({ ...comSetor, setoresParticipando: ["compras"] }, "operacional")).toBeNull();
  });
});

describe("permissoesSetor", () => {
  const executor = entrada({ papel: "operacao", setoresDoMembro: [{ setor: "operacional", capacidade: "executar" }], setoresParticipando: ["operacional"] });
  const coordenador = entrada({ papel: "operacao", setoresDoMembro: [{ setor: "compras", capacidade: "coordenar" }] });

  it("executor altera fluxo mas não gere participantes; coordenador e admin fazem os dois", () => {
    expect(permissoesSetor(executor, "operacional", ATIVA)).toEqual({ autorizacao: "executar", alterarFluxo: true, gerirParticipantes: false });
    expect(permissoesSetor(coordenador, "compras", ATIVA)).toEqual({ autorizacao: "coordenar", alterarFluxo: true, gerirParticipantes: true });
    expect(permissoesSetor(entrada({ papel: "admin" }), "engenharia", ATIVA)).toEqual({ autorizacao: "admin", alterarFluxo: true, gerirParticipantes: true });
  });

  it("obra cancelada: nada; pausada: só participantes", () => {
    const admin = entrada({ papel: "admin" });
    expect(permissoesSetor(admin, "compras", { cancelada: true, pausada: false })).toMatchObject({ alterarFluxo: false, gerirParticipantes: false });
    expect(permissoesSetor(admin, "compras", { cancelada: true, pausada: true })).toMatchObject({ alterarFluxo: false, gerirParticipantes: false });
    expect(permissoesSetor(admin, "compras", { cancelada: false, pausada: true })).toMatchObject({ alterarFluxo: false, gerirParticipantes: true });
    expect(permissoesSetor(executor, "operacional", { cancelada: false, pausada: true })).toMatchObject({ alterarFluxo: false, gerirParticipantes: false });
  });

  it("marcos: só quem atua no Operacional e com a obra ativa", () => {
    expect(podeAtualizarMarcos(executor, ATIVA)).toBe(true);
    expect(podeAtualizarMarcos(coordenador, ATIVA)).toBe(false);
    expect(podeAtualizarMarcos(entrada({ papel: "admin" }), ATIVA)).toBe(true);
    expect(podeAtualizarMarcos(entrada({ papel: "admin" }), { cancelada: false, pausada: true })).toBe(false);
    expect(podeAtualizarMarcos(entrada({ papel: "gestor" }), ATIVA)).toBe(false);
  });

  it("mensagem de bloqueio da obra", () => {
    expect(bloqueioDaObra(ATIVA)).toBeNull();
    expect(bloqueioDaObra({ cancelada: true, pausada: true })).toMatch(/cancelada/);
    expect(bloqueioDaObra({ cancelada: false, pausada: true })).toMatch(/pausada/);
  });

  it("GERIR_OBRAS: só admin e operacao; todos estão dentro de OBRAS", () => {
    for (const papel of ["gestor", "vendedor", "sdr"]) expect(pode(papel, GERIR_OBRAS), papel).toBe(false);
    for (const papel of GERIR_OBRAS) expect(pode(papel, OBRAS)).toBe(true);
  });
});

// --- Navegação ------------------------------------------------------------------

const obraNav = (id: string, numero: number, extra: Partial<{ situacao: string; clienteNome: string }> = {}) => ({
  id,
  numero,
  clienteNome: extra.clienteNome ?? `Cliente ${numero}`,
  situacao: (extra.situacao ?? "em_andamento") as "em_andamento" | "pausada",
  alertas: [],
  setores: [],
});

describe("navegação entre obras", () => {
  const obras = [obraNav("a", 30), obraNav("b", 20, { situacao: "pausada" }), obraNav("c", 10), obraNav("d", 5, { situacao: "pausada" })];

  it("Obra X de N, anterior e próxima seguem a ordem da lista", () => {
    expect(montarNavegacao(obras, {}, "b")).toMatchObject({ posicao: 2, total: 4, anteriorId: "a", proximaId: "c" });
    expect(montarNavegacao(obras, {}, "a")).toMatchObject({ posicao: 1, anteriorId: null, proximaId: "b" });
    expect(montarNavegacao(obras, {}, "d")).toMatchObject({ posicao: 4, anteriorId: "c", proximaId: null });
  });

  it("respeita os filtros: só percorre a lista filtrada", () => {
    const nav = montarNavegacao(obras, { situacao: "pausada" }, "d");
    expect(nav.itens.map((i) => i.id)).toEqual(["b", "d"]);
    expect(nav).toMatchObject({ posicao: 2, total: 2, anteriorId: "b", proximaId: null });
  });

  it("obra fora da lista filtrada (ou sem acesso): sem posição, volta ao início/fim", () => {
    expect(montarNavegacao(obras, { situacao: "pausada" }, "a")).toMatchObject({ posicao: null, total: 2, anteriorId: "d", proximaId: "b" });
    expect(montarNavegacao([], {}, "a")).toMatchObject({ posicao: null, total: 0, anteriorId: null, proximaId: null });
  });

  it("só a obra atual: nem anterior nem próxima", () => {
    expect(montarNavegacao([obraNav("a", 1)], {}, "a")).toMatchObject({ posicao: 1, total: 1, anteriorId: null, proximaId: null });
  });

  it("itens trazem só id e rótulo", () => {
    const [item] = montarNavegacao([obraNav("a", 7, { clienteNome: "Maria" })], {}, "a").itens;
    expect(item).toEqual({ id: "a", rotulo: "#7 Maria" });
  });

  it("filtros da URL: valores desconhecidos são ignorados; query preserva só os válidos", () => {
    const f = filtrosDeParams({ q: "  maria ", situacao: "pausada", alerta: "invalido", setor: "compras", estado: ["parado"], extra: "x" });
    expect(f).toEqual({ busca: "maria", situacao: "pausada", alerta: undefined, setor: "compras", estado: undefined });
    expect(queryDosFiltros(f)).toBe("q=maria&situacao=pausada&setor=compras");
    expect(queryDosFiltros({})).toBe("");
    expect(temFiltroAtivo({ setor: "compras" })).toBe(false);
    expect(temFiltroAtivo(f)).toBe(true);
    expect(filtrosDeParams({ q: "x".repeat(500) }).busca).toHaveLength(100);
  });

  it("endereço da obra preserva os filtros", () => {
    expect(hrefObra("/obras", "a", "")).toBe("/obras/a");
    expect(hrefObra("/obras", "a", "situacao=pausada")).toBe("/obras/a?situacao=pausada");
  });
});

// --- carregarDetalheObra: bloco gestao --------------------------------------------

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
      order: (col: string, { ascending = true }: { ascending?: boolean } = {}) => {
        linhas = [...linhas].sort((x, y) => (Number(x[col]) - Number(y[col])) * (ascending ? 1 : -1));
        return q;
      },
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
const OBRA = "11111111-1111-4111-8111-111111111111";

const linhaObra: Linha = {
  id: OBRA,
  empresa_id: EMPRESA,
  numero: 9,
  negocio_id: "neg-1",
  cliente_nome: "Cliente 9",
  cidade: "Cascavel",
  uf: "PR",
  potencia_kwp: 5,
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

const fluxos = ["compras", "engenharia", "operacional"].map((setor) => ({
  obra_id: OBRA,
  empresa_id: EMPRESA,
  setor,
  status: setor === "compras" ? "cotando" : setor === "engenharia" ? "a_iniciar" : "agendada",
  status_desde: null,
  parado: false,
  parado_motivo: null,
  aguardando: setor === "operacional" ? "cliente" : null,
}));

const participantes = [
  { id: "p-ana", obra_id: OBRA, empresa_id: EMPRESA, setor: "operacional", membro_id: "m-ana", funcao: "responsavel", principal: true, fim: null },
  { id: "p-eu", obra_id: OBRA, empresa_id: EMPRESA, setor: "compras", membro_id: "m-eu", funcao: "apoio", principal: false, fim: null },
  { id: "p-vend", obra_id: OBRA, empresa_id: EMPRESA, setor: "comercial", membro_id: "m-vend", funcao: "vendedor", principal: false, fim: null },
];

const identidades = [
  { membro_id: "m-ana", nome: "Ana", avatar_caminho: null },
  { membro_id: "m-eu", nome: "Eu", avatar_caminho: null },
  { membro_id: "m-vend", nome: "Vendedor", avatar_caminho: null },
  { membro_id: "m-bia", nome: "Bia", avatar_caminho: null },
];

function cenario(extra: { setoresMembro?: Linha[]; obra?: Linha; membros?: Linha[] } = {}) {
  return criarFake({
    tabelas: {
      obras: [{ ...linhaObra, ...extra.obra }],
      obra_fluxos: fluxos,
      obra_marcos: [],
      obra_participantes: participantes,
      obra_historico: [],
      obra_dados_comerciais: [],
      membro_setores_obra: extra.setoresMembro ?? [],
      empresa_membros: extra.membros ?? [],
    },
    rpcs: {
      identidade_membros: identidades,
      obras_operacao: [{ ...linhaObra, ...extra.obra, obra_id: OBRA }],
    },
  });
}

describe("navegação com 12 obras carregadas do jeito real (carregarObras + filtros)", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `o${String(i + 1).padStart(2, "0")}`);
  const tabelas = {
    obras: ids.map((id, i) => ({ ...linhaObra, id, numero: i + 1, cliente_nome: `Cliente ${i + 1}` })),
    // Obras pares têm o Operacional parado.
    obra_fluxos: ids.flatMap((id, i) =>
      ["compras", "engenharia", "operacional"].map((setor) => ({
        obra_id: id,
        empresa_id: EMPRESA,
        setor,
        status: "a_iniciar",
        parado: setor === "operacional" && i % 2 === 1,
        aguardando: null,
      })),
    ),
    obra_marcos: [],
    obra_participantes: [{ obra_id: "o01", empresa_id: EMPRESA, setor: "compras", membro_id: "m-ana", principal: true, fim: null }],
  };

  it("percorre as 12 em ordem (número decrescente), do início ao fim", async () => {
    const { cliente } = criarFake({ tabelas, rpcs: { identidade_membros: identidades } });
    const { obras } = await carregarObras(cliente, { empresaId: EMPRESA, papel: "admin", comResponsaveis: false });
    const visitadas: string[] = [];
    let atual: string | null = "o12";
    while (atual) {
      const nav = montarNavegacao(obras, {}, atual);
      expect(nav.posicao).toBe(visitadas.length + 1);
      expect(nav.total).toBe(12);
      visitadas.push(atual);
      atual = nav.proximaId;
    }
    expect(visitadas).toEqual([...ids].reverse());
  });

  it("com filtro (setor Operacional parado): só as 6 pares, posição relativa à lista filtrada", async () => {
    const { cliente } = criarFake({ tabelas, rpcs: { identidade_membros: identidades } });
    const { obras } = await carregarObras(cliente, { empresaId: EMPRESA, papel: "admin", comResponsaveis: false });
    const nav = montarNavegacao(obras, { setor: "operacional", estado: "parado" }, "o08");
    expect(nav.itens.map((i) => i.id)).toEqual(["o12", "o10", "o08", "o06", "o04", "o02"]);
    expect(nav).toMatchObject({ posicao: 3, total: 6, anteriorId: "o10", proximaId: "o06" });
  });

  it("comResponsaveis: false não consulta participantes nem nomes", async () => {
    const { cliente, chamadas } = criarFake({ tabelas, rpcs: { identidade_membros: identidades } });
    await carregarObras(cliente, { empresaId: EMPRESA, papel: "admin", comResponsaveis: false });
    expect(chamadas).not.toContain("from:obra_participantes");
    expect(chamadas).not.toContain("rpc:identidade_membros");
    const completo = criarFake({ tabelas, rpcs: { identidade_membros: identidades } });
    await carregarObras(completo.cliente, { empresaId: EMPRESA, papel: "admin" });
    expect(completo.chamadas).toContain("from:obra_participantes");
  });

  it("obras de outra empresa nunca entram na navegação", async () => {
    const comOutra = { ...tabelas, obras: [...tabelas.obras, { ...linhaObra, id: "x1", empresa_id: "emp-2", numero: 99 }] };
    const { cliente } = criarFake({ tabelas: comOutra, rpcs: { identidade_membros: identidades } });
    const { obras } = await carregarObras(cliente, { empresaId: EMPRESA, papel: "admin", comResponsaveis: false });
    expect(montarNavegacao(obras, {}, "o01").itens.map((i) => i.id)).not.toContain("x1");
  });
});

describe("carregarDetalheObra — bloco gestao", () => {
  it("gestor, vendedor e SDR: gestao nula e nenhuma consulta de setores/membros", async () => {
    for (const papel of ["gestor", "vendedor", "sdr"]) {
      const { cliente, chamadas } = cenario();
      const obra = await carregarDetalheObra(cliente, { empresaId: EMPRESA, papel, obraId: OBRA, membroId: "m-x" });
      expect(obra?.gestao, papel).toBeNull();
      expect(chamadas).not.toContain("from:membro_setores_obra");
      expect(chamadas).not.toContain("from:empresa_membros");
    }
  });

  it("admin: todos os setores, candidatos verificados (só operacao ativo com o setor)", async () => {
    const { cliente } = cenario({
      membros: [
        { id: "m-ana", empresa_id: EMPRESA, papel: "operacao", ativo: true },
        { id: "m-bia", empresa_id: EMPRESA, papel: "operacao", ativo: true },
        { id: "m-vend", empresa_id: EMPRESA, papel: "vendedor", ativo: true },
      ],
      setoresMembro: [
        { empresa_id: EMPRESA, membro_id: "m-bia", setor: "compras", capacidade: "executar" },
        { empresa_id: EMPRESA, membro_id: "m-ana", setor: "operacional", capacidade: "coordenar" },
        // Membro inativo / não-operacao com setor: fora.
        { empresa_id: EMPRESA, membro_id: "m-sumido", setor: "compras", capacidade: "executar" },
      ],
    });
    const obra = await carregarDetalheObra(cliente, { empresaId: EMPRESA, papel: "admin", obraId: OBRA, membroId: "m-adm" });
    const g = obra?.gestao;
    expect(g?.bloqueio).toBeNull();
    expect(g?.podeAtualizarMarcos).toBe(true);
    expect(g?.setores.map((s) => s.permissoes.autorizacao)).toEqual(["admin", "admin", "admin"]);
    const compras = g?.setores.find((s) => s.setor === "compras");
    expect(compras?.candidatosVerificados).toBe(true);
    expect(compras?.candidatos).toEqual([{ membroId: "m-bia", nome: "Bia", detalhe: "Executa no setor" }]);
    const operacional = g?.setores.find((s) => s.setor === "operacional");
    expect(operacional?.aguardandoCodigo).toBe("cliente");
    expect(operacional?.participantes).toEqual([
      { participanteId: "p-ana", nome: "Ana", funcao: "responsavel", funcaoRotulo: "Responsável", principal: true, proprio: false },
    ]);
    // Participação comercial nunca entra na gestão.
    expect(JSON.stringify(g)).not.toContain("p-vend");
  });

  it("operacao executor: só o setor em que participa; sem ids de participantes nem candidatos", async () => {
    const { cliente, chamadas } = cenario({ setoresMembro: [{ empresa_id: EMPRESA, membro_id: "m-eu", setor: "compras", capacidade: "executar" }] });
    const obra = await carregarDetalheObra(cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA, membroId: "m-eu" });
    const g = obra?.gestao;
    expect(g?.setores.map((s) => s.permissoes.autorizacao)).toEqual(["executar", null, null]);
    expect(g?.setores[0].permissoes).toMatchObject({ alterarFluxo: true, gerirParticipantes: false });
    expect(g?.podeAtualizarMarcos).toBe(false);
    for (const s of g?.setores ?? []) {
      expect(s.participantes).toEqual([]);
      expect(s.candidatos).toEqual([]);
    }
    expect(JSON.stringify(g)).not.toMatch(/p-ana|p-eu|m-ana|m-bia/);
    expect(chamadas).not.toContain("from:empresa_membros");
  });

  it("operacao coordenador: gere o próprio setor; candidatos não verificados, sem ele mesmo", async () => {
    const { cliente } = cenario({ setoresMembro: [{ empresa_id: EMPRESA, membro_id: "m-eu", setor: "compras", capacidade: "coordenar" }] });
    const obra = await carregarDetalheObra(cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA, membroId: "m-eu" });
    const compras = obra?.gestao?.setores.find((s) => s.setor === "compras");
    expect(compras?.permissoes).toEqual({ autorizacao: "coordenar", alterarFluxo: true, gerirParticipantes: true });
    expect(compras?.candidatosVerificados).toBe(false);
    expect(compras?.candidatos.map((c) => c.membroId)).not.toContain("m-eu");
    expect(compras?.participantes).toEqual([
      { participanteId: "p-eu", nome: "Eu", funcao: "apoio", funcaoRotulo: "Apoio", principal: false, proprio: true },
    ]);
    // Outros setores: nada, nem ids.
    expect(obra?.gestao?.setores.filter((s) => s.setor !== "compras").every((s) => s.participantes.length === 0)).toBe(true);
  });

  it("operacao sem setor e sem participação: gestao nula", async () => {
    const { cliente } = cenario();
    const obra = await carregarDetalheObra(cliente, { empresaId: EMPRESA, papel: "operacao", obraId: OBRA, membroId: "m-outro" });
    expect(obra?.gestao).toBeNull();
  });

  it("obra cancelada: gestao com bloqueio e nada habilitado; pausada: só participantes", async () => {
    const cancelada = await carregarDetalheObra(cenario({ obra: { cancelada_em: "2026-10-05T00:00:00Z" } }).cliente, {
      empresaId: EMPRESA,
      papel: "admin",
      obraId: OBRA,
      membroId: "m-adm",
    });
    expect(cancelada?.gestao?.bloqueio).toMatch(/cancelada/);
    expect(cancelada?.gestao?.setores.every((s) => !s.permissoes.alterarFluxo && !s.permissoes.gerirParticipantes)).toBe(true);
    expect(cancelada?.gestao?.podeAtualizarMarcos).toBe(false);

    const pausada = await carregarDetalheObra(cenario({ obra: { pausada_em: "2026-10-05T00:00:00Z" } }).cliente, {
      empresaId: EMPRESA,
      papel: "admin",
      obraId: OBRA,
      membroId: "m-adm",
    });
    expect(pausada?.gestao?.bloqueio).toMatch(/pausada/);
    expect(pausada?.gestao?.setores.every((s) => !s.permissoes.alterarFluxo && s.permissoes.gerirParticipantes)).toBe(true);
  });
});
