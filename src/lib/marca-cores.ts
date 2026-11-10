/*
 * Marca e cores da empresa no app (Onboarding, subprojeto 2; docs/superpowers/specs/2026-11-10-marca-cores-design.md).
 * Regra pura: as cores vêm da identidade da proposta (cor primária = barra e faixa; cor de destaque = o dourado do app).
 * Contraste pela razão do WCAG 2; cor ilegível não salva, e combinação antiga ilegível cai no padrão Raion.
 */

export const MARCA_PADRAO = { barra: "#0F0F10", destaque: "#D4AF37" } as const;
export type Marca = { barra: string; destaque: string };

const TEXTO_MENU = "#FAF8F3";
const CARVAO = "#0F0F10";
const BRANCO = "#FFFFFF";
const MINIMO = 4.5;

const canais = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

function luminancia(cor: string): number {
  const [r, g, b] = canais(cor).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste do WCAG 2 entre duas cores `#RRGGBB` (1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Texto sobre a cor: carvão ou branco, o de maior contraste. */
export const textoSobre = (cor: string): "#0F0F10" | "#FFFFFF" => (contraste(cor, CARVAO) >= contraste(cor, BRANCO) ? "#0F0F10" : "#FFFFFF");

/** Mistura `cor` com `alvo` na proporção `p` (0 = cor, 1 = alvo). */
const misturar = (cor: string, alvo: string, p: number) => {
  const a = canais(cor);
  const b = canais(alvo);
  return hex(a.map((c, i) => c + (b[i] - c) * p));
};

/** Escurece (ou clareia) em passos de 5% até ter contraste mínimo com o fundo. */
function legivelSobre(cor: string, fundo: string, alvo: string): string {
  for (let passo = 0; passo <= 20; passo++) {
    const tom = misturar(cor, alvo, passo * 0.05);
    if (contraste(tom, fundo) >= MINIMO) return tom;
  }
  return alvo === BRANCO ? TEXTO_MENU : CARVAO;
}

export function validarMarca(m: Marca): string[] {
  const problemas: string[] = [];
  if (contraste(m.barra, TEXTO_MENU) < MINIMO) problemas.push("A cor da barra é clara demais: o texto do menu fica ilegível.");
  if (contraste(m.destaque, textoSobre(m.destaque)) < MINIMO) {
    problemas.push("A cor de destaque não deixa o texto dos botões legível, nem em preto nem em branco.");
  }
  return problemas;
}

/** Variáveis de cor que o invólucro do app recebe (só quando a empresa tem marca própria). */
export function variaveisMarca(m: Marca): Record<string, string> {
  return {
    "--color-dourado": m.destaque,
    "--color-acao": m.destaque,
    "--color-acao-forte": misturar(m.destaque, CARVAO, 0.13),
    "--color-sobre-acao": textoSobre(m.destaque),
    "--color-dourado-texto": `light-dark(${legivelSobre(m.destaque, TEXTO_MENU, CARVAO)}, ${legivelSobre(m.destaque, CARVAO, BRANCO)})`,
    "--cor-barra": m.barra,
  };
}

/** Marca do app a partir da identidade da proposta. Nula = padrão Raion (sem cor própria, ou combinação ilegível). */
export function marcaDoApp(linha: { cor_primaria: string | null; cor_destaque: string | null } | null): Marca | null {
  if (!linha || (!linha.cor_primaria && !linha.cor_destaque)) return null;
  const m = { barra: linha.cor_primaria || MARCA_PADRAO.barra, destaque: linha.cor_destaque || MARCA_PADRAO.destaque };
  return validarMarca(m).length ? null : m;
}
