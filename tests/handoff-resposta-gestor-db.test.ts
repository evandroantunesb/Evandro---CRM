/**
 * PR S — quem aceita ou devolve um handoff pendente (migration 20261009110000), com Supabase
 * local (roda no CI) e o cliente autenticado de cada usuário (RLS real, RPC direta):
 * destinatário, admin ativo da empresa e gestor ativo de uma equipe ativa do destinatário.
 * Gestor só do SDR remetente, de equipe inativa, inativo, vendedor marcado como gestor de
 * equipe e usuários de outra empresa são recusados. O resto do aceite/devolução (histórico,
 * notificação, eventos, perfil congelado, handoff_origem_id, responsável) não muda.
 * oportunidades_pendentes_equipe: lista restrita do Painel (gestor/admin), colunas fixas,
 * sem dados pessoais/financeiros, isolada por empresa e equipe.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/supabase/database.types";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const NOMES = [
  "admin",
  "gestorDest",
  "gestorSdr",
  "gestorEquipeInativa",
  "gestorInativo",
  "vendedorMarcadoGestor",
  "sdr",
  "closer",
  "outroVendedor",
  "adminOutra",
  "gestorOutra",
  "gestorDuasEmpresas",
  "sdrOutra",
  "closerOutra",
] as const;
type Nome = (typeof NOMES)[number];

const u = {} as Record<Nome, Usuario>;
const membro = {} as Record<Nome, string>;
let empresa: string;
let outra: string;
let funil: string;
let etapaInicial: string;
let contato: string;
let funilOutra: string;
let etapaOutra: string;
let contatoOutra: string;

async function equipe(empresaId: string, nome: string, ativa: boolean, gestor: Nome, membros: Nome[]) {
  const { data: eq, error } = await servico.from("equipes").insert({ empresa_id: empresaId, nome, ativa }).select("id").single();
  if (error) throw error;
  const { error: erroMembros } = await servico.from("equipe_membros").insert([
    { equipe_id: eq!.id, empresa_id: empresaId, membro_id: membro[gestor], e_gestor: true },
    ...membros.map((m) => ({ equipe_id: eq!.id, empresa_id: empresaId, membro_id: membro[m], e_gestor: false })),
  ]);
  if (erroMembros) throw erroMembros;
}

beforeAll(async () => {
  const usuarios = await Promise.all(NOMES.map((n) => criarUsuario(`hr-${n}`)));
  NOMES.forEach((n, i) => (u[n] = usuarios[i]));

  const { data: emps } = await servico
    .from("empresas")
    .insert([{ nome: `Resposta handoff ${sufixo}` }, { nome: `Resposta handoff outra ${sufixo}` }])
    .select("id, nome");
  empresa = emps!.find((e) => !e.nome.includes("outra"))!.id;
  outra = emps!.find((e) => e.nome.includes("outra"))!.id;

  const papeis: [Nome, string, "admin" | "gestor" | "vendedor" | "sdr", boolean][] = [
    ["admin", empresa, "admin", true],
    ["gestorDest", empresa, "gestor", true],
    ["gestorSdr", empresa, "gestor", true],
    ["gestorEquipeInativa", empresa, "gestor", true],
    ["gestorInativo", empresa, "gestor", false],
    ["vendedorMarcadoGestor", empresa, "vendedor", true],
    ["sdr", empresa, "sdr", true],
    ["closer", empresa, "vendedor", true],
    ["outroVendedor", empresa, "vendedor", true],
    ["adminOutra", outra, "admin", true],
    ["gestorOutra", outra, "gestor", true],
    ["gestorDuasEmpresas", empresa, "gestor", true],
    ["sdrOutra", outra, "sdr", true],
    ["closerOutra", outra, "vendedor", true],
  ];
  const { data: vinculos, error } = await servico
    .from("empresa_membros")
    .insert(
      papeis.map(([n, e, papel, ativo]) => ({
        empresa_id: e,
        user_id: u[n].id,
        papel,
        // `ativo` é derivado de `status` (sincronizar_ativo_membro).
        status: ativo ? ("ativo" as const) : ("inativo" as const),
        perfil_gamificacao: papel === "sdr" ? ("sdr" as const) : papel === "vendedor" ? ("closer" as const) : null,
      })),
    )
    .select("id, user_id");
  if (error) throw error;
  for (const n of NOMES) membro[n] = vinculos!.find((v) => v.user_id === u[n].id)!.id;
  // Mesmo usuário também é admin da outra empresa (vínculo extra; membro[] guarda o da empresa A).
  const { data: vinculoB, error: erroB } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: outra, user_id: u.gestorDuasEmpresas.id, papel: "admin" })
    .select("id")
    .single();
  if (erroB) throw erroB;
  void vinculoB;

  await equipe(empresa, "Equipe do closer", true, "gestorDest", ["closer"]);
  await equipe(empresa, "Equipe do SDR", true, "gestorSdr", ["sdr"]);
  await equipe(empresa, "Equipe antiga do closer", false, "gestorEquipeInativa", ["closer"]);
  await equipe(empresa, "Equipe do gestor inativo", true, "gestorInativo", ["closer"]);
  await equipe(empresa, "Equipe com vendedor marcado", true, "vendedorMarcadoGestor", ["closer"]);
  await equipe(empresa, "Equipe do gestor de duas empresas", true, "gestorDuasEmpresas", ["closer"]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapaInicial = et!.id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente resposta handoff" }).select("id").single();
  contato = c!.id;

  const { data: fB } = await servico.from("funis").select("id").eq("empresa_id", outra).single();
  funilOutra = fB!.id;
  const { data: etB } = await servico.from("etapas").select("id").eq("funil_id", funilOutra).order("ordem").limit(1).single();
  etapaOutra = etB!.id;
  const { data: cB } = await servico.from("contatos").insert({ empresa_id: outra, nome: "Cliente da outra empresa" }).select("id").single();
  contatoOutra = cB!.id;
});

/** Negócio do SDR com handoff pendente SDR → closer (aberto pelo próprio SDR, via RLS). */
async function handoffPendente(
  titulo: string,
  extra: { contatoId?: string; snapshot?: { [chave: string]: Json }; observacoes?: string; outraEmpresa?: boolean } = {},
) {
  const b = extra.outraEmpresa;
  const contatoId = extra.contatoId ?? (b ? contatoOutra : contato);
  const { data: negocio, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: b ? outra : empresa,
      titulo,
      contato_id: contatoId,
      funil_id: b ? funilOutra : funil,
      etapa_id: b ? etapaOutra : etapaInicial,
      responsavel_id: b ? membro.sdrOutra : membro.sdr,
      valor: 98765,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data: handoff, error: erroHandoff } = await (b ? u.sdrOutra : u.sdr).cliente
    .from("handoffs")
    .insert({
      empresa_id: b ? outra : empresa,
      negocio_id: negocio!.id,
      contato_id: contatoId,
      de_membro_id: b ? membro.sdrOutra : membro.sdr,
      para_membro_id: b ? membro.closerOutra : membro.closer,
      status_qualificacao: "qualificado",
      qualificacao_snapshot: extra.snapshot ?? {},
      observacoes: extra.observacoes ?? null,
    })
    .select("id")
    .single();
  if (erroHandoff) throw erroHandoff;
  return { negocioId: negocio!.id, handoffId: handoff!.id };
}

const estado = async (handoffId: string, negocioId: string) => {
  const [{ data: h }, { data: n }, { count: eventos }] = await Promise.all([
    servico.from("handoffs").select("status, respondido_por, motivo_devolucao").eq("id", handoffId).single(),
    servico.from("negocios").select("responsavel_id, handoff_origem_id").eq("id", negocioId).single(),
    servico
      .from("eventos")
      .select("id", { count: "exact", head: true })
      .eq("entidade_id", negocioId)
      .in("tipo", ["oportunidade_aceita", "handoff.devolvido"]),
  ]);
  return { handoff: h!, negocio: n!, eventosResposta: eventos };
};

const AUTORIZADOS: Nome[] = ["closer", "admin", "gestorDest", "gestorDuasEmpresas"];
const RECUSADOS: Nome[] = [
  "gestorSdr",
  "gestorEquipeInativa",
  "gestorInativo",
  "vendedorMarcadoGestor",
  "sdr",
  "outroVendedor",
  "adminOutra",
  "gestorOutra",
  "sdrOutra",
  "closerOutra",
];

describe("pode_responder_handoff (regra usada pela tela e pelas RPCs)", () => {
  it("verdadeiro só para destinatário, admin da empresa e gestor de equipe ativa do destinatário", async () => {
    const { handoffId } = await handoffPendente("Regra de resposta");
    for (const n of NOMES) {
      const { data, error } = await u[n].cliente.rpc("pode_responder_handoff", { p_handoff_id: handoffId });
      expect(error, n).toBeNull();
      expect(data, n).toBe(AUTORIZADOS.includes(n));
    }
  });
});

describe("aceite", () => {
  it.each(RECUSADOS)("%s não aceita: recusa sem alterar nada", async (n) => {
    const { negocioId, handoffId } = await handoffPendente(`Aceite recusado ${n}`);
    const antes = await estado(handoffId, negocioId);
    const { error } = await u[n].cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
    expect(error?.message).toContain("Você não pode aceitar essa oportunidade.");
    expect(error?.hint).toBe("mensagem_usuario");
    expect(await estado(handoffId, negocioId)).toEqual(antes);
    expect(antes.handoff.status).toBe("pendente");
  });

  it.each(AUTORIZADOS)("%s aceita: responsável, origem, histórico e crédito do SDR preservados", async (n) => {
    const { negocioId, handoffId } = await handoffPendente(`Aceite por ${n}`);
    const { data, error } = await u[n].cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "aceito", respondido_por: membro[n], perfil_sdr_credito: "sdr" });

    const { negocio } = await estado(handoffId, negocioId);
    expect(negocio).toEqual({ responsavel_id: membro.closer, handoff_origem_id: handoffId });

    const delegacao = n !== "closer";
    const { data: evento } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, profile_at_event, payload")
      .eq("entidade_id", negocioId)
      .eq("tipo", "oportunidade_aceita")
      .single();
    expect(evento).toMatchObject({ ator_id: u[n].id, beneficiario_id: u.sdr.id, profile_at_event: "sdr" });
    expect((evento!.payload as { por_delegacao: boolean }).por_delegacao).toBe(delegacao);

    const { data: atividade } = await servico
      .from("atividades")
      .select("ator_id, dados")
      .eq("negocio_id", negocioId)
      .eq("tipo", "handoff_aceito")
      .single();
    expect(atividade!.ator_id).toBe(u[n].id);
    expect((atividade!.dados as { por_delegacao: boolean }).por_delegacao).toBe(delegacao);
  });
});

describe("devolução", () => {
  it.each(RECUSADOS)("%s não devolve: recusa sem alterar nada", async (n) => {
    const { negocioId, handoffId } = await handoffPendente(`Devolução recusada ${n}`);
    const antes = await estado(handoffId, negocioId);
    const { error } = await u[n].cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "Fora da área" });
    expect(error?.message).toContain("Você não pode devolver essa oportunidade.");
    expect(await estado(handoffId, negocioId)).toEqual(antes);
  });

  it.each(AUTORIZADOS)("%s devolve: negócio fica com o SDR, motivo, evento e notificação ao SDR", async (n) => {
    const { negocioId, handoffId } = await handoffPendente(`Devolução por ${n}`);
    const motivo = `Motivo ${n} ${sufixo}`;
    const { data, error } = await u[n].cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: motivo });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "devolvido", respondido_por: membro[n], motivo_devolucao: motivo });

    const { negocio } = await estado(handoffId, negocioId);
    expect(negocio).toEqual({ responsavel_id: membro.sdr, handoff_origem_id: null });

    const { data: evento } = await servico
      .from("eventos")
      .select("ator_id, payload")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.devolvido")
      .single();
    expect(evento!.ator_id).toBe(u[n].id);
    expect((evento!.payload as { por_delegacao: boolean }).por_delegacao).toBe(n !== "closer");

    const { data: notificacoes } = await servico
      .from("notificacoes")
      .select("mensagem")
      .eq("membro_id", membro.sdr)
      .eq("tipo", "handoff_devolvido")
      .like("mensagem", `%${motivo}`);
    expect(notificacoes).toHaveLength(1);
  });

  it("motivo continua obrigatório e a segunda resposta continua recusada", async () => {
    const { handoffId } = await handoffPendente("Motivo e dupla resposta");
    const semMotivo = await u.gestorDest.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "  " });
    expect(semMotivo.error?.message).toContain("Informe o motivo");
    expect((await u.gestorDest.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId })).error).toBeNull();
    const segunda = await u.admin.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "tarde demais" });
    expect(segunda.error?.message).toContain("já foi respondida");
  });
});

describe("visibilidade (sem ampliação nesta PR)", () => {
  it("gestor só do destinatário responde pela RPC, mas ainda não vê o negócio nem o handoff pela RLS", async () => {
    const { negocioId, handoffId } = await handoffPendente("Visibilidade do gestor do destinatário");
    const { data: negocio } = await u.gestorDest.cliente.from("negocios").select("id").eq("id", negocioId);
    const { data: handoff } = await u.gestorDest.cliente.from("handoffs").select("id").eq("id", handoffId);
    expect(negocio).toEqual([]);
    expect(handoff).toEqual([]);
    // O gestor do SDR vê o negócio (cartão "Aguardando aceite"), mas não pode responder.
    const { data: vistoPeloGestorSdr } = await u.gestorSdr.cliente.from("negocios").select("id").eq("id", negocioId);
    expect(vistoPeloGestorSdr).toHaveLength(1);
  });
});

describe("oportunidades_pendentes_equipe (lista restrita do Painel)", () => {
  const COLUNAS = [
    "handoff_id",
    "negocio_id",
    "negocio_numero",
    "negocio_titulo",
    "contato_nome",
    "contato_cidade",
    "contato_uf",
    "telefone_informado",
    "sdr_nome",
    "destinatario_nome",
    "enviado_em",
    "status_qualificacao",
    "tipo_cliente",
    "possui_conta_energia",
    "distribuidora",
    "imovel_proprio",
    "objetivo",
    "prazo_instalacao",
    "busca_financiamento",
    "orcamento_outra_empresa",
    "e_decisor",
    "outro_decisor",
  ].sort();

  const listar = async (n: Nome, empresaId = empresa) => {
    const { data, error } = await u[n].cliente.rpc("oportunidades_pendentes_equipe", { p_empresa_id: empresaId });
    expect(error, n).toBeNull();
    return data ?? [];
  };

  it("gestor da equipe do destinatário e admin veem; demais papéis, equipes e empresas não", async () => {
    const { handoffId } = await handoffPendente("Lista por papel");
    const veem: Nome[] = ["admin", "gestorDest", "gestorDuasEmpresas"];
    for (const n of NOMES) {
      const ids = (await listar(n)).map((o) => o.handoff_id);
      expect(ids.includes(handoffId), n).toBe(veem.includes(n));
    }
  });

  it("usuário em duas empresas: cada empresa só devolve as próprias pendências", async () => {
    const a = await handoffPendente("Lista empresa A");
    const b = await handoffPendente("Lista empresa B", { outraEmpresa: true });
    const naA = (await listar("gestorDuasEmpresas", empresa)).map((o) => o.handoff_id);
    const naB = (await listar("gestorDuasEmpresas", outra)).map((o) => o.handoff_id);
    expect(naA).toContain(a.handoffId);
    expect(naA).not.toContain(b.handoffId);
    expect(naB).toContain(b.handoffId); // admin na empresa B
    expect(naB).not.toContain(a.handoffId);
    // Admin de B pedindo a empresa A não recebe nada.
    expect(await listar("adminOutra", empresa)).toEqual([]);
  });

  it("devolve só as colunas autorizadas, sem dados pessoais, financeiros nem textos livres", async () => {
    const { data: c } = await servico
      .from("contatos")
      .insert({
        empresa_id: empresa,
        nome: "Maria Cliente Teste",
        telefone: "(45) 98888-7777",
        email: "maria.secreta@exemplo.com",
        documento: "123.456.789-09",
        endereco: "Rua Escondida, 99",
        cidade: "Cascavel",
        uf: "PR",
      })
      .select("id")
      .single();
    const { handoffId } = await handoffPendente("Lista com dados", {
      contatoId: c!.id,
      snapshot: {
        tipo_cliente: "residencial",
        possui_conta_energia: true,
        distribuidora: "Copel",
        imovel_proprio: false,
        objetivo: "Reduzir a conta",
        prazo_instalacao: null,
        busca_financiamento: true,
        orcamento_outra_empresa: false,
        e_decisor: true,
        outro_decisor: false,
        participantes_decisao: "Fulano Terceiro Secreto",
      },
      observacoes: "Observação livre secreta",
    });
    const item = (await listar("gestorDest")).find((o) => o.handoff_id === handoffId)!;
    expect(Object.keys(item).sort()).toEqual(COLUNAS);
    expect(item).toMatchObject({
      contato_nome: "Maria Cliente Teste",
      contato_cidade: "Cascavel",
      contato_uf: "PR",
      telefone_informado: true,
      tipo_cliente: "residencial",
      possui_conta_energia: true,
      distribuidora: "Copel",
      imovel_proprio: false,
      objetivo: "Reduzir a conta",
      prazo_instalacao: null,
      busca_financiamento: true,
      orcamento_outra_empresa: false,
      e_decisor: true,
      outro_decisor: false,
    });
    const texto = JSON.stringify(item);
    for (const proibido of ["98888", "maria.secreta", "123.456.789", "Rua Escondida", "98765", "Fulano Terceiro", "Observação livre"]) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it("depois do aceite ou da devolução a oportunidade deixa de ser listada; a consulta não altera nada", async () => {
    const aceitar = await handoffPendente("Lista some no aceite");
    const devolver = await handoffPendente("Lista some na devolução");
    const antes = (await listar("gestorDest")).map((o) => o.handoff_id);
    expect(antes).toEqual(expect.arrayContaining([aceitar.handoffId, devolver.handoffId]));
    expect((await estado(aceitar.handoffId, aceitar.negocioId)).handoff.status).toBe("pendente");

    expect((await u.gestorDest.cliente.rpc("aceitar_handoff", { p_handoff_id: aceitar.handoffId })).error).toBeNull();
    expect((await u.gestorDest.cliente.rpc("devolver_handoff", { p_handoff_id: devolver.handoffId, p_motivo: "Sem perfil" })).error).toBeNull();
    const depois = (await listar("gestorDest")).map((o) => o.handoff_id);
    expect(depois).not.toContain(aceitar.handoffId);
    expect(depois).not.toContain(devolver.handoffId);
    // No aceite, o vendedor da equipe vira o responsável: o gestor passa a ver o negócio pela RLS normal.
    expect((await u.gestorDest.cliente.from("negocios").select("id").eq("id", aceitar.negocioId)).data).toHaveLength(1);
    // Na devolução, o negócio fica com o SDR: o gestor do destinatário continua sem vê-lo.
    expect((await u.gestorDest.cliente.from("negocios").select("id").eq("id", devolver.negocioId)).data).toEqual([]);
  });

  it("anônimo não executa a função", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc("oportunidades_pendentes_equipe", { p_empresa_id: empresa });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("retorno das RPCs de aceite e devolução sem dados confidenciais", () => {
  const SNAPSHOT = {
    tipo_cliente: "residencial",
    objetivo: "Objetivo confidencial do cliente",
    e_decisor: false,
    outro_decisor: true,
    participantes_decisao: "Terceiro Confidencial da Silva",
  };
  const OBSERVACAO = "Observação confidencial do SDR";
  const PROIBIDOS = ["Objetivo confidencial", "Terceiro Confidencial", "Observação confidencial"];

  for (const acao of ["aceitar", "devolver"] as const) {
    it.each(["gestorDest", "closer", "admin"] as Nome[])(`${acao} por %s: retorno sem snapshot nem observações; registro gravado intacto`, async (n) => {
      const { negocioId, handoffId } = await handoffPendente(`Retorno ${acao} ${n}`, { snapshot: SNAPSHOT, observacoes: OBSERVACAO });
      if (n === "gestorDest") {
        // Gestor só do destinatário: sem acesso normal ao negócio nem ao handoff.
        expect((await u.gestorDest.cliente.from("negocios").select("id").eq("id", negocioId)).data).toEqual([]);
        expect((await u.gestorDest.cliente.from("handoffs").select("id").eq("id", handoffId)).data).toEqual([]);
      }
      const { data, error } =
        acao === "aceitar"
          ? await u[n].cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId })
          : await u[n].cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "Fora do perfil" });
      expect(error).toBeNull();
      // Campos que os consumidores usam continuam no retorno.
      expect(data).toMatchObject({ id: handoffId, status: acao === "aceitar" ? "aceito" : "devolvido", respondido_por: membro[n] });
      if (acao === "devolver") expect(data!.motivo_devolucao).toBe("Fora do perfil");
      expect(data!.qualificacao_snapshot).toEqual({});
      expect(data!.observacoes).toBeNull();
      const texto = JSON.stringify(data);
      for (const proibido of PROIBIDOS) expect(texto, proibido).not.toContain(proibido);

      // A sanitização é só do retorno: o registro gravado não muda.
      const { data: gravado } = await servico.from("handoffs").select("qualificacao_snapshot, observacoes").eq("id", handoffId).single();
      expect(gravado).toEqual({ qualificacao_snapshot: SNAPSHOT, observacoes: OBSERVACAO });
    });
  }
});
