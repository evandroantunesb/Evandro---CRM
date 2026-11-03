/**
 * Fórmula da conta GD II com piso (regra ACEITA pelo Evandro; contrato .aurora/contratos/m2-p0-decisao-fio-b-copel.md,
 * seções 3 e 7). Puro, sem I/O. Quem chama resolve T, D e N (ver `calculadora.ts`, ramo `completa`).
 *
 * Entradas (kWh, R$/kWh):
 *   C = consumo da rede = consumo total − autoconsumo simultâneo
 *   E = energia disponível para compensação = geração − autoconsumo simultâneo (injetada)
 *   T = tarifa base (TE + TUSD); D = custo de disponibilidade (kWh, REN 1.000, art. 291)
 *   N = custo unitário da energia compensada = percentual legal × TUSD Fio B, na MESMA base tributária de T.
 * Fórmulas:
 *   K = min(E, C, max(0, ((C − D) × T) / (T − N)))
 *   conta SEM solar = max(consumo total, D) × T          (piso sobre todo o consumo; sem solar não há autoconsumo)
 *   conta COM solar = max(D × T, (C − K) × T + K × N)    (piso sobre o faturamento TOTAL; REN 1.000, art. 655-I, §2º, I)
 * O piso vale para toda unidade GD II (interpretação oficial da ANEEL no voto da REN 1.059/2023, itens 204–210).
 * Parcelas representadas: só energia (TE + TUSD) a T; ficam fora iluminação pública, bandeiras e tributos que T não
 * inclua. É estimativa, não a fatura.
 * Economia = sem − com, calculada sobre as contas JÁ arredondadas (aritmética aprovada em 21/10/2026; ver
 * .aurora/contratos/m2-p0-arredondamento-economia.md). Nenhuma fórmula de payback aqui (indisponível no P0).
 * Arredondamento: só no resultado final; monetário e energia em 2 casas, meio para longe de zero (como o numeric do
 * Postgres). Cálculos intermediários usam o valor sem arredondar.
 */

export const METODO_GD2_PISO_V1 = "gd2_piso_655i_v1" as const;

export type EntradaFioBGd2 = {
  consumoTotalKwh: number;
  geracaoTotalKwh: number;
  /** Padrão 0: hipótese declarada (o CRM não tem esse dado). */
  autoconsumoInstantaneoKwh?: number;
  tarifaCheiaRsKwh: number;
  custoDisponibilidadeKwh: number;
  /** N em R$/kWh, na mesma base tributária de T. */
  custoEnergiaCompensadaRsKwh: number;
};

export type ResultadoFioBGd2 =
  | {
      ok: true;
      metodo: typeof METODO_GD2_PISO_V1;
      premissas: { autoconsumoInstantaneo: "zero_declarado" | "informado"; bancoDeCreditos: false };
      geracaoTotalKwh: number;
      autoconsumoInstantaneoKwh: number;
      energiaInjetadaKwh: number;
      energiaDisponivelCompensacaoKwh: number; // E
      energiaCompensadaKwh: number; // K
      /** E − K: injetado e não compensado no ciclo (crédito na distribuidora, não valorado). */
      energiaDisponivelNaoCompensadaKwh: number;
      consumoDaRedeKwh: number; // C
      /** C − K: energia faturada a T. */
      energiaFaturadaTarifaCheiaKwh: number;
      /** K × N: custo da energia compensada (R$). */
      custoEnergiaCompensada: number;
      contaSemSolar: number;
      contaComSolar: number;
      economiaMensal: number;
      /** true somente se economiaMensal > 0 (após arredondamento). */
      paybackDisponivel: boolean;
    }
  | { ok: false; motivo: string };

/** Meio para longe de zero em 2 casas; `toPrecision(15)` remove o ruído binário (ex.: 1.005 -> 1.01). */
export function arredondar2(v: number): number {
  const escalado = Number((Math.abs(v) * 100).toPrecision(15));
  const r = Math.round(escalado) / 100;
  return v < 0 && r !== 0 ? -r : r;
}

const erro = (motivo: string): ResultadoFioBGd2 => ({ ok: false, motivo });

export function calcularFioBGd2(entrada: EntradaFioBGd2): ResultadoFioBGd2 {
  const autoconsumo = entrada.autoconsumoInstantaneoKwh ?? 0;
  const { consumoTotalKwh, geracaoTotalKwh, tarifaCheiaRsKwh: T, custoDisponibilidadeKwh: D, custoEnergiaCompensadaRsKwh: N } = entrada;

  const valores = [consumoTotalKwh, geracaoTotalKwh, autoconsumo, T, D, N];
  if (valores.some((v) => typeof v !== "number" || !Number.isFinite(v))) return erro("Todos os valores precisam ser números finitos.");
  if (consumoTotalKwh < 0) return erro("O consumo não pode ser negativo.");
  if (geracaoTotalKwh < 0) return erro("A geração não pode ser negativa.");
  if (autoconsumo < 0) return erro("O autoconsumo instantâneo não pode ser negativo.");
  if (D < 0) return erro("O custo de disponibilidade não pode ser negativo.");
  if (N < 0) return erro("O custo unitário da energia compensada não pode ser negativo.");
  if (!(T > N)) return erro("A tarifa cheia precisa ser maior que o custo unitário da energia compensada.");
  if (autoconsumo > consumoTotalKwh) return erro("O autoconsumo instantâneo não pode superar o consumo total.");
  if (autoconsumo > geracaoTotalKwh) return erro("O autoconsumo instantâneo não pode superar a geração.");

  const C = consumoTotalKwh - autoconsumo;
  const E = geracaoTotalKwh - autoconsumo;

  const K = Math.min(E, C, Math.max(0, ((C - D) * T) / (T - N)));
  const contaSemSolar = Math.max(consumoTotalKwh, D) * T;
  const contaComSolar = Math.max(D * T, (C - K) * T + K * N);

  const resultado = {
    contaSemSolar: arredondar2(contaSemSolar),
    contaComSolar: arredondar2(contaComSolar),
    economiaMensal: arredondar2(arredondar2(contaSemSolar) - arredondar2(contaComSolar)),
  };
  if (![resultado.contaSemSolar, resultado.contaComSolar, resultado.economiaMensal, K].every(Number.isFinite)) {
    return erro("O cálculo não produziu um resultado finito.");
  }

  return {
    ok: true,
    metodo: METODO_GD2_PISO_V1,
    premissas: { autoconsumoInstantaneo: entrada.autoconsumoInstantaneoKwh ? "informado" : "zero_declarado", bancoDeCreditos: false },
    geracaoTotalKwh: arredondar2(geracaoTotalKwh),
    autoconsumoInstantaneoKwh: arredondar2(autoconsumo),
    energiaInjetadaKwh: arredondar2(E),
    energiaDisponivelCompensacaoKwh: arredondar2(E),
    energiaCompensadaKwh: arredondar2(K),
    energiaDisponivelNaoCompensadaKwh: arredondar2(E - K),
    consumoDaRedeKwh: arredondar2(C),
    energiaFaturadaTarifaCheiaKwh: arredondar2(C - K),
    custoEnergiaCompensada: arredondar2(K * N),
    ...resultado,
    paybackDisponivel: resultado.economiaMensal > 0,
  };
}
