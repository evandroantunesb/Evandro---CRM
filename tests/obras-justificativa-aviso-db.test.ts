/**
 * Aviso no sininho da justificativa de atraso (20261107100000_obras_justificativa_aviso.sql): pedido e cobrança avisam
 * quem recebeu o pedido e o gestor da equipe dele; a resposta avisa quem pediu. Ninguém é avisado da própria ação.
 * Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Aviso just A" + sufixo, usuários "aviso-just-*" + sufixo). Os testes seguem em ordem.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { urlBancoLocal } from "./banco-local";
import { CLIENTE_CONTRATO, criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

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
let gestorOutro: Usuario;
let vendedor: Usuario;
let engenheiro: Usuario;
let empresa: string;
const membro: Record<string, string> = {};

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};

const avisos = async (quem: Usuario) =>
  (await quem.cliente.from("notificacoes").select("tipo, mensagem, link").eq("empresa_id", empresa).order("created_at")).data ?? [];

describe("Obras: aviso da justificativa de atraso (ordem importa)", { concurrent: false, shuffle: false }, () => {
  let obra: string;
  let numero: number;
  let justificativa: string;

  beforeAll(async () => {
    [admin, gestor, gestorOutro, vendedor, engenheiro] = await Promise.all(
      ["aviso-just-admin", "aviso-just-gestor", "aviso-just-gestor-2", "aviso-just-vendedor", "aviso-just-engenheiro"].map(criarUsuario),
    );
    const { data: emp } = ok(await servico.from("empresas").insert({ nome: `Aviso just A ${sufixo}` }).select("id").single(), "empresa");
    empresa = emp!.id;
    const vinculos: [Usuario, object][] = [
      [admin, { papel: "admin" }],
      [gestor, { papel: "gestor" }],
      [gestorOutro, { papel: "gestor" }],
      [vendedor, { papel: "vendedor", perfil_gamificacao: "closer" }],
      [engenheiro, { papel: "operacao" }],
    ];
    const { data: linhas } = ok(
      await servico
        .from("empresa_membros")
        .insert(vinculos.map(([u, extra]) => ({ empresa_id: empresa, user_id: u.id, ...extra })) as never)
        .select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[engenheiro.id], p_setores: [{ setor: "engenharia", capacidade: "executar" }] as never }), "setor");

    // O gestor coordena a equipe do engenheiro; o outro gestor coordena outra equipe.
    const { data: equipes } = ok(
      await servico.from("equipes").insert([{ empresa_id: empresa, nome: `Engenharia ${sufixo}` }, { empresa_id: empresa, nome: `Vendas ${sufixo}` }]).select("id, nome").order("nome"),
      "equipes",
    );
    const [eng, vendas] = equipes!;
    ok(
      await servico.from("equipe_membros").insert([
        { empresa_id: empresa, equipe_id: eng.id, membro_id: membro[gestor.id], e_gestor: true },
        { empresa_id: empresa, equipe_id: eng.id, membro_id: membro[engenheiro.id], e_gestor: false },
        { empresa_id: empresa, equipe_id: vendas.id, membro_id: membro[gestorOutro.id], e_gestor: true },
        { empresa_id: empresa, equipe_id: vendas.id, membro_id: membro[vendedor.id], e_gestor: false },
      ]),
      "equipe_membros",
    );

    // Obra paga, com o projeto atrasado (chegou há 20 dias úteis) e o engenheiro como responsável principal.
    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
    const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
    const { data: c } = await servico.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa, nome: "Cliente Aviso" }).select("id").single();
    const { data: neg } = ok(
      await servico
        .from("negocios")
        .insert({ empresa_id: empresa, titulo: "Aviso", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 30000 })
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
    const { data: o } = await servico.from("obras").select("id, numero").eq("negocio_id", neg!.id).single();
    obra = o!.id;
    numero = o!.numero;
    const [{ d: chegada }] = await noBanco(
      "select (select d::date::text from generate_series(current_date - 60, current_date, interval '1 day') d where public.somar_dias_uteis($1, d::date, 20) >= public.hoje_brasilia() order by d limit 1) as d",
      [empresa],
    );
    await noBanco("update public.obras set created_at = ($2::date + time '12:00') at time zone 'America/Sao_Paulo' where id = $1", [obra, chegada]);
    ok(
      await admin.cliente.rpc("atribuir_participante_obra", { p_obra_id: obra, p_membro_id: membro[engenheiro.id], p_setor: "engenharia", p_funcao: "responsavel", p_principal: true }),
      "responsável",
    );
  });

  it("pedido do admin: avisa o responsável e o gestor da equipe dele; o outro gestor e o admin não", async () => {
    const { data: id } = ok(await admin.cliente.rpc("pedir_justificativa_atraso", { p_obra_id: obra, p_etapa: "projeto" }), "pedido");
    justificativa = id!;
    const esperado = {
      tipo: "justificativa_atraso_pedida",
      mensagem: `Justificativa de atraso pedida: Projeto na obra nº ${numero} (Cliente Aviso).`,
      link: `/obras/${obra}#atrasos`,
    };
    expect(await avisos(engenheiro)).toEqual([esperado]);
    expect(await avisos(gestor)).toEqual([esperado]);
    for (const quem of [admin, gestorOutro, vendedor]) expect(await avisos(quem), quem.email).toEqual([]);
  });

  it("cobrança do gestor: avisa o responsável de novo; o gestor não recebe o aviso da própria cobrança", async () => {
    ok(await gestor.cliente.rpc("pedir_justificativa_atraso", { p_obra_id: obra, p_etapa: "projeto" }), "cobrança");
    expect((await avisos(engenheiro)).map((a) => a.tipo)).toEqual(["justificativa_atraso_pedida", "justificativa_atraso_cobrada"]);
    expect((await avisos(gestor)).map((a) => a.tipo)).toEqual(["justificativa_atraso_pedida"]);
    expect(await avisos(admin)).toEqual([]);
  });

  it("resposta: avisa quem pediu; quem respondeu não recebe", async () => {
    ok(await engenheiro.cliente.rpc("responder_justificativa_atraso", { p_justificativa_id: justificativa, p_texto: "Cliente atrasou a documentação." }), "resposta");
    expect(await avisos(admin)).toEqual([
      { tipo: "justificativa_atraso_respondida", mensagem: `Justificativa de atraso respondida: Projeto na obra nº ${numero} (Cliente Aviso).`, link: `/obras/${obra}#atrasos` },
    ]);
    expect((await avisos(engenheiro)).map((a) => a.tipo)).toEqual(["justificativa_atraso_pedida", "justificativa_atraso_cobrada"]);
    expect((await avisos(gestor)).map((a) => a.tipo)).toEqual(["justificativa_atraso_pedida"]);
  });

  it("gestor inativo não recebe", async () => {
    await noBanco("update public.empresa_membros set ativo = false where id = $1", [membro[gestor.id]]);
    // Nova pendência na mesma etapa: o pedido anterior já foi respondido.
    ok(await admin.cliente.rpc("pedir_justificativa_atraso", { p_obra_id: obra, p_etapa: "projeto" }), "novo pedido");
    const [{ n }] = await noBanco("select count(*)::int as n from public.notificacoes where membro_id = $1 and tipo = 'justificativa_atraso_pedida'", [membro[gestor.id]]);
    expect(n).toBe(1);
    expect((await avisos(engenheiro)).map((a) => a.tipo)).toEqual(["justificativa_atraso_pedida", "justificativa_atraso_cobrada", "justificativa_atraso_pedida"]);
  });
});
