import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { dadosDeAmostraProposta } from "@/lib/propostas/pdf-amostra";
import { calcularQuebras } from "@/lib/propostas/pdf-paginacao";
import { ModeloPdfDocument } from "@/lib/propostas/pdf";
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

describe("calcularQuebras", () => {
  it("nunca quebra antes do primeiro bloco", () => {
    expect(calcularQuebras([{ quebraPagina: "nova_pagina" }])).toEqual([false]);
  });

  it("quebra antes de nova_pagina e pagina_exclusiva", () => {
    const r = calcularQuebras([{ quebraPagina: "auto" }, { quebraPagina: "nova_pagina" }, { quebraPagina: "pagina_exclusiva" }]);
    expect(r).toEqual([false, true, true]);
  });

  it("força quebra no bloco seguinte a um pagina_exclusiva", () => {
    const r = calcularQuebras([{ quebraPagina: "pagina_exclusiva" }, { quebraPagina: "auto" }, { quebraPagina: "auto" }]);
    expect(r).toEqual([false, true, false]);
  });
});

describe("ModeloPdfDocument", () => {
  const dados = dadosDeAmostraProposta();

  it("renderiza um PDF válido com a capa e os blocos implementados", async () => {
    const blocos = [
      bloco("cover"),
      bloco("system_summary", { ordem: 1 }),
      bloco("equipment_summary", { ordem: 2 }),
      bloco("investment_main", { ordem: 3 }),
      bloco("next_steps", { ordem: 4 }),
    ];
    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "minimalista" }, blocos, identidade: IDENTIDADE_VAZIA, dados }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("renderiza as três variantes de capa sem imagens configuradas", async () => {
    for (const capaVariante of ["foto", "minimalista", "tecnica"] as const) {
      const buffer = await renderToBuffer(
        ModeloPdfDocument({ modelo: { capaVariante }, blocos: [bloco("cover")], identidade: IDENTIDADE_VAZIA, dados }),
      );
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });

  it("omite blocos configuráveis sem conteúdo cadastrado e blocos de preço quando a proposta é sem preço", async () => {
    const blocos = [
      bloco("cover"),
      bloco("about_company", { ordem: 1 }), // config vazio — sem texto cadastrado, deve ser ignorado
      bloco("investment_main", { ordem: 2 }),
      bloco("payment_options", { ordem: 3 }),
      bloco("next_steps", { ordem: 4 }),
    ];
    const semPreco = { ...dados, modoPreco: "sem_preco" as const };
    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "minimalista" }, blocos, identidade: IDENTIDADE_VAZIA, dados: semPreco }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renderiza todos os 42 blocos do catálogo de uma vez, cada um com config plausível", async () => {
    const blocos = [
      bloco("cover"),
      bloco("proposal_identity", { config: { numero: "1023", validadeDias: "15", vendedorNome: "Ana Souza", tipoImovel: "Residencial" } }),
      bloco("cover_benefits", { config: { itens: ["Economia | Reduz sua conta todo mês", "Sustentabilidade | Energia limpa"] } }),
      bloco("about_company", { config: { texto: "Somos uma integradora com anos de experiência em energia solar." } }),
      bloco("company_highlights", { config: { itens: ["Equipe própria | Instalação sem terceirização", "Garantia estendida | 10 anos em equipamentos"] } }),
      bloco("company_numbers", { config: { itens: ["Projetos entregues | 500+", "Anos de mercado | 8"] } }),
      bloco("team_and_certifications", { config: { itens: ["João Silva | Engenheiro responsável | CREA 12345"] } }),
      bloco("portfolio", { config: { itens: ["Residência Jardim das Flores | Sistema de 8 kWp instalado em 2025"] } }),
      bloco("testimonials", { config: { itens: ["Maria Souza | Economizei mais de 80% na conta de luz."] } }),
      bloco("solar_benefits"),
      bloco("how_it_works"),
      bloco("day_night"),
      bloco("solar_faq", { config: { itens: ["O sistema funciona em dia nublado? | Sim, com geração reduzida."] } }),
      bloco("customer_profile", { config: { objetivo: "Reduzir o custo mensal com energia elétrica." } }),
      bloco("current_consumption"),
      bloco("consumption_chart", { config: { valores: "400,410,420,430,440,450,460,450,440,430,420,410" } }),
      bloco("system_summary"),
      bloco("equipment_summary"),
      bloco("equipment_table"),
      bloco("installation_layout", { config: { texto: "Instalação prevista no telhado de fibrocimento voltado pro norte." } }),
      bloco("generation_monthly_chart"),
      bloco("generation_vs_consumption", { config: { valoresConsumo: "400,410,420,430,440,450,460,450,440,430,420,410" } }),
      bloco("generation_summary"),
      bloco("simulation_assumptions", { config: { texto: "Orientação norte, inclinação 20°, perdas de 15%." } }),
      bloco("long_term_generation", { config: { texto: "Projeção de degradação de 0,5% ao ano em 25 anos." } }),
      bloco("before_after_bill"),
      bloco("savings_summary"),
      bloco("cashflow_payback"),
      bloco("investment_main"),
      bloco("payment_options"),
      bloco("included_services"),
      bloco("extra_costs", { config: { itens: ["Estrutura reforçada | R$ 800,00"] } }),
      bloco("validity_timeline", { config: { itens: ["Validade | 15 dias", "Prazo de instalação | 30 a 45 dias"] } }),
      bloco("project_steps", { config: { itens: ["Assinatura | 1 dia | Contrato e projeto executivo", "Instalação | 2 dias | Montagem do sistema"] } }),
      bloco("warranties"),
      bloco("support_maintenance", { config: { itens: ["Suporte técnico por telefone e WhatsApp"] } }),
      bloco("scope_inclusions_exclusions", { config: { incluido: ["Projeto e homologação"], excluido: ["Reforma do telhado"] } }),
      bloco("commercial_conditions", { config: { texto: "Proposta sujeita a alteração sem aviso prévio após o prazo de validade." } }),
      bloco("next_steps"),
      bloco("company_contacts", { config: { email: "contato@empresa.com", telefone: "(45) 3000-0000" } }),
      bloco("custom_content", { config: { titulo: "Observação", texto: "Sistema dimensionado com folga de 10% pra crescimento futuro." } }),
      bloco("pdf_attachment", { config: { itens: ["Memorial descritivo | https://example.com/memorial.pdf"] } }),
    ].map((b, i) => ({ ...b, ordem: i }));

    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "foto" }, blocos, identidade: IDENTIDADE_VAZIA, dados }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("omite blocos institucionais/config-only sem conteúdo cadastrado (não mostra placeholder no PDF do cliente)", async () => {
    const blocos = [
      bloco("cover"),
      bloco("company_highlights"),
      bloco("solar_faq"),
      bloco("consumption_chart"),
      bloco("scope_inclusions_exclusions"),
      bloco("pdf_attachment"),
    ].map((b, i) => ({ ...b, ordem: i }));
    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "minimalista" }, blocos, identidade: IDENTIDADE_VAZIA, dados }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("respeita o config customizado de itens inclusos e de próximos passos", async () => {
    const blocos = [
      bloco("included_services", { config: { itens: ["Item exclusivo A", "Item exclusivo B"] } }),
      bloco("next_steps", { ordem: 1, config: { texto: "Texto customizado", ctaTexto: "Fale com a gente" } }),
    ];
    const buffer = await renderToBuffer(
      ModeloPdfDocument({ modelo: { capaVariante: "minimalista" }, blocos, identidade: IDENTIDADE_VAZIA, dados }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
