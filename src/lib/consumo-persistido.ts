/**
 * Valores numéricos como o Postgres os gravará em colunas numeric(p, s). Módulo puro, sem dependências
 * (evita import circular entre `calculadora` e `calculo-reproduzivel`).
 */

/**
 * Valor com `casas` casas decimais, arredondamento half away from zero sobre o valor DECIMAL do número
 * (a representação mais curta que identifica o double, que é o texto enviado ao banco).
 * Não usa `Math.round(x * 10^casas)`: 1.005 * 100 = 100.49999999999999, mas o banco grava 1,01 para 1.005.
 *
 * Idempotente. Entrada não finita (NaN, ±Infinity) é devolvida como veio, sem mascarar: a validação/erro
 * continua a cargo de quem chama. Negativos são simétricos; nunca devolve -0. Não valida o limite de dígitos da coluna.
 * `casas` deve ser inteiro >= 0.
 */
export function valorComoPersistido(valor: number, casas: number): number {
  if (!Number.isInteger(casas) || casas < 0) throw new RangeError("casas deve ser um inteiro >= 0");
  if (!Number.isFinite(valor)) return valor;
  const negativo = valor < 0;
  let texto = Math.abs(valor).toString();
  if (/e/i.test(texto)) {
    // Notação científica: valores < 1e-6 ou >= 1e21. Expande em decimal fixo (o excedente de casas é arredondado abaixo).
    if (Math.abs(valor) >= 1) return valor; // inteiro grande: já não tem casas fracionárias
    texto = Math.abs(valor).toFixed(20);
  }
  const [inteiro, fracao = ""] = texto.split(".");
  if (fracao.length <= casas) return valor === 0 ? 0 : valor; // normaliza -0
  const mantida = fracao.slice(0, casas);
  const sobe = fracao.charCodeAt(casas) >= 53; // dígito seguinte >= '5' => afasta de zero
  // Valor escalado como inteiro exato (as colunas têm no máximo 12 dígitos, muito abaixo de 2^53).
  const escalado = Number(inteiro + mantida) + (sobe ? 1 : 0);
  const resultado = escalado / 10 ** casas;
  return negativo && resultado !== 0 ? -resultado : resultado;
}

/** Escala de `calculos_solares.consumo_medio_kwh` e `negocios.consumo_medio_kwh`: numeric(10, 2). */
export function consumoComoPersistido(kwh: number): number {
  return valorComoPersistido(kwh, 2);
}
