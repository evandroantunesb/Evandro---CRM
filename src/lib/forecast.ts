import type { Temperatura } from "@/lib/temperatura";

/**
 * Regras do Forecast (desenho aprovado "Forecast", decisões do Evandro de 02 e 04/11/2026), sem acesso ao banco.
 *
 * Chance = chance base da etapa (Configurações › Funis e etapas) + temperatura (quente +10, frio −10), entre 0 e 100.
 * Entra no Forecast o negócio aberto com chance ≥ 20%, valor e mês previsto de fechamento a partir do mês atual.
 * Categorias: Compromisso (≥ 70%), Provável (40% a 69%), Possível (20% a 39%). Ponderado = valor × chance.
 * "Fora do forecast": negócio aberto que não entra por falta de dado (sem data prevista, data já passada, sem valor),
 * parado ou em etapa sem chance; cada um conta uma vez, no primeiro motivo dessa ordem.
 * Meta do mês: soma das metas de receita que cobrem o mês; meta de período maior entra pela fração de dias no mês.
 */

export const CHANCE_MINIMA = 20;
export const AJUSTE_TEMPERATURA: Record<Temperatura, number> = { quente: 10, morno: 0, frio: -10 };

export const CATEGORIAS = ["compromisso", "provavel", "possivel"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const ROTULO_CATEGORIA: Record<Categoria, string> = { compromisso: "Compromisso", provavel: "Provável", possivel: "Possível" };
export const FAIXA_CATEGORIA: Record<Categoria, string> = { compromisso: "chance ≥ 70%", provavel: "40% a 69%", possivel: "20% a 39%" };

export const MOTIVOS_FORA = ["sem_data", "data_passada", "sem_valor", "parado", "etapa_sem_chance"] as const;
export type MotivoFora = (typeof MOTIVOS_FORA)[number];
export const ROTULO_MOTIVO_FORA: Record<MotivoFora, (dias: number) => string> = {
  sem_data: () => "sem data prevista de fechamento",
  data_passada: () => "com a data prevista já passada",
  sem_valor: () => "sem valor",
  parado: (dias) => `parados há mais de ${dias} ${dias === 1 ? "dia" : "dias"}`,
  etapa_sem_chance: () => "em etapa sem chance definida",
};

export type NegocioForecastEntrada = {
  id: string;
  numero: number;
  titulo: string;
  contatoNome: string;
  etapaNome: string;
  /** Chance base da etapa; nula = etapa fora do Forecast. */
  chanceBase: number | null;
  temperatura: Temperatura | null;
  /** Por que a temperatura é fria (risco mostrado na lista); nulo quando não é fria. */
  risco: string | null;
  valor: number | null;
  /** 1º dia do mês previsto ("2026-11-01"). */
  fechamentoPrevisto: string | null;
  parado: boolean;
  responsavelId: string | null;
};

export type NegocioForecast = NegocioForecastEntrada & { chance: number; categoria: Categoria; valor: number; mes: string; ponderado: number };
export type NegocioFora = NegocioForecastEntrada & { motivo: MotivoFora };

export type MetaReceita = { membroId: string; valorAlvo: number; periodoInicio: string; periodoFim: string };

/** "2026-11-04" → "2026-11-01". */
export const inicioDoMes = (dataIso: string) => `${dataIso.slice(0, 7)}-01`;

/** O mês de `inicio` somado de `n` meses, no formato "AAAA-MM-01". */
export function somarMeses(inicio: string, n: number) {
  const ano = Number(inicio.slice(0, 4));
  const mes = Number(inicio.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(ano, mes, 1));
  return d.toISOString().slice(0, 10);
}

/** Mês atual e os dois seguintes. */
export const mesesDoForecast = (hoje: string) => [0, 1, 2].map((n) => somarMeses(inicioDoMes(hoje), n));

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const nomeDoMes = (mes: string) => NOMES_MES[Number(mes.slice(5, 7)) - 1];
/** "2026-11-01" → "nov/26". */
export const mesCurto = (mes: string) => `${nomeDoMes(mes).slice(0, 3).toLowerCase()}/${mes.slice(2, 4)}`;

export function chanceAjustada(base: number, temperatura: Temperatura | null) {
  return Math.min(100, Math.max(0, base + (temperatura ? AJUSTE_TEMPERATURA[temperatura] : 0)));
}

export function categoriaDaChance(chance: number): Categoria | null {
  if (chance >= 70) return "compromisso";
  if (chance >= 40) return "provavel";
  if (chance >= CHANCE_MINIMA) return "possivel";
  return null;
}

export type Classificacao =
  | { tipo: "dentro"; negocio: NegocioForecast }
  | { tipo: "fora"; negocio: NegocioFora }
  /** Chance abaixo de 20%: não entra e não é problema de dado. */
  | { tipo: "abaixo" };

export function classificar(n: NegocioForecastEntrada, mesAtual: string): Classificacao {
  const motivo: MotivoFora | null = !n.fechamentoPrevisto
    ? "sem_data"
    : n.fechamentoPrevisto < mesAtual
      ? "data_passada"
      : n.valor == null || n.valor <= 0
        ? "sem_valor"
        : n.parado
          ? "parado"
          : n.chanceBase == null
            ? "etapa_sem_chance"
            : null;
  if (motivo) return { tipo: "fora", negocio: { ...n, motivo } };

  const chance = chanceAjustada(n.chanceBase!, n.temperatura);
  const categoria = categoriaDaChance(chance);
  if (!categoria) return { tipo: "abaixo" };
  const valor = n.valor!;
  return {
    tipo: "dentro",
    negocio: { ...n, chance, categoria, valor, mes: n.fechamentoPrevisto!, ponderado: (valor * chance) / 100 },
  };
}

const DIA = 86_400_000;
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA) + 1;

/** Parte da meta que cai no mês: inteira se o período está dentro do mês; senão, pela fração de dias. */
export function metaNoMes(meta: MetaReceita, mes: string) {
  const fimDoMes = somarMeses(mes, 1);
  const ultimoDia = new Date(Date.parse(`${fimDoMes}T00:00:00Z`) - DIA).toISOString().slice(0, 10);
  const de = meta.periodoInicio > mes ? meta.periodoInicio : mes;
  const ate = meta.periodoFim < ultimoDia ? meta.periodoFim : ultimoDia;
  if (de > ate) return 0;
  const total = dias(meta.periodoInicio, meta.periodoFim);
  if (total <= 0) return 0;
  return (meta.valorAlvo * dias(de, ate)) / total;
}

export const somaMetas = (metas: MetaReceita[], mes: string, membroId?: string) =>
  metas.filter((m) => !membroId || m.membroId === membroId).reduce((s, m) => s + metaNoMes(m, mes), 0);

export type ValoresCategoria = Record<Categoria, { valor: number; quantidade: number }>;
const categoriasZeradas = (): ValoresCategoria => ({
  compromisso: { valor: 0, quantidade: 0 },
  provavel: { valor: 0, quantidade: 0 },
  possivel: { valor: 0, quantidade: 0 },
});

export type MesForecast = { mes: string; categorias: ValoresCategoria; total: number; ponderado: number; meta: number };
export type VendedorForecast = { membroId: string; ponderado: number; meta: number };

export type ForecastVM = {
  meses: MesForecast[];
  /** Negócios do Forecast nos três meses, mais prováveis primeiro. */
  negocios: NegocioForecast[];
  fora: NegocioFora[];
  porVendedor: (mes: string) => VendedorForecast[];
};

export function montarForecast(entrada: NegocioForecastEntrada[], metas: MetaReceita[], hoje: string): ForecastVM {
  const meses = mesesDoForecast(hoje);
  const negocios: NegocioForecast[] = [];
  const fora: NegocioFora[] = [];
  for (const n of entrada) {
    const c = classificar(n, meses[0]);
    if (c.tipo === "dentro" && meses.includes(c.negocio.mes)) negocios.push(c.negocio);
    else if (c.tipo === "fora") fora.push(c.negocio);
  }
  negocios.sort((a, b) => b.chance - a.chance || b.ponderado - a.ponderado || a.numero - b.numero);

  const porMes = meses.map((mes): MesForecast => {
    const categorias = categoriasZeradas();
    let ponderado = 0;
    for (const n of negocios) {
      if (n.mes !== mes) continue;
      categorias[n.categoria].valor += n.valor;
      categorias[n.categoria].quantidade += 1;
      ponderado += n.ponderado;
    }
    const total = CATEGORIAS.reduce((s, c) => s + categorias[c].valor, 0);
    return { mes, categorias, total, ponderado, meta: somaMetas(metas, mes) };
  });

  const porVendedor = (mes: string): VendedorForecast[] => {
    const ids = new Set<string>([...metas.filter((m) => metaNoMes(m, mes) > 0).map((m) => m.membroId)]);
    for (const n of negocios) if (n.mes === mes && n.responsavelId) ids.add(n.responsavelId);
    return [...ids]
      .map((membroId) => ({
        membroId,
        ponderado: negocios.filter((n) => n.mes === mes && n.responsavelId === membroId).reduce((s, n) => s + n.ponderado, 0),
        meta: somaMetas(metas, mes, membroId),
      }))
      .sort((a, b) => b.ponderado - a.ponderado || b.meta - a.meta);
  };

  return { meses: porMes, negocios, fora, porVendedor };
}
