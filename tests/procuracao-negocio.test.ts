/** Rota GET /negocios/[id]/procuracao: papel, situações do modelo e o PDF com o nome de arquivo do negócio. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  criarClienteServidor: vi.fn(),
  montarProcuracaoNegocio: vi.fn(),
  lerMarcaPdf: vi.fn(),
}));

vi.mock("@/lib/sessao", () => ({ exigirPapel: mocks.exigirPapel }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: mocks.criarClienteServidor }));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: () => ({}) }));
vi.mock("@/lib/procuracao", () => ({ montarProcuracaoNegocio: mocks.montarProcuracaoNegocio, MENSAGEM_SEM_MODELO_PROCURACAO: "A empresa ainda não tem modelo de procuração." }));
vi.mock("@/lib/marca-pdf", () => ({ lerMarcaPdf: mocks.lerMarcaPdf }));

const { GET } = await import("@/app/(app)/negocios/[id]/procuracao/route");

const negocioId = "36f9b3b0-f944-421a-9d2d-750c3284c109";
const pedir = () => GET(new Request(`http://localhost/negocios/${negocioId}/procuracao`), { params: Promise.resolve({ id: negocioId }) } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigirPapel.mockResolvedValue({ atual: { empresaId: "e1", papel: "vendedor" } });
  mocks.criarClienteServidor.mockResolvedValue({});
  mocks.lerMarcaPdf.mockResolvedValue({ logoUrl: null, nome: "Solar Exemplo Ltda." });
});

describe("PDF da procuração pelo negócio", () => {
  it("exige os papéis de proposta e contrato", async () => {
    mocks.montarProcuracaoNegocio.mockResolvedValue({ situacao: "sem_modelo" });
    await pedir();
    expect(mocks.exigirPapel).toHaveBeenCalledWith("admin", "gestor", "vendedor");
  });

  it("sem modelo: 409 com a mensagem", async () => {
    mocks.montarProcuracaoNegocio.mockResolvedValue({ situacao: "sem_modelo" });
    const r = await pedir();
    expect(r.status).toBe(409);
    expect(await r.text()).toBe("A empresa ainda não tem modelo de procuração.");
  });

  it("negócio que a pessoa não vê: 404", async () => {
    mocks.montarProcuracaoNegocio.mockResolvedValue({ situacao: "nao_encontrado" });
    expect((await pedir()).status).toBe(404);
  });

  it("id inválido: 404 sem consultar", async () => {
    const r = await GET(new Request("http://localhost/negocios/x/procuracao"), { params: Promise.resolve({ id: "x" }) } as never);
    expect(r.status).toBe(404);
    expect(mocks.montarProcuracaoNegocio).not.toHaveBeenCalled();
  });

  it("pronto: application/pdf e nome procuracao-…", async () => {
    mocks.montarProcuracaoNegocio.mockResolvedValue({ situacao: "ok", titulo: "Marcos Pereira", conteudo: "OUTORGANTE: Marcos", arquivo: "procuracao-Sistema-8-kWp.pdf" });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('inline; filename="procuracao-Sistema-8-kWp.pdf"');
    expect(mocks.lerMarcaPdf).toHaveBeenCalledWith({}, "e1");
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
