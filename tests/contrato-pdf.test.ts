/**
 * PDF público do contrato (/contrato/[token]/pdf): mesmo token do link, sem login, e as mesmas regras da página —
 * token desconhecido é 404 e contrato com campo sem resolver não sai (409).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let linha: { conteudo: string; negocios: { titulo: string } | null } | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }) }) }),
  }),
}));

const { GET } = await import("@/app/contrato/[token]/pdf/route");

const pedir = () => GET(new Request("http://localhost/contrato/abc/pdf"), { params: Promise.resolve({ token: "abc" }) } as never);

beforeEach(() => {
  linha = null;
});

describe("PDF do contrato", () => {
  it("token desconhecido: 404", async () => {
    expect((await pedir()).status).toBe(404);
  });

  it("contrato com campo sem resolver: 409, sem PDF", async () => {
    linha = { conteudo: "Contratante: {{cliente_nome}}", negocios: { titulo: "Sistema 5 kWp" } };
    const r = await pedir();
    expect(r.status).toBe(409);
    expect(await r.text()).toMatch(/sendo preparado/);
  });

  it("contrato pronto: PDF com nome de arquivo do negócio", async () => {
    linha = { conteudo: "CONTRATO DE INSTALAÇÃO\n\nCláusula 1ª — Objeto.\nO contratante: João.", negocios: { titulo: "Sistema 5 kWp" } };
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain('filename="contrato-Sistema-5-kWp.pdf"');
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
