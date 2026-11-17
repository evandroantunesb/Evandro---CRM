/**
 * Procuração pela obra (Engenharia): a montagem a partir de `dados_procuracao_obra` (sem valor nem contatos, que saem
 * "—") e a rota GET /engenharia/[id]/procuracao (recusa do banco, modelo vazio, PDF).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { montarProcuracaoObra, type DadosProcuracaoObra } from "@/lib/procuracao";

const mocks = vi.hoisted(() => ({ exigirPapel: vi.fn(), rpc: vi.fn(), lerMarcaPdf: vi.fn() }));
vi.mock("@/lib/sessao", () => ({ exigirPapel: mocks.exigirPapel }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/marca-pdf", () => ({ lerMarcaPdf: mocks.lerMarcaPdf }));

const { GET } = await import("@/app/(app)/engenharia/[id]/procuracao/route");

const obraId = "36f9b3b0-f944-421a-9d2d-750c3284c109";
const pedir = () => GET(new Request(`http://localhost/engenharia/${obraId}/procuracao`), { params: Promise.resolve({ id: obraId }) } as never);
const agora = new Date("2026-11-17T12:00:00-03:00");

const dados = (modelo: string): DadosProcuracaoObra => ({
  modelo,
  empresa_id: "e1",
  empresa: { nome: "Solar Exemplo Ltda.", cnpj: "12.345.678/0001-90" },
  negocio: { titulo: "Sistema 8 kWp", numero: 1043, unidade_consumidora: "58213907", qualif_distribuidora: "Copel", consumo_medio_kwh: 620 },
  contato: { nome: "Marcos Pereira", documento: "123.456.789-00", rg: null, endereco: "Rua das Palmeiras, 220", cidade: "Cascavel", uf: "PR", inscricao_estadual: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigirPapel.mockResolvedValue({ atual: { empresaId: "e1", papel: "operacao" } });
  mocks.lerMarcaPdf.mockResolvedValue({ logoUrl: null, nome: "Solar Exemplo Ltda." });
});

describe("montarProcuracaoObra", () => {
  it("valor, telefone e e-mail no modelo saem —; os dados da procuração saem preenchidos", () => {
    const r = montarProcuracaoObra(dados("OUTORGANTE: {{cliente_nome}}, UC {{negocio_uc}} ({{distribuidora}}). VALOR {{negocio_valor}} TEL {{cliente_telefone}} {{cliente_email}}"), agora);
    expect(r).toEqual({
      situacao: "ok",
      titulo: "Marcos Pereira",
      arquivo: "procuracao-Sistema-8-kWp.pdf",
      conteudo: "OUTORGANTE: Marcos Pereira, UC 58213907 (Copel). VALOR — TEL — —",
    });
  });

  it("modelo só com espaços: sem_modelo", () => {
    expect(montarProcuracaoObra(dados("  \n "), agora)).toEqual({ situacao: "sem_modelo" });
  });
});

describe("PDF da procuração pela obra", () => {
  it("exige os papéis da Engenharia e chama a RPC com a obra", async () => {
    mocks.rpc.mockResolvedValue({ data: dados(""), error: null });
    await pedir();
    expect(mocks.exigirPapel).toHaveBeenCalledWith("admin", "gestor", "operacao");
    expect(mocks.rpc).toHaveBeenCalledWith("dados_procuracao_obra", { p_obra_id: obraId });
  });

  it("recusa do banco (42501): 403", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Você não pode gerar a procuração desta obra." } });
    expect((await pedir()).status).toBe(403);
  });

  it("obra inexistente (sem dados): 404", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await pedir()).status).toBe(404);
  });

  it("sem modelo: 409 com a mensagem", async () => {
    mocks.rpc.mockResolvedValue({ data: dados(""), error: null });
    const r = await pedir();
    expect(r.status).toBe(409);
    expect(await r.text()).toBe("A empresa ainda não tem modelo de procuração.");
  });

  it("pronto: application/pdf, nome do arquivo e marca da empresa da obra", async () => {
    mocks.rpc.mockResolvedValue({ data: dados("OUTORGANTE: {{cliente_nome}}"), error: null });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('inline; filename="procuracao-Sistema-8-kWp.pdf"');
    expect(mocks.lerMarcaPdf).toHaveBeenCalledWith("e1");
  });
});
