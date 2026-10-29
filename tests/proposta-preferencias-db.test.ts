/**
 * Validade padrão da proposta (20261029130000_proposta_preferencias.sql): admin e gestor criam e alteram a linha da
 * própria empresa, com o autor gravado; vendedor e SDR só leem; ninguém apaga; outra empresa não vê nem grava.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let sdr: Usuario;
let estranho: Usuario;
let empresa: string;
let membroGestor: string;

beforeAll(async () => {
  [admin, gestor, vendedor, sdr, estranho] = await Promise.all([
    criarUsuario("validade-admin"),
    criarUsuario("validade-gestor"),
    criarUsuario("validade-vendedor"),
    criarUsuario("validade-sdr"),
    criarUsuario("validade-estranho"),
  ]);
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Validade ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });
  const { data: mg } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: gestor.id, papel: "gestor" }).select("id").single();
  membroGestor = mg!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" });
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: sdr.id, papel: "sdr" });
  const { data: outra } = await servico.from("empresas").insert({ nome: `Validade outra ${sufixo}` }).select("id").single();
  await servico.from("empresa_membros").insert({ empresa_id: outra!.id, user_id: estranho.id, papel: "admin" });
});

describe("proposta_preferencias", () => {
  it("vendedor e SDR não criam a preferência", async () => {
    for (const u of [vendedor, sdr]) {
      const { error } = await u.cliente.from("proposta_preferencias").insert({ empresa_id: empresa, validade_dias: 20 });
      expect(error).not.toBeNull();
    }
    const { data } = await servico.from("proposta_preferencias").select("id").eq("empresa_id", empresa);
    expect(data).toEqual([]);
  });

  it("gestor cria e o autor fica gravado; fora de 1 a 180 é recusado", async () => {
    const { error } = await gestor.cliente
      .from("proposta_preferencias")
      .upsert({ empresa_id: empresa, validade_dias: 15 }, { onConflict: "empresa_id" });
    expect(error).toBeNull();
    const { data } = await servico.from("proposta_preferencias").select("validade_dias, atualizado_por").eq("empresa_id", empresa).single();
    expect(data).toEqual({ validade_dias: 15, atualizado_por: membroGestor });

    for (const dias of [0, 181]) {
      const r = await gestor.cliente.from("proposta_preferencias").update({ validade_dias: dias }).eq("empresa_id", empresa);
      expect(r.error).not.toBeNull();
    }
  });

  it("admin altera; vendedor lê mas não altera; ninguém apaga", async () => {
    const { error } = await admin.cliente
      .from("proposta_preferencias")
      .upsert({ empresa_id: empresa, validade_dias: 30 }, { onConflict: "empresa_id" });
    expect(error).toBeNull();

    const { data: lido } = await vendedor.cliente.from("proposta_preferencias").select("validade_dias").eq("empresa_id", empresa).single();
    expect(lido?.validade_dias).toBe(30);
    const { data: alterado } = await vendedor.cliente.from("proposta_preferencias").update({ validade_dias: 5 }).eq("empresa_id", empresa).select("id");
    expect(alterado ?? []).toEqual([]);

    const { error: erroDelete } = await admin.cliente.from("proposta_preferencias").delete().eq("empresa_id", empresa);
    expect(erroDelete).not.toBeNull();
    const { data: final } = await servico.from("proposta_preferencias").select("validade_dias").eq("empresa_id", empresa).single();
    expect(final?.validade_dias).toBe(30);
  });

  it("admin de outra empresa não vê nem grava", async () => {
    const { data } = await estranho.cliente.from("proposta_preferencias").select("id").eq("empresa_id", empresa);
    expect(data ?? []).toEqual([]);
    const { error } = await estranho.cliente.from("proposta_preferencias").insert({ empresa_id: empresa, validade_dias: 7 });
    expect(error).not.toBeNull();
  });
});
