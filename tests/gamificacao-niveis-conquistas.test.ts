/**
 * Fechamento de Níveis e Conquistas (Evandro, 2026-10-02), depois da auditoria read-only
 * e das decisões de produto sobre ela. Cobre a checklist pedida: thresholds de nível,
 * ausência de níveis cadastrados, configuração fora de ordem (rejeitada), queda de nível
 * após estorno, reinterpretação imediata ao mudar um threshold, conquista única (sem
 * desbloqueio duplicado), bônus XP/0 moedas, ausência de cascata entre conquistas via
 * bônus, permanência da conquista após estorno do XP de origem, conquista desativada
 * some só de quem ainda não desbloqueou, e concorrência/idempotência do desbloqueio.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { calcularNivel } from "@/lib/gamificacao";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

describe("calcularNivel: thresholds e ausência de níveis (função pura)", () => {
  const niveis = [
    { nivel: 1, nome: "Iniciante", xpMinimo: 0 },
    { nivel: 2, nome: "Veterano", xpMinimo: 100 },
    { nivel: 3, nome: "Mestre", xpMinimo: 500 },
  ];

  it("sem níveis cadastrados, todo mundo fica no nível 1 com 100% de progresso", () => {
    const r = calcularNivel([], 9999);
    expect(r.nivel).toBe(1);
    expect(r.progresso).toBe(100);
    expect(r.proximoNivel).toBeNull();
  });

  it("XP abaixo do primeiro threshold fica no nível base configurado", () => {
    const r = calcularNivel(niveis, 50);
    expect(r.nivel).toBe(1);
    expect(r.proximoNivel?.nivel).toBe(2);
    expect(r.progresso).toBe(50);
  });

  it("XP exatamente no threshold já conta pro nível seguinte", () => {
    const r = calcularNivel(niveis, 100);
    expect(r.nivel).toBe(2);
  });

  it("XP acima do maior threshold fica no nível máximo, sem erro, 100% de progresso", () => {
    const r = calcularNivel(niveis, 1_000_000);
    expect(r.nivel).toBe(3);
    expect(r.proximoNivel).toBeNull();
    expect(r.progresso).toBe(100);
  });
});

describe("niveis_gamificacao: banco rejeita configuração fora de ordem", () => {
  let admin: Usuario;
  let empresa: string;

  beforeAll(async () => {
    admin = await criarUsuario("nc-admin");
    const { data: emp } = await servico.from("empresas").insert({ nome: `Níveis ordem ${sufixo}` }).select("id").single();
    empresa = emp!.id;
    await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });
  });

  it("aceita níveis em ordem crescente de nivel e xp_minimo", async () => {
    const { error: e1 } = await admin.cliente.from("niveis_gamificacao").insert({ empresa_id: empresa, nivel: 1, xp_minimo: 0 });
    const { error: e2 } = await admin.cliente.from("niveis_gamificacao").insert({ empresa_id: empresa, nivel: 2, xp_minimo: 100 });
    expect(e1).toBeNull();
    expect(e2).toBeNull();
  });

  it("rejeita um nível com xp_minimo menor ou igual ao de um nível anterior", async () => {
    const { error } = await admin.cliente.from("niveis_gamificacao").insert({ empresa_id: empresa, nivel: 3, xp_minimo: 50 });
    expect(error).not.toBeNull();
  });

  it("rejeita atualizar um threshold de forma que quebre a ordem com os vizinhos", async () => {
    const { error } = await admin.cliente.from("niveis_gamificacao").update({ xp_minimo: 200 }).eq("empresa_id", empresa).eq("nivel", 1);
    expect(error).not.toBeNull();
  });
});

describe("nível: dinâmico a partir do XP ativo — cai com estorno, reinterpreta com mudança de threshold", () => {
  let admin: Usuario;
  let colab: Usuario;
  let empresa: string;
  let membroId: string;

  beforeAll(async () => {
    [admin, colab] = await Promise.all(["nc-queda-admin", "nc-queda-colab"].map(criarUsuario));
    const { data: emp } = await servico.from("empresas").insert({ nome: `Níveis queda ${sufixo}` }).select("id").single();
    empresa = emp!.id;
    const { data: vinculos } = await servico
      .from("empresa_membros")
      .insert([
        { empresa_id: empresa, user_id: admin.id, papel: "admin" },
        { empresa_id: empresa, user_id: colab.id, papel: "vendedor" },
      ])
      .select("id, user_id");
    membroId = vinculos!.find((v) => v.user_id === colab.id)!.id;

    await admin.cliente.from("niveis_gamificacao").insert([
      { empresa_id: empresa, nivel: 1, xp_minimo: 0 },
      { empresa_id: empresa, nivel: 2, xp_minimo: 100 },
    ]);
  });

  async function somaXpAtivo() {
    const { data } = await servico.from("point_ledger").select("xp").eq("membro_id", membroId).eq("estornado", false);
    return (data ?? []).reduce((s, l) => s + l.xp, 0);
  }

  async function nivelDoMembro() {
    const { data: niveis } = await servico.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", empresa).eq("ativa", true).order("xp_minimo");
    const total = await somaXpAtivo();
    return calcularNivel(
      (niveis ?? []).map((n) => ({ nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo })),
      total,
    ).nivel;
  }

  it("sobe de nível ao cruzar o threshold e cai de volta se o XP de origem for estornado", async () => {
    const entidadeId = randomUUID();
    const { data: regra } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "nc.sobe", evento_tipo: "nc.sobe", xp: 150, moedas: 0 })
      .select("id")
      .single();

    expect(await nivelDoMembro()).toBe(1);

    await servico.from("eventos").insert({ empresa_id: empresa, tipo: "nc.sobe", ator_id: colab.id, entidade: "negocio", entidade_id: entidadeId });
    expect(await nivelDoMembro()).toBe(2);

    await servico.rpc("estornar_lancamentos_evento", { p_entidade_id: entidadeId, p_eventos_tipo: ["nc.sobe"] });
    expect(await nivelDoMembro()).toBe(1);

    await servico.from("gamification_rules").delete().eq("id", regra!.id);
  });

  it("mudar o threshold de um nível reinterpreta o nível atual na hora, sem tocar no ledger", async () => {
    const entidadeId = randomUUID();
    await admin.cliente.from("gamification_rules").insert({ empresa_id: empresa, nome: "nc.threshold", evento_tipo: "nc.threshold", xp: 120, moedas: 0 });
    await servico.from("eventos").insert({ empresa_id: empresa, tipo: "nc.threshold", ator_id: colab.id, entidade: "negocio", entidade_id: entidadeId });

    expect(await nivelDoMembro()).toBe(2);

    const { error } = await admin.cliente.from("niveis_gamificacao").update({ xp_minimo: 500 }).eq("empresa_id", empresa).eq("nivel", 2);
    expect(error).toBeNull();
    expect(await nivelDoMembro()).toBe(1);

    const { data: ledgerAntes } = await servico.from("point_ledger").select("xp").eq("membro_id", membroId).eq("estornado", false);
    const totalLedger = (ledgerAntes ?? []).reduce((s, l) => s + l.xp, 0);
    expect(totalLedger).toBeGreaterThanOrEqual(120);
  });
});

describe("conquistas: desbloqueio único, bônus XP puro, sem cascata, permanente após estorno, desativação não some do histórico, concorrência segura", () => {
  let admin: Usuario;
  let colab: Usuario;
  let outro: Usuario;
  let empresa: string;
  const membro: Record<string, string> = {};

  beforeAll(async () => {
    [admin, colab, outro] = await Promise.all(["nc-cq-admin", "nc-cq-colab", "nc-cq-outro"].map(criarUsuario));
    const { data: emp } = await servico.from("empresas").insert({ nome: `Conquistas fechamento ${sufixo}` }).select("id").single();
    empresa = emp!.id;
    const { data: vinculos } = await servico
      .from("empresa_membros")
      .insert([
        { empresa_id: empresa, user_id: admin.id, papel: "admin" },
        { empresa_id: empresa, user_id: colab.id, papel: "vendedor" },
        { empresa_id: empresa, user_id: outro.id, papel: "vendedor" },
      ])
      .select("id, user_id");
    for (const v of vinculos!) membro[v.user_id] = v.id;
  });

  async function criarRegra(tipo: string, xp: number) {
    const { data, error } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: tipo, evento_tipo: tipo, xp, moedas: 0 })
      .select("id")
      .single();
    if (error) throw error;
    return data!.id;
  }

  async function emitir(tipo: string, atorId: string) {
    const { error } = await servico.from("eventos").insert({ empresa_id: empresa, tipo, ator_id: atorId, entidade: "negocio", entidade_id: randomUUID() });
    if (error) throw error;
  }

  it("não desbloqueia duas vezes a mesma conquista mesmo cruzando o limiar várias vezes", async () => {
    const { data: conquista } = await admin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresa, nome: "Única", criterio: { metrica: "xp_acumulado", valor: 10 }, xp_bonus: 5 })
      .select("id")
      .single();
    await criarRegra("nc.unica", 10);

    await emitir("nc.unica", colab.id);
    await emitir("nc.unica", colab.id);
    await emitir("nc.unica", colab.id);

    const { data: desbloqueios } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquista!.id).eq("membro_id", membro[colab.id]);
    expect(desbloqueios).toHaveLength(1);

    const { data: bonus } = await servico.from("point_ledger").select("xp, moedas").eq("referencia_tipo", "conquista").eq("referencia_id", conquista!.id).eq("membro_id", membro[colab.id]);
    expect(bonus).toHaveLength(1);
    expect(bonus![0].xp).toBe(5);
    expect(bonus![0].moedas).toBe(0);
  });

  it("bônus de uma conquista não desbloqueia outra conquista por xp_acumulado (sem cascata)", async () => {
    const regraId = await criarRegra("nc.cascata", 20);
    const { data: base } = await servico.from("point_ledger").select("xp").eq("membro_id", membro[outro.id]).eq("estornado", false);
    const totalAntes = (base ?? []).reduce((s, l) => s + l.xp, 0);

    const { data: cA } = await admin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresa, nome: "Cascata A", criterio: { metrica: "xp_acumulado", valor: totalAntes + 20 }, xp_bonus: 15 })
      .select("id")
      .single();
    // B exige exatamente totalAntes + 20 (evento) + 15 (bônus de A) — só alcançável se o
    // bônus de A contasse para B. Com a cascata eliminada, isso nunca deve acontecer.
    const { data: cB } = await admin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresa, nome: "Cascata B", criterio: { metrica: "xp_acumulado", valor: totalAntes + 35 }, xp_bonus: 0 })
      .select("id")
      .single();

    await emitir("nc.cascata", outro.id);

    const { data: desbloqueioA } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", cA!.id).eq("membro_id", membro[outro.id]).maybeSingle();
    expect(desbloqueioA).not.toBeNull();

    const { data: desbloqueioB } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", cB!.id).eq("membro_id", membro[outro.id]).maybeSingle();
    expect(desbloqueioB).toBeNull();

    await servico.from("gamification_rules").delete().eq("id", regraId);
  });

  it("conquista e bônus permanecem mesmo se o XP de origem for estornado depois", async () => {
    const entidadeId = randomUUID();
    const { data: base } = await servico.from("point_ledger").select("xp").eq("membro_id", membro[colab.id]).eq("estornado", false);
    const totalAntes = (base ?? []).reduce((s, l) => s + l.xp, 0);

    const { data: conquista } = await admin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresa, nome: "Permanente", criterio: { metrica: "xp_acumulado", valor: totalAntes + 25 }, xp_bonus: 9 })
      .select("id")
      .single();
    const { data: regra } = await admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: "nc.permanente", evento_tipo: "nc.permanente", xp: 25, moedas: 0 })
      .select("id")
      .single();

    await servico.from("eventos").insert({ empresa_id: empresa, tipo: "nc.permanente", ator_id: colab.id, entidade: "negocio", entidade_id: entidadeId });

    const { data: antesEstorno } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquista!.id).eq("membro_id", membro[colab.id]).maybeSingle();
    expect(antesEstorno).not.toBeNull();

    await servico.rpc("estornar_lancamentos_evento", { p_entidade_id: entidadeId, p_eventos_tipo: ["nc.permanente"] });

    const { data: depoisEstorno } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquista!.id).eq("membro_id", membro[colab.id]).maybeSingle();
    expect(depoisEstorno).not.toBeNull();

    const { data: bonus } = await servico.from("point_ledger").select("xp, moedas, estornado").eq("referencia_tipo", "conquista").eq("referencia_id", conquista!.id).eq("membro_id", membro[colab.id]).single();
    expect(bonus!.estornado).toBe(false);
    expect(bonus!.xp).toBe(9);

    await servico.from("gamification_rules").delete().eq("id", regra!.id);
  });

  it("desativar uma conquista impede novo desbloqueio, mas não apaga quem já tinha", async () => {
    const { data: base } = await servico.from("point_ledger").select("xp").eq("membro_id", membro[colab.id]).eq("estornado", false);
    const totalColab = (base ?? []).reduce((s, l) => s + l.xp, 0);

    const { data: conquista } = await admin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresa, nome: "Desativável", criterio: { metrica: "xp_acumulado", valor: totalColab }, xp_bonus: 0 })
      .select("id")
      .single();
    // Colab já tem XP suficiente (totalColab >= valor) — qualquer novo lançamento reavalia e desbloqueia.
    const regraId = await criarRegra("nc.desativavel-trigger", 1);
    await emitir("nc.desativavel-trigger", colab.id);

    const { data: colabTinha } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquista!.id).eq("membro_id", membro[colab.id]).maybeSingle();
    expect(colabTinha).not.toBeNull();

    await admin.cliente.from("conquistas").update({ ativa: false }).eq("id", conquista!.id);

    // outro membro, que não tinha a conquista, agora cruza o mesmo limiar — não pode desbloquear.
    const { data: baseOutro } = await servico.from("point_ledger").select("xp").eq("membro_id", membro[outro.id]).eq("estornado", false);
    const totalOutro = (baseOutro ?? []).reduce((s, l) => s + l.xp, 0);
    if (totalOutro < totalColab) {
      await criarRegra("nc.desativavel-outro", totalColab - totalOutro + 5);
      await emitir("nc.desativavel-outro", outro.id);
    }
    const { data: outroNaoTem } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquista!.id).eq("membro_id", membro[outro.id]).maybeSingle();
    expect(outroNaoTem).toBeNull();

    // registro do colab continua existindo (histórico permanente, decisão de Evandro).
    const { data: colabContinua } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquista!.id).eq("membro_id", membro[colab.id]).maybeSingle();
    expect(colabContinua).not.toBeNull();

    await servico.from("gamification_rules").delete().eq("id", regraId);
  });

  it("concorrência: dois lançamentos cruzando o limiar quase ao mesmo tempo não duplicam o bônus nem abortam o evento comercial", async () => {
    const { data: base } = await servico.from("point_ledger").select("xp").eq("membro_id", membro[outro.id]).eq("estornado", false);
    const totalAntes = (base ?? []).reduce((s, l) => s + l.xp, 0);

    const { data: conquista } = await admin.cliente
      .from("conquistas")
      .insert({ empresa_id: empresa, nome: "Concorrência", criterio: { metrica: "xp_acumulado", valor: totalAntes + 10 }, xp_bonus: 4 })
      .select("id")
      .single();
    const regraId = await criarRegra("nc.concorrencia", 10);

    const resultados = await Promise.all([emitir("nc.concorrencia", outro.id), emitir("nc.concorrencia", outro.id)]);
    expect(resultados).toEqual([undefined, undefined]); // nenhuma das duas inserções lançou erro

    const { data: desbloqueios } = await servico.from("conquistas_desbloqueadas").select("id").eq("conquista_id", conquista!.id).eq("membro_id", membro[outro.id]);
    expect(desbloqueios).toHaveLength(1);

    const { data: bonus } = await servico.from("point_ledger").select("id").eq("referencia_tipo", "conquista").eq("referencia_id", conquista!.id).eq("membro_id", membro[outro.id]);
    expect(bonus).toHaveLength(1);

    await servico.from("gamification_rules").delete().eq("id", regraId);
  });
});
