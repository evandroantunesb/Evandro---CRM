import { POTENCIA_MODULO_REFERENCIA_W } from "@/lib/calculadora";
import { materialServeAoTipo, type MaterialKitVM } from "@/lib/compras/precificacao-kit";
import { formatarNumeroBr } from "@/lib/formatacao";
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

export function inversorSugeridoKw(potenciaModulosKwp: number, potencias: readonly number[] = POTENCIAS_INVERSOR_KW): number | null {
  if (!(potenciaModulosKwp > 0) || !Number.isFinite(potenciaModulosKwp)) return null;
  return potencias.find((kw) => potenciaModulosKwp / kw <= RELACAO_CC_CA_SUGESTAO) ?? null;
}

/** Até três escolhas em volta da sugestão (uma menor, a sugerida, uma maior). */
export function opcoesInversorKw(sugeridoKw: number | null, potencias: readonly number[] = POTENCIAS_INVERSOR_KW): number[] {
  if (sugeridoKw == null) return [];
  const i = potencias.indexOf(sugeridoKw);
  return potencias.slice(Math.max(0, i - 1), i + 2);
}

/** Relação CC/CA para mostrar (2 casas); informativa. */
export function relacaoCcCa(potenciaModulosKwp: number, inversorKw: number): number | null {
  if (!(potenciaModulosKwp > 0) || !(inversorKw > 0)) return null;
  return Math.round((potenciaModulosKwp / inversorKw) * 100) / 100;
}

export const DESCRICAO_MODULO_REFERENCIA = `Módulo de referência ${POTENCIA_MODULO_REFERENCIA_W} W`;
export const descricaoInversorReferencia = (kw: number) => `Inversor de referência ${kw.toLocaleString("pt-BR")} kW`;

/**
 * O que o kit sugerido usa (P4b): com materiais na tabela de preços, o módulo com preço e potência mais próxima da
 * referência e os inversores cadastrados (por kW); sem eles, os itens de referência de antes.
 */
export type ReferenciaKit = {
  modulo: { materialId: string | null; descricao: string; potenciaW: number };
  /** kW comerciais oferecidos, em ordem; com material, o item dele. */
  inversores: { kw: number; materialId: string | null; descricao: string }[];
};

export function referenciaDoKit(materiais: MaterialKitVM[] = []): ReferenciaKit {
  const modulos = materiais.filter((m) => materialServeAoTipo(m, "modulo") && m.temPreco);
  const modulo = modulos.sort(
    (a, b) => Math.abs(a.potenciaW! - POTENCIA_MODULO_REFERENCIA_W) - Math.abs(b.potenciaW! - POTENCIA_MODULO_REFERENCIA_W) || a.nome.localeCompare(b.nome, "pt-BR"),
  )[0];
  const porKw = new Map<number, MaterialKitVM>();
  for (const m of materiais.filter((x) => materialServeAoTipo(x, "inversor") && x.temPreco)) {
    const kw = Math.round((m.potenciaW! / 1000) * 100) / 100;
    if (!porKw.has(kw)) porKw.set(kw, m);
  }
  return {
    modulo: modulo
      ? { materialId: modulo.id, descricao: modulo.nome, potenciaW: modulo.potenciaW! }
      : { materialId: null, descricao: DESCRICAO_MODULO_REFERENCIA, potenciaW: POTENCIA_MODULO_REFERENCIA_W },
    inversores: porKw.size
      ? [...porKw.entries()].sort(([a], [b]) => a - b).map(([kw, m]) => ({ kw, materialId: m.id, descricao: m.nome }))
      : POTENCIAS_INVERSOR_KW.map((kw) => ({ kw, materialId: null, descricao: descricaoInversorReferencia(kw) })),
  };
}

/** Linhas do editor para o kit sugerido (mesmo formato do kit montado à mão). */
export function linhasKitSugerido(quantidadeModulos: number, inversorKw: number | null, ref: ReferenciaKit = referenciaDoKit()): LinhaComponente[] {
  const linhas: LinhaComponente[] = [
    {
      tipo: "modulo",
      descricao: ref.modulo.descricao,
      potenciaW: formatarNumeroBr(ref.modulo.potenciaW),
      quantidade: String(quantidadeModulos),
      materialId: ref.modulo.materialId,
      precoVendaManual: "",
    },
  ];
  const inversor = inversorKw != null ? ref.inversores.find((x) => x.kw === inversorKw) : undefined;
  if (inversor) {
    linhas.push({
      tipo: "inversor",
      descricao: inversor.descricao,
      potenciaW: formatarNumeroBr(inversor.kw * 1000),
      quantidade: "1",
      materialId: inversor.materialId,
      precoVendaManual: "",
    });
  }
  return linhas;
}

/** O kit é o sugerido (módulo da referência + no máximo um inversor da referência)? Devolve quantidade e kW. */
export function kitSimples(linhas: LinhaComponente[], ref: ReferenciaKit = referenciaDoKit()) {
  const [modulo, inversor, ...resto] = linhas;
  const mesmoItem = (l: LinhaComponente, materialId: string | null, descricao: string) =>
    materialId ? l.materialId === materialId : !l.materialId && l.descricao === descricao;
  if (resto.length || modulo?.tipo !== "modulo" || !mesmoItem(modulo, ref.modulo.materialId, ref.modulo.descricao)) return null;
  const doInversor = inversor ? ref.inversores.find((x) => inversor.tipo === "inversor" && mesmoItem(inversor, x.materialId, x.descricao)) : undefined;
  if (inversor && !doInversor) return null;
  const quantidade = Number(modulo.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1) return null;
  return { quantidade, inversorKw: doInversor?.kw ?? null };
}
