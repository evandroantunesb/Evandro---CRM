/**
 * Corretiva pedida pelo Evandro em 2026-10-01: `handoff.won` (dispara quando o negócio
 * vira 'ganho', mudança de etapa) escolhia o SDR via "order by created_at desc limit 1"
 * sobre todos os handoffs do negócio — podendo pegar um handoff mais recente que nem
 * chegou a ser aceito, ou cujo `de_membro_id` nem é um SDR (ver 1º teste). Corrigido pra
 * usar `negocios.handoff_origem_id` (write-once, gravado só no aceite — mesma referência
 * causal da #110), igual já faz `handoff.contrato_assinado`.
 *
 * Também cobre a auditoria pedida: `handoff.won` (etapa ganha) e `handoff.contrato_assinado`
 * (contrato assinado) são fatos comerciais diferentes no banco (sem vínculo entre os dois),
 * o mesmo desenho já aprovado pro par do closer (`deal.won` x `contrato.assinado` na Fase
 * B) — por isso continuam como eventos separados, cada um correto na própria origem causal,
 * sem se duplicar nem se confundir.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let sdr1: Usuario;
let closer: Usuario;
let closer2: Usuario;
let sdr2: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [sdr1, closer, closer2, sdr2] = await Promise.all(["hwc-sdr1", "hwc-closer", "hwc-closer2", "hwc-sdr2"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Handoff won causal ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: sdr1.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: closer2.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: sdr2.id, papel: "sdr", perfil_gamificacao: "sdr" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapaInicial = et!.id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente handoff won causal" }).select("id").single();
  contato = c!.id;
});

async function criarNegocio(titulo: string, responsavelId: string) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: responsavelId })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function enviarEAceitar(negocioId: string, deUsuario: Usuario, paraUsuario: Usuario) {
  const { data: handoff, error } = await deUsuario.cliente
    .from("handoffs")
    .insert({
      empresa_id: empresa,
      negocio_id: negocioId,
      contato_id: contato,
      de_membro_id: membro[deUsuario.id],
      para_membro_id: membro[paraUsuario.id],
      status_qualificacao: "qualificado",
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data, error: erroAceite } = await paraUsuario.cliente.rpc("aceitar_handoff", { p_handoff_id: handoff!.id });
  if (erroAceite) throw erroAceite;
  return data!;
}

async function marcarGanho(negocioId: string, cliente: Usuario["cliente"]) {
  const { error } = await cliente.from("negocios").update({ status: "ganho", valor: 15000 }).eq("id", negocioId);
  if (error) throw error;
}

async function assinarContrato(negocioId: string, cliente: Usuario["cliente"]) {
  const { data: contrato, error } = await cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroAssinar } = await cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (erroAssinar) throw erroAssinar;
}

describe("handoff.won usa a origem causal (handoff_origem_id), não o mais recente", () => {
  it("negócio ganho credita o SDR causal, mesmo com um handoff mais recente de outro remetente", async () => {
    const negocioId = await criarNegocio("Negócio múltiplos handoffs", membro[sdr1.id]);
    const primeiroHandoff = await enviarEAceitar(negocioId, sdr1, closer);

    // Handoff mais recente de outro remetente (B1a: só o SDR responsável envia): o negócio
    // volta para o sdr2, que o envia ao closer2. A busca antiga ("order by created_at desc")
    // pegaria esse handoff e creditaria o sdr2 em vez do SDR de origem.
    const { error: erroResp } = await servico.from("negocios").update({ responsavel_id: membro[sdr2.id] }).eq("id", negocioId);
    if (erroResp) throw erroResp;
    await enviarEAceitar(negocioId, sdr2, closer2);

    const { data: negocio } = await servico.from("negocios").select("handoff_origem_id").eq("id", negocioId).single();
    expect(negocio!.handoff_origem_id).toBe(primeiroHandoff.id);

    await marcarGanho(negocioId, closer2.cliente);

    const { data: ev } = await servico
      .from("eventos")
      .select("beneficiario_id, profile_at_event")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.won")
      .single();
    expect(ev!.beneficiario_id).toBe(sdr1.id);
    expect(ev!.profile_at_event).toBe("sdr");
  });

  it("reabrir e ganhar de novo é reocorrência legítima: emite um novo evento (dedup de pontos fica a cargo do motor)", async () => {
    // Corretiva 2026-10-02: reabrir um negócio ganho estorna o lançamento (ver
    // estornar_lancamentos_evento em registrar_negocio), então ganhar de novo depois é uma
    // nova ocorrência comercial válida, não farm. A guarda "evento já existe" que impedia
    // esse segundo evento foi removida daqui — quem evita pontuação duplicada ENQUANTO o
    // crédito segue ativo é unica_por_negocio no motor (coberto com lançamentos reais em
    // tests/gamificacao-fix-reocorrencia.test.ts), não a emissão do evento em si.
    const negocioId = await criarNegocio("Negócio reversão ganho", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);
    await marcarGanho(negocioId, closer.cliente);

    const { error: erroReabrir } = await closer.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
    expect(erroReabrir).toBeNull();
    await marcarGanho(negocioId, closer.cliente);

    const { data: eventos } = await servico.from("eventos").select("id").eq("entidade_id", negocioId).eq("tipo", "handoff.won");
    expect(eventos).toHaveLength(2);
  });

  it("negócio sem handoff nunca emite handoff.won", async () => {
    const negocioId = await criarNegocio("Negócio direto, sem handoff", membro[closer.id]);
    await marcarGanho(negocioId, closer.cliente);

    const { data: eventos } = await servico.from("eventos").select("id").eq("entidade_id", negocioId).eq("tipo", "handoff.won");
    expect(eventos).toHaveLength(0);
  });
});

describe("handoff.won e handoff.contrato_assinado coexistem sem duplicar nem se confundir", () => {
  it("etapa ganha e contrato assinado no mesmo negócio geram um evento de cada tipo, ambos corretos", async () => {
    const negocioId = await criarNegocio("Negócio etapa+contrato", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);

    await marcarGanho(negocioId, closer.cliente);
    await assinarContrato(negocioId, closer.cliente);

    const { data: won } = await servico.from("eventos").select("beneficiario_id").eq("entidade_id", negocioId).eq("tipo", "handoff.won");
    const { data: assinado } = await servico
      .from("eventos")
      .select("beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado");

    expect(won).toHaveLength(1);
    expect(assinado).toHaveLength(1);
    expect(won![0].beneficiario_id).toBe(sdr1.id);
    expect(assinado![0].beneficiario_id).toBe(sdr1.id);

    // Reabrir o negócio estorna só o par deal.won/handoff.won (ver estornar_lancamentos_evento
    // em registrar_negocio) — nunca toca o evento de contrato assinado, que é outra entidade.
    const { error: erroReabrir } = await closer.cliente.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
    expect(erroReabrir).toBeNull();
    const { data: assinadoDepois } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado");
    expect(assinadoDepois).toHaveLength(1);
  });
});
