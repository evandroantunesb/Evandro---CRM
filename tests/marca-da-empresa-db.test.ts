/**
 * Marca da empresa (20261204100000_marca_da_empresa.sql): `marca_da_empresa` devolve as cores e as logos da identidade
 * da proposta a qualquer membro ativo da empresa, inclusive quem não tem acesso comercial (papel operacao), e nada a
 * outra empresa. A identidade completa continua só para o comercial. Precisa do Supabase local.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let operacao: Usuario;
let adminB: Usuario;
let empresa: string;

beforeAll(async () => {
  [admin, vendedor, operacao, adminB] = await Promise.all(["mar-admin", "mar-vendedor", "mar-operacao", "mar-admin-b"].map(criarUsuario));
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `Marca A ${sufixo}` }, { nome: `Marca B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  empresa = emps![0].id;
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    { empresa_id: empresa, user_id: operacao.id, papel: "operacao" },
    { empresa_id: emps![1].id, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
  const { error: ei } = await servico
    .from("proposta_identidades")
    .upsert({ empresa_id: empresa, cor_primaria: "#123C45", cor_destaque: "#0E9F8A", logo_url: `${empresa}/logo.png` } as never);
  if (ei) throw ei;
});

const marca = async (u: Usuario) => {
  const { data, error } = await u.cliente.rpc("marca_da_empresa", { p_empresa_id: empresa });
  if (error) throw error;
  return data ?? [];
};

describe("marca_da_empresa", () => {
  it("todo membro ativo lê as cores e a logo, inclusive a operação", async () => {
    for (const u of [admin, vendedor, operacao]) {
      expect(await marca(u)).toEqual([{ cor_primaria: "#123C45", cor_destaque: "#0E9F8A", logo_url: `${empresa}/logo.png`, logo_escuro_url: null }]);
    }
  });

  it("outra empresa não lê", async () => {
    expect(await marca(adminB)).toEqual([]);
  });

  it("a identidade completa continua fora do alcance da operação", async () => {
    const { data } = await operacao.cliente.from("proposta_identidades").select("empresa_id").eq("empresa_id", empresa);
    expect(data ?? []).toEqual([]);
  });
});
