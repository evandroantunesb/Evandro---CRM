/**
 * PDF público do contrato (/contrato/[token]/pdf): mesmo token do link, sem login, e as mesmas regras da página —
 * token desconhecido é 404 e contrato com campo sem resolver não sai (409). O cabeçalho usa a marca da empresa do
 * contrato (logo de fundo claro assinado), nunca a da Raion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let linha: { conteudo: string; empresa_id: string; negocios: { titulo: string } | null } | null = null;
const assinadas: string[] = [];
const respostas: Record<string, () => unknown> = {
  contratos: () => linha,
  proposta_identidades: () => ({ logo_url: "e1/logo.png", nome_exibicao: "Sol Forte" }),
  empresas: () => ({ nome: "Solar Exemplo Ltda." }),
};
vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    from: (tabela: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: respostas[tabela](), error: null }) }) }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (caminho: string) => {
          assinadas.push(`${bucket}:${caminho}`);
          // Sem rede no teste: a URL assinada não resolve e o PDF tem de sair assim mesmo.
          return { data: null, error: new Error("sem rede no teste") };
        },
      }),
    },
  }),
}));

const { GET } = await import("@/app/contrato/[token]/pdf/route");

const pedir = () => GET(new Request("http://localhost/contrato/abc/pdf"), { params: Promise.resolve({ token: "abc" }) } as never);

beforeEach(() => {
  linha = null;
  assinadas.length = 0;
});

describe("PDF do contrato", () => {
  it("token desconhecido: 404", async () => {
    expect((await pedir()).status).toBe(404);
  });

  it("contrato com campo sem resolver: 409, sem PDF", async () => {
    linha = { conteudo: "Contratante: {{cliente_nome}}", empresa_id: "e1", negocios: { titulo: "Sistema 5 kWp" } };
    const r = await pedir();
    expect(r.status).toBe(409);
    expect(await r.text()).toMatch(/sendo preparado/);
  });

  it("contrato pronto: PDF com nome de arquivo do negócio", async () => {
    linha = { conteudo: "CONTRATO DE INSTALAÇÃO\n\nCláusula 1ª — Objeto.\nO contratante: João.", empresa_id: "e1", negocios: { titulo: "Sistema 5 kWp" } };
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain('filename="contrato-Sistema-5-kWp.pdf"');
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("contrato pronto: busca o logo da empresa do contrato no bucket da marca", async () => {
    linha = { conteudo: "CONTRATO", empresa_id: "e1", negocios: { titulo: "Sistema 5 kWp" } };
    expect((await pedir()).status).toBe(200);
    expect(assinadas).toEqual(["proposta-marca:e1/logo.png"]);
  });
});
