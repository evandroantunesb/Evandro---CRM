/**
 * Compras, setor que atende no lugar dele (20261211100000_compras_substituto_candidatos.sql): enquanto ninguém ativo
 * tem o setor Compras, quem atua no setor escolhido pelo admin entra na lista de candidatos (`membros_do_setor`) e conta
 * como quem atua em Compras (`membro_atua_no_setor`); com alguém em Compras, só ele; sem escolha, ninguém. Os demais
 * setores não mudam. Precisa do Supabase local. Os testes seguem em ordem.
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
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
let gestor: Usuario;
let adminB: Usuario;
let adm: Usuario; // atua no Administrativo
let comprador: Usuario; // atua em Compras
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};

const atua = async (quem: Usuario, setor: string, emp = empresa) =>
  (await noBanco("select public.membro_atua_no_setor($1, $2, $3::public.setor_obra) as ok", [emp, membro[quem.id], setor]))[0].ok as boolean;

const candidatos = async (quem: Usuario, setor = "compras") => {
  const { data, error } = await quem.cliente.rpc("membros_do_setor", { p_empresa_id: empresa, p_setor: setor as never });
  if (error) throw error;
  return (data ?? []).map((l) => l.membro_id).sort();
};

/** Só o admin define os setores de um membro (a tabela não aceita escrita direta). */
async function darSetor(quem: Usuario, setor: string) {
  const { error } = await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade: "executar" }] as never });
  if (error) throw error;
}

beforeAll(async () => {
  [admin, gestor, adminB, adm, comprador] = await Promise.all(["csc-admin", "csc-gestor", "csc-admin-b", "csc-adm", "csc-comprador"].map(criarUsuario));
  const { data: emps, error } = await servico
    .from("empresas")
    .insert([{ nome: `CSC A ${sufixo}` }, { nome: `CSC B ${sufixo}` }])
    .select("id, nome")
    .order("nome");
  if (error) throw error;
  [empresa, empresaB] = [emps![0].id, emps![1].id];
  const { error: e } = await servico.from("empresa_membros").insert([
    { empresa_id: empresa, user_id: admin.id, papel: "admin" },
    { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresa, user_id: adm.id, papel: "operacao" },
    { empresa_id: empresa, user_id: comprador.id, papel: "operacao" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ] as never);
  if (e) throw e;
  const { data: ms } = await servico.from("empresa_membros").select("id, user_id").in("empresa_id", [empresa, empresaB]);
  for (const m of ms ?? []) membro[m.user_id] = m.id;
  await darSetor(adm, "administrativo");
});

describe("Compras atendida no lugar dele: candidatos e quem atua", () => {
  it("sem escolha do admin, ninguém atua em Compras nem é candidato", async () => {
    expect(await atua(adm, "compras")).toBe(false);
    expect(await candidatos(admin)).toEqual([]);
  });

  it("com o Administrativo escolhido, ele é candidato e conta como quem atua em Compras", async () => {
    const r = await admin.cliente.rpc("definir_atendimento_compras", { p_empresa_id: empresa, p_setor: "administrativo" });
    expect(r.error).toBeNull();
    expect(await atua(adm, "compras")).toBe(true);
    expect(await candidatos(admin)).toEqual([membro[adm.id]]);
    expect(await candidatos(gestor)).toEqual([membro[adm.id]]);
  });

  it("os demais setores não mudam: o Administrativo segue no Administrativo e fora de Engenharia", async () => {
    expect(await atua(adm, "administrativo")).toBe(true);
    expect(await atua(adm, "engenharia")).toBe(false);
    expect(await candidatos(admin, "administrativo")).toEqual([membro[adm.id]]);
    expect(await candidatos(admin, "engenharia")).toEqual([]);
  });

  it("quem é só executor não recebe a lista (continua restrito a admin, gestor e coordenador)", async () => {
    expect(await candidatos(adm)).toEqual([]);
  });

  it("com alguém ativo em Compras, só ele: o substituto deixa de atuar e de ser candidato", async () => {
    await darSetor(comprador, "compras");
    expect(await atua(comprador, "compras")).toBe(true);
    expect(await atua(adm, "compras")).toBe(false);
    expect(await candidatos(admin)).toEqual([membro[comprador.id]]);
    // o Administrativo dele continua valendo no próprio setor
    expect(await atua(adm, "administrativo")).toBe(true);
  });

  it("sem o comprador ativo, a regra volta ao setor escolhido", async () => {
    await servico.from("empresa_membros").update({ ativo: false, status: "inativo" } as never).eq("id", membro[comprador.id]);
    expect(await atua(adm, "compras")).toBe(true);
    expect(await candidatos(admin)).toEqual([membro[adm.id]]);
  });

  it("outra empresa não enxerga nem herda a escolha", async () => {
    const { data } = await adminB.cliente.rpc("membros_do_setor", { p_empresa_id: empresa, p_setor: "compras" });
    expect(data ?? []).toEqual([]);
    expect(await atua(adm, "compras", empresaB)).toBe(false);
  });
});
