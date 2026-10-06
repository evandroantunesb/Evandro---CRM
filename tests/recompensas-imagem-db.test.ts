/**
 * Imagem das recompensas: constraint do caminho em recompensas.imagem_caminho e políticas do
 * bucket privado "recompensas" (envio/remoção só do admin da empresa; leitura só de membro da
 * empresa; tipo e tamanho limitados pelo próprio bucket). Precisa do Supabase local.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const BUCKET = "recompensas";
const imagem = (tipo = "image/png", tamanho = 64) => new Blob([new Uint8Array(tamanho)], { type: tipo });

describe("recompensas: imagem (constraint do caminho + bucket privado)", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let adminOutra: Usuario;
  let empresa: string;
  let outraEmpresa: string;
  let recompensa: string;
  let outraRecompensa: string;

  beforeAll(async () => {
    [admin, vendedor, adminOutra] = await Promise.all(["rimg-admin", "rimg-vendedor", "rimg-admin-outra"].map(criarUsuario));
    const { data: empresas } = await servico
      .from("empresas")
      .insert([{ nome: `Recompensa imagem A ${sufixo}` }, { nome: `Recompensa imagem B ${sufixo}` }])
      .select("id, nome")
      .order("nome");
    empresa = empresas![0].id;
    outraEmpresa = empresas![1].id;
    await servico.from("empresa_membros").insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" },
      { empresa_id: outraEmpresa, user_id: adminOutra.id, papel: "admin" },
    ]);

    recompensa = randomUUID();
    outraRecompensa = randomUUID();
    const { error } = await admin.cliente.from("recompensas").insert([
      { id: recompensa, empresa_id: empresa, nome: "Vale-presente", custo_moedas: 100 },
      { id: outraRecompensa, empresa_id: empresa, nome: "Camiseta", custo_moedas: 50 },
    ]);
    expect(error).toBeNull();
  });

  describe("constraint recompensas_imagem_caminho_da_propria_pasta", () => {
    it("aceita nulo e o caminho da própria pasta (empresa/recompensa)", async () => {
      const semImagem = await admin.cliente.from("recompensas").update({ imagem_caminho: null }).eq("id", recompensa);
      expect(semImagem.error).toBeNull();
      const { error } = await admin.cliente
        .from("recompensas")
        .update({ imagem_caminho: `${empresa}/${recompensa}/${randomUUID()}.webp` })
        .eq("id", recompensa);
      expect(error).toBeNull();
    });

    it("rejeita pasta de outra recompensa, de outra empresa e caminho sem pasta", async () => {
      const deOutraRecompensa = await admin.cliente
        .from("recompensas")
        .update({ imagem_caminho: `${empresa}/${outraRecompensa}/${randomUUID()}.webp` })
        .eq("id", recompensa);
      expect(deOutraRecompensa.error).not.toBeNull();

      const deOutraEmpresa = await admin.cliente
        .from("recompensas")
        .update({ imagem_caminho: `${outraEmpresa}/${recompensa}/${randomUUID()}.webp` })
        .eq("id", recompensa);
      expect(deOutraEmpresa.error).not.toBeNull();

      const semPasta = await admin.cliente.from("recompensas").update({ imagem_caminho: `${randomUUID()}.webp` }).eq("id", recompensa);
      expect(semPasta.error).not.toBeNull();
    });

    it("rejeita já na criação", async () => {
      const id = randomUUID();
      const { error } = await admin.cliente.from("recompensas").insert({
        id,
        empresa_id: empresa,
        nome: "Com imagem alheia",
        custo_moedas: 10,
        imagem_caminho: `${outraEmpresa}/${id}/${randomUUID()}.webp`,
      });
      expect(error).not.toBeNull();
    });

    it("só o admin grava a coluna (vendedor não atualiza a recompensa)", async () => {
      const caminho = `${empresa}/${recompensa}/${randomUUID()}.webp`;
      await vendedor.cliente.from("recompensas").update({ imagem_caminho: caminho }).eq("id", recompensa);
      const { data } = await servico.from("recompensas").select("imagem_caminho").eq("id", recompensa).single();
      expect(data!.imagem_caminho).not.toBe(caminho);
    });
  });

  describe("bucket recompensas (privado)", () => {
    let caminho: string;

    beforeAll(() => {
      caminho = `${empresa}/${recompensa}/${randomUUID()}.png`;
    });

    it("é privado, com limite de 3 MB e só JPEG/PNG/WebP", async () => {
      const { data: bucket, error } = await servico.storage.getBucket(BUCKET);
      expect(error).toBeNull();
      expect(bucket!.public).toBe(false);
      expect(bucket!.file_size_limit).toBe(3145728);
      expect([...(bucket!.allowed_mime_types ?? [])].sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    });

    it("admin envia na pasta da própria empresa", async () => {
      const { error } = await admin.cliente.storage.from(BUCKET).upload(caminho, imagem(), { contentType: "image/png" });
      expect(error).toBeNull();
    });

    it("membro não-admin da mesma empresa não envia", async () => {
      const { error } = await vendedor.cliente.storage
        .from(BUCKET)
        .upload(`${empresa}/${recompensa}/${randomUUID()}.png`, imagem(), { contentType: "image/png" });
      expect(error).not.toBeNull();
    });

    it("admin de outra empresa não envia na pasta desta empresa", async () => {
      const { error } = await adminOutra.cliente.storage
        .from(BUCKET)
        .upload(`${empresa}/${recompensa}/${randomUUID()}.png`, imagem(), { contentType: "image/png" });
      expect(error).not.toBeNull();
    });

    it("caminho que não começa com o uuid da empresa é negado", async () => {
      const { error } = await admin.cliente.storage.from(BUCKET).upload(`${randomUUID()}.png`, imagem(), { contentType: "image/png" });
      expect(error).not.toBeNull();
    });

    it("o bucket recusa SVG, tipo fora da lista e arquivo acima de 3 MB", async () => {
      const base = `${empresa}/${recompensa}`;
      const svg = await admin.cliente.storage
        .from(BUCKET)
        .upload(`${base}/${randomUUID()}.svg`, imagem("image/svg+xml"), { contentType: "image/svg+xml" });
      expect(svg.error).not.toBeNull();
      const texto = await admin.cliente.storage
        .from(BUCKET)
        .upload(`${base}/${randomUUID()}.txt`, imagem("text/plain"), { contentType: "text/plain" });
      expect(texto.error).not.toBeNull();
      const grande = await admin.cliente.storage
        .from(BUCKET)
        .upload(`${base}/${randomUUID()}.png`, imagem("image/png", 3 * 1024 * 1024 + 1), { contentType: "image/png" });
      expect(grande.error).not.toBeNull();
    });

    it("membro ativo da empresa lê (URL assinada em lote); membro de outra empresa não", async () => {
      const { data, error } = await vendedor.cliente.storage.from(BUCKET).createSignedUrls([caminho], 60);
      expect(error).toBeNull();
      expect(data![0].error).toBeNull();
      expect(data![0].signedUrl).toContain("token=");

      const alheio = await adminOutra.cliente.storage.from(BUCKET).createSignedUrls([caminho], 60);
      expect(alheio.data?.[0]?.signedUrl ?? "").toBe("");
      const baixa = await adminOutra.cliente.storage.from(BUCKET).download(caminho);
      expect(baixa.error).not.toBeNull();
    });

    it("não-admin não remove; admin remove", async () => {
      const negado = await vendedor.cliente.storage.from(BUCKET).remove([caminho]);
      expect(negado.data ?? []).toHaveLength(0);
      const aindaExiste = await servico.storage.from(BUCKET).download(caminho);
      expect(aindaExiste.error).toBeNull();

      const removido = await admin.cliente.storage.from(BUCKET).remove([caminho]);
      expect(removido.error).toBeNull();
      expect(removido.data).toHaveLength(1);
    });
  });
});
