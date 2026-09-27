import type { TipoBloco } from "./blocos";
import type { DadosSistemaProposta } from "./pdf-tipos";

// Helpers de parsing de config compartilhados entre o motor de PDF (pdf.tsx)
// e o motor de HTML da página pública (pagina-blocos.tsx) — mesma convenção
// de armazenamento em ambos, só muda como o resultado é desenhado.
//
// Listas usam a mesma convenção de `included_services`: um item por linha no
// editor, aqui guardado em `config.itens`. Itens com mais de um campo (ex.:
// "título | texto") usam "|" como separador — mantém o editor simples (uma
// textarea) em vez de formulários dinâmicos por campo.

export function itensDoConfig(config: unknown): string[] | null {
  if (!config || typeof config !== "object") return null;
  const itens = (config as { itens?: unknown }).itens;
  if (!Array.isArray(itens)) return null;
  const validos = itens.filter((i): i is string => typeof i === "string" && i.trim().length > 0);
  return validos.length > 0 ? validos : null;
}

export function campoTexto(config: unknown, chave: string): string {
  const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const v = cfg[chave];
  return typeof v === "string" ? v.trim() : "";
}

export function partes(linha: string): string[] {
  return linha.split("|").map((p) => p.trim());
}

export function numerosDoConfig(config: unknown, chave: string): number[] | null {
  const texto = campoTexto(config, chave);
  if (!texto) return null;
  const valores = texto.split(",").map((v) => Number(v.trim().replace(",", ".")));
  return valores.length === 12 && valores.every((v) => Number.isFinite(v)) ? valores : null;
}

const TIPOS_LISTA_SIMPLES: TipoBloco[] = [
  "company_highlights",
  "company_numbers",
  "team_and_certifications",
  "portfolio",
  "testimonials",
  "solar_faq",
  "extra_costs",
  "validity_timeline",
  "project_steps",
  "support_maintenance",
  "pdf_attachment",
];
const TIPOS_TEXTO_SIMPLES: TipoBloco[] = ["about_company", "simulation_assumptions", "long_term_generation", "commercial_conditions", "custom_content"];

/**
 * Blocos de preço não fazem sentido quando a proposta é "sem preço", e blocos
 * de conteúdo configurável (institucional, garantias, anexos etc.) sem
 * conteúdo cadastrado nem dado padrão não entram no documento — melhor omitir
 * do que mostrar uma seção vazia ou um aviso "sem conteúdo" pro cliente final.
 */
export function blocoTemConteudo(tipo: TipoBloco, dados: DadosSistemaProposta, config: unknown) {
  if ((tipo === "investment_main" || tipo === "payment_options") && dados.modoPreco === "sem_preco") return false;
  if (TIPOS_LISTA_SIMPLES.includes(tipo)) return itensDoConfig(config) !== null;
  if (TIPOS_TEXTO_SIMPLES.includes(tipo)) return campoTexto(config, "texto") !== "";
  if (tipo === "scope_inclusions_exclusions") {
    const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
    return itensDoConfig({ itens: cfg.incluido }) !== null || itensDoConfig({ itens: cfg.excluido }) !== null;
  }
  if (tipo === "consumption_chart") return numerosDoConfig(config, "valores") !== null;
  if (tipo === "generation_vs_consumption") return numerosDoConfig(config, "valoresConsumo") !== null;
  if (tipo === "equipment_table") return dados.componentes.length > 0;
  if (tipo === "installation_layout") return campoTexto(config, "imagemUrl") !== "" || campoTexto(config, "texto") !== "";
  if (tipo === "cashflow_payback") return campoTexto(config, "texto") !== "" || dados.paybackMeses != null;
  return true;
}
