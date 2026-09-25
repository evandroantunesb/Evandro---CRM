/**
 * Testes de isolamento entre empresas. Rodam contra o Supabase local:
 *   pnpm supabase start && pnpm test
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SENHA = "senha-de-teste-123";
const sufixo = Date.now();

const admin = createClient<Database>(URL, SERVICE, { auth: { persistSession: false } });

async function criarUsuario(nome: string) {
  const email = `${nome}-${sufixo}@teste.raion`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  const cliente = createClient<Database>(URL, ANON, { auth: { persistSession: false } });
  const { error: erroLogin } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (erroLogin) throw erroLogin;
  return { id: data.user.id, email, cliente };
}

type Usuario = Awaited<ReturnType<typeof criarUsuario>>;
let dono: Usuario; // super-admin
let adminA: Usuario;
let vendedorA: Usuario;
let adminB: Usuario;
let empresaA: string;
let empresaB: string;

beforeAll(async () => {
  [dono, adminA, vendedorA, adminB] = await Promise.all(
    ["dono", "admin-a", "vendedor-a", "admin-b"].map(criarUsuario),
  );
  await admin.from("plataforma_admins").insert({ user_id: dono.id });

  const { data: a, error: ea } = await dono.cliente.from("empresas").insert({ nome: `Solar A ${sufixo}` }).select("id").single();
  const { data: b, error: eb } = await dono.cliente.from("empresas").insert({ nome: `Solar B ${sufixo}` }).select("id").single();
  expect(ea).toBeNull();
  expect(eb).toBeNull();
  empresaA = a!.id;
  empresaB = b!.id;

  const { error } = await dono.cliente.from("empresa_membros").insert([
    { empresa_id: empresaA, user_id: adminA.id, papel: "admin" },
    { empresa_id: empresaA, user_id: vendedorA.id, papel: "vendedor", tipo_vendedor: "representante" },
    { empresa_id: empresaB, user_id: adminB.id, papel: "admin" },
  ]);
  expect(error).toBeNull();
});

describe("empresas", () => {
  it("cada usuário só vê a própria empresa", async () => {
    const { data } = await adminA.cliente.from("empresas").select("id");
    expect(data!.map((e) => e.id)).toEqual([empresaA]);

    const { data: deB } = await adminB.cliente.from("empresas").select("id");
    expect(deB!.map((e) => e.id)).toEqual([empresaB]);
  });

  it("o super-admin vê todas", async () => {
    const { data } = await dono.cliente.from("empresas").select("id").in("id", [empresaA, empresaB]);
    expect(data).toHaveLength(2);
  });

  it("admin de empresa não cria empresa nem muda a situação", async () => {
    const { error } = await adminA.cliente.from("empresas").insert({ nome: "Pirata" });
    expect(error).not.toBeNull();

    await adminA.cliente.from("empresas").update({ situacao: "cancelada" }).eq("id", empresaA);
    const { data } = await admin.from("empresas").select("situacao").eq("id", empresaA).single();
    expect(data!.situacao).toBe("ativa");
  });
});

describe("membros", () => {
  it("não enxerga membros nem perfis de outra empresa", async () => {
    const { data: membros } = await adminB.cliente.from("empresa_membros").select("user_id");
    expect(membros!.map((m) => m.user_id)).toEqual([adminB.id]);

    const { data: perfis } = await adminB.cliente.from("perfis").select("id").in("id", [adminA.id, vendedorA.id]);
    expect(perfis).toHaveLength(0);
  });

  it("admin não adiciona gente na empresa de outro", async () => {
    const { error } = await adminB.cliente
      .from("empresa_membros")
      .insert({ empresa_id: empresaA, user_id: adminB.id, papel: "admin" });
    expect(error).not.toBeNull();
  });

  it("vendedor não altera o próprio papel", async () => {
    await vendedorA.cliente.from("empresa_membros").update({ papel: "admin" }).eq("user_id", vendedorA.id);
    const { data } = await admin.from("empresa_membros").select("papel").eq("user_id", vendedorA.id).single();
    expect(data!.papel).toBe("vendedor");
  });

  it("a empresa nunca fica sem admin ativo", async () => {
    const { error } = await adminA.cliente
      .from("empresa_membros")
      .update({ ativo: false })
      .eq("user_id", adminA.id)
      .eq("empresa_id", empresaA);
    expect(error?.message).toMatch(/admin ativo/);
  });
});

describe("equipes", () => {
  it("só o admin cria equipe, e só na própria empresa", async () => {
    const { error: doVendedor } = await vendedorA.cliente.from("equipes").insert({ empresa_id: empresaA, nome: "X" });
    expect(doVendedor).not.toBeNull();

    const { error: naOutra } = await adminB.cliente.from("equipes").insert({ empresa_id: empresaA, nome: "X" });
    expect(naOutra).not.toBeNull();

    const { error } = await adminA.cliente.from("equipes").insert({ empresa_id: empresaA, nome: "Maringá" });
    expect(error).toBeNull();
  });

  it("não mistura membro de uma empresa com equipe de outra", async () => {
    const { data: equipe } = await adminB.cliente
      .from("equipes")
      .insert({ empresa_id: empresaB, nome: "Londrina" })
      .select("id")
      .single();
    const { data: membroA } = await admin.from("empresa_membros").select("id").eq("user_id", vendedorA.id).single();
    const { error } = await adminB.cliente
      .from("equipe_membros")
      .insert({ empresa_id: empresaB, equipe_id: equipe!.id, membro_id: membroA!.id });
    expect(error).not.toBeNull();
  });
});

describe("auditoria", () => {
  it("registra as mudanças e ninguém consegue apagar", async () => {
    const { data } = await adminA.cliente
      .from("logs_auditoria")
      .select("entidade, acao, user_id")
      .eq("empresa_id", empresaA)
      .eq("entidade", "equipes");
    expect(data!.some((l) => l.acao === "insert" && l.user_id === adminA.id)).toBe(true);

    const { error } = await admin.from("logs_auditoria").delete().eq("empresa_id", empresaA);
    expect(error).not.toBeNull();
  });

  it("vendedor não lê a auditoria e ninguém lê a de outra empresa", async () => {
    const { data: doVendedor } = await vendedorA.cliente.from("logs_auditoria").select("id");
    expect(doVendedor).toHaveLength(0);
    const { data: deB } = await adminB.cliente.from("logs_auditoria").select("id").eq("empresa_id", empresaA);
    expect(deB).toHaveLength(0);
  });
});

describe("empresa suspensa", () => {
  it("perde o acesso na hora", async () => {
    await dono.cliente.from("empresas").update({ situacao: "suspensa" }).eq("id", empresaB);
    const { data } = await adminB.cliente.from("empresas").select("id");
    expect(data).toHaveLength(0);
    await dono.cliente.from("empresas").update({ situacao: "ativa" }).eq("id", empresaB);
  });
});
