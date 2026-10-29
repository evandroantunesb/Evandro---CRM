/**
 * Notificações das tarefas de setor (20261029235000_tarefas_setor_notificacoes.sql): concluída e cancelada avisam
 * quem pediu; atribuída avisa o novo responsável; reaberta avisa o responsável. Ninguém é avisado da própria ação.
 * Precisa do Supabase local (roda no CI). Os testes seguem em ordem (cada um parte do estado do anterior).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let engCoord: Usuario;
let engExec: Usuario;
let empresa: string;
let negocio: string;
const membro: Record<string, string> = {};
let tarefa: string;

const amanha = () => {
  const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const avisos = async (u: Usuario) =>
  (await servico.from("notificacoes").select("tipo, mensagem, link").eq("membro_id", membro[u.id]).order("created_at")).data ?? [];
const ok = (r: { error: unknown }) => expect(r.error).toBeNull();

describe("notificações das tarefas de setor (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, engCoord, engExec] = await Promise.all(["tsn-admin", "tsn-vendedor", "tsn-coord", "tsn-exec"].map(criarUsuario));
    const { data: e } = await servico.from("empresas").insert({ nome: `Notificações tarefa ${sufixo}` }).select("id").single();
    empresa = e!.id;
    const vinculos: [Usuario, object][] = [
      [admin, { papel: "admin" }],
      [vendedor, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engCoord, { papel: "operacao" }],
      [engExec, { papel: "operacao" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, extra]) => ({ empresa_id: empresa, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [alvo, capacidade] of [
      [engCoord, "coordenar"],
      [engExec, "executar"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: [{ setor: "engenharia", capacidade }] as never }));
    }
    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
    const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: `Cliente ${sufixo}`, ...CLIENTE_CONTRATO }).select("id").single();
    const { data: neg, error: eNeg } = await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: `Notif ${sufixo}`, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
      .select("id")
      .single();
    if (eNeg) throw eNeg;
    negocio = neg!.id;
    const { data: id, error: eT } = await vendedor.cliente.rpc("criar_tarefa_setor", {
      p_setor: "engenharia",
      p_titulo: "Projeto 3D do telhado",
      p_prazo: amanha(),
      p_negocio_id: negocio,
    });
    if (eT) throw eT;
    tarefa = id as string;
  });

  it("atribuir avisa o novo responsável, não quem atribuiu", async () => {
    ok(await engCoord.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: tarefa, p_membro_id: membro[engExec.id] }));
    expect(await avisos(engExec)).toEqual([
      { tipo: "tarefa_setor_atribuida", mensagem: "Tarefa de Engenharia atribuída a você: Projeto 3D do telhado", link: "/tarefas/setores?ver=minhas" },
    ]);
    expect(await avisos(engCoord)).toEqual([]);
  });

  it("concluir avisa quem pediu, com link para o negócio na aba Atividades", async () => {
    ok(await engExec.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: tarefa, p_resposta: "3D em anexo" }));
    expect(await avisos(vendedor)).toEqual([
      { tipo: "tarefa_setor_concluida", mensagem: "Engenharia concluiu: Projeto 3D do telhado", link: `/negocios/${negocio}?aba=atividades` },
    ]);
  });

  it("quem pediu reabre: avisa o responsável; quem reabriu não recebe nada", async () => {
    ok(await vendedor.cliente.rpc("reabrir_tarefa_setor", { p_tarefa_id: tarefa }));
    expect((await avisos(engExec)).map((a) => a.tipo)).toEqual(["tarefa_setor_atribuida", "tarefa_setor_reaberta"]);
    expect(await avisos(vendedor)).toHaveLength(1);
  });

  it("cancelada pelo coordenador avisa quem pediu com o motivo; cancelar o próprio pedido não avisa ninguém", async () => {
    ok(await engCoord.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: tarefa, p_motivo: "Cliente desistiu do 3D" }));
    expect((await avisos(vendedor)).at(-1)).toEqual({
      tipo: "tarefa_setor_cancelada",
      mensagem: "Pedido cancelado (Engenharia): Projeto 3D do telhado — Cliente desistiu do 3D",
      link: `/negocios/${negocio}?aba=atividades`,
    });

    const { data: outra } = await vendedor.cliente.rpc("criar_tarefa_setor", { p_setor: "engenharia", p_titulo: "Outro pedido", p_prazo: amanha(), p_negocio_id: negocio });
    const antes = (await avisos(vendedor)).length;
    ok(await vendedor.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: outra as string, p_motivo: "Pedi errado" }));
    expect(await avisos(vendedor)).toHaveLength(antes);
  });

  it("o próprio dono vê a notificação no sininho (RLS da tabela existente)", async () => {
    const { data } = await vendedor.cliente.from("notificacoes").select("tipo").eq("tipo", "tarefa_setor_concluida");
    expect(data).toHaveLength(1);
    const { data: alheia } = await engExec.cliente.from("notificacoes").select("tipo").eq("tipo", "tarefa_setor_concluida");
    expect(alheia).toEqual([]);
  });
});
