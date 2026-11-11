/**
 * Assistente de primeiro acesso (20261205100000_assistente_primeiro_acesso.sql): o super-admin cria o estado do
 * assistente junto com a empresa; só o admin da empresa lê e avança; concluído não volta a pendente; o admin grava o
 * CNPJ da própria empresa por `salvar_cnpj_empresa`; a foto da faixa só na pasta da própria empresa. Precisa do
 * Supabase local.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let superAdmin: Usuario;
let admin: Usuario;
let vendedor: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;

beforeAll(async () => {
  [superAdmin, admin, vendedor, adminB] = await Promise.all(["ass-super", "ass-admin", "ass-vendedor", "ass-admin-b"].map(criarUsuario));
  await servico.from("plataforma_admins").insert({ user_id: superAdmin.id });
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Assistente A ${sufixo}` }, { nome: `Assistente B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = emps![0].id;
  empresaB = emps![1].id;
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
});

const ler = async (u: Usuario) => {
  const { data } = await u.cliente.from("empresa_onboarding").select("passo_atual, pulados, concluido_em").eq("empresa_id", empresa).maybeSingle();
  return data;
};

describe("empresa_onboarding", () => {
  it("o super-admin cria; só o admin da empresa lê", async () => {
    const { error } = await superAdmin.cliente.from("empresa_onboarding").insert({ empresa_id: empresa });
    expect(error).toBeNull();
    expect(await ler(admin)).toEqual({ passo_atual: 1, pulados: [], concluido_em: null });
    expect(await ler(vendedor)).toBeNull();
    expect(await ler(adminB)).toBeNull();
  });

  it("o admin avança e pula; os outros não mexem", async () => {
    const { error } = await admin.cliente.from("empresa_onboarding").update({ passo_atual: 3, pulados: [2] }).eq("empresa_id", empresa);
    expect(error).toBeNull();
    await vendedor.cliente.from("empresa_onboarding").update({ passo_atual: 7 }).eq("empresa_id", empresa);
    await adminB.cliente.from("empresa_onboarding").update({ passo_atual: 7 }).eq("empresa_id", empresa);
    expect(await ler(admin)).toEqual({ passo_atual: 3, pulados: [2], concluido_em: null });
  });

  it("concluído não volta a pendente", async () => {
    await admin.cliente.from("empresa_onboarding").update({ concluido_em: new Date().toISOString() }).eq("empresa_id", empresa);
    expect((await ler(admin))?.concluido_em).not.toBeNull();
    const { error } = await admin.cliente.from("empresa_onboarding").update({ concluido_em: null }).eq("empresa_id", empresa);
    expect(error).not.toBeNull();
    expect((await ler(admin))?.concluido_em).not.toBeNull();
  });
});

describe("salvar_cnpj_empresa", () => {
  const cnpj = async () => (await servico.from("empresas").select("cnpj").eq("id", empresa).single()).data!.cnpj;

  it("o admin grava o CNPJ da própria empresa; o vendedor e outra empresa não", async () => {
    expect((await admin.cliente.rpc("salvar_cnpj_empresa", { p_empresa_id: empresa, p_cnpj: "12345678000190" })).error).toBeNull();
    expect(await cnpj()).toBe("12345678000190");
    expect((await vendedor.cliente.rpc("salvar_cnpj_empresa", { p_empresa_id: empresa, p_cnpj: "11111111000111" })).error).not.toBeNull();
    expect((await adminB.cliente.rpc("salvar_cnpj_empresa", { p_empresa_id: empresa, p_cnpj: "11111111000111" })).error).not.toBeNull();
    expect(await cnpj()).toBe("12345678000190");
  });

  it("tamanho errado é recusado; vazio limpa", async () => {
    expect((await admin.cliente.rpc("salvar_cnpj_empresa", { p_empresa_id: empresa, p_cnpj: "123" })).error).not.toBeNull();
    expect((await admin.cliente.rpc("salvar_cnpj_empresa", { p_empresa_id: empresa, p_cnpj: "" })).error).toBeNull();
    expect(await cnpj()).toBeNull();
  });
});

describe("faixa da tela de entrada", () => {
  it("só na pasta da própria empresa", async () => {
    const ok = await admin.cliente
      .from("empresa_tela_entrada")
      .upsert({ empresa_id: empresa, faixa_caminho: `${empresa}/faixa.jpg`, faixa_usa_entrada: false }, { onConflict: "empresa_id" });
    expect(ok.error).toBeNull();
    const ruim = await admin.cliente
      .from("empresa_tela_entrada")
      .upsert({ empresa_id: empresa, faixa_caminho: `${empresaB}/faixa.jpg` }, { onConflict: "empresa_id" });
    expect(ruim.error).not.toBeNull();
  });
});
