import { describe, expect, it } from "vitest";
import { GeracaoMensalDaProposta } from "@/app/proposta/[token]/geracao-mensal";
import { distribuirGeracaoMensal, NOTA_GERACAO_MENSAL } from "@/lib/geracao-mensal";
import { gerarPdfPropostaSimples } from "@/lib/propostas/emissao-simples-pdf";
import { SecaoGeracaoMensal } from "@/lib/propostas/pdf-geracao-mensal";
import { paletaDaEmpresa } from "@/lib/propostas/pdf-simples";
import { montarDadosEmissaoSimples, type EntradaEmissaoSimples } from "@/lib/propostas/proposta-simples";

/**
 * Gráfico "Geração e consumo mês a mês" (proposta completa, PR 4) no PDF e na página on-line. As seções são componentes
 * sem estado: o teste percorre a árvore que elas devolvem e junta os textos.
 */

function textos(no: unknown): string[] {
  if (no == null || typeof no === "boolean") return [];
  if (typeof no === "string" || typeof no === "number") return [String(no)];
  if (Array.isArray(no)) return no.flatMap(textos);
  const el = no as { type?: unknown; props?: Record<string, unknown> };
  if (typeof el.type === "function") return textos((el.type as (p: unknown) => unknown)(el.props));
  return [...(typeof el.props?.["aria-label"] === "string" ? [el.props["aria-label"] as string] : []), ...textos(el.props?.children)];
}

const CURVA = [5.9, 5.7, 5.3, 4.6, 3.8, 3.4, 3.6, 4.5, 4.7, 5.4, 6, 6.1];
const MENSAL = {
  geracaoKwh: distribuirGeracaoMensal(732, CURVA)!,
  consumoKwh: [720, 700, 680, 630, 600, 600, 610, 620, 630, 650, 680, 700],
  consumoOrigem: "informado" as const,
};

describe("seção do PDF", () => {
  it("tem título, legendas, meses, resumo e a nota", () => {
    const t = textos(SecaoGeracaoMensal({ mensal: MENSAL, p: paletaDaEmpresa("#0F0F10", "#D4AF37") })).join(" | ");
    expect(t).toContain("Geração e consumo mês a mês");
    expect(t).toContain("Geração estimada");
    expect(t).toContain("Seu consumo");
    expect(t).toContain("Jan");
    expect(t).toContain("Dez");
    expect(t).toContain("Maior geração: Dez 908 kWh · Menor: Jun 506 kWh · Ano: 8.784 kWh");
    expect(t).toContain(NOTA_GERACAO_MENSAL);
  });
});

describe("seção da página on-line", () => {
  it("tem título, legenda, descrição acessível e a nota", () => {
    const t = textos(GeracaoMensalDaProposta({ mensal: { ...MENSAL, consumoKwh: Array(12).fill(650), consumoOrigem: "media" } })).join(" | ");
    expect(t).toContain("Geração e consumo mês a mês");
    expect(t).toContain("Seu consumo médio (650 kWh)");
    expect(t).toContain("Geração estimada de 506 kWh em Jun a 908 kWh em Dez");
    expect(t).toContain(NOTA_GERACAO_MENSAL);
  });
});

describe("PDF completo", () => {
  it("com o gráfico, o PDF continua válido e não perde páginas", async () => {
    const base: EntradaEmissaoSimples = {
      contatoNome: "Maria Souza",
      contatoEndereco: "Rua A, 10 · Cascavel · PR",
      valorNegocio: 24500,
      consumoMedioKwhNegocio: 450,
      componentes: [{ tipo: "modulo", descricao: "Módulo 540 W", quantidade: 10, potencia_w: 540 }],
      produtividadeConfirmada: { valor: 120, em: "2026-10-20T12:00:00.000Z", fonte: "Usinas da região", responsavel: "Eng. Teste" },
      validadeAte: "2026-11-30",
      condicoes: {
        entrada: { aVista: { desconto: "0" }, parcelado: null, financiamento: null, personalizado: null, observacao: "50% na assinatura e 50% na instalação" },
        regras: { personalizadoAtivo: true, taxas: { cartao: [], boleto: [] }, limiteDesconto: 0, descontoAprovado: 0 },
      },
      conteudo: { incluso: ["Instalação"], exclusos: null, garantias: null, etapas: null, posVenda: null, institucional: null },
      identidade: { nomeExibicao: "Solar Teste", corPrimaria: "#0F0F10", corDestaque: "#D4AF37", whatsapp: "45999990000" },
      versao: 1,
      emitidaEm: "2026-10-22T12:00:00.000Z",
      hoje: "2026-10-22",
    };
    const paginas = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1").match(/\/Type \/Page(?!s)/g)?.length ?? 0;
    const sem = montarDadosEmissaoSimples(base);
    const com = montarDadosEmissaoSimples({ ...base, curvaGeracao: CURVA });
    if (!sem.ok || !com.ok) throw new Error("montagem");
    const pdfSem = await gerarPdfPropostaSimples(sem.dados, { logoUrl: null, fotoCapaUrl: null });
    const pdfCom = await gerarPdfPropostaSimples(com.dados, { logoUrl: null, fotoCapaUrl: null });
    expect(Buffer.from(pdfCom.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(paginas(pdfCom)).toBeGreaterThanOrEqual(paginas(pdfSem));
    expect(pdfCom.length).toBeGreaterThan(pdfSem.length);
  });
});
