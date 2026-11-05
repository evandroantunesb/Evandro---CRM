/**
 * Tela de entrada por empresa: tabela empresa_tela_entrada (só o admin da empresa lê e grava; limites
 * dos textos; imagem na pasta da própria empresa; sem login não abre: o servidor lê com a chave de
 * serviço) e bucket público "tela-entrada" (envio e remoção só do admin, na pasta da empresa). Precisa do
 * Supabase local.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "tela-entrada";
const imagem = (tipo = "image/webp", tamanho = 64) => new Blob([new Uint8Array(tamanho)], { type: tipo });
const anonimo = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});

describe("tela de entrada por empresa", () => {
  let admin: Usuario;
  let gestor: Usuario;
  let adminOutra: Usuario;
  let empresa: string;
  let outraEmpresa: string;

  beforeAll(async () => {
    [admin, gestor, adminOutra] = await Promise.all(["tent-admin", "tent-gestor", "tent-admin-outra"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Tela entrada A ${sufixo}` }, { nome: `Tela entrada B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    outraEmpresa = empresas![1].id;
    const { error } = await servico.from("empresa_membros").insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: outraEmpresa, user_id: adminOutra.id, papel: "admin" },
    ]);
    expect(error).toBeNull();
  });

  describe("tabela empresa_tela_entrada", () => {
    it("admin grava frase, texto e imagem da própria pasta, e o autor é ele", async () => {
      const { error } = await admin.cliente.from("empresa_tela_entrada").upsert(
        { empresa_id: empresa, frase: "Energia que transforma.", texto: "Texto de apoio.", imagem_caminho: `${empresa}/${randomUUID()}.webp` },
        { onConflict: "empresa_id" },
      );
      expect(error).toBeNull();
      const { data } = await servico.from("empresa_tela_entrada").select("frase, atualizado_por").eq("empresa_id", empresa).single();
      expect(data!.frase).toBe("Energia que transforma.");
      const { data: membro } = await servico.from("empresa_membros").select("id").eq("empresa_id", empresa).eq("user_id", admin.id).single();
      expect(data!.atualizado_por).toBe(membro!.id);
    });

    it("gestor não lê nem grava (só o admin configura a empresa)", async () => {
      const { data } = await gestor.cliente.from("empresa_tela_entrada").select("frase").eq("empresa_id", empresa);
      expect(data).toEqual([]);
      await gestor.cliente.from("empresa_tela_entrada").update({ frase: "Do gestor" }).eq("empresa_id", empresa);
      const { data: depois } = await servico.from("empresa_tela_entrada").select("frase").eq("empresa_id", empresa).single();
      expect(depois!.frase).toBe("Energia que transforma.");
    });

    it("admin de outra empresa não lê nem cria para esta", async () => {
      const { data } = await adminOutra.cliente.from("empresa_tela_entrada").select("frase").eq("empresa_id", empresa);
      expect(data).toEqual([]);
      const { error } = await adminOutra.cliente.from("empresa_tela_entrada").insert({ empresa_id: empresa, frase: "Invasão" });
      expect(error).not.toBeNull();
    });

    it("recusa frase acima de 60, texto acima de 140 e textos vazios", async () => {
      for (const campos of [{ frase: "a".repeat(61) }, { texto: "a".repeat(141) }, { frase: "" }, { texto: "" }]) {
        const { error } = await admin.cliente.from("empresa_tela_entrada").update(campos).eq("empresa_id", empresa);
        expect(error).not.toBeNull();
      }
    });

    it("recusa imagem fora da pasta da própria empresa", async () => {
      const { error } = await admin.cliente
        .from("empresa_tela_entrada")
        .update({ imagem_caminho: `${outraEmpresa}/${randomUUID()}.webp` })
        .eq("empresa_id", empresa);
      expect(error).not.toBeNull();
    });

    it("a empresa da linha não muda", async () => {
      const { error } = await admin.cliente.from("empresa_tela_entrada").update({ empresa_id: outraEmpresa }).eq("empresa_id", empresa);
      expect(error).not.toBeNull();
    });

    it("sem login, a tabela não abre", async () => {
      const { data } = await anonimo.from("empresa_tela_entrada").select("frase");
      expect(data ?? []).toEqual([]);
    });
  });

  describe("bucket tela-entrada (público)", () => {
    const caminho = () => `${empresa}/${randomUUID()}.webp`;

    it("é público, com limite de 3 MB e só JPEG/PNG/WebP", async () => {
      const { data: bucket, error } = await servico.storage.getBucket(BUCKET);
      expect(error).toBeNull();
      expect(bucket!.public).toBe(true);
      expect(bucket!.file_size_limit).toBe(3145728);
      expect([...(bucket!.allowed_mime_types ?? [])].sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    });

    it("admin envia e remove na pasta da própria empresa; o arquivo abre sem login", async () => {
      const c = caminho();
      const envio = await admin.cliente.storage.from(BUCKET).upload(c, imagem(), { contentType: "image/webp" });
      expect(envio.error).toBeNull();
      const publico = await fetch(anonimo.storage.from(BUCKET).getPublicUrl(c).data.publicUrl);
      expect(publico.ok).toBe(true);
      const { data: removidos, error } = await admin.cliente.storage.from(BUCKET).remove([c]);
      expect(error).toBeNull();
      expect(removidos).toHaveLength(1);
    });

    it("gestor, admin de outra empresa e quem não fez login não enviam", async () => {
      for (const cliente of [gestor.cliente, adminOutra.cliente, anonimo]) {
        const { error } = await cliente.storage.from(BUCKET).upload(caminho(), imagem(), { contentType: "image/webp" });
        expect(error).not.toBeNull();
      }
    });

    it("recusa SVG mesmo do admin", async () => {
      const { error } = await admin.cliente.storage
        .from(BUCKET)
        .upload(`${empresa}/${randomUUID()}.svg`, imagem("image/svg+xml"), { contentType: "image/svg+xml" });
      expect(error).not.toBeNull();
    });

    it("admin de outra empresa não remove o arquivo desta", async () => {
      const c = caminho();
      expect((await admin.cliente.storage.from(BUCKET).upload(c, imagem(), { contentType: "image/webp" })).error).toBeNull();
      const { data: removidos } = await adminOutra.cliente.storage.from(BUCKET).remove([c]);
      expect(removidos ?? []).toHaveLength(0);
      const { data: ainda } = await servico.storage.from(BUCKET).list(empresa);
      expect(ainda!.some((o) => c.endsWith(o.name))).toBe(true);
    });
  });

  it("gestor não apaga; admin volta ao padrão apagando a linha", async () => {
    await gestor.cliente.from("empresa_tela_entrada").delete().eq("empresa_id", empresa);
    expect((await servico.from("empresa_tela_entrada").select("id").eq("empresa_id", empresa)).data).toHaveLength(1);
    const { error } = await admin.cliente.from("empresa_tela_entrada").delete().eq("empresa_id", empresa);
    expect(error).toBeNull();
    expect((await servico.from("empresa_tela_entrada").select("id").eq("empresa_id", empresa)).data).toEqual([]);
  });
});
