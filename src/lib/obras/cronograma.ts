import type { Database } from "@/lib/supabase/database.types";
import type { SetorObra } from "./rotulos";

/**
 * Cronograma da obra (OPR): as sete etapas que o banco calcula em `cronograma_obra` (previsto, real, previsão em
 * cascata e atraso em dias úteis) viram as linhas do Gantt do desenho aprovado "Obras — Apresentação". Só
 * apresentação: nenhuma data ou atraso é recalculado aqui.
 */

export type LinhaCronograma = Database["public"]["Functions"]["cronograma_obra"]["Returns"][number];

export const ETAPAS_OBRA = ["projeto", "homologacao", "compra", "entrega_material", "instalacao", "vistoria", "conexao"] as const;
export type EtapaObra = (typeof ETAPAS_OBRA)[number];

export const ROTULO_ETAPA: Record<EtapaObra, string> = {
  projeto: "Chegada na Engenharia e projeto",
  homologacao: "Homologação na concessionária",
  compra: "Compra de equipamentos",
  entrega_material: "Entrega do material",
  instalacao: "Instalação da usina",
  vistoria: "Vistoria da concessionária",
  conexao: "Conexão e entrega ao cliente",
};

/** Rótulo curto (configuração dos prazos). */
export const ROTULO_ETAPA_CURTO: Record<EtapaObra, string> = {
  projeto: "Chegada e projeto",
  homologacao: "Homologação",
  compra: "Compra",
  entrega_material: "Entrega do material",
  instalacao: "Instalação",
  vistoria: "Vistoria",
  conexao: "Conexão",
};

export const SETOR_ETAPA: Record<EtapaObra, SetorObra> = {
  projeto: "engenharia",
  homologacao: "engenharia",
  compra: "compras",
  entrega_material: "compras",
  instalacao: "operacional",
  vistoria: "engenharia",
  conexao: "engenharia",
};

/** Prazos configuráveis (`obra_prazos_etapas`): um por etapa e o da entrega contratada. */
export const CHAVES_PRAZO_OBRA = [...ETAPAS_OBRA, "entrega_contratada"] as const;
export type ChavePrazoObra = (typeof CHAVES_PRAZO_OBRA)[number];

const ehEtapa = (v: string): v is EtapaObra => (ETAPAS_OBRA as readonly string[]).includes(v);

/** Faixa no Gantt, em % da linha do tempo: [início, largura]. */
export type Faixa = readonly [inicio: number, largura: number];
export type Tom = "erro" | "atencao" | "ok" | "neutro";

export type EtapaGanttVM = {
  chave: EtapaObra;
  num: number;
  nome: string;
  sub: string;
  estado: "ok" | "and" | "pend";
  previsto: Faixa;
  real: Faixa | null;
  previsao: Faixa | null;
  tempo: string;
  desvio: { texto: string; tom: Tom };
  /** O que aparece ao passar o mouse no atraso: a justificativa (respondida ou pendente) do atraso próprio ou o motivo
   * calculado do atraso herdado. */
  dica: DicaAtraso | null;
};

export type DicaAtraso = {
  titulo: string;
  texto: string;
  rodape: string;
  /** Justificativa pedida e ainda sem resposta. */
  pendente: boolean;
};

export type CronogramaVM = {
  meses: { rotulo: string; largura: number }[];
  hoje: number | null;
  contratada: { pos: number; data: string };
  etapas: EtapaGanttVM[];
  entregaPrevista: string;
};

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIA_MS = 86_400_000;
const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** Tom do atraso, pela mesma régua do semáforo: até 5 dias úteis é atenção; mais que isso, erro. */
export const tomAtraso = (atraso: number): Tom => (atraso > 5 ? "erro" : atraso > 0 ? "atencao" : "ok");

function desvio(l: LinhaCronograma, ultima: boolean): EtapaGanttVM["desvio"] {
  const a = l.atraso_dias;
  if (l.situacao === "concluida") {
    if (a > 0) return { texto: `+${dias(a)}`, tom: tomAtraso(a) };
    return { texto: a < 0 ? `${dias(-a)} antes` : "no prazo", tom: "ok" };
  }
  if (l.situacao === "andamento") return a > 0 ? { texto: `+${dias(a)} prev.`, tom: tomAtraso(a) } : { texto: "no prazo", tom: "ok" };
  const prev = `prev. ${ddmm(l.previsao_fim)}`;
  if (a <= 0) return { texto: prev, tom: "neutro" };
  return { texto: `${prev} · +${dias(a)}`, tom: ultima ? tomAtraso(a) : "neutro" };
}

/**
 * Linhas do Gantt e escala do desenho: meses inteiros do primeiro ao último dia que aparece (previsto, real, previsão e
 * entrega contratada); posições em % dessa faixa. Linhas fora das sete etapas conhecidas são ignoradas.
 */
export function montarCronograma(
  linhas: readonly LinhaCronograma[],
  entrada: {
    hoje: string;
    entregaContratada: string;
    subtitulo?: (etapa: EtapaObra, l: LinhaCronograma) => string;
    /** Justificativa de cada etapa com atraso próprio (respondida ou pendente). */
    justificativas?: Partial<Record<EtapaObra, DicaAtraso>>;
  },
): CronogramaVM | null {
  const validas = [...linhas].filter((l) => ehEtapa(l.etapa)).sort((a, b) => a.ordem - b.ordem);
  if (validas.length === 0) return null;

  const datas = [entrada.entregaContratada, ...validas.flatMap((l) => [l.previsto_inicio, l.previsto_fim, l.previsao_inicio, l.previsao_fim, l.real_inicio, l.real_fim])]
    .filter((d): d is string => !!d)
    .map(dia);
  const menor = new Date(Math.min(...datas));
  const maior = new Date(Math.max(...datas));
  const ini = Date.UTC(menor.getUTCFullYear(), menor.getUTCMonth(), 1);
  const fim = Date.UTC(maior.getUTCFullYear(), maior.getUTCMonth() + 1, 1);
  const total = (fim - ini) / DIA_MS;
  const pos = (iso: string) => ((dia(iso) - ini) / DIA_MS / total) * 100;
  const faixa = (de: string, ate: string): Faixa => [pos(de), Math.max(pos(ate) - pos(de), 0.6)];

  const meses: CronogramaVM["meses"] = [];
  for (let m = new Date(ini); m.getTime() < fim; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const proximo = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1);
    meses.push({ rotulo: MESES[m.getUTCMonth()], largura: ((proximo - m.getTime()) / DIA_MS / total) * 100 });
  }

  const h = dia(entrada.hoje);
  const etapas = validas.map((l, i): EtapaGanttVM => {
    const chave = l.etapa as EtapaObra;
    const concluida = l.situacao === "concluida";
    const andamento = l.situacao === "andamento";
    const realFim = l.real_fim ?? (andamento ? entrada.hoje : null);
    const previsaoIni = andamento ? entrada.hoje : l.previsao_inicio;
    const causa = l.causa_etapa && ehEtapa(l.causa_etapa) ? l.causa_etapa : null;
    return {
      chave,
      num: i + 1,
      nome: ROTULO_ETAPA[chave],
      sub: entrada.subtitulo?.(chave, l) ?? "",
      estado: concluida ? "ok" : andamento ? "and" : "pend",
      previsto: faixa(l.previsto_inicio, l.previsto_fim),
      real: l.real_inicio && realFim ? faixa(l.real_inicio, realFim) : null,
      previsao: !concluida && dia(l.previsao_fim) > dia(previsaoIni) ? faixa(previsaoIni, l.previsao_fim) : null,
      tempo: concluida ? dias(l.dias_na_etapa) : andamento ? `há ${dias(l.dias_na_etapa)}` : "a iniciar",
      desvio: desvio(l, i === validas.length - 1),
      dica:
        (l.atraso_proprio > 0 ? entrada.justificativas?.[chave] : undefined) ??
        (causa
          ? {
              titulo: "Motivo",
              texto: `Consequência do atraso na etapa ${ETAPAS_OBRA.indexOf(causa) + 1} (${ROTULO_ETAPA_CURTO[causa].toLowerCase()}).`,
              rodape: "Calculado pelo sistema",
              pendente: false,
            }
          : null),
    };
  });

  return {
    meses,
    hoje: h >= ini && h < fim ? pos(entrada.hoje) : null,
    contratada: { pos: pos(entrada.entregaContratada), data: entrada.entregaContratada },
    etapas,
    entregaPrevista: validas.at(-1)!.previsao_fim,
  };
}
