import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModeloPaginaBlocos } from "@/app/proposta/[token]/pagina-blocos";
import { dadosDeAmostraProposta } from "@/lib/propostas/pdf-amostra";
import type { BlocoRenderizavel, IdentidadeProposta } from "@/lib/propostas/pdf-tipos";

const IDENTIDADE_VAZIA: IdentidadeProposta = {
  nomeExibicao: "",
  corPrimaria: "",
  corDestaque: "",
  whatsapp: "",
  rodapeTexto: "",
  logoUrl: null,
  logoEscuroUrl: null,
  fotoCapaUrl: null,
};

function bloco(tipo: BlocoRenderizavel["tipo"], overrides: Partial<BlocoRenderizavel> = {}): BlocoRenderizavel {
  return { tipo, ordem: 0, ativo: true, quebraPagina: "auto", config: {}, ...overrides };
}

describe("ModeloPaginaBlocos", () => {
  const dados = dadosDeAmostraProposta();

  it("renderiza os blocos ativos com dado real do negócio", () => {
    const blocos = [
      bloco("cover"),
      bloco("system_summary", { ordem: 1 }),
      bloco("equipment_summary", { ordem: 2 }),
      bloco("investment_main", { ordem: 3 }),
      bloco("next_steps", { ordem: 4 }),
    ];
    const html = renderToStaticMarkup(createElement(ModeloPaginaBlocos, { blocos, identidade: IDENTIDADE_VAZIA, dados }));
    expect(html).toContain(dados.kitNome);
    expect(html).toContain("Principais equipamentos");
    expect(html).toContain("Valor da proposta");
    expect(html).toContain("Próximos passos");
  });

  it("nunca renderiza o bloco cover (a página já mostra o cabeçalho fora do motor de blocos)", () => {
    const html = renderToStaticMarkup(
      createElement(ModeloPaginaBlocos, { blocos: [bloco("cover"), bloco("system_summary", { ordem: 1 })], identidade: IDENTIDADE_VAZIA, dados }),
    );
    expect(html).not.toContain("PROPOSTA DE ENERGIA SOLAR");
  });

  it("mostra conteúdo cadastrado nos blocos configuráveis (config, formato 'campo | campo')", () => {
    const blocos = [
      bloco("testimonials", { config: { itens: ["Maria Souza | Economizei mais de 80% na conta de luz."] } }),
      bloco("warranties", { ordem: 1 }),
    ];
    const html = renderToStaticMarkup(createElement(ModeloPaginaBlocos, { blocos, identidade: IDENTIDADE_VAZIA, dados }));
    expect(html).toContain("Maria Souza");
    expect(html).toContain("Economizei mais de 80%");
    expect(html).toContain("Garantias");
  });

  it("omite blocos institucionais sem conteúdo cadastrado (sem placeholder pro cliente)", () => {
    const blocos = [bloco("about_company"), bloco("solar_faq", { ordem: 1 }), bloco("pdf_attachment", { ordem: 2 })];
    const html = renderToStaticMarkup(createElement(ModeloPaginaBlocos, { blocos, identidade: IDENTIDADE_VAZIA, dados }));
    expect(html).not.toContain("Sem conteúdo cadastrado");
    expect(html).not.toContain("Quem somos");
    expect(html).not.toContain("Perguntas frequentes");
  });

  it("omite blocos de preço quando a proposta é sem preço", () => {
    const semPreco = { ...dados, modoPreco: "sem_preco" as const };
    const blocos = [bloco("investment_main"), bloco("payment_options", { ordem: 1 }), bloco("next_steps", { ordem: 2 })];
    const html = renderToStaticMarkup(createElement(ModeloPaginaBlocos, { blocos, identidade: IDENTIDADE_VAZIA, dados: semPreco }));
    expect(html).not.toContain("Valor da proposta");
    expect(html).not.toContain("Condições de pagamento");
    expect(html).toContain("Próximos passos");
  });

  it("não renderiza bloco inativo", () => {
    const blocos = [bloco("warranties", { ativo: false })];
    const html = renderToStaticMarkup(createElement(ModeloPaginaBlocos, { blocos, identidade: IDENTIDADE_VAZIA, dados }));
    expect(html).not.toContain("Garantias");
  });
});
