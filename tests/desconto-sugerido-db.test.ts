/**
 * Compras P4c (20261202100000_desconto_sobre_sugerido.sql): o pedido de desconto guarda o preço sugerido do momento;
 * quem pediu cancela o próprio pedido pendente (ninguém mais, e o valor do negócio não muda); a fila "Descontos para
 * aprovar" do Início lista só o que quem está logado pode decidir (gestor da equipe até o limite dele, ou admin; nunca
 * outra empresa). Vendedor 5% e gestor 10%, como em descontos-aprovacao-db. Precisa do Supabase local.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let gestorOutro: Usuario;
let vendedor: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let negocio: string;

beforeAll(async () => {
  [admin, gestor, gestorOutro, vendedor, adminB] = await Promise.all(
    ["dss-admin", "dss-gestor", "dss-gestor-outro", "dss-vendedor", "dss-admin-b"].map(criarUsuario),
  );
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Desconto sugerido A ${sufixo}` }, { nome: `Desconto sugerido B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = emps![0].id;
  empresaB = emps![1].id;
  const { data: linhas, error: e } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: gestorOutro.id, papel: "gestor" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
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
  const { error: erroPref } = await servico
    .from("condicoes_pagamento_preferencias")
    .insert({ empresa_id: empresa, desconto_max_vendedor: 5, desconto_max_gestor: 10 });
  if (erroPref) throw erroPref;

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente sugerido" }).select("id").single();
  const { data: n, error: erroNegocio } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Sugerido ${sufixo}`, contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id], valor: 21000 })
    .select("id")
    .single();
  if (erroNegocio) throw erroNegocio;
  negocio = n!.id;
});

const pedir = (u: Usuario, percentual: number, motivo = "Cliente fecha com este valor") =>
  u.cliente.rpc("solicitar_desconto", { p_negocio_id: negocio, p_percentual: percentual, p_motivo: motivo });
const lerPedido = async (id: string) => {
  const { data } = await servico.from("descontos_solicitacoes").select("status, preco_sugerido, decidido_por, motivo_decisao").eq("id", id).single();
  return data!;
};
const fila = async (u: Usuario, empresaId = empresa) => {
  const { data, error } = await u.cliente.rpc("descontos_para_aprovar", { p_empresa_id: empresaId });
  if (error) throw error;
  return data ?? [];
};

describe("pedido guarda o preço sugerido do momento", () => {
  it("sem sugerido, nulo; com sugerido, o valor da tabela", async () => {
    const sem = await pedir(vendedor, 6);
    expect(sem.error).toBeNull();
    expect((await lerPedido(sem.data!)).preco_sugerido).toBeNull();

    const { error } = await servico.from("negocio_precificacao").upsert({ negocio_id: negocio, empresa_id: empresa, preco_sugerido: 22771.56 });
    expect(error).toBeNull();
    const com = await pedir(vendedor, 7.78);
    expect(com.error).toBeNull();
    expect(Number((await lerPedido(com.data!)).preco_sugerido)).toBe(22771.56);
    // O pedido anterior foi substituído.
    expect((await lerPedido(sem.data!)).status).toBe("cancelado");
  });
});

describe("descontos para aprovar (Início)", () => {
  it("gestor da equipe e admin veem o pedido; o outro gestor, o vendedor e outra empresa não", async () => {
    const { data: id } = await pedir(vendedor, 8);
    const doGestor = await fila(gestor);
    expect(doGestor.map((d) => d.id)).toEqual([id]);
    expect(doGestor[0].titulo).toBe(`Sugerido ${sufixo}`);
    expect(Number(doGestor[0].percentual)).toBe(8);
    expect(Number(doGestor[0].preco_sugerido)).toBe(22771.56);
    expect((await fila(admin)).map((d) => d.id)).toEqual([id]);
    expect(await fila(gestorOutro)).toEqual([]);
    expect(await fila(vendedor)).toEqual([]);
    expect(await fila(adminB, empresa)).toEqual([]);
    expect(await fila(adminB, empresaB)).toEqual([]);
  });

  it("acima do limite do gestor, só o admin", async () => {
    const { data: id } = await pedir(vendedor, 12);
    expect(await fila(gestor)).toEqual([]);
    expect((await fila(admin)).map((d) => d.id)).toEqual([id]);
  });
});

describe("cancelar o pedido", () => {
  it("só quem pediu cancela; o valor do negócio não muda; decidido não cancela de novo", async () => {
    const { data: id } = await pedir(vendedor, 9);
    const doGestor = await gestor.cliente.rpc("cancelar_desconto", { p_id: id! });
    expect(doGestor.error?.message).toBe("Pedido de desconto não encontrado.");
    const deOutraEmpresa = await adminB.cliente.rpc("cancelar_desconto", { p_id: id! });
    expect(deOutraEmpresa.error?.message).toBe("Pedido de desconto não encontrado.");

    const { error } = await vendedor.cliente.rpc("cancelar_desconto", { p_id: id! });
    expect(error).toBeNull();
    const p = await lerPedido(id!);
    expect(p.status).toBe("cancelado");
    expect(p.decidido_por).toBe(membro[vendedor.id]);
    expect(p.motivo_decisao).toBe("Cancelado por quem pediu.");
    const { data: n } = await servico.from("negocios").select("valor").eq("id", negocio).single();
    expect(Number(n!.valor)).toBe(21000);
    expect(await fila(admin)).toEqual([]);

    const deNovo = await vendedor.cliente.rpc("cancelar_desconto", { p_id: id! });
    expect(deNovo.error?.message).toBe("Este pedido já foi decidido ou cancelado.");
  });
});
