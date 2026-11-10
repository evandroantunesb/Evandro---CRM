import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sessao", () => ({ obterSessao: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: vi.fn() }));

const { lerMarcaEmpresa } = await import("@/lib/marca-servidor");

type Linha = { cor_primaria: string | null; cor_destaque: string | null; logo_url: string | null; logo_escuro_url: string | null };
/** Cliente falso: `rpc` devolve as linhas (ou erro); o armazenamento assina "u:<caminho>". */
function cliente(resposta: { data: Linha[] | null; error: unknown }) {
  return {
    rpc: async () => resposta,
    storage: { from: () => ({ createSignedUrl: async (caminho: string) => ({ data: { signedUrl: `u:${caminho}` }, error: null }) }) },
  } as never;
}
const linha = (extra: Partial<Linha>): Linha => ({ cor_primaria: null, cor_destaque: null, logo_url: null, logo_escuro_url: null, ...extra });

describe("lerMarcaEmpresa", () => {
  it("cores válidas viram a marca; a logo escura tem preferência", async () => {
    const r = await lerMarcaEmpresa(
      cliente({ data: [linha({ cor_primaria: "#123C45", cor_destaque: "#0E9F8A", logo_url: "e/claro.png", logo_escuro_url: "e/escuro.png" })], error: null }),
      "e",
    );
    expect(r).toEqual({ marca: { barra: "#123C45", destaque: "#0E9F8A" }, logoUrl: "u:e/escuro.png" });
  });

  it("sem logo escura usa a clara; sem cores, só a logo", async () => {
    expect(await lerMarcaEmpresa(cliente({ data: [linha({ logo_url: "e/claro.png" })], error: null }), "e")).toEqual({ marca: null, logoUrl: "u:e/claro.png" });
  });

  it("sem identidade ou com erro: padrão Raion", async () => {
    expect(await lerMarcaEmpresa(cliente({ data: [], error: null }), "e")).toEqual({ marca: null, logoUrl: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lerMarcaEmpresa(cliente({ data: null, error: { message: "falhou" } }), "e")).toEqual({ marca: null, logoUrl: null });
  });
});
