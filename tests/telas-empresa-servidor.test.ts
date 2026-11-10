import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sessao", () => ({ obterSessao: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: vi.fn() }));

const { lerTelasEmpresa } = await import("@/lib/telas-empresa-servidor");
const { areaLigada, TELAS_PADRAO } = await import("@/lib/telas-empresa");

type Resposta = { data: unknown; error: unknown };
/** Cliente falso: cada tabela devolve a resposta dada; `rpc` devolve o produto. */
function cliente({ telas, empresa, produto }: { telas: Resposta; empresa: Resposta; produto: Resposta }) {
  const tabela = (r: Resposta) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => r }) }) });
  return {
    from: (nome: string) => tabela(nome === "empresa_telas" ? telas : empresa),
    rpc: async () => produto,
  } as never;
}
const ok = (data: unknown): Resposta => ({ data, error: null });

describe("lerTelasEmpresa", () => {
  it("lê as desligadas, o plano e a liberação do Eletroposto", async () => {
    const t = await lerTelasEmpresa(cliente({ telas: ok({ desligadas: ["obras"] }), empresa: ok({ eletroposto_ativo: true }), produto: ok("pro") }), "e1");
    expect(areaLigada(t, "obras")).toBe(false);
    expect(areaLigada(t, "eletroposto")).toBe(true);
    expect(areaLigada(t, "forecast")).toBe(true);
  });

  it("sem linha de telas: nada desligado; plano Solo vale", async () => {
    const t = await lerTelasEmpresa(cliente({ telas: ok(null), empresa: ok({ eletroposto_ativo: false }), produto: ok("solo") }), "e1");
    expect(t.solo).toBe(true);
  });

  it("erro na leitura: o padrão de sempre (PRO, tudo ligado)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = await lerTelasEmpresa(cliente({ telas: { data: null, error: { message: "falhou" } }, empresa: ok(null), produto: ok("pro") }), "e1");
    expect(t).toBe(TELAS_PADRAO);
  });
});
