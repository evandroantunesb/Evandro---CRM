import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sessao", () => ({ obterSessao: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: vi.fn() }));

const { lerMarcaEmpresa } = await import("@/lib/marca-servidor");

type Linha = { cor_primaria: string | null; cor_destaque: string | null; logo_url: string | null; logo_escuro_url: string | null };
/** Cliente da sessão falso: só o `rpc`. Se alguém tentar assinar pela sessão, o teste quebra (o papel operacao não lê o Storage). */
function cliente(resposta: { data: Linha[] | null; error: unknown }) {
  return {
    rpc: async () => resposta,
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          throw new Error("a logo não pode ser assinada pela sessão");
        },
      }),
    },
  } as never;
}
/** Quem assina a logo no servidor (depois de o RPC provar que a pessoa é membro). */
const assinar = async (caminho: string) => `u:${caminho}`;
const linha = (extra: Partial<Linha>): Linha => ({ cor_primaria: null, cor_destaque: null, logo_url: null, logo_escuro_url: null, ...extra });

describe("lerMarcaEmpresa", () => {
  it("cores válidas viram a marca; a barra usa a logo de fundo escuro, assinada no servidor", async () => {
    const r = await lerMarcaEmpresa(
      cliente({ data: [linha({ cor_primaria: "#123C45", cor_destaque: "#0E9F8A", logo_url: "e/claro.png", logo_escuro_url: "e/escuro.png" })], error: null }),
      "e",
      assinar,
    );
    expect(r).toEqual({ marca: { barra: "#123C45", destaque: "#0E9F8A" }, logoUrl: "u:e/escuro.png" });
  });

  it("só a logo de fundo claro: a barra fica com a do Raion (decisão de 10/11/2026)", async () => {
    expect(await lerMarcaEmpresa(cliente({ data: [linha({ logo_url: "e/claro.png" })], error: null }), "e", assinar)).toEqual({ marca: null, logoUrl: null });
  });

  it("sem identidade ou com erro: padrão Raion", async () => {
    expect(await lerMarcaEmpresa(cliente({ data: [], error: null }), "e", assinar)).toEqual({ marca: null, logoUrl: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lerMarcaEmpresa(cliente({ data: null, error: { message: "falhou" } }), "e", assinar)).toEqual({ marca: null, logoUrl: null });
  });

  it("falha ao assinar a logo: fica a do Raion, sem quebrar", async () => {
    const r = await lerMarcaEmpresa(cliente({ data: [linha({ logo_escuro_url: "e/escuro.png" })], error: null }), "e", async () => null);
    expect(r).toEqual({ marca: null, logoUrl: null });
  });
});
