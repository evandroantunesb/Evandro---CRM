/**
 * Fechamento do handoff SDR → Closer (critérios de aceite do Evandro, 2026-10-01):
 * closer destinatário e admin/gestor autorizado podem aceitar/devolver; quando
 * admin/gestor agem, o ator é quem clicou mas o crédito de pontos continua no SDR
 * de origem; responsavel_id só muda no aceite; devolução mantém o negócio com o
 * SDR; motivo obrigatório; notificações corretas; dupla resposta concorrente e
 * handoff pendente duplicado são recusados.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let sdr: Usuario;
let closer: Usuario;
let outroVendedor: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [admin, gestor, sdr, closer, outroVendedor] = await Promise.all(
    ["hf-admin", "hf-gestor", "hf-sdr", "hf-closer", "hf-outro"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Handoff fechamento ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: outroVendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapaInicial = et!.id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente handoff" }).select("id").single();
  contato = c!.id;
});

/** Cria um negócio novo (responsável = SDR) e um handoff pendente SDR → closer. */
async function criarNegocioComHandoffPendente(titulo: string) {
  const { data: negocio, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membro[sdr.id] })
    .select("id")
    .single();
  if (error) throw error;
  const { data: handoff, error: erroHandoff } = await servico
    .from("handoffs")
    .insert({
      empresa_id: empresa,
      negocio_id: negocio!.id,
      contato_id: contato,
      de_membro_id: membro[sdr.id],
      para_membro_id: membro[closer.id],
      status_qualificacao: "qualificado",
    })
    .select("id")
    .single();
  if (erroHandoff) throw erroHandoff;
  return { negocioId: negocio!.id, handoffId: handoff!.id };
}

describe("envio: notificação ao closer", () => {
  it("registra notificação 'aguardando seu aceite' pro closer destinatário", async () => {
    const { handoffId } = await criarNegocioComHandoffPendente("Envio com notificação");
    const { data } = await servico
      .from("notificacoes")
      .select("tipo, mensagem")
      .eq("empresa_id", empresa)
      .eq("membro_id", membro[closer.id])
      .eq("tipo", "handoff_recebido");
    expect(data!.some((n) => n.mensagem.includes("aguardando seu aceite"))).toBe(true);
    void handoffId;
  });
});

describe("aceite pelo closer destinatário", () => {
  it("closer aceita: responsavel_id muda, evento oportunidade_aceita credita o SDR com o perfil congelado", async () => {
    const { negocioId, handoffId } = await criarNegocioComHandoffPendente("Aceite pelo closer");
    const { data, error } = await closer.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
    expect(error).toBeNull();
    expect(data!.status).toBe("aceito");
    expect(data!.respondido_por).toBe(membro[closer.id]);
    expect(data!.perfil_sdr_credito).toBe("sdr");

    const { data: negocio } = await servico.from("negocios").select("responsavel_id").eq("id", negocioId).single();
    expect(negocio!.responsavel_id).toBe(membro[closer.id]);

    const { data: evento } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, profile_at_event, payload")
      .eq("entidade_id", negocioId)
      .eq("tipo", "oportunidade_aceita")
      .single();
    expect(evento!.ator_id).toBe(closer.id);
    expect(evento!.beneficiario_id).toBe(sdr.id);
    expect(evento!.profile_at_event).toBe("sdr");
    expect((evento!.payload as { por_delegacao: boolean }).por_delegacao).toBe(false);

    const { data: ativ } = await servico.from("atividades").select("tipo, ator_id").eq("negocio_id", negocioId).eq("tipo", "handoff_aceito");
    expect(ativ).toHaveLength(1);
    expect(ativ![0].ator_id).toBe(closer.id);
  });

  it("closer devolve: negócio continua com o SDR, motivo obrigatório, SDR é notificado", async () => {
    const { negocioId, handoffId } = await criarNegocioComHandoffPendente("Devolução pelo closer");

    const semMotivo = await closer.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "" });
    expect(semMotivo.error?.message).toContain("motivo");
    expect(semMotivo.error?.hint).toBe("mensagem_usuario");

    const { data, error } = await closer.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "Lead não qualificado" });
    expect(error).toBeNull();
    expect(data!.status).toBe("devolvido");
    expect(data!.motivo_devolucao).toBe("Lead não qualificado");

    const { data: negocio } = await servico.from("negocios").select("responsavel_id").eq("id", negocioId).single();
    expect(negocio!.responsavel_id).toBe(membro[sdr.id]);

    const { data: notif } = await servico
      .from("notificacoes")
      .select("mensagem")
      .eq("empresa_id", empresa)
      .eq("membro_id", membro[sdr.id])
      .eq("tipo", "handoff_devolvido");
    expect(notif!.some((n) => n.mensagem.includes("Lead não qualificado"))).toBe(true);
  });
});

describe("aceite/devolução por admin e gestor (delegação)", () => {
  it("admin aceita em nome do closer: ator é o admin, crédito continua com o SDR, responsável vira o closer original", async () => {
    const { negocioId, handoffId } = await criarNegocioComHandoffPendente("Aceite por admin");
    const { data, error } = await admin.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
    expect(error).toBeNull();
    expect(data!.respondido_por).toBe(membro[admin.id]);

    const { data: negocio } = await servico.from("negocios").select("responsavel_id").eq("id", negocioId).single();
    expect(negocio!.responsavel_id).toBe(membro[closer.id]);

    const { data: evento } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, payload")
      .eq("entidade_id", negocioId)
      .eq("tipo", "oportunidade_aceita")
      .single();
    expect(evento!.ator_id).toBe(admin.id);
    expect(evento!.beneficiario_id).toBe(sdr.id);
    expect((evento!.payload as { por_delegacao: boolean }).por_delegacao).toBe(true);
  });

  it("gestor devolve em nome do closer: negócio volta pro SDR e por_delegacao fica marcado", async () => {
    const { negocioId, handoffId } = await criarNegocioComHandoffPendente("Devolução por gestor");
    const { error } = await gestor.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "Fora da área de atendimento" });
    expect(error).toBeNull();

    const { data: negocio } = await servico.from("negocios").select("responsavel_id").eq("id", negocioId).single();
    expect(negocio!.responsavel_id).toBe(membro[sdr.id]);

    const { data: evento } = await servico
      .from("eventos")
      .select("payload")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.devolvido")
      .single();
    expect((evento!.payload as { por_delegacao: boolean }).por_delegacao).toBe(true);
  });
});

describe("usuário não autorizado", () => {
  it("vendedor que não é o destinatário nem admin/gestor não aceita nem devolve", async () => {
    const { handoffId } = await criarNegocioComHandoffPendente("Não autorizado");
    const aceite = await outroVendedor.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
    expect(aceite.error).not.toBeNull();
    expect(aceite.error?.hint).toBe("mensagem_usuario");

    const devolucao = await outroVendedor.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "x" });
    expect(devolucao.error).not.toBeNull();

    const { data } = await servico.from("handoffs").select("status").eq("id", handoffId).single();
    expect(data!.status).toBe("pendente");
  });
});

describe("dupla resposta concorrente", () => {
  it("a segunda tentativa (aceite ou devolução) vê 'já foi respondida'", async () => {
    const { handoffId } = await criarNegocioComHandoffPendente("Dupla resposta");
    const [primeira, segunda] = await Promise.all([
      closer.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId }),
      admin.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "tentativa concorrente" }),
    ]);
    const resultados = [primeira, segunda];
    const sucesso = resultados.filter((r) => !r.error);
    const falha = resultados.filter((r) => r.error);
    expect(sucesso).toHaveLength(1);
    expect(falha).toHaveLength(1);
    expect(falha[0].error?.message).toContain("já foi respondida");
  });
});

describe("handoff pendente único por negócio", () => {
  it("não permite um segundo handoff pendente pro mesmo negócio", async () => {
    const { negocioId } = await criarNegocioComHandoffPendente("Pendente único");
    const { error } = await servico.from("handoffs").insert({
      empresa_id: empresa,
      negocio_id: negocioId,
      contato_id: contato,
      de_membro_id: membro[sdr.id],
      para_membro_id: membro[closer.id],
      status_qualificacao: "qualificado",
    });
    expect(error).not.toBeNull();
  });
});
