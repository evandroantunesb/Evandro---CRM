/**
 * Gestor escreve em todos os setores (20261122100000_gestor_escreve_setores.sql): age como coordenador em Compras,
 * Engenharia, Operacional e Administrativo de qualquer obra da empresa; gere participantes (menos coordenador);
 * cria, atribui, conclui e cancela tarefas de setor; nunca assume tarefa para si. O histórico guarda o papel gestor.
 * O que é só do admin continua só do admin. Precisa do Supabase local (roda no CI). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario, anexarDocumentosContrato } from "./ajuda";
import { urlBancoLocal } from "./banco-local";

async function noBanco(sql: string, params: unknown[] = []) {
  const banco = new Client({ connectionString: urlBancoLocal() });
  await banco.connect();
  try {
    return (await banco.query(sql, params)).rows;
  } finally {
    await banco.end();
  }
}

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let engExec: Usuario;
let engCoord: Usuario;
let gestorB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let obra: string;
let tarefa: string;

const SETORES = ["compras", "engenharia", "operacional", "administrativo"] as const;

const amanha = () => {
  const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function criarObra(titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  const ganho = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id);
  if (ganho.error) throw ganho.error;
  await anexarDocumentosContrato(neg!.id);
  const { data: contrato, error: e2 } = await vendedor.cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (e2) throw e2;
  const assinado = await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const pago = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (pago.error) throw pago.error;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const parar = (quem: Usuario, setor: (typeof SETORES)[number], parado: boolean) =>
  quem.cliente.rpc("marcar_parado_fluxo_obra", { p_obra_id: obra, p_setor: setor, p_parado: parado, p_motivo: parado ? "Teste do gestor" : undefined });

describe("gestor escreve em todos os setores (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, vendedor, engExec, engCoord, gestorB] = await Promise.all(
      ["ge-admin", "ge-gestor", "ge-vendedor", "ge-eng-exec", "ge-eng-coord", "ge-gestor-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Gestor setores A ${sufixo}` }, { nome: `Gestor setores B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [gestor, empresa, { papel: "gestor" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engExec, empresa, { papel: "operacao" }],
      [engCoord, empresa, { papel: "operacao" }],
      [gestorB, empresaB, { papel: "gestor" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;

    for (const [alvo, capacidade] of [
      [engExec, "executar"],
      [engCoord, "coordenar"],
    ] as const) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", {
        p_membro_id: membro[alvo.id],
        p_setores: [{ setor: "engenharia", capacidade }] as never,
      });
      if (e) throw e;
    }
    obra = await criarObra(`Obra gestor ${sufixo}`);
  });

  it("altera o andamento dos quatro setores; o histórico guarda o papel gestor", async () => {
    for (const setor of SETORES) {
      expect((await parar(gestor, setor, true)).error, setor).toBeNull();
      expect((await parar(gestor, setor, false)).error, setor).toBeNull();
    }
    const { data } = await servico
      .from("obra_historico")
      .select("setor, autor_membro_id, autor_contexto, dados")
      .eq("obra_id", obra)
      .eq("tipo", "fluxo_alterado")
      .eq("autor_membro_id", membro[gestor.id]);
    expect(data).toHaveLength(8);
    for (const h of data!) expect(h).toMatchObject({ autor_contexto: { papel: "gestor" }, dados: { autorizacao: "coordenar" } });
  });

  it("atualiza o marco de garantia (do Operacional)", async () => {
    const marco = (quem: Usuario) => quem.cliente.rpc("atualizar_marco_obra", { p_obra_id: obra, p_marco: "garantia", p_status: "concluido" });
    expect((await marco(vendedor)).error?.code).toBe("42501");
    expect((await marco(gestor)).error).toBeNull();
    const { data } = await servico.from("obra_marcos").select("status").eq("obra_id", obra).eq("marco", "garantia").single();
    expect(data!.status).toBe("concluido");
  });

  it("vendedor e gestor de outra empresa continuam sem escrever", async () => {
    for (const quem of [vendedor, gestorB]) expect((await parar(quem, "compras", true)).error?.code, quem.email).toBe("42501");
  });

  it("gere participantes como coordenador: atribui e encerra quem executa; coordenador só o admin atribui", async () => {
    const { data: lista, error } = await gestor.cliente.rpc("membros_do_setor", { p_empresa_id: empresa, p_setor: "engenharia" });
    expect(error).toBeNull();
    expect(new Set((lista ?? []).map((m) => m.membro_id))).toEqual(new Set([membro[engExec.id], membro[engCoord.id]]));
    expect((await vendedor.cliente.rpc("membros_do_setor", { p_empresa_id: empresa, p_setor: "engenharia" })).data).toEqual([]);

    const atribuir = (alvo: Usuario) =>
      gestor.cliente.rpc("atribuir_participante_obra", { p_obra_id: obra, p_membro_id: membro[alvo.id], p_setor: "engenharia", p_funcao: "apoio" });
    expect((await atribuir(engCoord)).error?.message).toContain("Só o admin atribui um coordenador");
    const { data: participante, error: e1 } = await atribuir(engExec);
    expect(e1).toBeNull();
    expect((await gestor.cliente.rpc("encerrar_participante_obra", { p_participante_id: participante as string, p_motivo: "Troca de equipe" })).error).toBeNull();
  });

  it("o que é só do admin continua só do admin", async () => {
    const r = await gestor.cliente.rpc("concluir_engenharia_sem_conexao", { p_obra_id: obra, p_motivo: "Obra sem conexão nova (teste)" });
    expect(r.error?.message).toContain("Só o administrador");
  });

  it("tarefas: cria com responsável, atribui e conclui com resposta; não assume para si", async () => {
    const { data: id, error } = await gestor.cliente.rpc("criar_tarefa_setor", {
      p_setor: "engenharia",
      p_titulo: "Revisar projeto",
      p_prazo: amanha(),
      p_obra_id: obra,
      p_responsavel_id: membro[engExec.id],
    });
    expect(error).toBeNull();
    tarefa = id as string;

    expect((await gestor.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: tarefa })).error).toBeNull();
    expect((await gestor.cliente.rpc("assumir_tarefa_setor", { p_tarefa_id: tarefa })).error?.message).toContain("Só quem atua no setor");
    expect((await gestor.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: tarefa, p_resposta: "Projeto revisado" })).error).toBeNull();

    const { data: t } = await servico.from("tarefas_setor").select("status, resposta, concluida_por").eq("id", tarefa).single();
    expect(t).toEqual({ status: "concluida", resposta: "Projeto revisado", concluida_por: membro[gestor.id] });
    expect((await gestorB.cliente.rpc("reabrir_tarefa_setor", { p_tarefa_id: tarefa })).error).not.toBeNull();
  });

  it("tarefas: reabre e cancela com motivo", async () => {
    expect((await gestor.cliente.rpc("reabrir_tarefa_setor", { p_tarefa_id: tarefa })).error).toBeNull();
    expect((await gestor.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: tarefa, p_motivo: "Não precisa mais" })).error).toBeNull();
    const { data: t } = await servico.from("tarefas_setor").select("status, cancelada_por").eq("id", tarefa).single();
    expect(t).toEqual({ status: "cancelada", cancelada_por: membro[gestor.id] });
  });

  it("obra cancelada: nem o gestor altera", async () => {
    await noBanco("update public.obras set cancelada_em = now(), cancelamento_motivo = 'Desistência' where id = $1", [obra]);
    expect((await parar(gestor, "compras", true)).error?.message).toContain("cancelada");
  });
});
