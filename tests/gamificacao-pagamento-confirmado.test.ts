/**
 * Pagamento confirmado (Evandro, 2026-10-01): marco operacional auditável — "Aguardando
 * pagamento" → "Pagamento confirmado" — sem módulo financeiro completo. Só gestor/admin
 * confirma, nunca o closer que assinou o contrato (beneficiário congelado na assinatura,
 * via `contratos.responsavel_assinatura_id` — nunca `negocios.responsavel_id` atual, que
 * pode mudar por redistribuição). Desenho revisado em Opus antes de codar
 * (20261001250000_gamificacao_pagamento_confirmado.sql).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let closer: Usuario;
let closer2: Usuario;
let gestor: Usuario;
let gestorResponsavel: Usuario;
let admin: Usuario;
let vendedorOutraEmpresa: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [closer, closer2, gestor, gestorResponsavel, admin, vendedorOutraEmpresa] = await Promise.all(
    ["pg-closer", "pg-closer2", "pg-gestor", "pg-gestor-resp", "pg-admin", "pg-outra-empresa"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Pagamento confirmado ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: closer2.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: gestorResponsavel.id, papel: "gestor" },
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: emp2 } = await servico.from("empresas").insert({ nome: `Outra empresa ${sufixo}` }).select("id").single();
  await servico.from("empresa_membros").insert({ empresa_id: emp2!.id, user_id: vendedorOutraEmpresa.id, papel: "gestor" });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapaInicial = et!.id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente pagamento" }).select("id").single();
  contato = c!.id;

  // `gestor` só enxerga negócio de responsável fora da própria empresa/equipe via `pode_ver_responsavel`
  // (admin vê tudo; gestor só vê quem está na equipe dele). Sem isso, `confirmar_pagamento` falha com
  // "Você não tem acesso a este negócio." antes mesmo de chegar nas regras de pagamento.
  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe pagamento" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer.id], e_gestor: false },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer2.id], e_gestor: false },
  ]);
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

async function criarEAssinarContrato(negocioId: string, cliente: Usuario["cliente"]) {
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

describe("confirmar_pagamento", () => {
  it("contrato não assinado: erro", async () => {
    const negocioId = await criarNegocio("Sem contrato", membro[closer.id]);
    const { data: contrato } = await closer.cliente
      .from("contratos")
      .insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Rascunho" })
      .select("id")
      .single();

    const { error } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
    expect(error?.message).toContain("assinado");
  });

  it("closer (vendedor) não pode confirmar: erro de permissão", async () => {
    const negocioId = await criarNegocio("Closer tenta confirmar", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);

    const { error } = await closer.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("gestor ou admin");
  });

  it("gestor responsável pelo próprio negócio não pode autoconfirmar", async () => {
    const negocioId = await criarNegocio("Gestor é o responsável", membro[gestorResponsavel.id]);
    const contratoId = await criarEAssinarContrato(negocioId, gestorResponsavel.cliente);

    const { error } = await gestorResponsavel.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("assinou como responsável");
  });

  it("admin responsável pelo próprio negócio não pode autoconfirmar", async () => {
    const negocioId = await criarNegocio("Admin é o responsável", membro[admin.id]);
    const contratoId = await criarEAssinarContrato(negocioId, admin.cliente);

    const { error } = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).not.toBeNull();
  });

  it("gestor confirma: evento ator=gestor beneficiário=closer, só o closer pontua", async () => {
    const negocioId = await criarNegocio("Fluxo feliz", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);

    // `gamification_rules` revoga insert até de service_role (só admin autenticado cria, via RLS) —
    // tem que ser `admin.cliente`, não `servico`.
    const { data: regra } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "Pagamento confirmado", evento_tipo: "pagamento.confirmado", pontos: 25 })
      .select("id")
      .single();

    const { data: conf, error } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).toBeNull();
    expect(conf).not.toBeNull();

    const { data: ev } = await servico
      .from("eventos")
      .select("ator_id, beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "pagamento.confirmado")
      .single();
    expect(ev!.ator_id).toBe(gestor.id);
    expect(ev!.beneficiario_id).toBe(closer.id);

    const { data: ledger } = await servico.from("point_ledger").select("membro_id, pontos").eq("regra_id", regra!.id);
    expect(ledger).toHaveLength(1);
    expect(ledger![0].membro_id).toBe(membro[closer.id]);
  });

  it("confirmação duplicada: erro, sem segundo evento nem segundo lançamento", async () => {
    const negocioId = await criarNegocio("Duplicada", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });

    const { error } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("já está confirmado");

    const { data: eventos } = await servico.from("eventos").select("id").eq("entidade_id", negocioId).eq("tipo", "pagamento.confirmado");
    expect(eventos).toHaveLength(1);
  });

  it("beneficiário é o closer congelado na assinatura, não o responsável atual após reatribuição", async () => {
    const negocioId = await criarNegocio("Reatribuído depois da assinatura", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);

    // Redistribuição: o negócio passa pro closer2 depois da assinatura (férias, etc.).
    await servico.from("negocios").update({ responsavel_id: membro[closer2.id] }).eq("id", negocioId);

    const { data: contrato } = await servico.from("contratos").select("responsavel_assinatura_id").eq("id", contratoId).single();
    expect(contrato!.responsavel_assinatura_id).toBe(membro[closer.id]);

    await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    const { data: ev } = await servico
      .from("eventos")
      .select("beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "pagamento.confirmado")
      .single();
    // Crédito vai pro closer original (quem assinou), não pro closer2 (responsável atual).
    expect(ev!.beneficiario_id).toBe(closer.id);
  });

  it("gestor de outra empresa não pode confirmar (sem pode_ver_negocio)", async () => {
    const negocioId = await criarNegocio("Fora do alcance", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);

    const { error } = await vendedorOutraEmpresa.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).not.toBeNull();
  });

  it("contrato com pagamento ativo não pode sair de 'assinado'", async () => {
    const negocioId = await criarNegocio("Travado pelo pagamento", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });

    const { error } = await closer.cliente.from("contratos").update({ status: "rascunho" }).eq("id", contratoId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("estorne a confirmação");
  });

  it("negócio com pagamento confirmado não pode ser apagado", async () => {
    const negocioId = await criarNegocio("Protegido contra exclusão", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });

    const { error } = await admin.cliente.from("negocios").delete().eq("id", negocioId);
    expect(error).not.toBeNull();
  });
});

describe("estornar_confirmacao_pagamento", () => {
  it("sem motivo: erro", async () => {
    const negocioId = await criarNegocio("Estorno sem motivo", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });

    const { error } = await gestor.cliente.rpc("estornar_confirmacao_pagamento", { p_contrato_id: contratoId, p_motivo: "" });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("motivo");
  });

  it("estorna com motivo: ledger marcado, atividade registrada, linha preservada com estornado_*", async () => {
    const negocioId = await criarNegocio("Estorno completo", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    // Outras regras com o mesmo evento_tipo (de testes anteriores no mesmo `empresa`) continuam ativas
    // e também pontuam — filtra pelo regra_id desta regra pra não pegar o ledger de outra regra.
    const { data: regraEstorno } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "Pagamento 2", evento_tipo: "pagamento.confirmado", pontos: 25 })
      .select("id")
      .single();
    const { data: conf } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });

    const { data: estorno, error } = await gestor.cliente.rpc("estornar_confirmacao_pagamento", {
      p_contrato_id: contratoId,
      p_motivo: "Pagamento não caiu na conta",
    });
    expect(error).toBeNull();
    expect(estorno!.id).toBe(conf!.id);
    expect(estorno!.motivo_estorno).toBe("Pagamento não caiu na conta");
    expect(estorno!.estornado_por_user_id).toBe(gestor.id);

    const { data: ledger } = await servico
      .from("point_ledger")
      .select("estornado, estornado_por")
      .eq("evento_id", conf!.evento_confirmacao_id)
      .eq("regra_id", regraEstorno!.id)
      .single();
    expect(ledger!.estornado).toBe(true);
    expect(ledger!.estornado_por).toBe(membro[gestor.id]);

    const { data: eventoEstorno } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "pagamento.confirmacao_estornada");
    expect(eventoEstorno).toHaveLength(1);
  });

  it("depois do estorno, o contrato pode sair de 'assinado'", async () => {
    const negocioId = await criarNegocio("Libera depois do estorno", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    await gestor.cliente.rpc("estornar_confirmacao_pagamento", { p_contrato_id: contratoId, p_motivo: "engano" });

    const { error } = await closer.cliente.from("contratos").update({ status: "rascunho" }).eq("id", contratoId);
    expect(error).toBeNull();
  });

  it("ciclo confirmar → estornar → confirmar de novo: 2 linhas, sem pontos duplicados, mesmo beneficiário", async () => {
    const negocioId = await criarNegocio("Ciclo completo", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    const { data: regra } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "Pagamento ciclo", evento_tipo: "pagamento.confirmado", pontos: 25 })
      .select("id")
      .single();

    await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    await gestor.cliente.rpc("estornar_confirmacao_pagamento", { p_contrato_id: contratoId, p_motivo: "engano 1" });
    const { data: conf2, error } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });
    expect(error).toBeNull();
    expect(conf2!.beneficiario_user_id).toBe(closer.id);

    const { data: linhas } = await servico.from("confirmacoes_pagamento").select("id, estornado_em").eq("contrato_id", contratoId);
    expect(linhas).toHaveLength(2);

    const { data: ledgerAtivo } = await servico.from("point_ledger").select("id").eq("regra_id", regra!.id).eq("estornado", false);
    expect(ledgerAtivo).toHaveLength(1);
  });
});

describe("confirmacoes_pagamento é protegida contra escrita direta", () => {
  it("update direto (authenticated) é bloqueado", async () => {
    const negocioId = await criarNegocio("Sem escrita direta", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);
    const { data: conf } = await gestor.cliente.rpc("confirmar_pagamento", { p_contrato_id: contratoId });

    const { error } = await gestor.cliente.from("confirmacoes_pagamento").update({ motivo_estorno: "forjado" }).eq("id", conf!.id);
    expect(error).not.toBeNull();
  });

  it("insert direto (authenticated) é bloqueado", async () => {
    const negocioId = await criarNegocio("Sem insert direto", membro[closer.id]);
    const contratoId = await criarEAssinarContrato(negocioId, closer.cliente);

    const { error } = await gestor.cliente.from("confirmacoes_pagamento").insert({
      empresa_id: empresa,
      contrato_id: contratoId,
      negocio_id: negocioId,
      confirmado_por_membro_id: membro[gestor.id],
      confirmado_por_user_id: gestor.id,
      beneficiario_membro_id: membro[closer.id],
      beneficiario_user_id: closer.id,
      evento_confirmacao_id: 1,
    });
    expect(error).not.toBeNull();
  });
});
