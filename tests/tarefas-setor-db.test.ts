/**
 * Tarefas de setor (20261029210000_tarefas_setor.sql): pedidos do comercial no negócio e tarefas da obra, para
 * Compras, Engenharia ou Operacional. Matriz de quem vê e quem age, resposta para quem pediu, cancelamento com
 * motivo, histórico com autor real, contexto mínimo para a Operação e nenhum evento de gamificação.
 * Precisa do Supabase local (roda no CI). Os testes seguem em ordem (cada um parte do estado do anterior).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let vendedor2: Usuario;
let engExec: Usuario;
let engFora: Usuario;
let engCoord: Usuario;
let comprasExec: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let negocio: string;
let obra: string;
let pedido3d: string;
let tarefaObra: string;

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const amanha = () => {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function novoNegocio(titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico
    .from("contatos")
    .insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}`, cidade: "Toledo", uf: "PR" })
    .select("id")
    .single();
  const { data: neg, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
    .select("id")
    .single();
  if (error) throw error;
  return neg!.id;
}

async function venderAteObra(negocioId: string): Promise<string> {
  const ganho = await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", negocioId);
  if (ganho.error) throw ganho.error;
  const { data: contrato, error } = await vendedor.cliente
    .from("contratos")
    .insert({ empresa_id: empresa, negocio_id: negocioId, conteudo: "Contrato de teste" })
    .select("id")
    .single();
  if (error) throw error;
  const assinado = await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id);
  if (assinado.error) throw assinado.error;
  const pago = await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id });
  if (pago.error) throw pago.error;
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", negocioId).single();
  return o!.id;
}

const ve = async (u: Usuario, id: string) => {
  const { data } = await u.cliente.from("tarefas_setor").select("id").eq("id", id);
  return (data ?? []).length === 1;
};
const linha = async (id: string) => (await servico.from("tarefas_setor").select("*").eq("id", id).single()).data!;
const tipos = async (id: string) =>
  ((await servico.from("tarefas_setor_historico").select("tipo").eq("tarefa_id", id).order("id")).data ?? []).map((h) => h.tipo);

describe("tarefas de setor (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, vendedor2, engExec, engFora, engCoord, comprasExec, adminB] = await Promise.all(
      ["ts-admin", "ts-vendedor", "ts-vendedor2", "ts-eng-exec", "ts-eng-fora", "ts-eng-coord", "ts-compras", "ts-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Tarefas setor A ${sufixo}` }, { nome: `Tarefas setor B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;

    const operacao = { papel: "operacao" as const };
    const vinculos: [Usuario, string, object][] = [
      [admin, empresa, { papel: "admin" }],
      [vendedor, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [vendedor2, empresa, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engExec, empresa, operacao],
      [engFora, empresa, operacao],
      [engCoord, empresa, operacao],
      [comprasExec, empresa, operacao],
      [adminB, empresaB, { papel: "admin" }],
    ];
    const { data: linhas, error } = await servico
      .from("empresa_membros")
      .insert(vinculos.map(([u, emp, extra]) => ({ empresa_id: emp, user_id: u.id, ...extra })) as never)
      .select("id, user_id");
    if (error) throw error;
    for (const l of linhas!) membro[l.user_id] = l.id;

    const setores: [Usuario, unknown][] = [
      [engExec, [{ setor: "engenharia", capacidade: "executar" }]],
      [engFora, [{ setor: "engenharia", capacidade: "executar" }]],
      [engCoord, [{ setor: "engenharia", capacidade: "coordenar" }]],
      [comprasExec, [{ setor: "compras", capacidade: "executar" }]],
    ];
    for (const [alvo, s] of setores) {
      const { error: e } = await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[alvo.id], p_setores: s as never });
      if (e) throw e;
    }

    negocio = await novoNegocio(`Pedido ${sufixo}`);
    obra = await venderAteObra(await novoNegocio(`Obra ${sufixo}`));
    for (const [u, setor] of [
      [engExec, "engenharia"],
      [comprasExec, "compras"],
    ] as const) {
      const { error: e } = await admin.cliente.rpc("atribuir_participante_obra", {
        p_obra_id: obra,
        p_membro_id: membro[u.id],
        p_setor: setor,
        p_funcao: "apoio",
        p_principal: false,
      });
      if (e) throw e;
    }
  });

  it("vendedor pede o 3D à Engenharia no negócio; prazo no passado e setor comercial são recusados", async () => {
    const passado = await vendedor.cliente.rpc("criar_tarefa_setor", { p_setor: "engenharia", p_titulo: "3D", p_prazo: "2020-01-01", p_negocio_id: negocio });
    expect(passado.error?.message).toBe("O prazo não pode ser no passado.");
    const comercial = await vendedor.cliente.rpc("criar_tarefa_setor", { p_setor: "comercial", p_titulo: "3D", p_prazo: amanha(), p_negocio_id: negocio });
    expect(comercial.error?.message).toBe("Escolha Compras, Engenharia ou Operacional.");
    const { data, error } = await vendedor.cliente.rpc("criar_tarefa_setor", {
      p_setor: "engenharia",
      p_titulo: "Projeto 3D do telhado",
      p_descricao: "Cliente quer ver a disposição dos módulos",
      p_prazo: amanha(),
      p_negocio_id: negocio,
    });
    expect(error).toBeNull();
    pedido3d = data as string;
    expect(await linha(pedido3d)).toMatchObject({ status: "aberta", setor: "engenharia", responsavel_id: null, criado_por: membro[vendedor.id], origem: "manual" });
  });

  it("pedido do negócio: vê quem pediu, a Engenharia inteira e o admin; não vê Compras, outro vendedor nem outra empresa", async () => {
    for (const u of [vendedor, engExec, engFora, engCoord, admin]) expect(await ve(u, pedido3d)).toBe(true);
    for (const u of [comprasExec, vendedor2, adminB]) expect(await ve(u, pedido3d)).toBe(false);
  });

  it("a Operação não cria pedido no negócio (não tem acesso comercial)", async () => {
    const { error } = await engExec.cliente.rpc("criar_tarefa_setor", { p_setor: "compras", p_titulo: "Orçamento", p_prazo: amanha(), p_negocio_id: negocio });
    expect(error?.message).toBe("Você não pode criar tarefa aqui.");
  });

  it("contexto para a Operação: só número do negócio, cliente e cidade; quem não vê não recebe nada", async () => {
    const { data } = await engFora.cliente.rpc("contexto_tarefas_setor", { p_ids: [pedido3d] });
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ tarefa_id: pedido3d, obra_numero: null, cliente_nome: `Cliente Pedido ${sufixo}`, cidade: "Toledo", uf: "PR" });
    expect(data![0].negocio_numero).toBeGreaterThan(0);
    expect(Object.keys(data![0]).sort()).toEqual(["cidade", "cliente_nome", "negocio_numero", "obra_numero", "tarefa_id", "uf"]);
    expect((await comprasExec.cliente.rpc("contexto_tarefas_setor", { p_ids: [pedido3d] })).data).toEqual([]);
  });

  it("Compras não conclui pedido da Engenharia; executor não atribui; quem é da Engenharia assume", async () => {
    expect((await comprasExec.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: pedido3d })).error?.message).toBe("Tarefa não encontrada.");
    const atribuir = await engExec.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: pedido3d, p_membro_id: membro[engFora.id] });
    expect(atribuir.error?.message).toBe("Só o coordenador do setor ou o admin atribui a tarefa.");
    expect((await engFora.cliente.rpc("assumir_tarefa_setor", { p_tarefa_id: pedido3d })).error).toBeNull();
    expect((await linha(pedido3d)).responsavel_id).toBe(membro[engFora.id]);
  });

  it("conclui com resposta para quem pediu; quem pediu reabre; a resposta anterior fica no histórico", async () => {
    const { error } = await engFora.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: pedido3d, p_resposta: "3D enviado: https://exemplo.test/3d" });
    expect(error).toBeNull();
    const { data } = await vendedor.cliente.from("tarefas_setor").select("status, resposta, concluida_por").eq("id", pedido3d).single();
    expect(data).toEqual({ status: "concluida", resposta: "3D enviado: https://exemplo.test/3d", concluida_por: membro[engFora.id] });
    expect((await vendedor.cliente.rpc("reabrir_tarefa_setor", { p_tarefa_id: pedido3d })).error).toBeNull();
    expect(await linha(pedido3d)).toMatchObject({ status: "aberta", resposta: null, concluida_em: null });
    const { data: hist } = await vendedor.cliente.from("tarefas_setor_historico").select("tipo, dados, autor_membro_id").eq("tarefa_id", pedido3d).order("id");
    expect(hist!.map((h) => h.tipo)).toEqual(["criada", "assumida", "concluida", "reaberta"]);
    expect(hist![3]).toMatchObject({ dados: { resposta_anterior: "3D enviado: https://exemplo.test/3d" }, autor_membro_id: membro[vendedor.id] });
  });

  it("cancelamento: exige motivo; quem pediu cancela; cancelada não conclui", async () => {
    expect((await vendedor.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: pedido3d, p_motivo: " " })).error?.message).toBe(
      "Informe o motivo do cancelamento.",
    );
    expect((await engFora.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: pedido3d, p_motivo: "não precisa" })).error?.message).toBe(
      "Só quem pediu, o coordenador do setor ou o admin cancela a tarefa.",
    );
    expect((await vendedor.cliente.rpc("cancelar_tarefa_setor", { p_tarefa_id: pedido3d, p_motivo: "Cliente desistiu do 3D" })).error).toBeNull();
    expect(await linha(pedido3d)).toMatchObject({ status: "cancelada", motivo_cancelamento: "Cliente desistiu do 3D", cancelada_por: membro[vendedor.id] });
    expect((await engFora.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: pedido3d })).error?.message).toBe("Só tarefa aberta pode ser concluída.");
    expect(await tipos(pedido3d)).toEqual(["criada", "assumida", "concluida", "reaberta", "cancelada"]);
  });

  it("na obra, a Engenharia pede a Compras; tarefa interna: o vendedor da obra não vê", async () => {
    const { data, error } = await engExec.cliente.rpc("criar_tarefa_setor", {
      p_setor: "compras",
      p_titulo: "Comprar estrutura de fixação",
      p_prazo: amanha(),
      p_obra_id: obra,
    });
    expect(error).toBeNull();
    tarefaObra = data as string;
    for (const u of [engExec, comprasExec, admin]) expect(await ve(u, tarefaObra)).toBe(true);
    for (const u of [vendedor, vendedor2, engFora, engCoord, adminB]) expect(await ve(u, tarefaObra)).toBe(false);
  });

  it("quem não atua na obra não cria tarefa nela", async () => {
    const { error } = await engFora.cliente.rpc("criar_tarefa_setor", { p_setor: "compras", p_titulo: "X", p_prazo: amanha(), p_obra_id: obra });
    expect(error?.message).toBe("Você não pode criar tarefa aqui.");
  });

  it("coordenador da Engenharia vê e atribui tarefa de engenharia da obra a quem não participa; o responsável passa a ver e concluir", async () => {
    const { data: id, error } = await engExec.cliente.rpc("criar_tarefa_setor", {
      p_setor: "engenharia",
      p_titulo: "Cadastro do cliente no app e pedido de vistoria",
      p_prazo: amanha(),
      p_obra_id: obra,
    });
    expect(error).toBeNull();
    expect(await ve(engCoord, id as string)).toBe(true);
    expect(await ve(engFora, id as string)).toBe(false);
    const errado = await engCoord.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: id as string, p_membro_id: membro[comprasExec.id] });
    expect(errado.error?.message).toBe("O responsável precisa atuar nesse setor.");
    expect((await engCoord.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: id as string, p_membro_id: membro[engFora.id] })).error).toBeNull();
    expect(await ve(engFora, id as string)).toBe(true);
    expect((await engFora.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: id as string, p_resposta: "Vistoria pedida" })).error).toBeNull();
    expect(await tipos(id as string)).toEqual(["criada", "atribuida", "concluida"]);
  });

  it("ninguém escreve direto na tabela, nem admin nem service_role", async () => {
    const direto = await admin.cliente.from("tarefas_setor").update({ titulo: "Mudado" }).eq("id", tarefaObra).select("id");
    expect(direto.data ?? []).toEqual([]);
    const servicoUpdate = await servico.from("tarefas_setor").update({ titulo: "Mudado" }).eq("id", tarefaObra);
    expect(servicoUpdate.error).not.toBeNull();
    const servicoInsert = await servico.from("tarefas_setor").insert({ empresa_id: empresa, obra_id: obra, setor: "compras", titulo: "X", prazo: amanha() });
    expect(servicoInsert.error).not.toBeNull();
    expect((await servico.from("tarefas_setor_historico").delete().eq("tarefa_id", tarefaObra)).error).not.toBeNull();
    expect((await linha(tarefaObra)).titulo).toBe("Comprar estrutura de fixação");
  });

  it("tarefa de setor não gera evento de gamificação", async () => {
    const { data } = await servico.from("eventos").select("id").in("entidade_id", [pedido3d, tarefaObra]);
    expect(data).toEqual([]);
  });
});
