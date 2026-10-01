import type { Database } from "@/lib/supabase/database.types";

type TipoEquipamento = Database["public"]["Tables"]["equipamentos_empresa"]["Row"]["tipo"];
type TipoInversor = Database["public"]["Enums"]["tipo_inversor_equipamento"];
type FasesCa = Database["public"]["Enums"]["fases_ca_equipamento"];
type LinhaEquipamentoImportacao = Omit<
  Database["public"]["Tables"]["equipamentos_empresa"]["Insert"],
  "empresa_id"
>;

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

/** "48.96" -> 48.96; "" ou inválido -> null. CSV usa ponto decimal (formato técnico), não vírgula BR. */
function numeroCsv(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Datasheets de inversor multi-MPPT às vezes trazem um valor por MPPT, separados por "|"
 * (ex.: "12.5|12.5") ou um valor por fiação dentro do mesmo MPPT, separados por "/" (ex.: tensão
 * "220/380"). O cadastro hoje só guarda um valor único por inversor (grupos de MPPT homogêneos),
 * então pegamos o primeiro grupo/valor — correto quando os grupos são iguais, como nos exemplos
 * vistos até agora; um inversor com MPPTs realmente diferentes entre si perderia essa diferença.
 */
function primeiroValorMppt(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const primeiroGrupo = v.split("|")[0]?.split("/")[0];
  return numeroCsv(primeiroGrupo);
}

function booleanoCsv(v: string | undefined): boolean | null {
  const t = v?.trim().toLowerCase();
  if (t === "true" || t === "1") return true;
  if (t === "false" || t === "0") return false;
  return null;
}

function textoCsv(v: string | undefined, maxLen = 500): string | null {
  const t = v?.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

/** Percentual escrito como número "de 0 a 100" na planilha (ex.: "97.8") -> fração de 0 a 1. */
function percentualCsv(v: string | undefined): number | null {
  const n = numeroCsv(v);
  return n == null ? null : n / 100;
}

function tipoInversorCsv(categoria: string | undefined): TipoInversor | null {
  const t = categoria?.trim().toLowerCase().replace(/-/g, "_");
  if (t === "on_grid" || t === "ongrid") return "on_grid";
  if (t === "hibrido" || t === "hybrid") return "hibrido";
  return null;
}

function fasesCsv(v: string | undefined): FasesCa | null {
  const t = v?.trim().toLowerCase();
  if (t === "monofasico" || t === "trifasico") return t;
  return null;
}

/**
 * Converte uma linha do CSV de importação em massa (colunas documentadas em
 * `RAION_equipamentos_teste_10_inversores_10_modulos.csv`, pedido do Evandro em
 * 2026-10-01) nos campos de `equipamentos_empresa`. Pura e testável sem banco —
 * a action `importarEquipamentosCsv` (`lib/acoes/equipamentos.ts`) só faz a
 * leitura do arquivo e o upsert; toda a lógica de mapeamento mora aqui.
 */
export function linhaCsvParaEquipamento(
  linha: Record<string, string>,
): { ok: true; valores: LinhaEquipamentoImportacao } | { ok: false; erro: string } {
  const fabricante = textoCsv(linha.fabricante, 120);
  const modelo = textoCsv(linha.modelo, 120);
  const tipo = linha.tipo?.trim().toLowerCase();
  if (tipo !== "modulo" && tipo !== "inversor") {
    return { ok: false, erro: `tipo inválido ("${linha.tipo}") — use "modulo" ou "inversor"` };
  }
  if (!fabricante || !modelo) return { ok: false, erro: "fabricante e modelo são obrigatórios" };

  const potenciaW = tipo === "modulo" ? numeroCsv(linha.potencia_wp) : numeroCsv(linha.potencia_ac_w);
  if (!potenciaW || potenciaW <= 0) {
    return {
      ok: false,
      erro: tipo === "modulo" ? "potencia_wp inválida ou vazia" : "potencia_ac_w inválida ou vazia",
    };
  }

  const comuns: LinhaEquipamentoImportacao = {
    tipo,
    fabricante,
    modelo,
    potencia_w: potenciaW,
    ativo: booleanoCsv(linha.ativo) ?? true,
    prioridade: Math.trunc(numeroCsv(linha.prioridade) ?? 0),
    preco_referencia_brl: numeroCsv(linha.custo_reais),
    categoria: textoCsv(linha.categoria, 60),
    tecnologia: textoCsv(linha.tecnologia, 60),
    status_validacao: textoCsv(linha.status_validacao, 60),
    fonte_primaria: textoCsv(linha.fonte_primaria, 500),
    fonte_secundaria: textoCsv(linha.fonte_secundaria, 500),
    observacoes: textoCsv(linha.observacoes, 2000),
  };

  if (tipo === "modulo") {
    return {
      ok: true,
      valores: {
        ...comuns,
        voc_v: numeroCsv(linha.voc_v),
        vmp_v: numeroCsv(linha.vmp_v),
        isc_a: numeroCsv(linha.isc_a),
        imp_a: numeroCsv(linha.imp_a),
        coef_temp_voc_pct_c: numeroCsv(linha.coef_temp_voc_pct_c),
        coef_temp_pmax_pct_c: numeroCsv(linha.coef_temp_pmax_pct_c),
        coef_temp_isc_pct_c: numeroCsv(linha.coef_temp_isc_pct_c),
        bifacial: booleanoCsv(linha.bifacial),
        bifacialidade_pct: numeroCsv(linha.bifacialidade_pct),
        nmot_c: numeroCsv(linha.nmot_c),
        tensao_max_sistema_v: numeroCsv(linha.tensao_max_sistema_v),
        fusivel_max_serie_a: numeroCsv(linha.fusivel_max_serie_a),
        eficiencia_modulo_pct: percentualCsv(linha.eficiencia_modulo_pct),
        comprimento_mm: numeroCsv(linha.comprimento_mm),
        largura_mm: numeroCsv(linha.largura_mm),
        espessura_mm: numeroCsv(linha.espessura_mm),
        peso_kg: numeroCsv(linha.peso_kg),
      },
    };
  }

  // Guarda a string bruta de tensão AC (pode trazer vários valores, ex.: "220/380|230/400|240/415")
  // no campo de texto livre que já existia pra isso — nada se perde mesmo quando o cadastro
  // estruturado (`tensao_ac_v`) só guarda o primeiro valor.
  return {
    ok: true,
    valores: {
      ...comuns,
      tipo_inversor: tipoInversorCsv(linha.categoria),
      tensao_max_dc_v: numeroCsv(linha.tensao_dc_max_v),
      tensao_partida_v: numeroCsv(linha.tensao_partida_v),
      mppt_min_v: numeroCsv(linha.mppt_min_v),
      mppt_max_v: numeroCsv(linha.mppt_max_v),
      quantidade_mppt: numeroCsv(linha.quantidade_mppt) != null ? Math.trunc(numeroCsv(linha.quantidade_mppt)!) : null,
      entradas_por_mppt: primeiroValorMppt(linha.entradas_por_mppt) != null ? Math.trunc(primeiroValorMppt(linha.entradas_por_mppt)!) : null,
      corrente_max_entrada_a: primeiroValorMppt(linha.corrente_max_por_mppt_a),
      isc_maximo_entrada_a: primeiroValorMppt(linha.isc_max_por_mppt_a),
      potencia_dc_maxima_entrada_w: numeroCsv(linha.potencia_pv_recomendada_max_w),
      potencia_aparente_max_va: numeroCsv(linha.potencia_aparente_max_va),
      tensao_ac_v: primeiroValorMppt(linha.tensao_ac_v),
      tensao_fases_ac: textoCsv(linha.tensao_ac_v, 120),
      fases_ca: fasesCsv(linha.fases),
      corrente_max_ac_a: numeroCsv(linha.corrente_ac_max_a),
      eficiencia_pct: percentualCsv(linha.eficiencia_inversor_pct),
      grau_protecao: textoCsv(linha.grau_protecao, 20),
    },
  };
}
