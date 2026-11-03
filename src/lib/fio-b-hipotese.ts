/**
 * HIPÓTESE EM TESTE — não usar em cálculo comercial; economia não validada.
 *
 * Módulo isolado e NÃO ligado a nada (nenhuma tela, ação, calculo-servidor, proposta ou PDF pode chamá-lo).
 * Escopo da hipótese: B1 convencional, GD II, 2026, sem banco de créditos.
 *
 * Entradas (kWh, R$/kWh):
 *   C = consumo da rede = consumo total − autoconsumo instantâneo
 *   E = energia disponível para compensação = geração − autoconsumo instantâneo (injetada)
 *   T = tarifa cheia; D = custo de disponibilidade (kWh)
 *   N = custo unitário da energia compensada = TUSD Fio B × 0,60, JÁ resolvido pelo chamador e na MESMA base
 *       tributária de T. Este módulo não aplica fator tributário (tratamento tributário do Fio B é pendência legal).
 * Fórmulas:
 *   K = min(E, C, max(0, ((C − D) × T) / (T − N)))
 *   conta SEM solar = max(consumo total, D) × T          (piso sobre todo o consumo; sem solar não há autoconsumo)
 *   conta COM solar = max(D × T, (C − K) × T + K × N)    (piso sobre o faturamento TOTAL)
 * Sem solar, toda a energia vem da rede: o autoconsumo instantâneo só existe depois de instalar o sistema, por
 * isso a conta sem solar usa o consumo TOTAL e não depende de autoconsumo nem de geração.
 * Por que as duas diferem: sem solar não existe energia compensada, então o faturamento é consumo total × T e o piso
 * é comparado a ele. Com solar o faturamento já inclui a parcela compensada (K × N) e é ESSE total que
 * se compara ao piso (REN 1.000/2021, art. 655-I e §2º); nunca se soma o Fio B por fora de uma parcela
 * já elevada ao piso. Por isso a expressão sem solar NÃO é reaplicada ao lado com solar.
 * Parcelas representadas: só energia (TE + TUSD) ao piso/tarifa cheia T; ficam fora iluminação pública,
 * bandeiras e tributos que T não inclua. É estimativa, não a fatura.
 * Economia = sem − com, calculada sobre as contas JÁ arredondadas (os números exibidos fecham; contas iguais => economia 0). Regra aprovada pelo Evandro em 21/10/2026 (não valida a fórmula regulatória nem a Copel): ver .aurora/contratos/m2-p0-arredondamento-economia.md. `paybackDisponivel` = economiaMensal > 0
 * (quando consumo total <= D as duas contas coincidem, economia 0 e payback indisponível; nenhuma fórmula de payback aqui).
 * Arredondamento: só no resultado final; monetário e energia em 2 casas, meio para longe de zero
 * (como o numeric do Postgres). Cálculos intermediários usam o valor sem arredondar.
 */

export const METODO_FIO_B_HIPOTESE = "fio_b_hipotese_gd2_2026_v0" as const;

export type EntradaFioBHipotese = {
  consumoTotalKwh: number;
  geracaoTotalKwh: number;
  /** Padrão 0 (premissa conservadora). */
  autoconsumoInstantaneoKwh?: number;
  tarifaCheiaRsKwh: number;
  custoDisponibilidadeKwh: number;
  /** N em R$/kWh, na mesma base tributária de T. */
  custoEnergiaCompensadaRsKwh: number;
};

export type ResultadoFioBHipotese =
  | {
      ok: true;
      metodo: typeof METODO_FIO_B_HIPOTESE;
      premissas: { autoconsumoInstantaneo: "zero_conservador" | "informado"; bancoDeCreditos: false };
      geracaoTotalKwh: number;
      autoconsumoInstantaneoKwh: number;
      energiaInjetadaKwh: number;
      energiaDisponivelCompensacaoKwh: number; // E
      energiaCompensadaKwh: number; // K
      /** E − K: identificada separadamente; não é tratada como compensada nem como descartada (sem banco de créditos). */
      energiaDisponivelNaoCompensadaKwh: number;
      consumoDaRedeKwh: number; // C
      contaSemSolar: number;
      contaComSolar: number;
      economiaMensal: number;
      /** true somente se economiaMensal > 0 (após arredondamento). Sem economia, payback é indisponível. */
      paybackDisponivel: boolean;
    }
  | { ok: false; motivo: string };

/** Meio para longe de zero em 2 casas; `toPrecision(15)` remove o ruído binário (ex.: 1.005 -> 1.01). */
function arredondar2(v: number): number {
  const escalado = Number((Math.abs(v) * 100).toPrecision(15));
  const r = Math.round(escalado) / 100;
  return v < 0 && r !== 0 ? -r : r;
}

const erro = (motivo: string): ResultadoFioBHipotese => ({ ok: false, motivo });

export function calcularFioBHipotese(entrada: EntradaFioBHipotese): ResultadoFioBHipotese {
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
    metodo: METODO_FIO_B_HIPOTESE,
    premissas: { autoconsumoInstantaneo: entrada.autoconsumoInstantaneoKwh ? "informado" : "zero_conservador", bancoDeCreditos: false },
    geracaoTotalKwh: arredondar2(geracaoTotalKwh),
    autoconsumoInstantaneoKwh: arredondar2(autoconsumo),
    energiaInjetadaKwh: arredondar2(E),
    energiaDisponivelCompensacaoKwh: arredondar2(E),
    energiaCompensadaKwh: arredondar2(K),
    energiaDisponivelNaoCompensadaKwh: arredondar2(E - K),
    consumoDaRedeKwh: arredondar2(C),
    ...resultado,
    paybackDisponivel: resultado.economiaMensal > 0,
  };
}
