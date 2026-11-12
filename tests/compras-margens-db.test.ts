/**
 * Compras, P4a (20261130100000_compras_margens.sql): margem por categoria (editam admin e gestor; veem os que veem a
 * tabela de preços) e potência do material. Precisa do Supabase local (CI).
 *
 * Cenário próprio ("Margens A/B" + sufixo, usuários "cmg-*" + sufixo).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let comprador: Usuario;
let administrativo: Usuario;
let operacional: Usuario;
let adminB: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};

const ok = <T extends { error: unknown }>(r: T, contexto: string): T => {
  if (r.error) throw new Error(`${contexto}: ${JSON.stringify(r.error)}`);
  return r;
};
const margens = async (quem: Usuario, emp = empresa) =>
  Object.fromEntries(((await quem.cliente.from("compras_margens").select("categoria, margem").eq("empresa_id", emp)).data ?? []).map((m) => [m.categoria, Number(m.margem)]));

describe("Compras: margens por categoria e potência do material", { concurrent: false, shuffle: false }, () => {
  beforeAll(async () => {
    [admin, gestor, comprador, administrativo, operacional, adminB] = await Promise.all(
      ["cmg-admin", "cmg-gestor", "cmg-comprador", "cmg-administrativo", "cmg-operacional", "cmg-admin-b"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Margens A ${sufixo}` }, { nome: `Margens B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    empresaB = empresas![1].id;
    const vinculos: [Usuario, string, string][] = [
      [admin, empresa, "admin"],
      [gestor, empresa, "gestor"],
      [comprador, empresa, "operacao"],
      [administrativo, empresa, "operacao"],
      [operacional, empresa, "operacao"],
      [adminB, empresaB, "admin"],
    ];
    const { data: linhas } = ok(
      await servico.from("empresa_membros").insert(vinculos.map(([u, emp, papel]) => ({ empresa_id: emp, user_id: u.id, papel })) as never).select("id, user_id"),
      "membros",
    );
    for (const l of linhas!) membro[l.user_id] = l.id;
    for (const [quem, setor] of [
      [comprador, "compras"],
      [administrativo, "administrativo"],
      [operacional, "operacional"],
    ] as const) {
      ok(await admin.cliente.rpc("definir_setores_membro", { p_membro_id: membro[quem.id], p_setores: [{ setor, capacidade: "executar" }] as never }), "setor");
    }
  });

  it("admin e gestor gravam as margens; Compras, Administrativo e a outra empresa não", async () => {
    ok(await admin.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { modulos: 0.18, inversores: 0.15 } }), "admin");
    ok(await gestor.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { modulos: 0.2, estrutura: 0.25 } }), "gestor");
    expect(await margens(admin)).toEqual({ modulos: 0.2, inversores: 0.15, estrutura: 0.25 });
    for (const quem of [comprador, administrativo, adminB]) {
      const r = await quem.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { modulos: 0.5 } });
      expect(r.error?.message).toContain("Só o admin e o gestor");
    }
    expect((await margens(admin)).modulos).toBe(0.2);
  });

  it("valida categoria e faixa (0% a 500%)", async () => {
    expect((await admin.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { kits: 0.1 } })).error?.message).toContain("Categoria");
    expect((await admin.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { modulos: -0.1 } })).error?.message).toContain("Margem inválida");
    expect((await admin.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { modulos: 6 } })).error?.message).toContain("Margem inválida");
    expect((await admin.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { modulos: "x" } })).error?.message).toContain("Margem inválida");
    // Tudo ou nada: uma categoria inválida não grava as outras.
    await admin.cliente.rpc("salvar_margens_compra", { p_empresa_id: empresa, p_margens: { inversores: 0.3, modulos: 9 } });
    expect((await margens(admin)).inversores).toBe(0.15);
  });

  it("Compras e Administrativo leem as margens; Operacional e a outra empresa não", async () => {
    expect((await margens(comprador)).modulos).toBe(0.2);
    expect((await margens(administrativo)).modulos).toBe(0.2);
    expect(await margens(operacional)).toEqual({});
    expect(await margens(adminB)).toEqual({});
  });

  it("potência do material: opcional, maior que zero; chamada antiga (sem potência) continua", async () => {
    const { data: id } = ok(
      await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Módulo 550 W", p_categoria: "modulos", p_unidade: "un", p_potencia_w: 550 }),
      "módulo",
    );
    ok(await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Cabo 6 mm²", p_categoria: "cabos_protecao", p_unidade: "m" }), "cabo");
    const ruim = await comprador.cliente.rpc("criar_material_compra", { p_empresa_id: empresa, p_nome: "Inversor", p_categoria: "inversores", p_unidade: "un", p_potencia_w: 0 });
    expect(ruim.error?.message).toContain("Potência inválida");
    ok(await comprador.cliente.rpc("editar_material_compra", { p_material_id: id as string, p_nome: "Módulo 550 W", p_categoria: "modulos", p_unidade: "un", p_potencia_w: 555.5 }), "editar");
    const { data } = await servico.from("compras_materiais").select("nome, potencia_w").eq("empresa_id", empresa).order("nome");
    expect(data!.map((m) => [m.nome, m.potencia_w == null ? null : Number(m.potencia_w)])).toEqual([
      ["Cabo 6 mm²", null],
      ["Módulo 550 W", 555.5],
    ]);
  });
});
