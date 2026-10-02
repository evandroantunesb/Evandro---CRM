/**
 * Loja de recompensas: fecha 2 gaps da auditoria read-only (Evandro, 2026-10-02) e a
 * semântica de saldo negativo por reversão. Ver
 * `20261002220000_loja_concorrencia_saldo_negativo.sql`:
 * - Saldo negativo é um estado VÁLIDO quando moedas já gastas têm a origem revertida
 *   depois (reabertura de negócio, p.ex.) — nunca bloqueado, nunca corrigido
 *   artificialmente. Ganhos futuros compensam naturalmente.
 * - `solicitar_resgate` trava a linha do colaborador em `empresa_membros` antes de ler
 *   o saldo, serializando 2 resgates concorrentes do mesmo colaborador mesmo quando são
 *   de recompensas diferentes (antes só a recompensa era travada).
 * - `atualizar_status_resgate` só permite solicitado→aprovado, solicitado→cancelado,
 *   aprovado→entregue, aprovado→cancelado — `entregue`/`cancelado` continuam terminais.
 *
 * Cada teste usa um `empresa_membros.id` novo (via `novoMembro()`), como no padrão de
 * Metas/Comissões — a mesma regra `deal.won → 100 moedas` é compartilhada pela empresa
 * inteira, então isolar por membro evita que o saldo de um teste contamine outro.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let empresa: string;
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  admin = await criarUsuario("lsc-admin");
  const { data: emp } = await servico.from("empresas").insert({ nome: `Loja saldo e concorrência ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente loja" }).select("id").single();
  contato = c!.id;

  // Única regra da empresa: deal.won credita sempre 100 moedas (xp=0, isolado de XP).
  // gamification_rules revoga insert até de service_role — só admin autenticado cria, via RLS.
  const { error } = await admin.cliente.from("gamification_rules").insert({
    empresa_id: empresa,
    nome: "Negócio ganho (teste)",
    evento_tipo: "deal.won",
    xp: 0,
    moedas: 100,
    ativa: true,
  });
  if (error) throw error;
});

let contadorMembro = 0;

async function novoMembro() {
  contadorMembro += 1;
  const usuario = await criarUsuario(`lsc-membro-${contadorMembro}`);
  const { data, error } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: usuario.id, papel: "vendedor" }).select("id").single();
  if (error) throw error;
  return { membroId: data!.id as string, cliente: usuario.cliente };
}

async function ganharMoedas(membroId: string) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Negócio loja ${sufixo}-${Math.random()}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membroId, valor: 1000 })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroGanho } = await servico.from("negocios").update({ status: "ganho" }).eq("id", data!.id);
  if (erroGanho) throw erroGanho;
  return data!.id as string;
}

async function reabrirNegocio(negocioId: string) {
  const { error } = await servico.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
  if (error) throw error;
}

async function criarRecompensa(custoMoedas: number, extra: Record<string, unknown> = {}) {
  const { data, error } = await servico
    .from("recompensas")
    .insert({ empresa_id: empresa, nome: `Recompensa ${sufixo}-${Math.random()}`, custo_moedas: custoMoedas, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function saldoDe(membroId: string) {
  const { data, error } = await servico.from("point_ledger").select("moedas").eq("membro_id", membroId).eq("estornado", false);
  if (error) throw error;
  return (data ?? []).reduce((soma, l) => soma + l.moedas, 0);
}

describe("saldo negativo por reversão de crédito já gasto", () => {
  it("origem revertida depois do resgate deixa o saldo negativo, sem bloquear a reversão nem recolher a recompensa", async () => {
    const { membroId, cliente } = await novoMembro();
    const negocioId = await ganharMoedas(membroId);
    expect(await saldoDe(membroId)).toBe(100);

    const recompensaId = await criarRecompensa(100);
    const { error: erroResgate } = await cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaId });
    expect(erroResgate).toBeNull();
    expect(await saldoDe(membroId)).toBe(0);

    // A reversão da origem (reabertura do negócio) não é bloqueada por já ter sido gasta.
    await reabrirNegocio(negocioId);
    expect(await saldoDe(membroId)).toBe(-100);

    // O resgate em si (e a recompensa já entregue) não é desfeito automaticamente.
    const { data: resgate } = await servico.from("resgates").select("status").eq("membro_id", membroId).single();
    expect(resgate!.status).toBe("solicitado");
  });

  it("ganhos futuros compensam naturalmente o saldo negativo", async () => {
    const { membroId, cliente } = await novoMembro();
    const negocioId = await ganharMoedas(membroId);
    const recompensaId = await criarRecompensa(100);
    await cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaId });
    await reabrirNegocio(negocioId);
    expect(await saldoDe(membroId)).toBe(-100);

    await ganharMoedas(membroId);
    expect(await saldoDe(membroId)).toBe(0);

    await ganharMoedas(membroId);
    expect(await saldoDe(membroId)).toBe(100);
  });

  it("solicitar_resgate bloqueia novo resgate enquanto o saldo real for insuficiente/negativo", async () => {
    const { membroId, cliente } = await novoMembro();
    const negocioId = await ganharMoedas(membroId);
    const recompensaId = await criarRecompensa(100);
    await cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaId });
    await reabrirNegocio(negocioId);
    expect(await saldoDe(membroId)).toBe(-100);

    const outraRecompensaId = await criarRecompensa(10);
    const { error } = await cliente.rpc("solicitar_resgate", { p_recompensa_id: outraRecompensaId });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Moedas insuficientes");
  });
});

describe("concorrência: FOR UPDATE em empresa_membros", () => {
  it("dois resgates simultâneos de recompensas diferentes, com saldo pra só um, deixam exatamente um passar", async () => {
    const { membroId, cliente } = await novoMembro();
    await ganharMoedas(membroId); // saldo = 100
    const recompensaA = await criarRecompensa(60);
    const recompensaB = await criarRecompensa(60);

    const [resultadoA, resultadoB] = await Promise.all([
      cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaA }),
      cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaB }),
    ]);

    const erros = [resultadoA.error, resultadoB.error];
    expect(erros.filter((e) => e === null)).toHaveLength(1);
    expect(erros.filter((e) => e !== null)).toHaveLength(1);
    expect(await saldoDe(membroId)).toBe(40);

    const { count } = await servico.from("resgates").select("id", { count: "exact", head: true }).eq("membro_id", membroId);
    expect(count).toBe(1);
  });
});

describe("cancelamento: restaura o débito e é idempotente", () => {
  it("cancelar um resgate solicitado devolve as moedas", async () => {
    const { membroId, cliente } = await novoMembro();
    await ganharMoedas(membroId);
    const recompensaId = await criarRecompensa(100);
    const { data: resgate, error: erroResgate } = await cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaId });
    if (erroResgate || !resgate) throw erroResgate;
    expect(await saldoDe(membroId)).toBe(0);

    const { error } = await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgate.id, p_novo_status: "cancelado" });
    expect(error).toBeNull();
    expect(await saldoDe(membroId)).toBe(100);
  });

  it("cancelar duas vezes não devolve as moedas duas vezes", async () => {
    const { membroId, cliente } = await novoMembro();
    await ganharMoedas(membroId);
    const recompensaId = await criarRecompensa(100);
    const { data: resgate, error: erroResgate } = await cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaId });
    if (erroResgate || !resgate) throw erroResgate;

    await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgate.id, p_novo_status: "cancelado" });
    expect(await saldoDe(membroId)).toBe(100);

    const { error } = await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgate.id, p_novo_status: "cancelado" });
    expect(error).not.toBeNull();
    expect(await saldoDe(membroId)).toBe(100);
  });
});

describe("máquina de estados: só os 4 caminhos permitidos", () => {
  async function novoResgateSolicitado() {
    const { membroId, cliente } = await novoMembro();
    await ganharMoedas(membroId);
    const recompensaId = await criarRecompensa(100);
    const { data: resgate, error: erroResgate } = await cliente.rpc("solicitar_resgate", { p_recompensa_id: recompensaId });
    if (erroResgate || !resgate) throw erroResgate;
    return resgate.id as string;
  }

  type StatusResgateTeste = "solicitado" | "aprovado" | "entregue" | "cancelado";

  it.each<[StatusResgateTeste, StatusResgateTeste]>([
    ["solicitado", "aprovado"],
    ["solicitado", "cancelado"],
    ["aprovado", "entregue"],
    ["aprovado", "cancelado"],
  ])("permite %s → %s", async (de, para) => {
    const resgateId = await novoResgateSolicitado();
    if (de === "aprovado") {
      await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgateId, p_novo_status: "aprovado" });
    }
    const { error } = await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgateId, p_novo_status: para });
    expect(error).toBeNull();
  });

  it.each<[StatusResgateTeste, StatusResgateTeste]>([
    ["solicitado", "entregue"],
    ["aprovado", "solicitado"],
    ["entregue", "cancelado"],
    ["entregue", "aprovado"],
    ["cancelado", "aprovado"],
    ["cancelado", "entregue"],
  ])("bloqueia %s → %s", async (de, para) => {
    const resgateId = await novoResgateSolicitado();
    if (de === "aprovado" || de === "entregue") {
      await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgateId, p_novo_status: "aprovado" });
    }
    if (de === "entregue") {
      await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgateId, p_novo_status: "entregue" });
    }
    if (de === "cancelado") {
      await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgateId, p_novo_status: "cancelado" });
    }
    const { error } = await admin.cliente.rpc("atualizar_status_resgate", { p_resgate_id: resgateId, p_novo_status: para });
    expect(error).not.toBeNull();
  });
});
