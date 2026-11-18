/** Valores por extenso em português (contrato: `{{negocio_valor_extenso}}`). */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 1 a 999 por extenso. */
function ate999(n: number): string {
  if (n === 100) return "cem";
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
  else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d) partes.push(DEZENAS[d]);
    if (u) partes.push(UNIDADES[u]);
  }
  return partes.join(" e ");
}

const ESCALAS: [singular: string, plural: string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
  ["trilhão", "trilhões"],
];

/** Inteiro >= 1 por extenso: grupos de milhar, " e " antes do grupo final redondo ou menor que 100, senão ", ". */
function inteiroPorExtenso(n: number): string {
  const grupos: number[] = [];
  for (let resto = n; resto > 0; resto = Math.floor(resto / 1000)) grupos.push(resto % 1000);
  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const [singular, plural] = ESCALAS[i];
    const texto = i === 0 ? ate999(g) : i === 1 ? (g === 1 ? "mil" : `${ate999(g)} mil`) : `${ate999(g)} ${g === 1 ? singular : plural}`;
    partes.push({ texto, valor: g });
  }
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const conector = p.valor < 100 || p.valor % 100 === 0 ? " e " : ", ";
      return conector + p.texto;
    })
    .join("");
}

/** Valor em reais por extenso, com centavos (arredonda a 2 casas). Ex.: 42500 → "quarenta e dois mil e quinhentos reais". */
export function valorPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) throw new RangeError("Valor inválido para escrever por extenso.");
  const totalCentavos = Math.round(valor * 100);
  const reais = Math.floor(totalCentavos / 100);
  const centavos = totalCentavos % 100;

  const partes: string[] = [];
  if (reais > 0) {
    const texto = inteiroPorExtenso(reais);
    // "um milhão de reais", "dois milhões de reais": milhão/bilhão exatos levam "de".
    const exato = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${texto}${exato ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}
