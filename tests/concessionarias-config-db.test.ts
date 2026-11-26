/**
 * Concessionárias, entrega 3 (20261224100000_concessionarias_configuracao.sql; plano em
 * docs/superpowers/plans/2026-11-26-concessionarias-configuracao.md): checklist, prazos da distribuidora e canais por
 * concessionária. Para quem só atende a Copel, nada muda. Precisa do Supabase local (roda no CI).
 *
 * Cenário próprio ("Config conc A/B" + sufixo, usuários "ccf-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { urlBancoLocal } from "./banco-local";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato, gerarContratoTeste } from "./ajuda";

// Ações reais das telas: só a sessão é substituída (padrão de negocios-acoes-db.test.ts).
const sessao = vi.hoisted(() => ({ cliente: null as unknown, atual: { empresaId: "", membroId: "", papel: "" } }));
vi.mock("@/lib/sessao", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(sessao.atual.papel)) throw new Error("sem permissão");
    return { atual: sessao.atual };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => sessao.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

function comoAdmin() {
  sessao.cliente = admin.cliente;
  sessao.atual = { empresaId: empresa, membroId: membro[admin.id], papel: "admin" };
}

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

function ok<T extends { error: unknown }>(r: T, onde: string): T {
  if (r.error) throw new Error(`${onde}: ${JSON.stringify(r.error)}`);
  return r;
}

let admin: Usuario;
let vendedor: Usuario;
let coordEng: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};

async function criarVenda(emp: string, titulo: string, distribuidora: string | null): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", emp).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: emp, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: emp,
      titulo,
      contato_id: c!.id,
      funil_id: f!.id,
      etapa_id: et!.id,
      responsavel_id: membro[vendedor.id],
      valor: 30000,
      qualif_distribuidora: distribuidora,
    })
    .select("id")
    .single();
  if (error) throw error;
  ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato, error: erroContrato } = await gerarContratoTeste(vendedor.cliente, { empresa_id: emp, negocio_id: neg!.id, conteudo: "Contrato de teste" });
  if (erroContrato) throw erroContrato;
  ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinado");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

async function idPorSigla(emp: string, sigla: string): Promise<string> {
  const [l] = await noBanco("select id from public.concessionarias where empresa_id = $1 and distribuidora = $2", [emp, sigla]);
  return l.id;
}

async function titulosDaObra(obra: string): Promise<string[]> {
  const linhas = await noBanco("select titulo from public.obra_engenharia_itens where obra_id = $1 order by titulo", [obra]);
  return linhas.map((l) => l.titulo);
}

async function protocolar(obra: string, inicio: string) {
  ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
  const { data: itens } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
  for (const i of itens!) ok(await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste" }), "dispensar");
  ok(
    await admin.cliente.rpc("registrar_protocolo_engenharia", {
      p_obra_id: obra,
      p_distribuidora: "Copel",
      p_canal: "pew",
      p_numero: `CF-${obra.slice(0, 8)}`,
      p_tipo_solicitacao: "nova_conexao",
      p_protocolado_em: inicio,
    }),
    "protocolo",
  );
}

async function analiseDaObra(quem: Usuario, obra: string) {
  const { data, error } = await quem.cliente.rpc("prazos_engenharia", { p_empresa_id: empresa });
  if (error) throw error;
  return (data ?? []).find((p) => p.obra_id === obra && p.chave === "distribuidora_analise");
}

async function venceEm(inicio: string, dias: number, contagem: string): Promise<string> {
  const [l] = await noBanco("select public.somar_dias_prazo($1, $2::date, $3, $4)::text as d", [empresa, inicio, dias, contagem]);
  return l.d;
}

describe("Concessionárias: checklist e prazos por concessionária (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let copelA: string;
  let cemigA: string;
  let obraCopel: string;

  beforeAll(async () => {
    [admin, vendedor, coordEng, adminB] = await Promise.all(["ccf-admin", "ccf-vendedor", "ccf-coord-eng", "ccf-admin-b"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Config conc A ${sufixo}` }, { nome: `Config conc B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [coordEng, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    ok(
      await admin.cliente.rpc("definir_setores_membro", {
        p_membro_id: membro[coordEng.id],
        p_setores: [{ setor: "engenharia", capacidade: "coordenar" }] as never,
      }),
      "coordenador",
    );
    copelA = await idPorSigla(empresa, "COPEL-DIS");
    const { data: cemig, error: e } = await servico
      .from("concessionarias")
      .insert({ empresa_id: empresa, nome: "Cemig", distribuidora: "CEMIG-D" })
      .select("id")
      .single();
    if (e) throw e;
    cemigA = cemig!.id;
  });

  it("obra da Copel recebe exatamente os itens ativos do modelo da Copel", async () => {
    obraCopel = await criarVenda(empresa, `Copel ${sufixo}`, "Copel Distribuição");
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obraCopel }), "aplicar");
    const modelo = await noBanco(
      "select titulo from public.engenharia_checklist_modelo where concessionaria_id = $1 and ativo order by titulo",
      [copelA],
    );
    expect(modelo.length).toBeGreaterThan(0);
    expect(await titulosDaObra(obraCopel)).toEqual(modelo.map((l) => l.titulo));
  });

  it("item do modelo da Cemig só entra em obra da Cemig", async () => {
    const titulo = `Item só da Cemig ${sufixo}`;
    ok(
      await admin.cliente
        .from("engenharia_checklist_modelo")
        .insert({ empresa_id: empresa, concessionaria_id: cemigA, grupo: "Cemig", titulo, obrigatorio: true, ordem: 10 } as never),
      "item da Cemig",
    );
    const obraCemig = await criarVenda(empresa, `Cemig ${sufixo}`, "Cemig");
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obraCemig }), "aplicar Cemig");
    expect(await titulosDaObra(obraCemig)).toEqual([titulo]);
    expect(await titulosDaObra(obraCopel)).not.toContain(titulo);
  });

  it("tela: o admin cria item no modelo da concessionária escolhida", async () => {
    const { criarItemModelo } = await import("@/app/(app)/configuracoes/engenharia/actions");
    comoAdmin();
    const titulo = `Pela tela na Cemig ${sufixo}`;
    expect(await criarItemModelo(null, formulario({ concessionariaId: cemigA, grupo: "Cemig", titulo, ordem: "20" }))).toEqual({ ok: true, mensagem: "Item criado." });
    const [l] = await noBanco("select concessionaria_id from public.engenharia_checklist_modelo where titulo = $1", [titulo]);
    expect(l.concessionaria_id).toBe(cemigA);
    expect(await criarItemModelo(null, formulario({ grupo: "Cemig", titulo: `${titulo} 2`, ordem: "30" }))).toEqual({ ok: false, mensagem: "Escolha a concessionária." });
  });

  it("o item do modelo não troca de concessionária", async () => {
    const { data: item } = await servico.from("engenharia_checklist_modelo").select("id").eq("concessionaria_id" as never, copelA).limit(1).single();
    expect((await admin.cliente.from("engenharia_checklist_modelo").update({ concessionaria_id: cemigA } as never).eq("id", item!.id)).error).not.toBeNull();
  });

  it("prazo da distribuidora vem da concessionária da obra, também para quem só lê pela Operação", async () => {
    const [{ d: inicio }] = await noBanco("select (public.hoje_brasilia() - 3)::text as d");
    await protocolar(obraCopel, inicio);
    const esperado = await venceEm(inicio, 15, "corridos");
    expect(await analiseDaObra(admin, obraCopel)).toMatchObject({ inicio, limite: esperado, contagem: "corridos" });
    expect(await analiseDaObra(coordEng, obraCopel)).toMatchObject({ inicio, limite: esperado, contagem: "corridos" });

    ok(
      await coordEng.cliente
        .from("concessionaria_prazos" as never)
        .update({ dias_uteis: 20 } as never)
        .eq("concessionaria_id", copelA)
        .eq("chave", "distribuidora_analise"),
      "coordenador edita",
    );
    expect(await analiseDaObra(admin, obraCopel)).toMatchObject({ limite: await venceEm(inicio, 20, "corridos") });

    // Obra sem concessionária: sem prazo da distribuidora.
    await noBanco("update public.obras set concessionaria_id = null where id = $1", [obraCopel]);
    expect(await analiseDaObra(admin, obraCopel)).toBeUndefined();
    await noBanco("update public.obras set concessionaria_id = $2 where id = $1", [obraCopel, copelA]);
  });

  it("prazos da distribuidora: só quem edita prazos da empresa altera; ninguém de fora", async () => {
    const tentar = (quem: Usuario) =>
      quem.cliente
        .from("concessionaria_prazos" as never)
        .update({ dias_uteis: 99 } as never)
        .eq("concessionaria_id", copelA)
        .eq("chave", "distribuidora_vistoria")
        .select("chave");
    for (const quem of [vendedor, adminB]) {
      const r = await tentar(quem);
      expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
    }
    const [{ dias_uteis }] = await noBanco("select dias_uteis from public.concessionaria_prazos where concessionaria_id = $1 and chave = 'distribuidora_vistoria'", [copelA]);
    expect(dias_uteis).toBe(7);
    expect((await adminB.cliente.from("concessionaria_prazos" as never).select("chave").eq("concessionaria_id", copelA)).data).toEqual([]);
  });

  it("tela: lê os prazos da distribuidora da concessionária, na ordem das chaves", async () => {
    const { carregarPrazosConcessionaria } = await import("@/lib/engenharia-prazos");
    const lista = await carregarPrazosConcessionaria(coordEng.cliente as unknown as SupabaseServidor, { empresaId: empresa, concessionariaId: copelA });
    expect(lista).toEqual([
      { chave: "distribuidora_analise", dias: 20, contagem: "corridos" },
      { chave: "distribuidora_analise_rural", dias: 30, contagem: "corridos" },
      { chave: "distribuidora_vistoria", dias: 7, contagem: "uteis" },
      { chave: "distribuidora_conexao", dias: null, contagem: "uteis" },
    ]);
  });

  it("empresa criada depois tem a Copel com checklist e prazos, e só prazos internos na empresa", async () => {
    const { data } = await servico.from("empresas").insert({ nome: `Config conc C ${sufixo}` }).select("id").single();
    const copelC = await idPorSigla(data!.id, "COPEL-DIS");
    const titulos = await noBanco("select titulo from public.engenharia_checklist_modelo where concessionaria_id = $1", [copelC]);
    expect(titulos.map((l) => l.titulo)).toContain("Memorial descritivo");
    const prazos = await noBanco(
      "select chave, dias_uteis, contagem from public.concessionaria_prazos where concessionaria_id = $1 order by chave",
      [copelC],
    );
    expect(prazos).toEqual([
      { chave: "distribuidora_analise", dias_uteis: 15, contagem: "corridos" },
      { chave: "distribuidora_analise_rural", dias_uteis: 30, contagem: "corridos" },
      { chave: "distribuidora_conexao", dias_uteis: null, contagem: "uteis" },
      { chave: "distribuidora_vistoria", dias_uteis: 7, contagem: "uteis" },
    ]);
    const daEmpresa = await noBanco("select chave from public.engenharia_prazos where empresa_id = $1 and chave like 'distribuidora%'", [data!.id]);
    expect(daEmpresa).toEqual([]);
  });

  it("canais da Copel: a regra do PEW de hoje virou cadastro", async () => {
    const canais = await noBanco(
      "select nome, ordem, ativo, tipos, tensoes from public.concessionaria_canais where concessionaria_id = $1 order by ordem",
      [copelA],
    );
    expect(canais).toEqual([
      { nome: "PEW", ordem: 10, ativo: true, tipos: ["nova_conexao", "ampliacao", "regularizacao", "ligacao_nova", "aumento_carga"], tensoes: ["baixa"] },
      { nome: "Site da Copel", ordem: 20, ativo: true, tipos: ["troca_titularidade", "cadastro_compensacao", "ligacao_nova", "aumento_carga"], tensoes: ["media"] },
      { nome: "CAW", ordem: 30, ativo: true, tipos: [], tensoes: [] },
      { nome: "Atendimento comercial", ordem: 40, ativo: true, tipos: [], tensoes: [] },
    ]);
    expect((await vendedor.cliente.from("concessionaria_canais" as never).insert({ empresa_id: empresa, concessionaria_id: copelA, nome: "Fax" } as never)).error).not.toBeNull();
    expect((await adminB.cliente.from("concessionaria_canais" as never).select("id").eq("concessionaria_id", copelA)).data).toEqual([]);
  });

  it("nova concessionária: cópia da Copel ou vazia; só o admin da empresa; sigla válida e nova", async () => {
    const siglas = await noBanco(
      "select distinct distribuidora from public.tarifas_gd_aneel where distribuidora not in ('COPEL-DIS', 'CEMIG-D') order by distribuidora limit 2",
    );
    const [copia, vazia] = siglas.map((l) => l.distribuidora as string);
    const criar = (quem: Usuario, nome: string, sigla: string, copiarDe: string | null) =>
      quem.cliente.rpc("criar_concessionaria" as never, { p_empresa_id: empresa, p_nome: nome, p_distribuidora: sigla, p_copiar_de: copiarDe } as never);

    expect((await criar(vendedor, "Nova", copia, copelA)).error?.message).toBe("Só o admin cria concessionária.");
    expect((await criar(adminB, "Nova", copia, copelA)).error?.message).toBe("Só o admin cria concessionária.");
    expect((await criar(admin, "Nova", "NAO-EXISTE", copelA)).error?.message).toBe("Distribuidora não encontrada.");
    expect((await criar(admin, "Outra Cemig", "CEMIG-D", null)).error?.message).toBe("Esta distribuidora já tem concessionária na empresa.");
    expect((await criar(admin, "copel", copia, null)).error?.message).toBe("Já existe uma concessionária com esse nome.");

    const r = await criar(admin, `Cópia ${sufixo}`.slice(0, 40), copia, copelA);
    expect(r.error).toBeNull();
    const nova = r.data as unknown as string;
    const titulos = (c: string) =>
      noBanco("select titulo from public.engenharia_checklist_modelo where concessionaria_id = $1 and ativo order by titulo", [c]).then((l) => l.map((x) => x.titulo));
    expect(await titulos(nova)).toEqual(await titulos(copelA));
    const prazos = (c: string) =>
      noBanco("select chave, dias_uteis, contagem from public.concessionaria_prazos where concessionaria_id = $1 order by chave", [c]);
    expect(await prazos(nova)).toEqual(await prazos(copelA));
    const canais = (c: string) =>
      noBanco("select nome, ordem, ativo, tipos, tensoes from public.concessionaria_canais where concessionaria_id = $1 order by ordem", [c]);
    expect(await canais(nova)).toEqual(await canais(copelA));
    const marcados = async (c: string) => {
      const [l] = await noBanco(
        "select count(*) filter (where documento_cliente is not null or gera_procuracao)::int as n from public.engenharia_checklist_modelo where concessionaria_id = $1 and ativo",
        [c],
      );
      return l.n;
    };
    expect(await marcados(nova)).toBe(await marcados(copelA));

    const rv = await criar(admin, `Vazia ${sufixo}`.slice(0, 40), vazia, null);
    expect(rv.error).toBeNull();
    const idVazia = rv.data as unknown as string;
    expect(await titulos(idVazia)).toEqual([]);
    expect(await canais(idVazia)).toEqual([]);
    expect((await prazos(idVazia)).map((p) => p.dias_uteis)).toEqual([null, null, null, null]);

    // A distribuidora não muda depois de criada; o nome, sim.
    expect((await admin.cliente.from("concessionarias").update({ distribuidora: "COPEL-DIS" }).eq("id", idVazia)).error).not.toBeNull();
    expect((await admin.cliente.from("concessionarias").update({ nome: `Renomeada ${sufixo}`.slice(0, 40) }).eq("id", idVazia)).error).toBeNull();
  });

  it("regra 7: trocar a concessionária troca o checklist só se nada foi enviado", async () => {
    const definir = (obra: string, c: string) => coordEng.cliente.rpc("definir_concessionaria_obra", { p_obra_id: obra, p_concessionaria_id: c });
    const historico = async (obra: string) => {
      const [h] = await noBanco(
        "select dados from public.obra_historico where obra_id = $1 and tipo = 'concessionaria_obra_alterada' order by created_at desc limit 1",
        [obra],
      );
      return h.dados;
    };
    const daCemig = (
      await noBanco("select titulo from public.engenharia_checklist_modelo where concessionaria_id = $1 and ativo order by titulo", [cemigA])
    ).map((l) => l.titulo);

    // Só pendentes: troca.
    const limpa = await criarVenda(empresa, `Regra 7 limpa ${sufixo}`, "Copel");
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: limpa }), "aplicar");
    ok(await definir(limpa, cemigA), "trocar");
    expect(await titulosDaObra(limpa)).toEqual(daCemig);
    expect(await historico(limpa)).toMatchObject({ de: "Copel", para: "Cemig", checklist_trocado: true });

    // Dispensado pelo enquadramento não conta como envio: troca.
    const enquadrada = await criarVenda(empresa, `Regra 7 enquadrada ${sufixo}`, "Copel");
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: enquadrada }), "aplicar");
    ok(await admin.cliente.rpc("salvar_enquadramento_engenharia", { p_obra_id: enquadrada, p_respostas: { titularidade: "pf" } as never }), "enquadrar");
    const [{ auto }] = await noBanco(
      "select count(*)::int as auto from public.obra_engenharia_itens where obra_id = $1 and pelo_enquadramento and status = 'dispensado'",
      [enquadrada],
    );
    expect(auto).toBeGreaterThan(0);
    ok(await definir(enquadrada, cemigA), "trocar enquadrada");
    expect(await historico(enquadrada)).toMatchObject({ checklist_trocado: true });

    // "Não se aplica" marcado à mão: o checklist fica.
    const trabalhada = await criarVenda(empresa, `Regra 7 trabalhada ${sufixo}`, "Copel");
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: trabalhada }), "aplicar");
    const antes = await titulosDaObra(trabalhada);
    const { data: item } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", trabalhada).limit(1).single();
    ok(await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: item!.id, p_status: "dispensado", p_motivo: "Não se aplica" }), "dispensar");
    const enviado = await admin.cliente.rpc("checklist_engenharia_enviado" as never, { p_obra_id: trabalhada } as never);
    expect(enviado.data).toBe(true);
    ok(await definir(trabalhada, cemigA), "trocar trabalhada");
    expect(await titulosDaObra(trabalhada)).toEqual(antes);
    expect(await historico(trabalhada)).toMatchObject({ checklist_trocado: false });
  });

  it("protocolo: canal da concessionária da obra (sem diferenciar maiúsculas) ou Outro", async () => {
    const [p] = await noBanco("select canal from public.obra_engenharia_protocolos where obra_id = $1", [obraCopel]);
    expect(p.canal).toBe("PEW");

    const obra = await criarVenda(empresa, `Canal ${sufixo}`, "Copel");
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
    const { data: itens } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
    for (const i of itens!) ok(await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste" }), "dispensar");
    const registrar = (canal: string) =>
      admin.cliente.rpc("registrar_protocolo_engenharia", {
        p_obra_id: obra,
        p_distribuidora: "Copel",
        p_canal: canal,
        p_numero: `CN-${sufixo}`,
        p_tipo_solicitacao: "nova_conexao",
        p_protocolado_em: "2026-11-20",
      });
    expect((await registrar("Fax")).error?.message).toBe("Escolha um canal da concessionária da obra.");
    ok(await registrar("Outro"), "outro");
    const [q] = await noBanco("select canal from public.obra_engenharia_protocolos where obra_id = $1", [obra]);
    expect(q.canal).toBe("outro");
  });

  it("obras sem concessionária, por distribuidora citada no negócio (só o admin vê)", async () => {
    const [d] = await noBanco(
      `select t.distribuidora, t.nomes_aceitos[1] as nome from public.tarifas_gd_aneel t
       where not exists (select 1 from public.concessionarias c where c.empresa_id = $1 and c.distribuidora = t.distribuidora)
       order by t.distribuidora desc limit 1`,
      [empresa],
    );
    await criarVenda(empresa, `Sem conc ${sufixo}`, d.nome);
    const { data, error } = await admin.cliente.rpc("obras_sem_concessionaria_por_distribuidora" as never, { p_empresa_id: empresa } as never);
    expect(error).toBeNull();
    expect(data as unknown as { distribuidora: string; obras: number }[]).toContainEqual({ distribuidora: d.distribuidora, obras: 1 });
    expect((await vendedor.cliente.rpc("obras_sem_concessionaria_por_distribuidora" as never, { p_empresa_id: empresa } as never)).error).not.toBeNull();
  });

  it("tela: lê as concessionárias com a sigla, os canais por ordem e se a obra já teve envio", async () => {
    const { carregarCanais, carregarConcessionarias, checklistEnviado } = await import("@/lib/engenharia-concessionaria");
    const cliente = coordEng.cliente as unknown as SupabaseServidor;
    const lista = await carregarConcessionarias(cliente, empresa);
    expect(lista).toContainEqual({ id: copelA, nome: "Copel", distribuidora: "COPEL-DIS" });
    const canais = await carregarCanais(cliente, { empresaId: empresa, concessionariaId: copelA });
    expect(canais.map((c) => c.nome)).toEqual(["PEW", "Site da Copel", "CAW", "Atendimento comercial"]);
    expect(canais[0]).toMatchObject({ ordem: 10, ativo: true, tensoes: ["baixa"] });
    expect(await checklistEnviado(cliente, obraCopel)).toBe(true);
  });

  it("tela: o admin cria concessionária (cópia da Copel), renomeia e cadastra canal; quem coordena salva os prazos", async () => {
    const { criarConcessionaria, renomearConcessionaria, salvarCanal, salvarPrazosConcessionaria } = await import(
      "@/app/(app)/configuracoes/engenharia/acoes-concessionarias"
    );
    const [{ distribuidora: sigla }] = await noBanco(
      "select distinct t.distribuidora from public.tarifas_gd_aneel t where not exists (select 1 from public.concessionarias c where c.empresa_id = $1 and c.distribuidora = t.distribuidora) order by 1 limit 1",
      [empresa],
    );
    comoAdmin();
    await expect(criarConcessionaria(null, formulario({ nome: "Pela tela", distribuidora: sigla, base: "copel" }))).rejects.toThrow(
      /redirect \/configuracoes\/engenharia\?c=[0-9a-f-]{36}/,
    );
    const [nova] = await noBanco("select id from public.concessionarias where empresa_id = $1 and distribuidora = $2", [empresa, sigla]);
    const [{ n }] = await noBanco("select count(*)::int as n from public.concessionaria_canais where concessionaria_id = $1", [nova.id]);
    expect(n).toBe(4);
    expect(await criarConcessionaria(null, formulario({ nome: "Outra", distribuidora: sigla, base: "vazia" }))).toEqual({
      ok: false,
      mensagem: "Esta distribuidora já tem concessionária na empresa.",
    });

    expect(await renomearConcessionaria(null, formulario({ id: nova.id, nome: "Renomeada pela tela" }))).toEqual({ ok: true, mensagem: "Nome salvo." });

    const canal = (campos: Record<string, string>, tipos: string[] = [], tensoes: string[] = []) => {
      const fd = formulario({ concessionariaId: nova.id, ordem: "50", ativo: "on", ...campos });
      for (const t of tipos) fd.append("tipos", t);
      for (const t of tensoes) fd.append("tensoes", t);
      return salvarCanal(null, fd);
    };
    expect(await canal({ nome: "Agência virtual" }, ["voo"])).toEqual({ ok: false, mensagem: "Tipo de solicitação inválido." });
    expect(await canal({ nome: "Agência virtual" }, ["ligacao_nova"], ["alta"])).toEqual({ ok: false, mensagem: "Tensão inválida." });
    expect(await canal({ nome: "outro" })).toEqual({ ok: false, mensagem: 'Use outro nome: "Outro" já é a opção fixa do protocolo.' });
    expect(await canal({ nome: "pew" })).toEqual({ ok: false, mensagem: "Já existe um canal com esse nome." });
    expect(await canal({ nome: "Agência virtual" }, ["troca_titularidade"])).toEqual({ ok: true, mensagem: "Canal salvo." });
    const [criado] = await noBanco("select id, tipos, ativo from public.concessionaria_canais where concessionaria_id = $1 and nome = 'Agência virtual'", [nova.id]);
    expect(criado).toMatchObject({ tipos: ["troca_titularidade"], ativo: true });
    expect(await canal({ id: criado.id, nome: "Agência virtual", ativo: "" })).toEqual({ ok: true, mensagem: "Canal salvo." });
    const [desativado] = await noBanco("select ativo from public.concessionaria_canais where id = $1", [criado.id]);
    expect(desativado.ativo).toBe(false);

    sessao.cliente = coordEng.cliente;
    sessao.atual = { empresaId: empresa, membroId: membro[coordEng.id], papel: "operacao" };
    const prazos = formulario({
      concessionariaId: nova.id,
      distribuidora_analise: "12",
      distribuidora_analise_contagem: "uteis",
      distribuidora_analise_rural: "",
      distribuidora_analise_rural_contagem: "corridos",
      distribuidora_vistoria: "7",
      distribuidora_vistoria_contagem: "uteis",
      distribuidora_conexao: "",
      distribuidora_conexao_contagem: "uteis",
    });
    expect(await salvarPrazosConcessionaria(null, prazos)).toEqual({ ok: true, mensagem: "Prazos salvos." });
    const gravados = await noBanco(
      "select chave, dias_uteis, contagem from public.concessionaria_prazos where concessionaria_id = $1 order by chave",
      [nova.id],
    );
    expect(gravados).toEqual([
      { chave: "distribuidora_analise", dias_uteis: 12, contagem: "uteis" },
      { chave: "distribuidora_analise_rural", dias_uteis: null, contagem: "corridos" },
      { chave: "distribuidora_conexao", dias_uteis: null, contagem: "uteis" },
      { chave: "distribuidora_vistoria", dias_uteis: 7, contagem: "uteis" },
    ]);
  });

  it("tela: a ação do protocolo aceita o nome de um canal da concessionária", async () => {
    const { registrarProtocoloEngenharia } = await import("@/lib/acoes/engenharia");
    const obra = await criarVenda(empresa, `Canal pela tela ${sufixo}`, "Copel");
    ok(await admin.cliente.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
    const { data: itens } = await servico.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
    for (const i of itens!) ok(await admin.cliente.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste" }), "dispensar");
    comoAdmin();
    const r = await registrarProtocoloEngenharia(
      null,
      formulario({ obraId: obra, distribuidora: "Copel", canal: "Site da Copel", numero: `TL-${sufixo}`, tipoSolicitacao: "troca_titularidade", protocoladoEm: "2026-11-20" }),
    );
    expect(r?.ok).toBe(true);
    const [p] = await noBanco("select canal from public.obra_engenharia_protocolos where obra_id = $1", [obra]);
    expect(p.canal).toBe("Site da Copel");
  });

  it("tela: diz de qual concessionária veio o checklist já aplicado", async () => {
    const { concessionariaDoChecklist } = await import("@/lib/engenharia-concessionaria");
    const cliente = coordEng.cliente as unknown as SupabaseServidor;
    expect(await concessionariaDoChecklist(cliente, obraCopel)).toBe(copelA);
    const semChecklist = await criarVenda(empresa, `Sem checklist ${sufixo}`, "Copel");
    expect(await concessionariaDoChecklist(cliente, semChecklist)).toBeNull();
  });
});
