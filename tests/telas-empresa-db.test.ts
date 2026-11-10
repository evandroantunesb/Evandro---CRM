/**
 * Telas por empresa (20261203100000_telas_empresa.sql): `empresa_telas` guarda as telas opcionais desligadas; os
 * membros leem, só o admin grava; só as oito chaves conhecidas; outra empresa não lê nem grava. `produto_da_empresa`
 * devolve o plano (solo/pro) só a membros, e PRO quando a empresa não tem plano. Precisa do Supabase local.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;

beforeAll(async () => {
  [admin, gestor, vendedor, adminB] = await Promise.all(["tel-admin", "tel-gestor", "tel-vendedor", "tel-admin-b"].map(criarUsuario));
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Telas A ${sufixo}` }, { nome: `Telas B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = emps![0].id;
  empresaB = emps![1].id;
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
});

const ler = async (u: Usuario, empresaId = empresa) => {
  const { data } = await u.cliente.from("empresa_telas").select("desligadas").eq("empresa_id", empresaId).maybeSingle();
  return data?.desligadas ?? null;
};
const gravar = (u: Usuario, desligadas: string[], empresaId = empresa) =>
  u.cliente.from("empresa_telas").upsert({ empresa_id: empresaId, desligadas }, { onConflict: "empresa_id" }).select("desligadas");

describe("empresa_telas", () => {
  it("admin grava; todos os membros leem", async () => {
    const { error } = await gravar(admin, ["forecast", "gamificacao"]);
    expect(error).toBeNull();
    expect(await ler(admin)).toEqual(["forecast", "gamificacao"]);
    expect(await ler(gestor)).toEqual(["forecast", "gamificacao"]);
    expect(await ler(vendedor)).toEqual(["forecast", "gamificacao"]);
  });

  it("só o admin grava", async () => {
    for (const u of [gestor, vendedor]) {
      await gravar(u, ["obras"]);
      await u.cliente.from("empresa_telas").update({ desligadas: ["obras"] }).eq("empresa_id", empresa);
    }
    expect(await ler(admin)).toEqual(["forecast", "gamificacao"]);
  });

  it("só as chaves conhecidas", async () => {
    const { error } = await gravar(admin, ["financeiro"]);
    expect(error).not.toBeNull();
    expect(await ler(admin)).toEqual(["forecast", "gamificacao"]);
  });

  it("outra empresa não lê nem grava", async () => {
    expect(await ler(adminB)).toBeNull();
    await gravar(adminB, []);
    await adminB.cliente.from("empresa_telas").update({ desligadas: [] }).eq("empresa_id", empresa);
    expect(await ler(admin)).toEqual(["forecast", "gamificacao"]);
  });

  it("registra quem mudou e a auditoria", async () => {
    const { data: linha } = await servico.from("empresa_telas").select("id, atualizado_por").eq("empresa_id", empresa).single();
    const { data: membro } = await servico.from("empresa_membros").select("id").eq("empresa_id", empresa).eq("user_id", admin.id).single();
    expect(linha!.atualizado_por).toBe(membro!.id);
    const { data: logs } = await servico.from("logs_auditoria").select("id").eq("entidade", "empresa_telas").eq("entidade_id", linha!.id);
    expect((logs ?? []).length).toBeGreaterThan(0);
  });
});

describe("produto_da_empresa", () => {
  const produto = async (u: Usuario, empresaId = empresa) => (await u.cliente.rpc("produto_da_empresa", { p_empresa_id: empresaId })).data;

  it("sem plano, PRO; com plano Solo, solo; fora da empresa, nulo", async () => {
    expect(await produto(vendedor)).toBe("pro");
    const { error } = await servico.from("planos_empresa").upsert({ empresa_id: empresa, produto: "solo" } as never);
    expect(error).toBeNull();
    expect(await produto(admin)).toBe("solo");
    expect(await produto(adminB)).toBeNull();
  });
});
