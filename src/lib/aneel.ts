/**
 * Tarifa homologada real por distribuidora (fase 4 do kit automático — ver
 * especificação V2 enviada pelo Evandro em 2026-09-30).
 *
 * Fonte: dataset público "Tarifas de aplicação das distribuidoras de energia
 * elétrica" da ANEEL (dadosabertos.aneel.gov.br), via API do CKAN
 * (datastore_search) — a ANEEL não tem uma API dedicada e estável, então
 * dependemos da estrutura desse dataset aberto. `fetch` é recebido por
 * parâmetro pra dar pra testar sem rede.
 */

const ANEEL_DATASTORE_URL = "https://dadosabertos.aneel.gov.br/api/3/action/datastore_search";

/** Dataset "tarifas-distribuidoras-energia-eletrica", recurso principal (CSV/JSON). */
const RESOURCE_ID_TARIFAS = "fcf2906c-7c32-4b9b-a637-054e7a5234f4";

/** Subgrupo B1 (baixa tensão, residencial) — o único usado hoje pela calculadora. */
const SUBGRUPO_PADRAO = "B1";

export type TarifaAneel = {
  vlrTusd: number;
  vlrTe: number;
  subGrupo: string;
  modalidadeTarifaria: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
};

type RegistroTarifaAneel = {
  DscSubGrupo?: string;
  DscModalidadeTarifaria?: string;
  DatInicioVigencia?: string;
  DatFimVigencia?: string;
  VlrTUSD?: string | number;
  VlrTE?: string | number;
};

/** Aceita "0,45" (padrão do dataset) ou "0.45"; inválido vira null. */
function numeroDataset(v: string | number | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Tarifa B1 convencional mais recente da distribuidora (sigla do agente na
 * ANEEL, ex.: "CPFL-PAULISTA"). Entre os registros retornados, prioriza
 * modalidade "Convencional" (a mais comum pra residencial) e pega a maior
 * data de início de vigência. Se a distribuidora não usa essa nomenclatura
 * exata ou a estrutura do dataset mudar, retorna `null` — quem chamou cai
 * pra tarifa digitada manualmente.
 */
export async function buscarTarifaHomologada(
  sigAgente: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TarifaAneel | null> {
  const sigla = sigAgente.trim();
  if (!sigla) return null;

  const filtros = encodeURIComponent(JSON.stringify({ SigAgente: sigla, DscSubGrupo: SUBGRUPO_PADRAO }));
  const url = `${ANEEL_DATASTORE_URL}?resource_id=${RESOURCE_ID_TARIFAS}&filters=${filtros}&limit=1000`;

  let resposta: Response;
  try {
    resposta = await fetchImpl(url);
  } catch {
    return null;
  }
  if (!resposta.ok) return null;

  const dados = (await resposta.json()) as { success?: boolean; result?: { records?: RegistroTarifaAneel[] } };
  if (!dados.success) return null;
  const registros = dados.result?.records ?? [];
  if (registros.length === 0) return null;

  const convencionais = registros.filter((r) => (r.DscModalidadeTarifaria ?? "").toLowerCase().includes("convencional"));
  const candidatos = convencionais.length > 0 ? convencionais : registros;

  const maisRecente = candidatos.reduce<RegistroTarifaAneel | null>((melhor, atual) => {
    if (!melhor) return atual;
    const dataAtual = new Date(atual.DatInicioVigencia ?? 0).getTime();
    const dataMelhor = new Date(melhor.DatInicioVigencia ?? 0).getTime();
    return dataAtual > dataMelhor ? atual : melhor;
  }, null);
  if (!maisRecente) return null;

  const vlrTusd = numeroDataset(maisRecente.VlrTUSD);
  const vlrTe = numeroDataset(maisRecente.VlrTE);
  if (vlrTusd == null || vlrTe == null) return null;

  return {
    vlrTusd,
    vlrTe,
    subGrupo: maisRecente.DscSubGrupo ?? SUBGRUPO_PADRAO,
    modalidadeTarifaria: maisRecente.DscModalidadeTarifaria ?? "",
    vigenciaInicio: maisRecente.DatInicioVigencia ?? "",
    vigenciaFim: maisRecente.DatFimVigencia || null,
  };
}

/** Tarifa total ao consumidor (R$/kWh) — soma dos dois componentes regulados pela ANEEL. */
export function tarifaTotalKwh(tarifa: TarifaAneel): number {
  return tarifa.vlrTusd + tarifa.vlrTe;
}
