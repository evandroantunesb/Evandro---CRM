/**
 * Avatar global do usuário: constraint do caminho em perfis.avatar_caminho e políticas do
 * bucket privado "avatares" (cada um escreve só na própria pasta; lê o dono e quem compartilha
 * empresa com ele; super-admin sem vínculo não lê). Precisa do Supabase local.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "avatares";
const imagem = (tipo = "image/png", tamanho = 64) => new Blob([new Uint8Array(tamanho)], { type: tipo });
const enviar = (u: Usuario, caminho: string, tipo = "image/png") =>
  u.cliente.storage.from(BUCKET).upload(caminho, imagem(tipo), { contentType: tipo });

describe("avatares (constraint do caminho + bucket privado)", () => {
  let dono: Usuario;
  let colega: Usuario;
  let estranho: Usuario;
  let superAdmin: Usuario;
  let empresa: string;
  let outraEmpresa: string;

  beforeAll(async () => {
    [dono, colega, estranho, superAdmin] = await Promise.all(
      ["avt-dono", "avt-colega", "avt-estranho", "avt-super"].map(criarUsuario),
    );
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Avatar A ${sufixo}` }, { nome: `Avatar B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    outraEmpresa = empresas![1].id;
    await servico.from("empresa_membros").insert([
      { empresa_id: empresa, user_id: dono.id, papel: "vendedor" },
      { empresa_id: empresa, user_id: colega.id, papel: "gestor" },
      { empresa_id: outraEmpresa, user_id: estranho.id, papel: "admin" },
    ]);
    await servico.from("plataforma_admins").insert({ user_id: superAdmin.id });
  });

  describe("constraint perfis_avatar_caminho_da_propria_pasta", () => {
    it("aceita nulo e o caminho na própria pasta, em webp, jpg e png", async () => {
      for (const ext of ["webp", "jpg", "png"]) {
        const { error } = await dono.cliente
          .from("perfis")
          .update({ avatar_caminho: `${dono.id}/${randomUUID()}.${ext}` })
          .eq("id", dono.id);
        expect(error).toBeNull();
      }
      const { error } = await dono.cliente.from("perfis").update({ avatar_caminho: null }).eq("id", dono.id);
      expect(error).toBeNull();
    });

    it("rejeita caminho na pasta de outro usuário", async () => {
      const { error } = await dono.cliente
        .from("perfis")
        .update({ avatar_caminho: `${colega.id}/${randomUUID()}.webp` })
        .eq("id", dono.id);
      expect(error).not.toBeNull();
    });

    it("rejeita caminho malformado (subpasta, extensão, nome não-uuid, '..', sem pasta)", async () => {
      const malformados = [
        `${dono.id}/sub/${randomUUID()}.webp`,
        `${dono.id}/${randomUUID()}.gif`,
        `${dono.id}/${randomUUID()}.svg`,
        `${dono.id}/foto.webp`,
        `${dono.id}/../${colega.id}/${randomUUID()}.webp`,
        `${randomUUID()}.webp`,
        `${dono.id}/${randomUUID()}.webp/extra`,
      ];
      for (const avatar_caminho of malformados) {
        const { error } = await dono.cliente.from("perfis").update({ avatar_caminho }).eq("id", dono.id);
        expect(error, avatar_caminho).not.toBeNull();
      }
    });

    it("o dono grava na própria linha; ninguém grava na linha de outro", async () => {
      const caminho = `${dono.id}/${randomUUID()}.webp`;
      await colega.cliente.from("perfis").update({ avatar_caminho: caminho }).eq("id", dono.id);
      const { data } = await servico.from("perfis").select("avatar_caminho").eq("id", dono.id).single();
      expect(data!.avatar_caminho).not.toBe(caminho);
    });
  });

  describe("bucket avatares (privado)", () => {
    let caminho: string;

    beforeAll(() => {
      caminho = `${dono.id}/${randomUUID()}.png`;
    });

    it("é privado, com limite de 3 MB e só JPEG/PNG/WebP", async () => {
      const { data: bucket, error } = await servico.storage.getBucket(BUCKET);
      expect(error).toBeNull();
      expect(bucket!.public).toBe(false);
      expect(bucket!.file_size_limit).toBe(3145728);
      expect([...(bucket!.allowed_mime_types ?? [])].sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    });

    it("o dono envia na própria pasta (png, jpg e webp)", async () => {
      expect((await enviar(dono, caminho)).error).toBeNull();
      expect((await enviar(dono, `${dono.id}/${randomUUID()}.jpg`, "image/jpeg")).error).toBeNull();
      expect((await enviar(dono, `${dono.id}/${randomUUID()}.webp`, "image/webp")).error).toBeNull();
    });

    it("o dono atualiza (sobrescreve) o próprio arquivo", async () => {
      const { error } = await dono.cliente.storage
        .from(BUCKET)
        .update(caminho, imagem("image/png", 128), { contentType: "image/png" });
      expect(error).toBeNull();
    });

    it("outro usuário não envia na pasta do dono, nem colega da mesma empresa", async () => {
      expect((await enviar(colega, `${dono.id}/${randomUUID()}.png`)).error).not.toBeNull();
      expect((await enviar(estranho, `${dono.id}/${randomUUID()}.png`)).error).not.toBeNull();
    });

    it("outro usuário não atualiza o arquivo do dono", async () => {
      const { error } = await colega.cliente.storage
        .from(BUCKET)
        .update(caminho, imagem("image/png", 200), { contentType: "image/png" });
      expect(error).not.toBeNull();
      const { data } = await servico.storage.from(BUCKET).download(caminho);
      expect(data!.size).toBe(128);
    });

    it("nome fora do padrão é negado mesmo na própria pasta", async () => {
      const proprios = [
        `${dono.id}/sub/${randomUUID()}.png`,
        `${dono.id}/${randomUUID()}.gif`,
        `${dono.id}/${randomUUID()}.jpeg`,
        `${dono.id}/foto.png`,
        `${dono.id}/${randomUUID()}.png.png`,
        `${randomUUID()}.png`,
      ];
      for (const nome of proprios) {
        expect((await enviar(dono, nome)).error, nome).not.toBeNull();
      }
    });

    it("o bucket recusa SVG, tipo fora da lista e arquivo acima de 3 MB", async () => {
      const svg = await dono.cliente.storage
        .from(BUCKET)
        .upload(`${dono.id}/${randomUUID()}.webp`, imagem("image/svg+xml"), { contentType: "image/svg+xml" });
      expect(svg.error).not.toBeNull();
      const texto = await dono.cliente.storage
        .from(BUCKET)
        .upload(`${dono.id}/${randomUUID()}.png`, imagem("text/plain"), { contentType: "text/plain" });
      expect(texto.error).not.toBeNull();
      const grande = await dono.cliente.storage
        .from(BUCKET)
        .upload(`${dono.id}/${randomUUID()}.png`, imagem("image/png", 3 * 1024 * 1024 + 1), { contentType: "image/png" });
      expect(grande.error).not.toBeNull();
    });

    it("o dono e o colega que compartilha empresa leem (URL assinada em lote)", async () => {
      for (const quem of [dono, colega]) {
        const { data, error } = await quem.cliente.storage.from(BUCKET).createSignedUrls([caminho], 60);
        expect(error).toBeNull();
        expect(data![0].error).toBeNull();
        expect(data![0].signedUrl).toContain("token=");
        const baixa = await quem.cliente.storage.from(BUCKET).download(caminho);
        expect(baixa.error).toBeNull();
      }
    });

    it("usuário de outra empresa não lê", async () => {
      const alheio = await estranho.cliente.storage.from(BUCKET).createSignedUrls([caminho], 60);
      expect(alheio.data?.[0]?.signedUrl ?? "").toBe("");
      const baixa = await estranho.cliente.storage.from(BUCKET).download(caminho);
      expect(baixa.error).not.toBeNull();
    });

    it("super-admin sem vínculo com a empresa do dono não lê", async () => {
      const alheio = await superAdmin.cliente.storage.from(BUCKET).createSignedUrls([caminho], 60);
      expect(alheio.data?.[0]?.signedUrl ?? "").toBe("");
      const baixa = await superAdmin.cliente.storage.from(BUCKET).download(caminho);
      expect(baixa.error).not.toBeNull();
    });

    it("nome malformado no bucket não quebra a consulta de quem lê", async () => {
      // Só o service_role consegue colocar um arquivo fora do padrão (as policies de envio negam).
      const malformado = `nao-e-uuid/${randomUUID()}.png`;
      const semPasta = `${randomUUID()}.png`;
      for (const nome of [malformado, semPasta]) {
        const { error } = await servico.storage.from(BUCKET).upload(nome, imagem(), { contentType: "image/png" });
        expect(error).toBeNull();
      }
      const { data, error } = await colega.cliente.storage
        .from(BUCKET)
        .createSignedUrls([malformado, semPasta, caminho], 60);
      expect(error).toBeNull();
      expect(data!.find((i) => i.path === caminho)?.signedUrl).toContain("token=");
      expect(data!.find((i) => i.path === malformado)?.signedUrl ?? "").toBe("");
      const listagem = await colega.cliente.storage.from(BUCKET).list(dono.id);
      expect(listagem.error).toBeNull();
      await servico.storage.from(BUCKET).remove([malformado, semPasta]);
    });

    it("outro usuário não remove o arquivo do dono; o dono remove", async () => {
      for (const quem of [colega, estranho]) {
        const negado = await quem.cliente.storage.from(BUCKET).remove([caminho]);
        expect(negado.data ?? []).toHaveLength(0);
      }
      const aindaExiste = await servico.storage.from(BUCKET).download(caminho);
      expect(aindaExiste.error).toBeNull();

      const removido = await dono.cliente.storage.from(BUCKET).remove([caminho]);
      expect(removido.error).toBeNull();
      expect(removido.data).toHaveLength(1);
    });
  });
});
