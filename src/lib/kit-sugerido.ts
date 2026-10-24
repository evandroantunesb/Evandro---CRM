import { POTENCIA_MODULO_REFERENCIA_W } from "@/lib/calculadora";
import type { LinhaComponente } from "@/lib/kit-linhas";

/**
 * Kit sugerido no cadastro: módulos de referência pelo consumo (`dimensionarSistema`) e um inversor de potência
 * comercial. São itens "de referência" (modelo final é da engenharia): entram no negócio como linhas comuns do kit,
 * editáveis no mesmo editor. Nada aqui confere compatibilidade técnica (tensão, MPPT).
 */

/** Potências comerciais de inversor (kW) oferecidas no cadastro. */
export const POTENCIAS_INVERSOR_KW = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75] as const;

/**
 * Relação CC/CA (módulos ÷ inversor) usada só para escolher o inversor sugerido: o menor que fique até esta relação.
 * Ponto de partida comercial, não regra técnica: a faixa aceita é da engenharia.
 */
export const RELACAO_CC_CA_SUGESTAO = 1.3;

export function inversorSugeridoKw(potenciaModulosKwp: number): number | null {
  if (!(potenciaModulosKwp > 0) || !Number.isFinite(potenciaModulosKwp)) return null;
  return POTENCIAS_INVERSOR_KW.find((kw) => potenciaModulosKwp / kw <= RELACAO_CC_CA_SUGESTAO) ?? null;
}

/** Até três escolhas em volta da sugestão (uma menor, a sugerida, uma maior). */
export function opcoesInversorKw(sugeridoKw: number | null): number[] {
  if (sugeridoKw == null) return [];
  const i = POTENCIAS_INVERSOR_KW.indexOf(sugeridoKw as (typeof POTENCIAS_INVERSOR_KW)[number]);
  return POTENCIAS_INVERSOR_KW.slice(Math.max(0, i - 1), i + 2);
}

/** Relação CC/CA para mostrar (2 casas); informativa. */
export function relacaoCcCa(potenciaModulosKwp: number, inversorKw: number): number | null {
  if (!(potenciaModulosKwp > 0) || !(inversorKw > 0)) return null;
  return Math.round((potenciaModulosKwp / inversorKw) * 100) / 100;
}

export const DESCRICAO_MODULO_REFERENCIA = `Módulo de referência ${POTENCIA_MODULO_REFERENCIA_W} W`;
export const descricaoInversorReferencia = (kw: number) => `Inversor de referência ${kw.toLocaleString("pt-BR")} kW`;

/** Linhas do editor para o kit sugerido (mesmo formato do kit montado à mão). */
export function linhasKitSugerido(quantidadeModulos: number, inversorKw: number | null): LinhaComponente[] {
  const linhas: LinhaComponente[] = [
    {
      tipo: "modulo",
      descricao: DESCRICAO_MODULO_REFERENCIA,
      potenciaW: String(POTENCIA_MODULO_REFERENCIA_W),
      quantidade: String(quantidadeModulos),
    },
  ];
  if (inversorKw != null) {
    linhas.push({ tipo: "inversor", descricao: descricaoInversorReferencia(inversorKw), potenciaW: String(inversorKw * 1000), quantidade: "1" });
  }
  return linhas;
}
