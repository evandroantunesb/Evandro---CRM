import { CAMPOS_TECNICOS_INVERSOR, CAMPOS_TECNICOS_MODULO, type EquipamentoAtivo } from "@/lib/dimensionamento";
import type { Database } from "@/lib/supabase/database.types";

type TipoEquipamento = Database["public"]["Tables"]["equipamentos_empresa"]["Row"]["tipo"];
type TipoInversor = Database["public"]["Enums"]["tipo_inversor_equipamento"];
type FasesCa = Database["public"]["Enums"]["fases_ca_equipamento"];
export type StatusTecnico = Database["public"]["Enums"]["status_tecnico_equipamento"];
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

// ---------------------------------------------------------------------------
// Status técnico (migration 20261001030000_equipamentos_status_tecnico.sql)
// ---------------------------------------------------------------------------

export const ROTULO_STATUS_TECNICO: Record<StatusTecnico, string> = {
  completo: "Completo",
  incompleto: "Incompleto",
  em_revisao: "Em revisão",
  verificado: "Verificado",
  descontinuado: "Descontinuado",
};

/** Status que o admin escolhe à mão; "completo"/"incompleto" são sempre calculados. */
export const STATUS_TECNICO_MANUAIS = ["em_revisao", "verificado", "descontinuado"] as const;
export type StatusTecnicoManual = (typeof STATUS_TECNICO_MANUAIS)[number];

/** Campos técnicos de um equipamento, em snake_case (como vêm do banco ou do CSV). */
export type RegistroTecnico = {
  voc_v?: number | null;
  vmp_v?: number | null;
  isc_a?: number | null;
  imp_a?: number | null;
  coef_temp_voc_pct_c?: number | null;
  tensao_max_dc_v?: number | null;
  mppt_min_v?: number | null;
  mppt_max_v?: number | null;
  corrente_max_entrada_a?: number | null;
  quantidade_mppt?: number | null;
};

/**
 * Quais dados técnicos que o motor usa pra validar string/MPPT faltam em UM equipamento —
 * mesmo critério (e mesmos rótulos) de `camposTecnicosFaltantes` em `dimensionamento.ts`, que
 * olha o par módulo+inversor. Base do status técnico "completo"/"incompleto".
 */
export function camposTecnicosFaltantesEquipamento(tipo: TipoEquipamento, r: RegistroTecnico): string[] {
  const comoMotor: Partial<EquipamentoAtivo> = {
    vocV: r.voc_v,
    vmpV: r.vmp_v,
    iscA: r.isc_a,
    impA: r.imp_a,
    coefTempVocPctC: r.coef_temp_voc_pct_c,
    tensaoMaxDcV: r.tensao_max_dc_v,
    mpptMinV: r.mppt_min_v,
    mpptMaxV: r.mppt_max_v,
    correnteMaxEntradaA: r.corrente_max_entrada_a,
    quantidadeMppt: r.quantidade_mppt,
  };
  const campos = tipo === "modulo" ? CAMPOS_TECNICOS_MODULO : CAMPOS_TECNICOS_INVERSOR;
  return campos.filter(({ chave }) => comoMotor[chave] == null).map(({ rotulo }) => rotulo);
}

/**
 * Espelho em TypeScript do gatilho `ajustar_status_tecnico_equipamento` (a fonte autoritativa é
 * o banco): "descontinuado" vale sempre; sem os dados técnicos completos o resultado é
 * "incompleto" (mesmo que o admin tenha pedido "verificado"/"em_revisao"); com dados completos,
 * "incompleto" vira "completo" e as escolhas manuais são mantidas. Usado pra mostrar o status
 * que vai resultar (preview da importação, mensagem ao salvar) antes de gravar.
 */
export function statusTecnicoResultante(desejado: StatusTecnico, dadosCompletos: boolean): StatusTecnico {
  if (desejado === "descontinuado") return desejado;
  if (!dadosCompletos) return "incompleto";
  return desejado === "incompleto" ? "completo" : desejado;
}

/**
 * Se o equipamento pode ser escolhido automaticamente pelo motor de dimensionamento (Evandro,
 * 2026-10-01: "incompleto pode existir no catálogo mas não deve participar automaticamente do
 * motor"). Descontinuado também fica de fora. `null`/`undefined` (banco ainda sem a coluna
 * `status_tecnico`, ex.: preview apontando pra produção antes da migration) mantém o
 * comportamento anterior — participa —, pra não esvaziar o catálogo por falta de schema.
 */
export function participaDoMotor(status: StatusTecnico | null | undefined): boolean {
  if (status == null) return true;
  return status === "completo" || status === "verificado" || status === "em_revisao";
}

/** Status pra exibir: o gravado no banco ou, se a coluna ainda não existir, o calculado dos dados. */
export function statusTecnicoExibido(
  tipo: TipoEquipamento,
  r: RegistroTecnico & { status_tecnico?: StatusTecnico | null },
): StatusTecnico {
  if (r.status_tecnico) return r.status_tecnico;
  return statusTecnicoResultante("completo", camposTecnicosFaltantesEquipamento(tipo, r).length === 0);
}

// ---------------------------------------------------------------------------
// Importação CSV em duas etapas: preview (sem gravar) → confirmação
// ---------------------------------------------------------------------------

export const COLUNAS_CSV_COMUNS = [
  "tipo",
  "fabricante",
  "modelo",
  "categoria",
  "tecnologia",
  "ativo",
  "prioridade",
  "custo_reais",
  "status_validacao",
  "fonte_primaria",
  "fonte_secundaria",
  "observacoes",
] as const;

export const COLUNAS_CSV_MODULO = [
  "potencia_wp",
  "voc_v",
  "vmp_v",
  "isc_a",
  "imp_a",
  "coef_temp_voc_pct_c",
  "coef_temp_pmax_pct_c",
  "coef_temp_isc_pct_c",
  "bifacial",
  "bifacialidade_pct",
  "nmot_c",
  "tensao_max_sistema_v",
  "fusivel_max_serie_a",
  "eficiencia_modulo_pct",
  "comprimento_mm",
  "largura_mm",
  "espessura_mm",
  "peso_kg",
] as const;

export const COLUNAS_CSV_INVERSOR = [
  "potencia_ac_w",
  "potencia_pv_recomendada_max_w",
  "potencia_aparente_max_va",
  "tensao_dc_max_v",
  "tensao_partida_v",
  "mppt_min_v",
  "mppt_max_v",
  "quantidade_mppt",
  "entradas_por_mppt",
  "corrente_max_por_mppt_a",
  "isc_max_por_mppt_a",
  "tensao_ac_v",
  "fases",
  "corrente_ac_max_a",
  "eficiencia_inversor_pct",
  "grau_protecao",
] as const;

/** Colunas do CSV que alimentam os dados técnicos usados pelo motor (status completo/incompleto). */
const COLUNAS_TECNICAS_MODULO = ["voc_v", "vmp_v", "isc_a", "imp_a", "coef_temp_voc_pct_c"];
const COLUNAS_TECNICAS_INVERSOR = [
  "tensao_dc_max_v",
  "mppt_min_v",
  "mppt_max_v",
  "corrente_max_por_mppt_a",
  "quantidade_mppt",
];

function campoCsv(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Modelo de CSV pra baixar ("Baixar modelo CSV"): um único cabeçalho com as colunas comuns + as
 * de módulo + as de inversor (cada linha preenche só as do seu tipo), e uma linha de exemplo de
 * cada tipo. Mesmas colunas que `linhaCsvParaEquipamento` lê.
 */
export function gerarModeloCsv(): string {
  const cabecalho: string[] = [...COLUNAS_CSV_COMUNS, ...COLUNAS_CSV_MODULO, ...COLUNAS_CSV_INVERSOR];
  const exemplos: Record<string, string>[] = [
    {
      tipo: "modulo",
      fabricante: "Fabricante Exemplo",
      modelo: "MOD-620W",
      categoria: "modulo_fv",
      tecnologia: "N-Type TOPCon",
      ativo: "true",
      prioridade: "1",
      custo_reais: "650.00",
      status_validacao: "VALIDADO_DATASHEET",
      fonte_primaria: "https://exemplo.com/datasheet-modulo.pdf",
      observacoes: "Linha de exemplo, apague antes de importar.",
      potencia_wp: "620",
      voc_v: "48.96",
      vmp_v: "40.74",
      isc_a: "16.12",
      imp_a: "15.22",
      coef_temp_voc_pct_c: "-0.25",
      coef_temp_pmax_pct_c: "-0.29",
      coef_temp_isc_pct_c: "0.045",
      bifacial: "false",
      tensao_max_sistema_v: "1500",
      fusivel_max_serie_a: "30",
      eficiencia_modulo_pct: "23.0",
      comprimento_mm: "2382",
      largura_mm: "1134",
      espessura_mm: "30",
      peso_kg: "28.0",
    },
    {
      tipo: "inversor",
      fabricante: "Fabricante Exemplo",
      modelo: "INV-5K-TRI",
      categoria: "on-grid",
      tecnologia: "string",
      ativo: "true",
      prioridade: "1",
      custo_reais: "4500.00",
      status_validacao: "VALIDADO_DATASHEET",
      fonte_primaria: "https://exemplo.com/datasheet-inversor.pdf",
      observacoes: "Linha de exemplo, apague antes de importar.",
      potencia_ac_w: "5000",
      potencia_pv_recomendada_max_w: "7500",
      potencia_aparente_max_va: "5500",
      tensao_dc_max_v: "1100",
      tensao_partida_v: "180",
      mppt_min_v: "160",
      mppt_max_v: "1000",
      quantidade_mppt: "2",
      entradas_por_mppt: "1|1",
      corrente_max_por_mppt_a: "12.5|12.5",
      isc_max_por_mppt_a: "16|16",
      tensao_ac_v: "220/380",
      fases: "trifasico",
      corrente_ac_max_a: "8.3",
      eficiencia_inversor_pct: "98.4",
      grau_protecao: "IP65",
    },
  ];
  const linhas = [cabecalho.join(","), ...exemplos.map((e) => cabecalho.map((c) => campoCsv(e[c] ?? "")).join(","))];
  return `${linhas.join("\n")}\n`;
}

export type EquipamentoExistente = {
  tipo: string;
  fabricante: string;
  modelo: string;
  status_tecnico?: StatusTecnico | null;
};

export type LinhaPreviewValida = {
  /** Número da linha no arquivo (cabeçalho = 1). */
  linha: number;
  /** A linha original do CSV — é ela que volta pra action de confirmação, que valida de novo. */
  original: Record<string, string>;
  tipo: "modulo" | "inversor";
  fabricante: string;
  modelo: string;
  potenciaW: number;
  acao: "novo" | "atualiza";
  statusTecnico: StatusTecnico;
  faltantes: string[];
};

export type PreviewImportacao = {
  totalLinhas: number;
  validas: LinhaPreviewValida[];
  erros: { linha: number; erro: string }[];
  /** Linhas repetidas (mesmo tipo + fabricante + modelo) dentro do arquivo: vale a última. */
  duplicados: { linha: number; repeteLinha: number; descricao: string }[];
  /** Avisos do arquivo como um todo (colunas ausentes/desconhecidas). */
  avisos: string[];
};

function chaveEquipamento(tipo: string, fabricante: string, modelo: string) {
  return JSON.stringify([tipo, fabricante, modelo]);
}

/**
 * Etapa "Mapear/validar → Preview" da importação: aplica `linhaCsvParaEquipamento` em cada
 * linha (mesma validação que grava), sem tocar no banco. Aponta erros, duplicados dentro do
 * arquivo (o upsert do Postgres não aceita a mesma chave duas vezes no mesmo comando — fica a
 * última ocorrência), colunas ausentes/desconhecidas no cabeçalho, se cada equipamento é novo ou
 * atualiza um existente (mesma chave do upsert: empresa + tipo + fabricante + modelo) e com que
 * status técnico vai ficar.
 */
export function prepararPreviewImportacao(
  linhas: Record<string, string>[],
  existentes: EquipamentoExistente[],
): PreviewImportacao {
  const avisos: string[] = [];
  const cabecalho = new Set(Object.keys(linhas[0] ?? {}));
  const tipos = new Set(linhas.map((l) => l.tipo?.trim().toLowerCase()));
  const conhecidas = new Set<string>([...COLUNAS_CSV_COMUNS, ...COLUNAS_CSV_MODULO, ...COLUNAS_CSV_INVERSOR]);

  const obrigatorias = ["tipo", "fabricante", "modelo"];
  if (tipos.has("modulo")) obrigatorias.push("potencia_wp");
  if (tipos.has("inversor")) obrigatorias.push("potencia_ac_w");
  const obrigatoriasAusentes = obrigatorias.filter((c) => !cabecalho.has(c));
  if (obrigatoriasAusentes.length) avisos.push(`Colunas obrigatórias ausentes: ${obrigatoriasAusentes.join(", ")}.`);

  const tecnicas = [
    ...(tipos.has("modulo") ? COLUNAS_TECNICAS_MODULO : []),
    ...(tipos.has("inversor") ? COLUNAS_TECNICAS_INVERSOR : []),
  ];
  const tecnicasAusentes = tecnicas.filter((c) => !cabecalho.has(c));
  if (tecnicasAusentes.length) {
    avisos.push(
      `Colunas técnicas ausentes: ${tecnicasAusentes.join(", ")}. Os equipamentos afetados entram como Incompletos e não participam do motor automático.`,
    );
  }
  const desconhecidas = [...cabecalho].filter((c) => !conhecidas.has(c));
  if (desconhecidas.length) avisos.push(`Colunas não reconhecidas (ignoradas): ${desconhecidas.join(", ")}.`);

  const existentesPorChave = new Map(existentes.map((e) => [chaveEquipamento(e.tipo, e.fabricante, e.modelo), e]));
  const erros: PreviewImportacao["erros"] = [];
  const duplicados: PreviewImportacao["duplicados"] = [];
  const porChave = new Map<string, LinhaPreviewValida>();

  linhas.forEach((original, i) => {
    const numero = i + 2;
    const resultado = linhaCsvParaEquipamento(original);
    if (!resultado.ok) {
      erros.push({ linha: numero, erro: resultado.erro });
      return;
    }
    const v = resultado.valores;
    const tipo = v.tipo as "modulo" | "inversor";
    const chave = chaveEquipamento(tipo, v.fabricante, v.modelo);
    const anterior = porChave.get(chave);
    if (anterior) {
      duplicados.push({ linha: numero, repeteLinha: anterior.linha, descricao: `${v.fabricante} ${v.modelo}` });
      porChave.delete(chave);
    }
    const existente = existentesPorChave.get(chave);
    const faltantes = camposTecnicosFaltantesEquipamento(tipo, v);
    porChave.set(chave, {
      linha: numero,
      original,
      tipo,
      fabricante: v.fabricante,
      modelo: v.modelo,
      potenciaW: v.potencia_w,
      acao: existente ? "atualiza" : "novo",
      // Reimportar não apaga a escolha manual (em revisão/verificado/descontinuado) de quem já existe.
      statusTecnico: statusTecnicoResultante(existente?.status_tecnico ?? "incompleto", faltantes.length === 0),
      faltantes,
    });
  });

  return {
    totalLinhas: linhas.length,
    validas: [...porChave.values()].sort((a, b) => a.linha - b.linha),
    erros,
    duplicados,
    avisos,
  };
}
