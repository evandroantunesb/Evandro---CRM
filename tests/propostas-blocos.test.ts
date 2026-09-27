/** Biblioteca de blocos do construtor de propostas: garante que a lista bate com o check constraint da migration. */
import { describe, expect, it } from "vitest";
import { BLOCOS_PROPOSTA, TIPOS_BLOCO_PROPOSTA, definicaoDoBloco } from "@/lib/propostas/blocos";

// Mesma lista do check constraint em supabase/migrations/20260927030000_proposta_modelos.sql —
// mantidas em arquivos separados de propósito (SQL não importa TS); este teste garante que não desalinham.
const TIPOS_NA_MIGRATION = [
  "cover",
  "proposal_identity",
  "cover_benefits",
  "about_company",
  "company_highlights",
  "company_numbers",
  "team_and_certifications",
  "portfolio",
  "testimonials",
  "solar_benefits",
  "how_it_works",
  "day_night",
  "solar_faq",
  "customer_profile",
  "current_consumption",
  "consumption_chart",
  "system_summary",
  "equipment_summary",
  "equipment_table",
  "installation_layout",
  "generation_monthly_chart",
  "generation_vs_consumption",
  "generation_summary",
  "simulation_assumptions",
  "long_term_generation",
  "before_after_bill",
  "savings_summary",
  "cashflow_payback",
  "investment_main",
  "payment_options",
  "included_services",
  "extra_costs",
  "validity_timeline",
  "project_steps",
  "warranties",
  "support_maintenance",
  "scope_inclusions_exclusions",
  "commercial_conditions",
  "next_steps",
  "company_contacts",
  "custom_content",
  "pdf_attachment",
];

describe("biblioteca de blocos da proposta", () => {
  it("tem exatamente os tipos do check constraint da migration, sem duplicatas", () => {
    expect(new Set(TIPOS_BLOCO_PROPOSTA).size).toBe(TIPOS_BLOCO_PROPOSTA.length);
    expect([...TIPOS_BLOCO_PROPOSTA].sort()).toEqual([...TIPOS_NA_MIGRATION].sort());
  });

  it("todo bloco tem nome, descrição e categoria", () => {
    for (const bloco of BLOCOS_PROPOSTA) {
      expect(bloco.nome.length).toBeGreaterThan(0);
      expect(bloco.descricao.length).toBeGreaterThan(0);
      expect(bloco.categoria.length).toBeGreaterThan(0);
    }
  });

  it("investment_main é o único obrigatório no modelo comercial", () => {
    const obrigatorios = BLOCOS_PROPOSTA.filter((b) => b.obrigatorioNoComercial);
    expect(obrigatorios.map((b) => b.tipo)).toEqual(["investment_main"]);
  });

  it("definicaoDoBloco encontra um tipo conhecido e retorna undefined pra um desconhecido", () => {
    expect(definicaoDoBloco("cover")?.nome).toBe("Capa");
    expect(definicaoDoBloco("bloco_inexistente")).toBeUndefined();
  });
});
