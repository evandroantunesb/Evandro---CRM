/**
 * Geração do PDF de documento (contrato e procuração): um logo que não carrega (URL vencida, Storage fora do ar) não
 * derruba o PDF — sai sem o logo, com o nome da empresa.
 */
import { describe, expect, it, vi } from "vitest";
import { renderizarDocumentoPdf } from "@/lib/pdf-contrato";

vi.mock("@/lib/log", () => ({ registrarErro: vi.fn() }));

describe("renderizarDocumentoPdf", () => {
  it("logo que não carrega: PDF sai assim mesmo", async () => {
    const pdf = await renderizarDocumentoPdf({
      rotulo: "Procuração",
      titulo: "Marcos Pereira",
      conteudo: "OUTORGANTE: Marcos Pereira",
      marca: { logoUrl: "http://127.0.0.1:9/logo-que-nao-existe.png", nome: "Solar Exemplo Ltda." },
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("sem logo nem nome: PDF com o texto", async () => {
    const pdf = await renderizarDocumentoPdf({ rotulo: "Contrato", titulo: null, conteudo: "Texto", marca: { logoUrl: null, nome: null } });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
