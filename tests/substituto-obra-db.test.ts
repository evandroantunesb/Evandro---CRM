/**
 * Substituto por obra (20261123100000_substituto_obra.sql): no máximo um substituto ativo por setor na obra (trocar é
 * substituir); o substituto age no setor, aparece em `minhas_substituicoes`, recebe os avisos das tarefas do principal
 * e o pedido de justificativa de atraso, e pode responder no lugar dele. Precisa do Supabase local (roda no CI).
 * Os testes seguem em ordem (cada um parte do estado do anterior).
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
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
let vendedor: Usuario;
let principal: Usuario;
let substituto: Usuario;
let outro: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let obra: string;
let participacaoSubstituto: string;
let tarefa: string;

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

async function criarObra(titulo: string): Promise<string> {
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: neg } = ok(
    await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
      .select("id")
      .single(),
    "negócio",
  );
  ok(await vendedor.cliente.from("negocios").update({ status: "ganho" }).eq("id", neg!.id), "ganho");
  const { data: contrato } = ok(
    await vendedor.cliente.from("contratos").insert({ empresa_id: empresa, negocio_id: neg!.id, conteudo: "Contrato de teste" }).select("id").single(),
    "contrato",
  );
  ok(await vendedor.cliente.from("contratos").update({ status: "assinado" }).eq("id", contrato!.id), "assinatura");
  ok(await admin.cliente.rpc("confirmar_pagamento", { p_contrato_id: contrato!.id }), "pagamento");
  const { data: o } = await servico.from("obras").select("id").eq("negocio_id", neg!.id).single();
  return o!.id;
}

const atribuir = (alvo: Usuario, extra: Record<string, unknown> = {}) =>
  admin.cliente.rpc("atribuir_participante_obra", { p_obra_id: obra, p_membro_id: membro[alvo.id], p_setor: "engenharia", ...extra } as never);

const avisos = async (quem: Usuario, tipo: string) =>
  (await servico.from("notificacoes").select("mensagem").eq("membro_id", membro[quem.id]).eq("tipo", tipo)).data ?? [];

describe("substituto por obra (ordem importa)", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, vendedor, principal, substituto, outro] = await Promise.all(["so-admin", "so-vendedor", "so-principal", "so-substituto", "so-outro"].map(criarUsuario));
    const { data: e } = ok(await servico.from("empresas").insert({ nome: `Substituto ${sufixo}` }).select("id").single(), "empresa");
    empresa = e!.id;
    const vinculos: [Usuario, object][] = [
      [admin, { papel: "admin" }],
      [vendedor, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [principal, { papel: "operacao" }],
      [substituto, { papel: "operacao" }],
      [outro, { papel: "operacao" }],
    ];
    const { data: linhas } = ok(
      await servico
        .from("empresa_membros")
        .insert(vinculos.map(([u, extra]) => ({ empresa_id: empresa, user_id: u.id, ...extra })) as never)
        .select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const quem of [principal, substituto, outro]) {
      ok(
        await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor: "engenharia", capacidade: "executar" }] as never }),
        "setor",
      );
    }
    obra = await criarObra("Substituto");
    ok(await atribuir(principal, { p_funcao: "responsavel", p_principal: true }), "principal");
  });

  it("um substituto por setor na obra; trocar é substituir; principal e substituto são pessoas diferentes", async () => {
    const { data: id } = ok(await atribuir(substituto, { p_funcao: "substituto" }), "substituto");
    participacaoSubstituto = id as string;
    expect((await atribuir(outro, { p_funcao: "substituto" })).error?.message).toContain("já tem um substituto");
    expect((await atribuir(principal, { p_funcao: "substituto" })).error?.message).toContain("não pode ser o próprio substituto");
    expect((await atribuir(substituto, { p_funcao: "responsavel", p_principal: true })).error?.message).toMatch(/já tem um responsável principal|é o substituto/);

    // Troca: o outro entra no lugar e depois devolve.
    const { data: troca } = ok(await atribuir(outro, { p_funcao: "substituto", p_substitui_id: participacaoSubstituto }), "troca");
    const { data: volta } = ok(await atribuir(substituto, { p_funcao: "substituto", p_substitui_id: troca as string }), "volta");
    participacaoSubstituto = volta as string;
    const { data: ativos } = await servico.from("obra_participantes").select("membro_id").eq("obra_id", obra).eq("funcao", "substituto").is("fim", null);
    expect(ativos).toEqual([{ membro_id: membro[substituto.id] }]);
  });

  it("o substituto age no setor e sabe onde substitui; os outros não", async () => {
    ok(await substituto.cliente.rpc("definir_aguardando_fluxo_obra", { p_obra_id: obra, p_setor: "engenharia", p_aguardando: "cliente" }), "aguardando");
    ok(await substituto.cliente.rpc("definir_aguardando_fluxo_obra", { p_obra_id: obra, p_setor: "engenharia" }), "sem aguardar");
    expect((await substituto.cliente.rpc("minhas_substituicoes", { p_empresa_id: empresa })).data).toEqual([
      { obra_id: obra, setor: "engenharia", principal_id: membro[principal.id] },
    ]);
    for (const quem of [principal, outro, vendedor]) expect((await quem.cliente.rpc("minhas_substituicoes", { p_empresa_id: empresa })).data, quem.email).toEqual([]);
  });

  it("tarefa atribuída ao principal: o substituto recebe o aviso junto; atribuída a outra pessoa, não", async () => {
    const { data: id } = ok(
      await admin.cliente.rpc("criar_tarefa_setor", { p_setor: "engenharia", p_titulo: "Revisar projeto", p_prazo: "2099-01-01", p_obra_id: obra }),
      "tarefa",
    );
    tarefa = id as string;
    ok(await admin.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: tarefa, p_membro_id: membro[principal.id] }), "atribuir ao principal");
    expect(await avisos(principal, "tarefa_setor_atribuida")).toEqual([{ mensagem: "Tarefa de Engenharia atribuída a você: Revisar projeto" }]);
    expect(await avisos(substituto, "tarefa_setor_atribuida")).toEqual([{ mensagem: "Tarefa de Engenharia na obra em que você é substituto: Revisar projeto" }]);

    const { data: outra } = ok(
      await admin.cliente.rpc("criar_tarefa_setor", { p_setor: "engenharia", p_titulo: "Outra", p_prazo: "2099-01-01", p_obra_id: obra, p_responsavel_id: membro[outro.id] }),
      "tarefa do outro",
    );
    ok(await admin.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: outra as string, p_membro_id: membro[principal.id] }), "ao principal");
    ok(await admin.cliente.rpc("atribuir_tarefa_setor", { p_tarefa_id: outra as string, p_membro_id: membro[outro.id] }), "de volta ao outro");
    // Só os dois avisos das atribuições ao principal.
    expect(await avisos(substituto, "tarefa_setor_atribuida")).toHaveLength(2);
  });

  it("o substituto conclui a tarefa do principal; reaberta, recebe o aviso de novo", async () => {
    ok(await substituto.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: tarefa, p_resposta: "Feito pelo substituto" }), "concluir");
    ok(await admin.cliente.rpc("reabrir_tarefa_setor", { p_tarefa_id: tarefa }), "reabrir");
    expect(await avisos(substituto, "tarefa_setor_reaberta")).toEqual([{ mensagem: "Tarefa reaberta na obra em que você é substituto: Revisar projeto" }]);
  });

  it("justificativa de atraso: pedida ao principal, o substituto recebe o aviso e responde; outro do setor não", async () => {
    // A obra chegou há 20 dias úteis: o projeto (Engenharia) já devia ter acabado.
    const [{ d: chegada }] = await noBanco(
      "select (select d::date::text from generate_series(current_date - 60, current_date, interval '1 day') d where public.somar_dias_uteis($1, d::date, 20) >= public.hoje_brasilia() order by d limit 1) as d",
      [empresa],
    );
    await noBanco("update public.obras set created_at = ($2::date + time '12:00') at time zone 'America/Sao_Paulo' where id = $1", [obra, chegada]);
    const { data: id } = ok(await admin.cliente.rpc("pedir_justificativa_atraso", { p_obra_id: obra, p_etapa: "projeto" }), "pedido");

    const { data: j } = await servico.from("obra_justificativas_atraso").select("pedido_a").eq("id", id as string).single();
    expect(j!.pedido_a).toBe(membro[principal.id]);
    expect(await avisos(substituto, "justificativa_atraso_pedida")).toHaveLength(1);
    expect(await avisos(outro, "justificativa_atraso_pedida")).toHaveLength(0);

    const responder = (quem: Usuario) =>
      quem.cliente.rpc("responder_justificativa_atraso", { p_justificativa_id: id as string, p_texto: "Cliente atrasou o envio dos documentos." });
    expect((await responder(outro)).error?.code).toBe("42501");
    ok(await responder(substituto), "resposta");
    const { data: respondida } = await servico.from("obra_justificativas_atraso").select("respondido_por").eq("id", id as string).single();
    expect(respondida!.respondido_por).toBe(membro[substituto.id]);
  });

  it("encerrada a substituição, o ex-substituto deixa de aparecer e não recebe mais avisos", async () => {
    ok(await admin.cliente.rpc("encerrar_participante_obra", { p_participante_id: participacaoSubstituto, p_motivo: "Fim da cobertura" }), "encerrar");
    expect((await substituto.cliente.rpc("minhas_substituicoes", { p_empresa_id: empresa })).data).toEqual([]);
    ok(await principal.cliente.rpc("concluir_tarefa_setor", { p_tarefa_id: tarefa }), "concluir");
    ok(await admin.cliente.rpc("reabrir_tarefa_setor", { p_tarefa_id: tarefa }), "reabrir");
    expect(await avisos(substituto, "tarefa_setor_reaberta")).toHaveLength(1);
  });
});
