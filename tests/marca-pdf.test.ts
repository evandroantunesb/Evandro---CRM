/**
 * Marca da empresa nos PDFs (contrato e procuração): o logo de fundo claro da identidade da proposta, assinado; só PNG
 * ou JPEG (o react-pdf não lê WebP); sem logo utilizável, só o nome. Nunca a marca Raion e nunca um erro no PDF.
 */
import { describe, expect, it, vi } from "vitest";
import { lerMarcaPdf } from "@/lib/marca-pdf";

vi.mock("@/lib/log", () => ({ registrarErro: vi.fn() }));

type Identidade = { logo_url: string | null; nome_exibicao: string | null } | null;

function adminFalso({
  identidade,
  empresa = { nome: "Solar Exemplo Ltda." },
  assinatura = async (caminho: string) => ({ data: { signedUrl: `https://assinada/${caminho}` }, error: null }),
}: {
  identidade: Identidade;
  empresa?: { nome: string } | null;
  assinatura?: (caminho: string) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
}) {
  const assinadas: string[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: tabela === "proposta_identidades" ? identidade : empresa, error: null }),
        }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (caminho: string) => {
          assinadas.push(`${bucket}:${caminho}`);
          return assinatura(caminho);
        },
      }),
    },
  };
  return { cliente: cliente as never, assinadas };
}

describe("lerMarcaPdf", () => {
  it("logo .png: URL assinada no bucket da marca, com o nome de exibição", async () => {
    const { cliente, assinadas } = adminFalso({ identidade: { logo_url: "e1/logo.png", nome_exibicao: "Sol Forte" } });
    expect(await lerMarcaPdf(cliente, "e1")).toEqual({ logoUrl: "https://assinada/e1/logo.png", nome: "Sol Forte" });
    expect(assinadas).toEqual(["proposta-marca:e1/logo.png"]);
  });

  it("logo .JPEG também serve", async () => {
    const { cliente } = adminFalso({ identidade: { logo_url: "e1/logo.JPEG", nome_exibicao: null } });
    expect((await lerMarcaPdf(cliente, "e1")).logoUrl).toBe("https://assinada/e1/logo.JPEG");
  });

  it("logo .webp: só o nome, sem assinar", async () => {
    const { cliente, assinadas } = adminFalso({ identidade: { logo_url: "e1/logo.webp", nome_exibicao: null } });
    expect(await lerMarcaPdf(cliente, "e1")).toEqual({ logoUrl: null, nome: "Solar Exemplo Ltda." });
    expect(assinadas).toEqual([]);
  });

  it("sem identidade: nome da empresa", async () => {
    const { cliente } = adminFalso({ identidade: null });
    expect(await lerMarcaPdf(cliente, "e1")).toEqual({ logoUrl: null, nome: "Solar Exemplo Ltda." });
  });

  it("assinatura com erro: logoUrl nulo, sem lançar", async () => {
    const { cliente } = adminFalso({
      identidade: { logo_url: "e1/logo.png", nome_exibicao: null },
      assinatura: async () => ({ data: null, error: new Error("objeto não encontrado") }),
    });
    expect(await lerMarcaPdf(cliente, "e1")).toEqual({ logoUrl: null, nome: "Solar Exemplo Ltda." });
  });

  it("assinatura que lança: logoUrl nulo", async () => {
    const { cliente } = adminFalso({
      identidade: { logo_url: "e1/logo.png", nome_exibicao: null },
      assinatura: async () => {
        throw new Error("rede");
      },
    });
    expect((await lerMarcaPdf(cliente, "e1")).logoUrl).toBeNull();
  });
});
