import { describe, expect, it } from "vitest";
import { problemaArquivoCompras, selosOrcamentos, tipoArquivoCompras, type OrcamentoVM } from "@/lib/compras/orcamentos-regras";

const base: OrcamentoVM = {
  id: "a",
  fornecedor: "Fornecedor",
  valorTotal: 1000,
  cobertura: "kit_completo",
  itensDescricao: null,
  entregaPrevista: "2026-11-14",
  validoAte: "2026-11-10",
  condicaoPagamento: null,
  observacao: null,
  arquivo: { nome: "o.pdf", url: null },
  pedido: null,
  descartado: false,
  motivoDescarte: null,
  criadoEm: "2026-11-06T12:00:00Z",
};
const orc = (extra: Partial<OrcamentoVM>): OrcamentoVM => ({ ...base, ...extra });
const HOJE = "2026-11-06";

describe("selos dos orçamentos", () => {
  it("escolhido, entrega mais rápida e parcial (como no desenho)", () => {
    const selos = selosOrcamentos(
      [
        orc({ id: "sul", entregaPrevista: "2026-11-14", pedido: { id: "p", numero: 145, criadoEm: "2026-11-05T12:00:00Z" } }),
        orc({ id: "atacado", entregaPrevista: "2026-11-12" }),
        orc({ id: "outro", entregaPrevista: "2026-11-13" }),
        orc({ id: "ferragens", entregaPrevista: "2026-11-09", cobertura: "parte", itensDescricao: "Estrutura" }),
      ],
      HOJE,
    );
    expect(selos.get("sul")).toEqual(["escolhido"]);
    expect(selos.get("atacado")).toEqual(["mais_rapida"]);
    expect(selos.get("outro")).toEqual([]);
    // Parcial não concorre a "entrega mais rápida".
    expect(selos.get("ferragens")).toEqual(["parcial"]);
  });

  it("sem selo de rapidez com um só candidato ou empate; vencido só sem pedido; descartado fica de fora", () => {
    expect(selosOrcamentos([orc({ id: "x" })], HOJE).get("x")).toEqual([]);
    const empate = selosOrcamentos([orc({ id: "x" }), orc({ id: "y" })], HOJE);
    expect([empate.get("x"), empate.get("y")]).toEqual([[], []]);
    const vencidos = selosOrcamentos(
      [orc({ id: "v", validoAte: "2026-11-05" }), orc({ id: "e", validoAte: "2026-11-05", pedido: { id: "p", numero: 1, criadoEm: "2026-11-04T12:00:00Z" } })],
      HOJE,
    );
    expect(vencidos.get("v")).toEqual(["vencido"]);
    expect(vencidos.get("e")).toEqual(["escolhido"]);
    expect(selosOrcamentos([orc({ id: "d", descartado: true })], HOJE).has("d")).toBe(false);
  });
});

describe("tipo do arquivo de compra", () => {
  it("planilha pela extensão (o Windows manda .csv como Excel)", () => {
    expect(tipoArquivoCompras("tabela.csv", "application/vnd.ms-excel")).toBe("text/csv");
    expect(tipoArquivoCompras("tabela.XLSX", "")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(tipoArquivoCompras("orc.pdf", "application/pdf")).toBe("application/pdf");
    expect(tipoArquivoCompras("planilha.xls", "application/vnd.ms-excel")).toBeNull();
  });

  it("recusa vazio, acima de 10 MB e tipo fora da lista", () => {
    expect(problemaArquivoCompras({ nome: "a.pdf", tamanho: 0, tipoMime: "application/pdf" })).toContain("vazio");
    expect(problemaArquivoCompras({ nome: "a.pdf", tamanho: 11 * 1024 * 1024, tipoMime: "application/pdf" })).toContain("10 MB");
    expect(problemaArquivoCompras({ nome: "a.zip", tamanho: 10, tipoMime: "application/zip" })).toContain("planilha");
    expect(problemaArquivoCompras({ nome: "a.jpg", tamanho: 10, tipoMime: "image/jpeg" })).toBeNull();
  });
});
