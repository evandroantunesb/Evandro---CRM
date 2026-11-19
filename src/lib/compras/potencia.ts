/**
 * Potência dos materiais na importação (item 5 do roadmap, opção A; decisões do Evandro em 18/11/2026) e palpite de
 * categoria pelo texto da planilha. Puro.
 */
import { lerNumeroBr } from "@/lib/formatacao";
import { normalizar, type Celula, type CategoriaMaterial } from "@/lib/compras/precos";

/**
 * Potência de uma célula, em W (decisão de 18/11/2026): número sem unidade é W; "620 W", "620Wp" e "620 Wp" também;
 * com "kW" (ou "kWp") multiplica por 1.000. Nulo = vazia; NaN = não deu para ler.
 */
export function lerPotenciaCelula(c: Celula): number | null {
  if (c == null) return null;
  if (typeof c === "number") return Number.isFinite(c) && c > 0 && c < 1_000_000 ? Math.round(c * 100) / 100 : Number.NaN;
  if (typeof c !== "string") return Number.NaN;
  const t = c.replace(/\s+/g, "").toLowerCase();
  if (!t) return null;
  const m = t.match(/^([\d.,]+)(k?)(w|wp)?$/);
  if (!m) return Number.NaN;
  const numero = lerNumeroBr(m[1]) ?? Number.NaN;
  const n = !Number.isNaN(numero) ? numero : /^\d+\.\d+$/.test(m[1]) ? Number(m[1]) : Number.NaN;
  const w = m[2] === "k" ? n * 1000 : n;
  return Number.isFinite(w) && w > 0 && w < 1_000_000 ? Math.round(w * 100) / 100 : Number.NaN;
}

/** O que acontece com a potência do material: a cadastrada nunca é trocada pela planilha (18/11/2026). */
export type SituacaoPotencia = "sem" | "ilegivel" | "nova" | "preenche" | "ja" | "diferente";

export function situacaoPotencia(lida: number | null, material: { potenciaW: number | null } | undefined): SituacaoPotencia {
  if (lida == null) return "sem";
  if (Number.isNaN(lida)) return "ilegivel";
  if (!material) return "nova";
  if (material.potenciaW == null) return "preenche";
  return material.potenciaW === lida ? "ja" : "diferente";
}

export const potenciaDoItem = (p: number | null): { potencia_w?: number } => (p != null && !Number.isNaN(p) ? { potencia_w: p } : {});

/**
 * Categoria provável pelo texto da planilha ("Módulo Jinko 620W" → módulos, "String box" → cabos e proteção). Só um
 * palpite para a prévia: quem importa troca antes de confirmar.
 */
export function palpiteCategoria(texto: string): CategoriaMaterial {
  const t = normalizar(texto);
  if (/modulo|painel|placa solar|^mod\b/.test(t)) return "modulos";
  if (/inversor|microinversor|^inv\b/.test(t)) return "inversores";
  if (/bateria/.test(t)) return "baterias";
  if (/estrutura|perfil|trilho|suporte|gancho|fixacao|telhado|solo/.test(t)) return "estrutura";
  if (/cabo|string ?box|disjuntor|\bdps\b|fusivel|conector|mc4|eletroduto|protecao/.test(t)) return "cabos_protecao";
  return "outros";
}

