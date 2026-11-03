/**
 * "Sua trajetória" e "Trajetória da equipe" no início do engenheiro (desenho aprovado em 03/11/2026). Os números vêm
 * por mês da RPC `trajetoria_engenharia` (obras com a Engenharia concluída e kWp, pela data da 1ª conclusão); aqui só
 * se soma e agrupa: totais, o mês corrente, trimestres (acumulado e no trecho) e o próximo marco.
 */

export type MetricaTrajetoria = "obras" | "kwp";
export type MesTrajetoria = { mes: string; obras: number; kwp: number };
export type PessoaTrajetoria = { membroId: string; nome: string; obras: number; kwp: number };
export type Trajetoria = {
  pessoal: MesTrajetoria[];
  /** Só para admin, gestor e quem coordena a Engenharia; para os demais, `null`. */
  equipe: { meses: MesTrajetoria[]; pessoas: PessoaTrajetoria[] } | null;
};

/** Marcos fixos por ora (a cada 25 obras ou 250 kWp); editáveis em Configurações numa PR seguinte. */
export const PASSO_MARCO: Record<MetricaTrajetoria, number> = { obras: 25, kwp: 250 };
/** Trimestres nos gráficos; os anteriores já estão no acumulado. */
export const TRIMESTRES_NO_GRAFICO = 12;

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const ehMes = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

function lerMeses(bruto: unknown): MesTrajetoria[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((m: { mes?: unknown; obras?: unknown; kwp?: unknown }) =>
    ehMes(m?.mes) ? [{ mes: m.mes, obras: numero(m.obras), kwp: numero(m.kwp) }] : [],
  );
}

export function lerTrajetoria(bruto: unknown): Trajetoria {
  const j = (bruto ?? {}) as { pessoal?: unknown; equipe?: { meses?: unknown; pessoas?: unknown } | null };
  const pessoas = Array.isArray(j.equipe?.pessoas) ? (j.equipe.pessoas as { membro_id?: unknown; nome?: unknown; obras?: unknown; kwp?: unknown }[]) : [];
  return {
    pessoal: lerMeses(j.pessoal),
    equipe: j.equipe
      ? {
          meses: lerMeses(j.equipe.meses),
          pessoas: pessoas.map((p) => ({ membroId: String(p.membro_id), nome: String(p.nome ?? ""), obras: numero(p.obras), kwp: numero(p.kwp) })),
        }
      : null,
  };
}

export function lerMetrica(valor: unknown): MetricaTrajetoria {
  return valor === "kwp" ? "kwp" : "obras";
}

/** "2024-03" → "março de 2024". */
export function mesPorExtenso(mes: string) {
  const [ano, m] = mes.split("-");
  return `${MESES_LONGOS[Number(m) - 1]} de ${ano}`;
}

/** "2026-01" → "2025-12". */
export function mesAnterior(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

/** Obras concluídas no mês atual e a comparação com o anterior: "▲ 1 em relação a outubro". */
export function concluidasNoMes(meses: MesTrajetoria[], mesAtual: string) {
  const obras = (mes: string) => meses.find((m) => m.mes === mes)?.obras ?? 0;
  const atual = obras(mesAtual);
  const anterior = mesAnterior(mesAtual);
  const diferenca = atual - obras(anterior);
  const nome = MESES_LONGOS[Number(anterior.split("-")[1]) - 1];
  const comparacao = diferenca === 0 ? `igual a ${nome}` : `${diferenca > 0 ? "▲" : "▼"} ${Math.abs(diferenca)} em relação a ${nome}`;
  return { atual, comparacao };
}

export type Trimestre ={ rotulo: string; acumulado: number; noTrecho: number };

export type ResumoTrajetoria = {
  totalObras: number;
  totalKwp: number;
  obrasNoMes: number;
  kwpNoMes: number;
  /** Potência média por obra; sem obras, `null`. */
  mediaKwp: number | null;
  /** Primeiro mês com obra concluída ("2024-03"); sem obras, `null`. */
  desde: string | null;
  /** Do trimestre da primeira obra até o atual (o último é "Hoje"), na métrica escolhida. */
  trimestres: Trimestre[];
  /** Média por trimestre antes do atual (para comparar o ritmo); sem trimestre anterior, `null`. */
  mediaAnteriores: number | null;
  marco: { proximo: number; falta: number; progresso: number };
};

const indiceTrimestre = (mes: string) => {
  const [ano, m] = mes.split("-").map(Number);
  return ano * 4 + Math.floor((m - 1) / 3);
};
const rotuloTrimestre = (indice: number) => `T${(indice % 4) + 1} ${String(Math.floor(indice / 4)).slice(-2)}`;

/** Soma os meses (até o mês atual) na métrica escolhida. `mesAtual` no formato "AAAA-MM" (fuso de Brasília). */
export function resumirTrajetoria(meses: MesTrajetoria[], metrica: MetricaTrajetoria, mesAtual: string): ResumoTrajetoria {
  const ate = meses.filter((m) => m.mes <= mesAtual).sort((a, b) => a.mes.localeCompare(b.mes));
  const totalObras = ate.reduce((s, m) => s + m.obras, 0);
  const totalKwp = ate.reduce((s, m) => s + m.kwp, 0);
  const doMes = ate.find((m) => m.mes === mesAtual);
  const valor = (m: MesTrajetoria) => (metrica === "obras" ? m.obras : m.kwp);

  const trimestres: Trimestre[] = [];
  if (ate.length > 0) {
    const atual = indiceTrimestre(mesAtual);
    let acumulado = 0;
    for (let t = indiceTrimestre(ate[0].mes); t <= atual; t++) {
      const noTrecho = ate.filter((m) => indiceTrimestre(m.mes) === t).reduce((s, m) => s + valor(m), 0);
      acumulado += noTrecho;
      trimestres.push({ rotulo: t === atual ? "Hoje" : rotuloTrimestre(t), acumulado, noTrecho });
    }
  }
  const anteriores = trimestres.slice(0, -1);

  const atingido = metrica === "obras" ? totalObras : totalKwp;
  const passo = PASSO_MARCO[metrica];
  const proximo = (Math.floor(atingido / passo) + 1) * passo;
  return {
    totalObras,
    totalKwp,
    obrasNoMes: doMes?.obras ?? 0,
    kwpNoMes: doMes?.kwp ?? 0,
    mediaKwp: totalObras > 0 ? totalKwp / totalObras : null,
    desde: ate[0]?.mes ?? null,
    trimestres: trimestres.slice(-TRIMESTRES_NO_GRAFICO),
    mediaAnteriores: anteriores.length > 0 ? anteriores.reduce((s, t) => s + t.noTrecho, 0) / anteriores.length : null,
    marco: { proximo, falta: proximo - atingido, progresso: atingido / proximo },
  };
}
