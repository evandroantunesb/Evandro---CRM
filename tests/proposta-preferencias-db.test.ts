/**
 * Validade padrão da proposta por empresa (20261029100000_proposta_preferencias.sql): todo membro ativo
 * lê; só admin e gestor escrevem (insert e update); isolamento por empresa.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let estranho: Usuario;
let empresa: string;

beforeAll(async () => {
  [admin, gestor, vendedor, estranho] = await Promise.all([
    criarUsuario("validade-admin"),
    criarUsuario("validade-gestor"),
    criarUsuario("validade-vendedor"),
    criarUsuario("validade-estranho"),
  ]);
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Validade ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: gestor.id, papel: "gestor" });
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" });
  const { data: outra } = await servico.from("empresas").insert({ nome: `Validade outra ${sufixo}` }).select("id").single();
  await servico.from("empresa_membros").insert({ empresa_id: outra!.id, user_id: estranho.id, papel: "admin" });
});

describe("leitura", () => {
  it("vendedor lê; estranho (outra empresa) não vê nada", async () => {
    await servico.from("proposta_preferencias").upsert({ empresa_id: empresa, validade_dias: 20 }, { onConflict: "empresa_id" });
    const { data: lida } = await vendedor.cliente.from("proposta_preferencias").select("validade_dias").eq("empresa_id", empresa).maybeSingle();
    expect(lida?.validade_dias).toBe(20);
    const { data: nada } = await estranho.cliente.from("proposta_preferencias").select("validade_dias").eq("empresa_id", empresa);
    expect(nada).toEqual([]);
  });
});

describe("escrita", () => {
  it("vendedor não cria nem atualiza", async () => {
    const outraEmpresa = empresa; // reuso: vendedor tenta escrever na própria empresa mesmo assim
    const { error: erroInsert } = await vendedor.cliente
      .from("proposta_preferencias")
      .upsert({ empresa_id: outraEmpresa, validade_dias: 30 }, { onConflict: "empresa_id" });
    expect(erroInsert).not.toBeNull();
    const { data: continuaVinte } = await servico.from("proposta_preferencias").select("validade_dias").eq("empresa_id", empresa).single();
    expect(continuaVinte!.validade_dias).toBe(20);
  });

  it("admin e gestor criam/atualizam; fora de 1..180 é recusado", async () => {
    const { data: outraEmp } = await servico.from("empresas").insert({ nome: `Validade admin cria ${sufixo}` }).select("id").single();
    await servico.from("empresa_membros").insert({ empresa_id: outraEmp!.id, user_id: admin.id, papel: "admin" });
    const { error: criar } = await admin.cliente.from("proposta_preferencias").insert({ empresa_id: outraEmp!.id, validade_dias: 45 });
    expect(criar).toBeNull();

    const { error: atualizar } = await gestor.cliente.from("proposta_preferencias").update({ validade_dias: 60 }).eq("empresa_id", empresa);
    expect(atualizar).toBeNull();
    const { data: lida } = await servico.from("proposta_preferencias").select("validade_dias").eq("empresa_id", empresa).single();
    expect(lida!.validade_dias).toBe(60);

    const { error: invalido } = await gestor.cliente.from("proposta_preferencias").update({ validade_dias: 181 }).eq("empresa_id", empresa);
    expect(invalido).not.toBeNull();
    const { error: zero } = await gestor.cliente.from("proposta_preferencias").update({ validade_dias: 0 }).eq("empresa_id", empresa);
    expect(zero).not.toBeNull();
  });

  it("gestor não escreve em outra empresa (isolamento)", async () => {
    const { data: outraEmp } = await servico.from("empresas").insert({ nome: `Validade isolamento ${sufixo}` }).select("id").single();
    const { error } = await gestor.cliente.from("proposta_preferencias").insert({ empresa_id: outraEmp!.id, validade_dias: 50 });
    expect(error).not.toBeNull();
  });
});
