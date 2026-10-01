/**
 * Tarifa homologada real por distribuidora (fase 4 do kit automático — ver
 * especificação V2 enviada pelo Evandro em 2026-09-30).
 *
 * Fonte: dataset público "Tarifas de aplicação das distribuidoras de energia
 * elétrica" da ANEEL (dadosabertos.aneel.gov.br), via API do CKAN
 * (datastore_search) — a ANEEL não tem uma API dedicada e estável, então
 * dependemos da estrutura desse dataset aberto. `fetch` é recebido por
 * parâmetro pra dar pra testar sem rede.
 *
 * Filtro (revisado com Evandro em 2026-09-30, pra evitar pegar registro
 * errado): base tarifária "Tarifa de Aplicação", subgrupo B1, classe e
 * subclasse "Residencial", modalidade "Convencional" (comparação exata —
 * "SCEE - CONVENCIONAL" não é a mesma coisa), posto tarifário "Não se
 * aplica" (B1 não tem posto horário) e vigência que inclua a data atual;
 * havendo mais de um candidato, o de vigência mais recente.
 */

const ANEEL_DATASTORE_URL = "https://dadosabertos.aneel.gov.br/api/3/action/datastore_search";

/** Dataset "tarifas-distribuidoras-energia-eletrica", recurso principal (CSV/JSON). */
const RESOURCE_ID_TARIFAS = "fcf2906c-7c32-4b9b-a637-054e7a5234f4";

const SUBGRUPO_PADRAO = "B1";
const BASE_TARIFARIA_ESPERADA = "Tarifa de Aplicação";
const MODALIDADE_ESPERADA = "Convencional";
const CLASSE_ESPERADA = "Residencial";
const POSTO_TARIFARIO_ESPERADO = "Não se aplica";

export type TarifaAneel = {
  vlrTusd: number;
  vlrTe: number;
  /** Unidade original do dataset (ex.: "R$/MWh" ou "R$/kWh") — ver `DscUnidadeTerciaria`. */
  unidadeTerciaria: string;
  /** (vlrTusd + vlrTe) já convertido pra R$/kWh, pronto pra preencher o campo do negócio. */
  tarifaFinalKwh: number;
  subGrupo: string;
  modalidadeTarifaria: string;
  /** Resolução Homologatória (REH) que aprovou essa tarifa — `DscREH`. */
  resolucaoHomologatoria: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
};

type RegistroTarifaAneel = {
  DscREH?: string;
  DscBaseTarifaria?: string;
  DscSubGrupo?: string;
  DscModalidadeTarifaria?: string;
  DscClasse?: string;
  DscSubClasse?: string;
  NomPostoTarifario?: string;
  DscUnidadeTerciaria?: string;
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

/** Compara ignorando espaços nas pontas e maiúsculas/minúsculas, mas exige o texto igual (não "contém"). */
function igual(valor: string | undefined, esperado: string): boolean {
  return (valor ?? "").trim().toLowerCase() === esperado.toLowerCase();
}

/** A vigência do registro inclui `hoje`? Sem `DatFimVigencia` (comum pra tarifa ainda vigente) conta como em aberto. */
function vigenteEm(registro: RegistroTarifaAneel, hoje: Date): boolean {
  const inicio = new Date(registro.DatInicioVigencia ?? "");
  if (Number.isNaN(inicio.getTime()) || inicio > hoje) return false;
  const fimTexto = (registro.DatFimVigencia ?? "").trim();
  if (!fimTexto) return true;
  const fim = new Date(fimTexto);
  return Number.isNaN(fim.getTime()) || fim >= hoje;
}

/**
 * Tarifa B1 residencial convencional vigente hoje pra distribuidora (sigla
 * do agente na ANEEL, ex.: "CPFL-PAULISTA"). Se nenhum registro bater com
 * todos os filtros, retorna `null` — quem chamou cai pra tarifa digitada
 * manualmente.
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

  const hoje = new Date();
  const candidatos = registros.filter(
    (r) =>
      igual(r.DscBaseTarifaria, BASE_TARIFARIA_ESPERADA) &&
      igual(r.DscSubGrupo, SUBGRUPO_PADRAO) &&
      igual(r.DscModalidadeTarifaria, MODALIDADE_ESPERADA) &&
      igual(r.DscClasse, CLASSE_ESPERADA) &&
      igual(r.DscSubClasse, CLASSE_ESPERADA) &&
      igual(r.NomPostoTarifario, POSTO_TARIFARIO_ESPERADO) &&
      vigenteEm(r, hoje),
  );
  if (candidatos.length === 0) return null;

  const maisRecente = candidatos.reduce((melhor, atual) =>
    new Date(atual.DatInicioVigencia ?? 0) > new Date(melhor.DatInicioVigencia ?? 0) ? atual : melhor,
  );

  const vlrTusd = numeroDataset(maisRecente.VlrTUSD);
  const vlrTe = numeroDataset(maisRecente.VlrTE);
  if (vlrTusd == null || vlrTe == null) return null;

  const unidadeTerciaria = (maisRecente.DscUnidadeTerciaria ?? "").trim();
  const somaTusdTe = vlrTusd + vlrTe;
  const emMegawattHora = unidadeTerciaria.toUpperCase().includes("MWH");
  const tarifaFinalKwh = emMegawattHora ? somaTusdTe / 1000 : somaTusdTe;

  return {
    vlrTusd,
    vlrTe,
    unidadeTerciaria,
    tarifaFinalKwh,
    subGrupo: maisRecente.DscSubGrupo ?? SUBGRUPO_PADRAO,
    modalidadeTarifaria: maisRecente.DscModalidadeTarifaria ?? "",
    resolucaoHomologatoria: maisRecente.DscREH ?? "",
    vigenciaInicio: maisRecente.DatInicioVigencia ?? "",
    vigenciaFim: maisRecente.DatFimVigencia || null,
  };
}
