/**
 * Parser CSV simples (RFC4180): vírgula como separador, aspas duplas pra campos com
 * vírgula/quebra de linha, `""` como aspas escapada dentro de um campo. Usado pela
 * importação em massa do catálogo de equipamentos (`src/lib/acoes/equipamentos.ts`).
 */
export function analisarCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  const semBom = texto.startsWith("﻿") ? texto.slice(1) : texto;
  let campo = "";
  let linha: string[] = [];
  let dentroAspas = false;

  for (let i = 0; i < semBom.length; i++) {
    const c = semBom[i];
    if (dentroAspas) {
      if (c === '"') {
        if (semBom[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      dentroAspas = true;
    } else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && semBom[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

/** Primeira linha como cabeçalho; demais linhas viram objetos `{ coluna: valor }`, com os valores já aparados. */
export function linhasParaObjetos(linhas: string[][]): Record<string, string>[] {
  const [cabecalho, ...resto] = linhas;
  if (!cabecalho) return [];
  return resto
    .filter((linha) => linha.some((v) => v.trim() !== ""))
    .map((linha) => Object.fromEntries(cabecalho.map((chave, i) => [chave.trim(), (linha[i] ?? "").trim()])));
}
