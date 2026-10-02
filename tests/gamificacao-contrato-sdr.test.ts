/**
 * Bônus "Contrato originado pelo SDR" (Evandro, 2026-10-01): crédito ao SDR de origem via
 * `negocios.handoff_origem_id`, gravado uma única vez no aceite do handoff — nunca por busca
 * arbitrária. Cobre: evento correto (beneficiário = SDR, perfil congelado), pontua uma vez,
 * estorno ao sair de 'assinado', write-once (segundo handoff aceito não rouba a origem), e
 * nenhum evento quando o negócio nunca passou por handoff.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let sdr1: Usuario;
let sdr2: Usuario;
let closer: Usuario;
let closer2: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [sdr1, sdr2, closer, closer2] = await Promise.all(["cs-sdr1", "cs-sdr2", "cs-closer", "cs-closer2"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Contrato SDR ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: sdr1.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: sdr2.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: closer2.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapaInicial = et!.id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente contrato SDR" }).select("id").single();
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

async function assinarContrato(negocioId: string, cliente: Usuario["cliente"]) {
  const { data: contrato, error } = await cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroAssinar } = await cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (erroAssinar) throw erroAssinar;
  return contrato!.id;
}

describe("contrato assinado credita o SDR de origem", () => {
  it("handoff_origem_id é gravado no aceite e o evento credita o SDR com o perfil congelado", async () => {
    const negocioId = await criarNegocio("Negócio com handoff", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);

    const { data: negocio } = await servico.from("negocios").select("handoff_origem_id").eq("id", negocioId).single();
    expect(negocio!.handoff_origem_id).not.toBeNull();

    await assinarContrato(negocioId, closer.cliente);

    const { data: ev } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id, profile_at_event")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado")
      .single();
    expect(ev!.ator_id).toBe(closer.id);
    expect(ev!.beneficiario_id).toBe(sdr1.id);
    expect(ev!.profile_at_event).toBe("sdr");

    const { data: evCloser } = await servico
      .from("eventos")
      .select("ator_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "contrato.assinado")
      .single();
    expect(evCloser!.ator_id).toBe(closer.id);
  });

  it("sair e voltar a 'assinado' é reocorrência legítima: emite um novo evento (dedup de pontos fica a cargo do motor)", async () => {
    // Corretiva 2026-10-02: sair de 'assinado' estorna o lançamento (ver
    // estornar_lancamentos_evento em registrar_contrato), então reassinar depois é uma
    // nova ocorrência comercial válida, não farm. A guarda "evento já existe" que impedia
    // esse segundo evento foi removida daqui — quem evita pontuação duplicada ENQUANTO o
    // crédito segue ativo é unica_por_negocio no motor (coberto com lançamentos reais em
    // tests/gamificacao-fix-reocorrencia.test.ts), não a emissão do evento em si.
    const negocioId = await criarNegocio("Negócio reversão", membro[sdr1.id]);
    await enviarEAceitar(negocioId, sdr1, closer);
    const contratoId = await assinarContrato(negocioId, closer.cliente);

    const { error: erroVoltar } = await closer.cliente.from("contratos").update({ status: "rascunho" }).eq("id", contratoId);
    expect(erroVoltar).toBeNull();
    const { error: erroAssinarDeNovo } = await closer.cliente.from("contratos").update({ status: "assinado" }).eq("id", contratoId);
    expect(erroAssinarDeNovo).toBeNull();

    const { data: eventos } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado");
    expect(eventos).toHaveLength(2);
  });

  it("write-once: um segundo handoff aceito não rouba a origem gravada no primeiro", async () => {
    const negocioId = await criarNegocio("Negócio redirecionado", membro[sdr1.id]);
    const primeiroHandoff = await enviarEAceitar(negocioId, sdr1, closer);

    // closer (responsável atual, único que vê o negócio pra criar outro handoff) reenvia pra
    // outro closer — de_membro_id do 2º handoff é o próprio closer, igual ao fluxo real
    // ("Enviar para vendas" usa negocio.responsavel_id como de_membro_id, não quem clica).
    await enviarEAceitar(negocioId, closer, closer2);

    const { data: negocio } = await servico.from("negocios").select("handoff_origem_id, responsavel_id").eq("id", negocioId).single();
    expect(negocio!.handoff_origem_id).toBe(primeiroHandoff.id);
    expect(negocio!.responsavel_id).toBe(membro[closer2.id]);

    await assinarContrato(negocioId, closer2.cliente);
    const { data: ev } = await servico
      .from("eventos")
      .select("beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado")
      .single();
    // Crédito continua com o sdr1 (origem gravada no 1º aceite), mesmo após o reenvio.
    expect(ev!.beneficiario_id).toBe(sdr1.id);
  });

  it("negócio sem handoff nunca emite o evento de bônus do SDR", async () => {
    const negocioId = await criarNegocio("Negócio direto, sem handoff", membro[closer.id]);
    await assinarContrato(negocioId, closer.cliente);

    const { data: eventos } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "handoff.contrato_assinado");
    expect(eventos).toHaveLength(0);
  });
});
