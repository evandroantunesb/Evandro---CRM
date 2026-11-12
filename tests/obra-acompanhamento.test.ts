import { beforeEach, describe, expect, it, vi } from "vitest";
import { ehRotaPublica } from "@/lib/rotas-publicas";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createSignedUrls: vi.fn(), createSignedUrl: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    storage: {
      from: (bucket: string) =>
        bucket === "obra-fotos" ? { createSignedUrls: mocks.createSignedUrls } : { createSignedUrl: mocks.createSignedUrl },
    },
  }),
}));

const { carregarAcompanhamento } = await import("@/lib/obras/acompanhamento");

const ETAPAS = ["contrato", "entrada", "projeto_art", "material_comprado", "protocolo", "material_entregue", "instalacao", "vistoria", "conexao", "entrega"];
const empresa = { nome: "Solar Campinas", logo_escura: "e1/logo.png", cor_primaria: null, cor_destaque: null, whatsapp: "(19) 99812-4410" };
const ativa = {
  situacao: "ativa",
  cliente_primeiro_nome: "Marcos",
  empresa,
  etapas: ETAPAS.map((etapa, i) => ({
    etapa,
    feita_em: i < 7 ? "2026-11-10" : null,
    prevista_para: etapa === "vistoria" ? "2026-11-21" : null,
    nao_se_aplica: false,
    fotos: etapa === "instalacao" ? ["e1/o1/instalacao/a.webp", "e1/o1/instalacao/b.webp"] : [],
  })),
  atualizado_em: "2026-11-10T20:40:00+00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSignedUrls.mockImplementation(async (caminhos: string[]) => ({ data: caminhos.map((p) => ({ path: p, signedUrl: `https://assinado/${p}` })), error: null }));
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://assinado/logo" }, error: null });
});

describe("rotas públicas", () => {
  it("/obra/x é pública e /obras continua exigindo login", () => {
    expect(ehRotaPublica("/obra/abc")).toBe(true);
    expect(ehRotaPublica("/obra")).toBe(true);
    expect(ehRotaPublica("/obras")).toBe(false);
    expect(ehRotaPublica("/obras/123")).toBe(false);
    expect(ehRotaPublica("/captura/x")).toBe(true);
  });
});

describe("carregarAcompanhamento", () => {
  it("token inválido", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await carregarAcompanhamento("x")).toEqual({ tipo: "invalido" });
    expect(await carregarAcompanhamento("")).toEqual({ tipo: "invalido" });
  });

  it("obra cancelada: encerrada, com o nome da empresa", async () => {
    mocks.rpc.mockResolvedValue({ data: { situacao: "encerrada", empresa }, error: null });
    expect(await carregarAcompanhamento("t")).toMatchObject({ tipo: "encerrada", empresa: { nome: "Solar Campinas" } });
  });

  it("fotos viram URLs assinadas e o VM não tem chave fora do contrato", async () => {
    mocks.rpc.mockResolvedValue({ data: ativa, error: null });
    const r = await carregarAcompanhamento("t");
    expect(mocks.rpc).toHaveBeenCalledWith("acompanhamento_obra", { p_token: "t" });
    if (r.tipo !== "ativa") throw new Error("esperava ativa");
    expect(Object.keys(r).sort()).toEqual(["andamento", "atualizadoEm", "clientePrimeiroNome", "empresa", "etapas", "tipo"]);
    expect(Object.keys(r.empresa).sort()).toEqual(["corDestaque", "corPrimaria", "logoUrl", "nome", "whatsapp"]);
    expect(r.empresa.logoUrl).toBe("https://assinado/logo");
    const instalacao = r.etapas.find((e) => e.etapa === "instalacao")!;
    expect(instalacao.fotos).toEqual(["https://assinado/e1/o1/instalacao/a.webp", "https://assinado/e1/o1/instalacao/b.webp"]);
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(["e1/o1/instalacao/a.webp", "e1/o1/instalacao/b.webp"], 3600);
    expect(r.andamento).toEqual({ resolvidas: 7, total: 10, atual: "vistoria", concluida: false });
  });

  it("erro na leitura: inválido, sem quebrar a página", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "falhou" } });
    expect(await carregarAcompanhamento("t")).toEqual({ tipo: "invalido" });
  });
});
