import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

/**
 * Modelos de proposta também pelo gestor (20261220100000_proposta_modelos_gestor.sql, pedido do Evandro em
 * 24/11/2026): admin e gestor criam, editam, publicam e apagam modelos e blocos da PRÓPRIA empresa; vendedor só lê os
 * publicados; a identidade visual (logo, cores, foto) continua só do admin; gestor de outra empresa não alcança nada.
 */

let empresaId: string;
let outraEmpresaId: string;
let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let gestorDeFora: Usuario;

beforeAll(async () => {
  [admin, gestor, vendedor, gestorDeFora] = await Promise.all([
    criarUsuario("modelos-admin"),
    criarUsuario("modelos-gestor"),
    criarUsuario("modelos-vend"),
    criarUsuario("modelos-gestor-fora"),
  ]);
  const { data: empresas, error } = await servico
    .from("empresas")
    .insert([{ nome: `Modelos gestor ${sufixo}` }, { nome: `Modelos outra ${sufixo}` }])
    .select("id");
  if (error) throw error;
  empresaId = empresas![0]!.id;
  outraEmpresaId = empresas![1]!.id;
  const { error: erroMembros } = await servico.from("empresa_membros").insert([
    { empresa_id: empresaId, user_id: admin.id, papel: "admin" },
    { empresa_id: empresaId, user_id: gestor.id, papel: "gestor" },
    { empresa_id: empresaId, user_id: vendedor.id, papel: "vendedor" },
    { empresa_id: outraEmpresaId, user_id: gestorDeFora.id, papel: "gestor" },
  ]);
  if (erroMembros) throw erroMembros;
});

describe("modelos de proposta pelo gestor", () => {
  it("o gestor cria um rascunho, vê, liga e desliga blocos, publica e apaga", async () => {
    const { data: modelo, error } = await gestor.cliente
      .from("proposta_modelos")
      .insert({ empresa_id: empresaId, nome: "Modelo do gestor" })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(modelo!.status).toBe("rascunho");

    const { data: bloco, error: erroBloco } = await gestor.cliente
      .from("proposta_modelo_blocos")
      .insert({ modelo_id: modelo!.id, tipo: "testimonials", ordem: 1, config: { itens: ["Maria | Atendimento rápido."] } })
      .select("id")
      .single();
    expect(erroBloco).toBeNull();

    const { data: desligado } = await gestor.cliente.from("proposta_modelo_blocos").update({ ativo: false }).eq("id", bloco!.id).select("ativo");
    expect(desligado).toEqual([{ ativo: false }]);

    const { data: publicado } = await gestor.cliente.from("proposta_modelos").update({ status: "publicado" }).eq("id", modelo!.id).select("status");
    expect(publicado).toEqual([{ status: "publicado" }]);

    const { data: apagado } = await gestor.cliente.from("proposta_modelos").delete().eq("id", modelo!.id).select("id");
    expect(apagado).toHaveLength(1);
  });

  it("o vendedor não cria modelo, não vê rascunho e não mexe nos blocos de um modelo publicado", async () => {
    const { error } = await vendedor.cliente.from("proposta_modelos").insert({ empresa_id: empresaId, nome: "Do vendedor" });
    expect(error).not.toBeNull();

    const { data: rascunho } = await servico.from("proposta_modelos").insert({ empresa_id: empresaId, nome: "Rascunho" }).select("id").single();
    const { data: visto } = await vendedor.cliente.from("proposta_modelos").select("id").eq("id", rascunho!.id);
    expect(visto).toEqual([]);
    const { data: vistoGestor } = await gestor.cliente.from("proposta_modelos").select("id").eq("id", rascunho!.id);
    expect(vistoGestor).toHaveLength(1);

    const { data: pub } = await servico.from("proposta_modelos").insert({ empresa_id: empresaId, nome: "Publicado", status: "publicado" }).select("id").single();
    const { data: bloco } = await servico.from("proposta_modelo_blocos").insert({ modelo_id: pub!.id, tipo: "warranties", ordem: 1, config: {} }).select("id").single();
    const { data: alterado } = await vendedor.cliente.from("proposta_modelo_blocos").update({ ativo: false }).eq("id", bloco!.id).select("id");
    expect(alterado).toEqual([]);
  });

  it("o gestor de outra empresa não cria nem altera modelos desta", async () => {
    const { error } = await gestorDeFora.cliente.from("proposta_modelos").insert({ empresa_id: empresaId, nome: "Intruso" });
    expect(error).not.toBeNull();
    const { data: pub } = await servico.from("proposta_modelos").insert({ empresa_id: empresaId, nome: "Alvo", status: "publicado" }).select("id").single();
    const { data: alterado } = await gestorDeFora.cliente.from("proposta_modelos").update({ nome: "Trocado" }).eq("id", pub!.id).select("id");
    expect(alterado).toEqual([]);
  });

  it("a identidade visual continua só do admin", async () => {
    const { error } = await gestor.cliente.from("proposta_identidades").upsert({ empresa_id: empresaId, nome_exibicao: "Pelo gestor" }, { onConflict: "empresa_id" });
    expect(error).not.toBeNull();
    const { error: erroAdmin } = await admin.cliente.from("proposta_identidades").upsert({ empresa_id: empresaId, nome_exibicao: "Pelo admin" }, { onConflict: "empresa_id" });
    expect(erroAdmin).toBeNull();
    const { data: alterada } = await gestor.cliente.from("proposta_identidades").update({ nome_exibicao: "Pelo gestor" }).eq("empresa_id", empresaId).select("id");
    expect(alterada).toEqual([]);
  });
});
