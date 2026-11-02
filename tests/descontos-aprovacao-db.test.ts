/**
 * Aprovação de desconto (20261102200000_descontos_aprovacao.sql), com as regras do Evandro (01/11/2026): vendedor
 * com 5% e gestor com 10% — até 5% o vendedor não pede; acima, o gestor da equipe aprova até 10% e, acima disso, só o
 * admin; pedido do gestor acima do limite dele só o admin decide; ninguém decide o próprio pedido; um pedido novo
 * cancela o pendente; quem pode decidir é notificado, e quem pediu recebe a decisão. Precisa do Supabase local.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let gestorOutro: Usuario;
let vendedor: Usuario;
let adminB: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let negocio: string;

beforeAll(async () => {
  [admin, gestor, gestorOutro, vendedor, adminB] = await Promise.all(
    ["dsc-admin", "dsc-gestor", "dsc-gestor-outro", "dsc-vendedor", "dsc-admin-b"].map(criarUsuario),
  );
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Descontos A ${sufixo}` }, { nome: `Descontos B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = emps![0].id;
  const { data: linhas, error: e } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: gestorOutro.id, papel: "gestor" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: emps![1].id, user_id: adminB.id, papel: "admin" },
    ] as never)
    .select("id, user_id");
  if (e) throw e;
  for (const l of linhas!) membro[l.user_id] = l.id;

  const { data: equipes } = await servico
    .from("equipes")
    .insert([{ empresa_id: empresa, nome: `Equipe 1 ${sufixo}` }, { empresa_id: empresa, nome: `Equipe 2 ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  const { error: erroEquipe } = await servico.from("equipe_membros").insert([
    { equipe_id: equipes![0].id, empresa_id: empresa, membro_id: membro[gestor.id], e_gestor: true },
    { equipe_id: equipes![0].id, empresa_id: empresa, membro_id: membro[vendedor.id], e_gestor: false },
    { equipe_id: equipes![1].id, empresa_id: empresa, membro_id: membro[gestorOutro.id], e_gestor: true },
  ]);
  if (erroEquipe) throw erroEquipe;
  await servico
    .from("condicoes_pagamento_preferencias")
    .insert({ empresa_id: empresa, desconto_max_vendedor: 5, desconto_max_gestor: 10 });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente desconto" }).select("id").single();
  const { data: n } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Desconto ${sufixo}`, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id] })
    .select("id")
    .single();
  negocio = n!.id;
});

const pedir = (u: Usuario, percentual: number, motivo = "Cliente tem orçamento menor") =>
  u.cliente.rpc("solicitar_desconto", { p_negocio_id: negocio, p_percentual: percentual, p_motivo: motivo });
const decidir = (u: Usuario, id: string, aprovar: boolean, motivo = "") => u.cliente.rpc("decidir_desconto", { p_id: id, p_aprovar: aprovar, p_motivo: motivo });
const pedido = async (id: string) => {
  const { data } = await servico.from("descontos_solicitacoes").select("status, decidido_por, motivo_decisao").eq("id", id).single();
  return data!;
};
/** Quem recebeu a notificação do tipo sobre aquele percentual (a mensagem traz "N%"). */
const notificados = async (tipo: string, percentual: number) => {
  const { data } = await servico.from("notificacoes").select("membro_id, mensagem").eq("empresa_id", empresa).eq("tipo", tipo);
  return (data ?? []).filter((n) => n.mensagem.includes(` ${percentual}% `)).map((n) => n.membro_id).sort();
};

describe("aprovação de desconto (ordem importa)", { concurrent: false, shuffle: false }, () => {
  it("cada um vê o próprio limite; admin sem limite", async () => {
    const limite = async (u: Usuario) => Number((await u.cliente.rpc("meu_limite_desconto", { p_empresa_id: empresa })).data);
    expect(await limite(vendedor)).toBe(5);
    expect(await limite(gestor)).toBe(10);
    expect(await limite(admin)).toBe(100);
  });

  it("dentro do limite não se pede aprovação", async () => {
    const r = await pedir(vendedor, 5);
    expect(r.error?.message).toMatch(/dentro do seu limite \(5%\)/);
  });

  it("vendedor pede 8%: admin e o gestor da equipe são avisados (o outro gestor não); o gestor aprova", async () => {
    const r = await pedir(vendedor, 8);
    expect(r.error).toBeNull();
    const id = r.data as string;
    expect(await notificados("desconto_solicitado", 8)).toEqual([membro[admin.id], membro[gestor.id]].sort());

    expect((await decidir(vendedor, id, true)).error?.message).toMatch(/próprio pedido|não encontrado/);
    expect((await decidir(gestorOutro, id, true)).error?.message).toMatch(/não encontrado/);
    expect((await gestor.cliente.rpc("posso_decidir_desconto", { p_id: id })).data).toBe(true);

    expect((await decidir(gestor, id, true)).error).toBeNull();
    expect(await pedido(id)).toMatchObject({ status: "aprovado", decidido_por: membro[gestor.id] });
    expect(await notificados("desconto_decidido", 8)).toEqual([membro[vendedor.id]]);
    expect((await decidir(admin, id, false, "Mudei de ideia")).error?.message).toMatch(/já foi decidido/);
  });

  it("vendedor pede 12%: passa do limite do gestor, só o admin decide; recusa exige motivo", async () => {
    const id = (await pedir(vendedor, 12)).data as string;
    expect(await notificados("desconto_solicitado", 12)).toEqual([membro[admin.id]]);
    expect((await gestor.cliente.rpc("posso_decidir_desconto", { p_id: id })).data).toBe(false);
    expect((await decidir(gestor, id, true)).error?.message).toMatch(/passa do seu limite/);
    expect((await decidir(admin, id, false)).error?.message).toMatch(/motivo da recusa/);
    expect((await decidir(admin, id, false, "Margem não permite")).error).toBeNull();
    expect(await pedido(id)).toMatchObject({ status: "recusado", motivo_decisao: "Margem não permite" });
  });

  it("pedido novo cancela o pendente anterior", async () => {
    const primeiro = (await pedir(vendedor, 7)).data as string;
    const segundo = (await pedir(vendedor, 9)).data as string;
    expect((await pedido(primeiro)).status).toBe("cancelado");
    expect((await pedido(segundo)).status).toBe("pendente");
    expect((await decidir(admin, primeiro, true)).error?.message).toMatch(/já foi decidido ou cancelado/);
  });

  it("gestor pede acima do limite dele: só o admin decide", async () => {
    const id = (await pedir(gestor, 15)).data as string;
    expect((await decidir(gestor, id, true)).error?.message).toMatch(/próprio pedido/);
    expect((await decidir(admin, id, true)).error).toBeNull();
  });

  it("ninguém grava direto na tabela, e outra empresa não vê os pedidos", async () => {
    const direto = await admin.cliente
      .from("descontos_solicitacoes")
      .insert({ empresa_id: empresa, negocio_id: negocio, solicitado_por: membro[admin.id], percentual: 50, motivo: "teste" });
    expect(direto.error).not.toBeNull();
    const { data } = await adminB.cliente.from("descontos_solicitacoes").select("id").eq("negocio_id", negocio);
    expect(data).toEqual([]);
    const fora = await adminB.cliente.rpc("solicitar_desconto", { p_negocio_id: negocio, p_percentual: 20, p_motivo: "fora" });
    expect(fora.error?.message).toMatch(/não pode pedir/);
  });
});
