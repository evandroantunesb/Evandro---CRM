// Código da ficha do negócio (`negocios/[id]`) como texto, para os testes que conferem no fonte como a tela é ligada.
// A ficha é dividida em página, dados, cabeçalho e um arquivo por aba; o fim de linha é normalizado (checkout LF ou CRLF).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PASTA = join(__dirname, "..", "src", "app", "(app)", "negocios", "[id]");

/** Aba (`?aba=`) → arquivo que a renderiza. */
export const ABAS_FICHA = {
  visao: "aba-visao.tsx",
  sistema: "aba-sistema.tsx",
  proposta: "aba-proposta.tsx",
  atividades: "aba-atividades.tsx",
  arquivos: "aba-arquivos.tsx",
} as const;

const ARQUIVOS_FICHA = ["page.tsx", "dados-ficha.ts", "cabecalho.tsx", "edicao-dados.tsx", ...Object.values(ABAS_FICHA)];

export const fonteFicha = (arquivo: string) => readFileSync(join(PASTA, arquivo), "utf8").replace(/\r\n/g, "\n");

/** Todos os arquivos da ficha juntos: para conferir o que existe (ou não) na tela, esteja onde estiver. */
export const fichaInteira = () => ARQUIVOS_FICHA.map(fonteFicha).join("\n");
