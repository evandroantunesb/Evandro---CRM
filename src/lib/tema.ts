/** Tema do app autenticado (claro, escuro ou o do aparelho), guardado por navegador no cookie COOKIE_TEMA. */
export const COOKIE_TEMA = "raion_tema";

export const TEMAS = ["claro", "escuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];

export const ROTULO_TEMA: Record<Tema, string> = {
  claro: "Tema claro",
  escuro: "Tema escuro",
  sistema: "Tema do sistema",
};

/** Valor do cookie (ou de um formulário) para um tema válido; qualquer outra coisa segue o aparelho. */
export function lerTema(valor: string | null | undefined): Tema {
  return TEMAS.includes(valor as Tema) ? (valor as Tema) : "sistema";
}
