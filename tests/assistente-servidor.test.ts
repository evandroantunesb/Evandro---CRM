import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sessao", () => ({ obterSessao: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: vi.fn() }));

const { lerOnboarding, precisaDoAssistente } = await import("@/lib/assistente-servidor");

const cliente = (resposta: { data: unknown; error: unknown }) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => resposta }) }) }) }) as never;

describe("lerOnboarding", () => {
  it("devolve o estado gravado", async () => {
    const linha = { passo_atual: 2, pulados: [1], concluido_em: null };
    expect(await lerOnboarding(cliente({ data: linha, error: null }), "e")).toEqual(linha);
  });

  it("sem linha ou com erro: nulo (o app segue normal)", async () => {
    expect(await lerOnboarding(cliente({ data: null, error: null }), "e")).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lerOnboarding(cliente({ data: null, error: { message: "falhou" } }), "e")).toBeNull();
  });
});

describe("precisaDoAssistente", () => {
  const pendente = { passo_atual: 1, pulados: [], concluido_em: null };
  it("só o admin, com o assistente pendente", () => {
    expect(precisaDoAssistente("admin", pendente)).toBe(true);
    expect(precisaDoAssistente("admin", { ...pendente, concluido_em: "2026-11-11T10:00:00Z" })).toBe(false);
    expect(precisaDoAssistente("vendedor", pendente)).toBe(false);
    expect(precisaDoAssistente("gestor", pendente)).toBe(false);
    expect(precisaDoAssistente("admin", null)).toBe(false);
    expect(precisaDoAssistente(undefined, pendente)).toBe(false);
  });
});
