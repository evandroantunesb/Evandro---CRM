/**
 * Correção causal de valor pós-ganho (Evandro, 2026-10-02, PR 2 de 2 — depois da #121 que
 * corrigiu o beneficiário de deal.won). Fonte causal `deal.value_corrected` pra correções de
 * valor feitas enquanto o negócio permanece `ganho`. Ver
 * `20261002170000_gamificacao_deal_value_corrected.sql`:
 * - UPDATE comum de `negocios.valor` em negócio ganho é bloqueado no banco (trigger
 *   `preparar_negocio`); só a RPC `corrigir_valor_negocio` pode mudar.
 * - Permissão: gestor com acesso ao negócio ou admin — nunca closer/vendedor.
 * - Motivo obrigatório, novo valor precisa ser diferente do atual.
 * - Beneficiário/perfil herdados do `deal.won` ativo do ciclo, nunca do responsável atual.
 * - Não gera XP/moedas (nenhuma `gamification_rules` configurada pra esse tipo).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let closer: Usuario;
let closer2: Usuario;
let gestor: Usuario;
let gestorForaEquipe: Usuario;
let admin: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let funil: string;
let etapaInicial: string;
let contato: string;

beforeAll(async () => {
  [closer, closer2, gestor, gestorForaEquipe, admin] = await Promise.all(
    ["vc-closer", "vc-closer2", "vc-gestor", "vc-gestor-fora", "vc-admin"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Correção de valor ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: closer.id, papel: "vendedor" },
      { empresa_id: empresa, user_id: closer2.id, papel: "vendedor" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: gestorForaEquipe.id, papel: "gestor" },
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    ])
    .select("id, user_id");
  for (const v of vinculos!) membro[v.user_id] = v.id;

  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe correção de valor" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer.id], e_gestor: false },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[closer2.id], e_gestor: false },
  ]);
  // gestorForaEquipe não participa de nenhuma equipe com closer/closer2 — sem acesso.

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapaInicial = etapas![0].id;

  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente correção de valor" }).select("id").single();
  contato = c!.id;
});

async function criarNegocioGanho(titulo: string, responsavelId: string, valor: number) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: responsavelId, valor })
    .select("id")
    .single();
  if (error) throw error;
  const { error: erroGanho } = await servico.from("negocios").update({ status: "ganho" }).eq("id", data!.id);
  if (erroGanho) throw erroGanho;
  return data!.id;
}

async function corrigirValor(cliente: Usuario["cliente"], negocioId: string, novoValor: number, motivo: string | null) {
  // motivo aceita null em runtime pra testar a validação "motivo obrigatório" do servidor —
  // o tipo gerado declara p_motivo como string (não aceita default null na função SQL).
  return cliente.rpc("corrigir_valor_negocio", { p_negocio_id: negocioId, p_novo_valor: novoValor, p_motivo: motivo as string });
}

describe("bloqueio de UPDATE comum em negócio ganho", () => {
  it("UPDATE direto de valor falha no banco, mesmo via service_role", async () => {
    const negocioId = await criarNegocioGanho("Negócio bloqueio UPDATE comum", membro[closer.id], 10000);
    const { error } = await servico.from("negocios").update({ valor: 20000 }).eq("id", negocioId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Corrigir valor/);

    const { data: negocio } = await servico.from("negocios").select("valor").eq("id", negocioId).single();
    expect(Number(negocio!.valor)).toBe(10000);
  });

  it("depois de uma correção pela RPC, UPDATE comum posterior continua bloqueado (flag não sobrevive)", async () => {
    const negocioId = await criarNegocioGanho("Negócio flag não reaproveitada", membro[closer.id], 10000);
    const { error: erroCorrecao } = await corrigirValor(gestor.cliente, negocioId, 15000, "Correção legítima");
    expect(erroCorrecao).toBeNull();

    const { error } = await servico.from("negocios").update({ valor: 99999 }).eq("id", negocioId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Corrigir valor/);

    const { data: negocio } = await servico.from("negocios").select("valor").eq("id", negocioId).single();
    expect(Number(negocio!.valor)).toBe(15000);
  });

  it("negócio aberto continua com edição normal de valor", async () => {
    const { data: negocio } = await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: `Negócio aberto ${sufixo}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membro[closer.id] })
      .select("id")
      .single();
    const { error } = await servico.from("negocios").update({ valor: 12345 }).eq("id", negocio!.id);
    expect(error).toBeNull();
  });
});

describe("permissões da RPC corrigir_valor_negocio", () => {
  it("closer (responsável) não pode corrigir o próprio negócio ganho", async () => {
    const negocioId = await criarNegocioGanho("Negócio closer tenta corrigir", membro[closer.id], 10000);
    const { error } = await corrigirValor(closer.cliente, negocioId, 15000, "Teste");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/gestor ou admin/);
  });

  it("gestor sem acesso à equipe do closer não pode corrigir", async () => {
    const negocioId = await criarNegocioGanho("Negócio gestor fora da equipe", membro[closer.id], 10000);
    const { error } = await corrigirValor(gestorForaEquipe.cliente, negocioId, 15000, "Teste");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/acesso a este negócio/);
  });

  it("gestor com acesso à equipe do closer pode corrigir", async () => {
    const negocioId = await criarNegocioGanho("Negócio gestor com acesso", membro[closer.id], 10000);
    const { data, error } = await corrigirValor(gestor.cliente, negocioId, 15000, "Correção autorizada pelo gestor");
    expect(error).toBeNull();
    expect(data!.tipo).toBe("deal.value_corrected");
  });

  it("admin pode corrigir qualquer negócio", async () => {
    const negocioId = await criarNegocioGanho("Negócio admin corrige", membro[closer.id], 10000);
    const { error } = await corrigirValor(admin.cliente, negocioId, 15000, "Correção autorizada pelo admin");
    expect(error).toBeNull();
  });
});

describe("validações da RPC", () => {
  it("motivo vazio é rejeitado", async () => {
    const negocioId = await criarNegocioGanho("Negócio motivo vazio", membro[closer.id], 10000);
    const { error: erroVazio } = await corrigirValor(gestor.cliente, negocioId, 15000, "");
    expect(erroVazio).not.toBeNull();
    expect(erroVazio!.message).toMatch(/motivo/i);

    const { error: erroNulo } = await corrigirValor(gestor.cliente, negocioId, 15000, null);
    expect(erroNulo).not.toBeNull();
  });

  it("novo valor igual ao atual é rejeitado", async () => {
    const negocioId = await criarNegocioGanho("Negócio valor igual", membro[closer.id], 10000);
    const { error } = await corrigirValor(gestor.cliente, negocioId, 10000, "Tentando repetir o mesmo valor");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/diferente/);
  });

  it("negócio aberto não pode ser corrigido pela RPC (só UPDATE comum)", async () => {
    const { data: negocio } = await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: `Negócio aberto pra RPC ${sufixo}`, contato_id: contato, funil_id: funil, etapa_id: etapaInicial, responsavel_id: membro[closer.id], valor: 5000 })
      .select("id")
      .single();
    const { error } = await corrigirValor(gestor.cliente, negocio!.id, 6000, "Negócio nem está ganho");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/negócio ganho/i);
  });
});

describe("vínculo causal com o deal.won e beneficiário", () => {
  it("deal.value_corrected aponta pro deal.won correto, herda beneficiário e perfil", async () => {
    const negocioId = await criarNegocioGanho("Negócio vínculo causal", membro[closer.id], 10000);
    const { data: dealWon } = await servico
      .from("eventos")
      .select("id, beneficiario_id, profile_at_event")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.won")
      .single();

    const { data: correcao, error } = await corrigirValor(gestor.cliente, negocioId, 15000, "Ajuste de escopo do projeto");
    expect(error).toBeNull();
    const payload = correcao!.payload as Record<string, unknown>;
    expect(payload.evento_original_id).toBe(dealWon!.id);
    expect(payload.de).toBe(10000);
    expect(payload.para).toBe(15000);
    expect(payload.delta).toBe(5000);
    expect(payload.motivo).toBe("Ajuste de escopo do projeto");
    expect(correcao!.beneficiario_id).toBe(dealWon!.beneficiario_id);
    expect(correcao!.beneficiario_id).toBe(closer.id);
    expect(correcao!.profile_at_event).toBe(dealWon!.profile_at_event);
    expect(correcao!.ator_id).toBe(gestor.id);

    const { data: negocio } = await servico.from("negocios").select("valor").eq("id", negocioId).single();
    expect(Number(negocio!.valor)).toBe(15000);
  });

  it("troca de responsável depois do ganho não transfere o beneficiário da correção", async () => {
    const negocioId = await criarNegocioGanho("Negócio troca de responsável", membro[closer.id], 10000);
    const { data: dealWon } = await servico
      .from("eventos")
      .select("beneficiario_id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.won")
      .single();
    expect(dealWon!.beneficiario_id).toBe(closer.id);

    await servico.from("negocios").update({ responsavel_id: membro[closer2.id] }).eq("id", negocioId);

    const { data: correcao, error } = await corrigirValor(gestor.cliente, negocioId, 20000, "Correção depois da troca de responsável");
    expect(error).toBeNull();
    // Beneficiário continua o closer original do deal.won, nunca o novo responsável (closer2).
    expect(correcao!.beneficiario_id).toBe(closer.id);
    expect(correcao!.beneficiario_id).not.toBe(closer2.id);
  });
});

describe("correções sucessivas e ciclo ganho→reaberto→ganho", () => {
  it("50k→55k(+5k)→52k(-3k): eventos imutáveis, cada um com seu próprio de/para/delta", async () => {
    const negocioId = await criarNegocioGanho("Negócio correções sucessivas", membro[closer.id], 50000);

    const { data: c1, error: e1 } = await corrigirValor(gestor.cliente, negocioId, 55000, "Primeira correção");
    expect(e1).toBeNull();
    const { data: c2, error: e2 } = await corrigirValor(gestor.cliente, negocioId, 52000, "Segunda correção");
    expect(e2).toBeNull();

    const p1 = c1!.payload as Record<string, unknown>;
    const p2 = c2!.payload as Record<string, unknown>;
    expect(p1.de).toBe(50000);
    expect(p1.para).toBe(55000);
    expect(p1.delta).toBe(5000);
    expect(p2.de).toBe(55000);
    expect(p2.para).toBe(52000);
    expect(p2.delta).toBe(-3000);

    const { data: todas } = await servico
      .from("eventos")
      .select("id")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.value_corrected")
      .order("created_at");
    expect(todas).toHaveLength(2);
    expect(todas!.map((e) => e.id)).toEqual([c1!.id, c2!.id]);

    const { data: negocio } = await servico.from("negocios").select("valor").eq("id", negocioId).single();
    expect(Number(negocio!.valor)).toBe(52000);
  });

  it("ganho(50k) → reaberto → valor alterado(55k) → ganho de novo: novo deal.won, sem deal.value_corrected do ciclo antigo", async () => {
    const negocioId = await criarNegocioGanho("Negócio ciclo reabertura", membro[closer.id], 50000);
    const { data: dealWon1 } = await servico.from("eventos").select("id").eq("entidade_id", negocioId).eq("tipo", "deal.won").single();

    await servico.from("negocios").update({ status: "aberto" }).eq("id", negocioId);
    // Negócio reaberto: edição normal de valor volta a funcionar (não é mais 'ganho').
    const { error: erroEditar } = await servico.from("negocios").update({ valor: 55000 }).eq("id", negocioId);
    expect(erroEditar).toBeNull();
    await servico.from("negocios").update({ status: "ganho" }).eq("id", negocioId);

    const { data: todosWon } = await servico.from("eventos").select("id, created_at").eq("entidade_id", negocioId).eq("tipo", "deal.won").order("created_at");
    expect(todosWon).toHaveLength(2);
    expect(todosWon![1].id).not.toBe(dealWon1!.id);

    const { data: correcoes } = await servico.from("eventos").select("id").eq("entidade_id", negocioId).eq("tipo", "deal.value_corrected");
    expect(correcoes).toHaveLength(0);

    // Uma correção agora aponta pro novo deal.won (ciclo atual), nunca pro antigo.
    const { data: correcao, error } = await corrigirValor(gestor.cliente, negocioId, 60000, "Correção do novo ciclo");
    expect(error).toBeNull();
    const payload = correcao!.payload as Record<string, unknown>;
    expect(payload.evento_original_id).toBe(todosWon![1].id);
    expect(payload.evento_original_id).not.toBe(dealWon1!.id);
  });
});

describe("concorrência", () => {
  it("duas correções concorrentes no mesmo negócio são serializadas pelo lock (for update), sem perda de atualização", async () => {
    const negocioId = await criarNegocioGanho("Negócio concorrência", membro[closer.id], 10000);

    const [r1, r2] = await Promise.all([
      corrigirValor(gestor.cliente, negocioId, 20000, "Correção concorrente A"),
      corrigirValor(admin.cliente, negocioId, 30000, "Correção concorrente B"),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();

    const { data: correcoes } = await servico
      .from("eventos")
      .select("payload")
      .eq("entidade_id", negocioId)
      .eq("tipo", "deal.value_corrected")
      .order("created_at");
    expect(correcoes).toHaveLength(2);

    // O lock garante ordem serial real: o "de" da segunda correção a commitar é exatamente
    // o "para" da primeira — nenhuma correção perdeu a atualização da outra.
    const p1 = correcoes![0].payload as Record<string, unknown>;
    const p2 = correcoes![1].payload as Record<string, unknown>;
    expect(p1.de).toBe(10000);
    expect(p2.de).toBe(p1.para);

    const { data: negocio } = await servico.from("negocios").select("valor").eq("id", negocioId).single();
    expect(Number(negocio!.valor)).toBe(p2.para);
  });
});

describe("ausência de point_ledger (sem XP/moedas)", () => {
  it("deal.value_corrected não gera nenhum lançamento, mesmo sem regra configurada pra ele", async () => {
    const negocioId = await criarNegocioGanho("Negócio sem XP na correção", membro[closer.id], 10000);
    const { data: correcao, error } = await corrigirValor(gestor.cliente, negocioId, 15000, "Correção sem XP");
    expect(error).toBeNull();

    const { data: ledger } = await servico.from("point_ledger").select("id").eq("evento_id", correcao!.id);
    expect(ledger).toHaveLength(0);

    const { data: ledgerPorReferencia } = await servico
      .from("point_ledger")
      .select("id")
      .eq("referencia_tipo", "negocio")
      .eq("referencia_id", negocioId);
    // Garante que nenhum lançamento (nem de deal.won, que não tem regra nesta empresa) existe.
    expect(ledgerPorReferencia).toHaveLength(0);
  });
});
