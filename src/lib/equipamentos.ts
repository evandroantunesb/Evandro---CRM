import type { Database } from "@/lib/supabase/database.types";

type TipoEquipamento = Database["public"]["Tables"]["equipamentos_empresa"]["Row"]["tipo"];
type TipoInversor = Database["public"]["Enums"]["tipo_inversor_equipamento"];
type FasesCa = Database["public"]["Enums"]["fases_ca_equipamento"];

/**
 * Campos técnicos do formulário de cadastro/edição de equipamento, já
 * convertidos pro tipo numérico/enum (camelCase, como o formulário produz).
 * Módulo e inversor têm conjuntos disjuntos — ver `camposTecnicosParaPersistir`.
 */
export type CamposTecnicosEntrada = {
  vocV: number | null;
  iscA: number | null;
  vmpV: number | null;
  impA: number | null;
  coefTempVocPctC: number | null;
  tipoInversor: TipoInversor | null;
  tensaoMaxDcV: number | null;
  tensaoPartidaV: number | null;
  mpptMinV: number | null;
  mpptMaxV: number | null;
  quantidadeMppt: number | null;
  entradasPorMppt: number | null;
  correnteMaxEntradaA: number | null;
  iscMaximoEntradaA: number | null;
  potenciaDcMaximaEntradaW: number | null;
  tensaoAcV: number | null;
  fasesCa: FasesCa | null;
  correnteMaxAcA: number | null;
  eficienciaPct: number | null;
};

/**
 * Bug relatado pelo Evandro (2026-09-30): o cadastro de inversor não estava
 * persistindo os campos técnicos corretos. Esta função isola a única regra
 * que importa aqui — módulo e inversor salvam colunas disjuntas em
 * `equipamentos_empresa` — pra ser testável sem banco (ver `tests/equipamentos.test.ts`).
 * Usada por `cadastrarEquipamentoManual`/`editarEquipamento` em `lib/acoes/equipamentos.ts`.
 */
export function camposTecnicosParaPersistir(tipo: TipoEquipamento, entrada: CamposTecnicosEntrada) {
  if (tipo === "modulo") {
    return {
      voc_v: entrada.vocV,
      isc_a: entrada.iscA,
      vmp_v: entrada.vmpV,
      imp_a: entrada.impA,
      coef_temp_voc_pct_c: entrada.coefTempVocPctC,
    };
  }
  return {
    tipo_inversor: entrada.tipoInversor,
    tensao_max_dc_v: entrada.tensaoMaxDcV,
    tensao_partida_v: entrada.tensaoPartidaV,
    mppt_min_v: entrada.mpptMinV,
    mppt_max_v: entrada.mpptMaxV,
    quantidade_mppt: entrada.quantidadeMppt,
    entradas_por_mppt: entrada.entradasPorMppt,
    corrente_max_entrada_a: entrada.correnteMaxEntradaA,
    isc_maximo_entrada_a: entrada.iscMaximoEntradaA,
    potencia_dc_maxima_entrada_w: entrada.potenciaDcMaximaEntradaW,
    tensao_ac_v: entrada.tensaoAcV,
    fases_ca: entrada.fasesCa,
    corrente_max_ac_a: entrada.correnteMaxAcA,
    eficiencia_pct: entrada.eficienciaPct,
  };
}
