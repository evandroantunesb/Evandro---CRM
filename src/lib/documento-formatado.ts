/**
 * Formatação simples dos documentos da empresa (contrato, procuração): linha `# ` ou `## ` é título, `**texto**` é
 * negrito e linha `- ` é item de lista. Nada além. Uma linha do texto = um bloco; nenhum caractere fora dos
 * marcadores se perde, então um texto sem marcadores sai igual ao de antes. Usado na conferência, no link do
 * cliente e no PDF.
 */

export type Trecho = { texto: string; negrito: boolean };
export type Bloco =
  | { tipo: "titulo"; nivel: 1 | 2; trechos: Trecho[] }
  | { tipo: "paragrafo"; trechos: Trecho[] }
  | { tipo: "item"; trechos: Trecho[] }
  | { tipo: "vazio" };

/** Negrito só entre pares de `**` na mesma linha; `**` sem par fica literal. */
function trechosDaLinha(linha: string): Trecho[] {
  const trechos: Trecho[] = [];
  let resto = linha;
  for (;;) {
    const inicio = resto.indexOf("**");
    const fim = inicio === -1 ? -1 : resto.indexOf("**", inicio + 2);
    if (inicio === -1 || fim === -1 || fim === inicio + 2) break;
    if (inicio > 0) trechos.push({ texto: resto.slice(0, inicio), negrito: false });
    trechos.push({ texto: resto.slice(inicio + 2, fim), negrito: true });
    resto = resto.slice(fim + 2);
  }
  if (resto || !trechos.length) trechos.push({ texto: resto, negrito: false });
  return trechos;
}

export function blocosDocumento(texto: string): Bloco[] {
  return texto.split(/\r?\n/).map((linha): Bloco => {
    if (!linha.trim()) return { tipo: "vazio" };
    if (linha.startsWith("## ")) return { tipo: "titulo", nivel: 2, trechos: trechosDaLinha(linha.slice(3)) };
    if (linha.startsWith("# ")) return { tipo: "titulo", nivel: 1, trechos: trechosDaLinha(linha.slice(2)) };
    if (linha.startsWith("- ")) return { tipo: "item", trechos: trechosDaLinha(linha.slice(2)) };
    return { tipo: "paragrafo", trechos: trechosDaLinha(linha) };
  });
}
