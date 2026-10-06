/**
 * Regras puras da imagem de recompensa (validação do arquivo, cálculo do recorte, caminho no
 * bucket) e a assinatura em lote de URLs. Não precisam de Supabase.
 */
import { describe, expect, it } from "vitest";
import {
  calcularDimensoesSaida,
  caminhoImagemRecompensaValido,
  extensaoDoTipo,
  LIMITE_BYTES_IMAGEM,
  montarCaminhoImagemRecompensa,
  validarArquivoImagem,
} from "@/lib/imagem-upload";
import { assinarImagensEmLote } from "@/lib/storage-imagens";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const RECOMPENSA = "22222222-2222-4222-8222-222222222222";
const ARQUIVO = "33333333-3333-4333-8333-333333333333";

describe("validarArquivoImagem", () => {
  it("aceita JPG, PNG e WebP até 3 MB (inclusive exatamente 3 MB)", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validarArquivoImagem({ type, size: 1024 })).toBeNull();
    }
    expect(validarArquivoImagem({ type: "image/png", size: LIMITE_BYTES_IMAGEM })).toBeNull();
  });

  it("recusa SVG, GIF, texto e tipo vazio", () => {
    for (const type of ["image/svg+xml", "image/gif", "text/plain", "application/pdf", ""]) {
      expect(validarArquivoImagem({ type, size: 1024 })).toMatch(/Formato não aceito/);
    }
  });

  it("recusa arquivo acima de 3 MB e arquivo vazio", () => {
    expect(validarArquivoImagem({ type: "image/jpeg", size: LIMITE_BYTES_IMAGEM + 1 })).toMatch(/3 MB/);
    expect(validarArquivoImagem({ type: "image/jpeg", size: 0 })).toMatch(/vazio/);
  });
});

describe("extensaoDoTipo", () => {
  it("mapeia o tipo final para a extensão do arquivo", () => {
    expect(extensaoDoTipo("image/webp")).toBe("webp");
    expect(extensaoDoTipo("image/jpeg")).toBe("jpg");
    expect(extensaoDoTipo("image/png")).toBe("png");
    expect(extensaoDoTipo("image/svg+xml")).toBeNull();
  });
});

describe("calcularDimensoesSaida", () => {
  it("reduz um recorte grande para no máximo 1200x900, mantendo a proporção 4:3", () => {
    expect(calcularDimensoesSaida(4000, 3000)).toEqual({ largura: 1200, altura: 900 });
    expect(calcularDimensoesSaida(2400, 1800)).toEqual({ largura: 1200, altura: 900 });
  });

  it("nunca amplia um recorte pequeno", () => {
    expect(calcularDimensoesSaida(400, 300)).toEqual({ largura: 400, altura: 300 });
  });

  it("respeita o limite mais restritivo e nunca devolve zero", () => {
    expect(calcularDimensoesSaida(3000, 6000)).toEqual({ largura: 450, altura: 900 });
    expect(calcularDimensoesSaida(1, 5000).largura).toBe(1);
  });

  it("aceita um máximo próprio (ex.: avatar quadrado)", () => {
    expect(calcularDimensoesSaida(1000, 1000, { largura: 512, altura: 512 })).toEqual({ largura: 512, altura: 512 });
  });
});

describe("caminho da imagem de recompensa", () => {
  it("monta <empresa>/<recompensa>/<arquivo>.<ext>", () => {
    expect(montarCaminhoImagemRecompensa(EMPRESA, RECOMPENSA, "webp", ARQUIVO)).toBe(`${EMPRESA}/${RECOMPENSA}/${ARQUIVO}.webp`);
  });

  it("aceita o caminho gerado pelo app em todas as extensões permitidas", () => {
    for (const ext of ["webp", "jpg", "jpeg", "png"]) {
      expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, montarCaminhoImagemRecompensa(EMPRESA, RECOMPENSA, ext, ARQUIVO))).toBe(true);
    }
  });

  it("recusa pasta de outra empresa ou de outra recompensa", () => {
    const outra = "44444444-4444-4444-8444-444444444444";
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${outra}/${RECOMPENSA}/${ARQUIVO}.webp`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${EMPRESA}/${outra}/${ARQUIVO}.webp`)).toBe(false);
  });

  it("recusa extensão não permitida, subpastas, travessia e nome fora do padrão", () => {
    const base = `${EMPRESA}/${RECOMPENSA}`;
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${base}/${ARQUIVO}.svg`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${base}/${ARQUIVO}.webp.exe`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${base}/sub/${ARQUIVO}.webp`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${base}/../${ARQUIVO}.webp`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${base}/foto.webp`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, `${base}/`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, RECOMPENSA, "")).toBe(false);
  });

  it("recusa ids que não são uuid (evita montar regex com texto livre)", () => {
    expect(caminhoImagemRecompensaValido(".*", RECOMPENSA, `x/${RECOMPENSA}/${ARQUIVO}.webp`)).toBe(false);
    expect(caminhoImagemRecompensaValido(EMPRESA, ".*", `${EMPRESA}/x/${ARQUIVO}.webp`)).toBe(false);
  });
});

type Chamada = { bucket: string; caminhos: string[]; expira: number };
type Resposta = { data: { error: string | null; path: string | null; signedUrl: string | null }[] | null; error: unknown };

function clienteFalso(resposta: Resposta, chamadas: Chamada[]) {
  return {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (caminhos: string[], expira: number) => {
          chamadas.push({ bucket, caminhos, expira });
          return resposta;
        },
      }),
    },
  };
}

describe("assinarImagensEmLote", () => {
  it("faz uma única chamada, ignora nulos/vazios/repetidos e mapeia caminho -> url", async () => {
    const chamadas: Chamada[] = [];
    const cliente = clienteFalso(
      {
        data: [
          { error: null, path: "a/1.webp", signedUrl: "https://x/a1" },
          { error: null, path: "b/2.webp", signedUrl: "https://x/b2" },
        ],
        error: null,
      },
      chamadas,
    );
    const urls = await assinarImagensEmLote(cliente, "recompensas", ["a/1.webp", null, undefined, "", "b/2.webp", "a/1.webp"]);
    expect(chamadas).toEqual([{ bucket: "recompensas", caminhos: ["a/1.webp", "b/2.webp"], expira: 3600 }]);
    expect(urls.get("a/1.webp")).toBe("https://x/a1");
    expect(urls.get("b/2.webp")).toBe("https://x/b2");
  });

  it("não chama o Storage quando não há caminhos", async () => {
    const chamadas: Chamada[] = [];
    const urls = await assinarImagensEmLote(clienteFalso({ data: [], error: null }, chamadas), "recompensas", [null, undefined]);
    expect(chamadas).toHaveLength(0);
    expect(urls.size).toBe(0);
  });

  it("deixa de fora os arquivos que falharam e nunca lança", async () => {
    const chamadas: Chamada[] = [];
    const parcial = clienteFalso(
      {
        data: [
          { error: "Object not found", path: "a/1.webp", signedUrl: "" },
          { error: null, path: "b/2.webp", signedUrl: "https://x/b2" },
        ],
        error: null,
      },
      chamadas,
    );
    const urls = await assinarImagensEmLote(parcial, "recompensas", ["a/1.webp", "b/2.webp"]);
    expect([...urls.keys()]).toEqual(["b/2.webp"]);

    const comErro = await assinarImagensEmLote(clienteFalso({ data: null, error: new Error("falhou") }, chamadas), "recompensas", ["a/1.webp"]);
    expect(comErro.size).toBe(0);

    const quebrado = {
      storage: {
        from: () => ({
          createSignedUrls: async (): Promise<Resposta> => {
            throw new Error("rede");
          },
        }),
      },
    };
    expect((await assinarImagensEmLote(quebrado, "recompensas", ["a/1.webp"])).size).toBe(0);
  });
});
