/**
 * Limite de usuários do plano (20261210100000_limite_usuarios_plano.sql): `limite_usuarios_empresa` devolve o número só
 * ao admin ativo da própria empresa; os demais papéis e outra empresa recebem nulo. Precisa do Supabase local.
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const anonimo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

let admin: Usuario;
let gestor: Usuario;
let adminB: Usuario;
let empresa: string;

beforeAll(async () => {
  [admin, gestor, adminB] = await Promise.all(["lim-admin", "lim-gestor", "lim-admin-b"].map(criarUsuario));
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Limite A ${sufixo}` }, { nome: `Limite B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = emps![0].id;
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: emps![1].id, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
  const { error: ep } = await servico.from("planos_empresa").upsert({ empresa_id: empresa, limite_usuarios: 7 } as never);
  if (ep) throw ep;
});

const limite = async (u: Usuario) => {
  const { data, error } = await u.cliente.rpc("limite_usuarios_empresa", { p_empresa_id: empresa });
  if (error) throw error;
  return data;
};

describe("limite_usuarios_empresa", () => {
  it("o admin da empresa lê o limite do plano", async () => {
    expect(await limite(admin)).toBe(7);
  });

  it("gestor e admin de outra empresa recebem nulo", async () => {
    expect(await limite(gestor)).toBeNull();
    expect(await limite(adminB)).toBeNull();
  });

  it("plano sem limite devolve nulo", async () => {
    await servico.from("planos_empresa").update({ limite_usuarios: null } as never).eq("empresa_id", empresa);
    expect(await limite(admin)).toBeNull();
  });

  it("sem login não chama", async () => {
    const { error } = await anonimo.rpc("limite_usuarios_empresa", { p_empresa_id: empresa });
    expect(error).not.toBeNull();
  });
});
