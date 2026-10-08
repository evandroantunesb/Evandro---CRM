/**
 * PR S — quem aceita ou devolve um handoff pendente (migration 20261009110000), com Supabase
 * local (roda no CI) e o cliente autenticado de cada usuário (RLS real, RPC direta):
 * destinatário, admin ativo da empresa e gestor ativo de uma equipe ativa do destinatário.
 * Gestor só do SDR remetente, de equipe inativa, inativo, vendedor marcado como gestor de
 * equipe e usuários de outra empresa são recusados. O resto do aceite/devolução (histórico,
 * notificação, eventos, perfil congelado, handoff_origem_id, responsável) não muda.
 */
import { beforeAll, describe, expect, it } from "vitest";
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
] as const;
type Nome = (typeof NOMES)[number];

const u = {} as Record<Nome, Usuario>;
const membro = {} as Record<Nome, string>;
let empresa: string;
let outra: string;
let funil: string;
let etapaInicial: string;
let contato: string;

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

  await equipe(empresa, "Equipe do closer", true, "gestorDest", ["closer"]);
  await equipe(empresa, "Equipe do SDR", true, "gestorSdr", ["sdr"]);
  await equipe(empresa, "Equipe antiga do closer", false, "gestorEquipeInativa", ["closer"]);
  await equipe(empresa, "Equipe do gestor inativo", true, "gestorInativo", ["closer"]);
  await equipe(empresa, "Equipe com vendedor marcado", true, "vendedorMarcadoGestor", ["closer"]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapaInicial = et!.id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente resposta handoff" }).select("id").single();
  contato = c!.id;
});

/** Negócio do SDR com handoff pendente SDR → closer (aberto pelo próprio SDR, via RLS). */
async function handoffPendente(titulo: string) {
  const { data: negocio, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membro.sdr })
    .select("id")
    .single();
  if (error) throw error;
  const { data: handoff, error: erroHandoff } = await u.sdr.cliente
    .from("handoffs")
    .insert({
      empresa_id: empresa,
      negocio_id: negocio!.id,
      contato_id: contato,
      de_membro_id: membro.sdr,
      para_membro_id: membro.closer,
      status_qualificacao: "qualificado",
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

const AUTORIZADOS: Nome[] = ["closer", "admin", "gestorDest"];
const RECUSADOS: Nome[] = ["gestorSdr", "gestorEquipeInativa", "gestorInativo", "vendedorMarcadoGestor", "sdr", "outroVendedor", "adminOutra", "gestorOutra"];

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
