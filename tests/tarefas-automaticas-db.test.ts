/**
 * Tarefas automáticas (20261031100000_tarefas_automaticas.sql): regras da empresa (setor + status da obra → tarefa
 * para um setor), disparadas por trigger em `obra_fluxos`, uma vez por obra e regra. Regras iniciais com a empresa,
 * admin cria e edita, ninguém apaga; tarefa com o responsável principal do setor na obra (e aviso no sininho) ou na
 * fila; prazo em dias úteis; histórico com o autor real; nenhum evento de gamificação.
 * Precisa do Supabase local (roda no CI). Os testes seguem em ordem (cada um parte do estado do anterior).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let engExec: Usuario;
let opExec: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let regraVistoria: string;
let regraAgendar: string;
let tarefaVistoria: string;

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function venderAteObra(): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico
    .from("contatos")
    .insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente automáticas ${sufixo}`, cidade: "Toledo", uf: "PR" })
    .select("id")
    .single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Automáticas ${sufixo}`, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error: eContrato } = await vendedor.cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (eContrato) throw eContrato;
  const assinado = await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const pago = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (pago.error) throw pago.error;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const status = async (setor: "compras" | "operacional", valor: string) => {
  const { error } = await admin.cliente.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: setor, p_status: valor });
  if (error) throw error;
};
const tarefasDaRegra = async (regra: string) =>
  (await servico.from("tarefas_setor").select("*").eq("obra_id", obra).eq("regra_id", regra)).data ?? [];

describe("tarefas automáticas (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, engExec, opExec, adminB] = await Promise.all(
      ["ta-admin", "ta-vendedor", "ta-eng", "ta-op", "ta-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Automáticas A ${sufixo}` }, { nome: `Automáticas B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engExec, empresa, { papel: "operacao" }],
      [opExec, empresa, { papel: "operacao" }],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [alvo, setor] of [
      [engExec, "engenharia"],
      [opExec, "operacional"],
    ] as const) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", {
        p_membro_id: membro[alvo.id],
        p_setores: [{ setor, capacidade: "executar" }] as never,
      });
      if (e) throw e;
    }
    obra = await venderAteObra();
    // Engenharia tem responsável principal na obra; no Operacional, só apoio (não principal).
    for (const [u, setor, funcao, principal] of [
      [engExec, "engenharia", "responsavel", true],
      [opExec, "operacional", "apoio", false],
    ] as const) {
      const { error: eP } = await admin.cliente.rpc("atribuir_participante_obra", {
        p_obra_id: obra,
        p_membro_id: membro[u.id],
        p_setor: setor,
        p_funcao: funcao,
        p_principal: principal,
      });
      if (eP) throw eP;
    }
  });

  it("toda empresa nasce com as duas regras do Evandro, ativas", async () => {
    const { data } = await admin.cliente
      .from("tarefas_automaticas_regras")
      .select("id, gatilho_setor, gatilho_status, setor, titulo, prazo_dias_uteis, ativa")
      .eq("empresa_id", empresa)
      .order("gatilho_setor");
    expect(data).toEqual([
      expect.objectContaining({ gatilho_setor: "compras", gatilho_status: "faturado_fornecedor", setor: "operacional", titulo: "Agendar instalação com o cliente", prazo_dias_uteis: 2, ativa: true }),
      expect.objectContaining({ gatilho_setor: "operacional", gatilho_status: "instalacao_concluida", setor: "engenharia", titulo: "Cadastro do cliente no app e pedido de vistoria", prazo_dias_uteis: 2, ativa: true }),
    ]);
    regraAgendar = data![0].id;
    regraVistoria = data![1].id;
  });

  it("só o admin cria e edita; ninguém apaga; outra empresa não vê; gatilho precisa ser um status do setor", async () => {
    const nova = { empresa_id: empresa, gatilho_setor: "operacional", gatilho_status: "agendada", setor: "compras", titulo: "Conferir material antes da instalação" } as const;
    for (const u of [vendedor, opExec]) {
      expect((await u.cliente.from("tarefas_automaticas_regras").insert(nova)).error).not.toBeNull();
      const { data } = await u.cliente.from("tarefas_automaticas_regras").update({ titulo: "Mudou" }).eq("id", regraAgendar).select("id");
      expect(data ?? []).toEqual([]);
    }
    expect((await admin.cliente.from("tarefas_automaticas_regras").insert({ ...nova, gatilho_status: "faturado_fornecedor" })).error?.code).toBe("23514");
    const { error } = await admin.cliente.from("tarefas_automaticas_regras").insert(nova);
    expect(error).toBeNull();
    expect((await admin.cliente.from("tarefas_automaticas_regras").insert(nova)).error?.code).toBe("23505");

    await admin.cliente.from("tarefas_automaticas_regras").delete().eq("id", regraAgendar);
    expect((await servico.from("tarefas_automaticas_regras").select("id").eq("id", regraAgendar)).data).toHaveLength(1);
    expect((await adminB.cliente.from("tarefas_automaticas_regras").select("id").eq("empresa_id", empresa)).data).toEqual([]);
  });

  it("status do gatilho abre a tarefa para o responsável principal, com prazo em dias úteis, e avisa", async () => {
    await status("operacional", "instalacao_concluida");
    const [t, ...resto] = await tarefasDaRegra(regraVistoria);
    expect(resto).toHaveLength(0);
    const { data: prazo } = await admin.cliente.rpc("somar_dias_uteis", { p_empresa_id: empresa, p_inicio: hoje(), p_dias: 2 });
    expect(t).toMatchObject({
      empresa_id: empresa,
      setor: "engenharia",
      titulo: "Cadastro do cliente no app e pedido de vistoria",
      status: "aberta",
      origem: "automatica",
      responsavel_id: membro[engExec.id],
      criado_por: null,
      negocio_id: null,
      prazo,
    });
    tarefaVistoria = t.id;

    const { data: hist } = await servico.from("tarefas_setor_historico").select("tipo, autor_membro_id, dados").eq("tarefa_id", t.id);
    expect(hist).toEqual([
      expect.objectContaining({
        tipo: "criada",
        autor_membro_id: membro[admin.id],
        dados: expect.objectContaining({ regra_id: regraVistoria, gatilho: { setor: "operacional", status: "instalacao_concluida" } }),
      }),
    ]);
    const { data: avisos } = await servico.from("notificacoes").select("tipo, link").eq("membro_id", membro[engExec.id]);
    expect(avisos).toEqual([{ tipo: "tarefa_setor_atribuida", link: "/tarefas/setores?ver=minhas" }]);
    expect((await engExec.cliente.from("tarefas_setor").select("id").eq("id", t.id)).data).toHaveLength(1);
  });

  it("sem responsável principal no setor de destino, a tarefa vai para a fila (o apoio da obra vê)", async () => {
    await status("compras", "faturado_fornecedor");
    const [t] = await tarefasDaRegra(regraAgendar);
    expect(t).toMatchObject({ setor: "operacional", titulo: "Agendar instalação com o cliente", responsavel_id: null, origem: "automatica" });
    expect((await opExec.cliente.from("tarefas_setor").select("id").eq("id", t.id)).data).toHaveLength(1);
  });

  it("uma vez por obra e regra: voltar o status, cancelar a tarefa e chegar de novo não abre outra", async () => {
    await status("operacional", "em_instalacao");
    await status("operacional", "instalacao_concluida");
    expect(await tarefasDaRegra(regraVistoria)).toHaveLength(1);

    // Sem "quem pediu": cancela o coordenador do setor ou o admin (o responsável, não).
    expect((await engExec.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: tarefaVistoria, p_motivo: "Cliente já tinha cadastro" })).error?.code).toBe("42501");
    const { error } = await admin.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: tarefaVistoria, p_motivo: "Cliente já tinha cadastro" });
    expect(error).toBeNull();
    await status("operacional", "em_instalacao");
    await status("operacional", "instalacao_concluida");
    const tarefas = await tarefasDaRegra(regraVistoria);
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0].status).toBe("cancelada");
  });

  it("regra desativada não dispara; regra criada depois dispara na próxima transição", async () => {
    const { data: nova } = await admin.cliente
      .from("tarefas_automaticas_regras")
      .select("id")
      .eq("empresa_id", empresa)
      .eq("gatilho_status", "agendada")
      .single();
    const { error } = await admin.cliente.from("tarefas_automaticas_regras").update({ ativa: false }).eq("id", nova!.id);
    expect(error).toBeNull();
    await status("operacional", "agendada");
    expect(await tarefasDaRegra(nova!.id)).toHaveLength(0);

    await admin.cliente.from("tarefas_automaticas_regras").update({ ativa: true }).eq("id", nova!.id);
    await status("operacional", "em_instalacao");
    await status("operacional", "agendada");
    expect(await tarefasDaRegra(nova!.id)).toEqual([expect.objectContaining({ setor: "compras", responsavel_id: null })]);
  });

  it("nenhum evento de gamificação", async () => {
    const ids = ((await servico.from("tarefas_setor").select("id").eq("obra_id", obra)).data ?? []).map((t) => t.id);
    expect(ids.length).toBeGreaterThan(0);
    const { data } = await servico.from("eventos").select("id").in("entidade_id", ids);
    expect(data).toEqual([]);
  });
});
