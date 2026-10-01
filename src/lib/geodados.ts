/**
 * Geocoding + irradiância solar real por localização (fase 2 do kit
 * automático — ver especificação V2 enviada pelo Evandro em 2026-09-30).
 *
 * Fontes externas, ambas gratuitas: Nominatim (OpenStreetMap) pro geocoding
 * e PVGIS (Comissão Europeia, cobre a América do Sul) pra irradiância/
 * produtividade — com NASA POWER como fallback quando o PVGIS não responde
 * (fora da área de cobertura ou instável). `fetch` é recebido por parâmetro
 * pra dar pra testar sem rede.
 *
 * Diagnóstico estruturado (Evandro, 2026-10-01, ponto 3 das correções pós-diagnóstico do caso
 * Cascavel/PR): antes, qualquer falha em qualquer etapa (geocoding, PVGIS, NASA) virava só
 * `null`, sem registrar em lugar nenhum POR QUE falhou — impossível saber se foi erro HTTP,
 * timeout, local fora de cobertura ou resposta mal formada. Cada etapa agora devolve um
 * `DiagnosticoEtapaGeodados` (status/provider/reasonCode/httpStatus/message/attemptedAt), mesmo
 * quando dá certo. O fallback pra produtividade padrão da empresa continua existindo (pedido
 * explícito do Evandro: "não quero remover o fallback") — só passa a vir acompanhado do motivo.
 * A UI continua simples ("Não foi possível obter dados solares externos. Usando produtividade
 * padrão da empresa."); o diagnóstico fica disponível pra quem quiser registrar/depurar.
 */

export type Coordenadas = { lat: number; lon: number };

export type ProvedorGeodados = "geocoding" | "pvgis" | "nasa";

export type CodigoDiagnosticoGeodados =
  | "GEOCODING_NOT_FOUND"
  | "GEOCODING_HTTP_ERROR"
  | "GEOCODING_TIMEOUT"
  | "PVGIS_HTTP_ERROR"
  | "PVGIS_UNAVAILABLE_FOR_LOCATION"
  | "PVGIS_TIMEOUT"
  | "PVGIS_INVALID_RESPONSE"
  | "NASA_HTTP_ERROR"
  | "NASA_TIMEOUT"
  | "NASA_INVALID_RESPONSE";

export type DiagnosticoEtapaGeodados = {
  provider: ProvedorGeodados;
  status: "ok" | "falhou";
  /** Ausente quando `status === "ok"`, ou quando a etapa nem chegou a ser tentada (ex.:
   * endereço vazio). */
  reasonCode?: CodigoDiagnosticoGeodados;
  httpStatus?: number;
  /** Curta, sem corpo de resposta nem dado do cliente — só o necessário pra depurar (Evandro,
   * 2026-10-01: "não registrar secrets nem dados desnecessários em logs"). */
  message: string;
  attemptedAt: string;
};

export type ResultadoGeocodificacao =
  | { ok: true; coordenadas: Coordenadas; diagnostico: DiagnosticoEtapaGeodados }
  | { ok: false; diagnostico: DiagnosticoEtapaGeodados };

export type ResultadoProdutividadeRegional =
  | { ok: true; produtividadeKwhKwpMes: number; fonte: "pvgis" | "nasa"; diagnosticos: DiagnosticoEtapaGeodados[] }
  | { ok: false; diagnosticos: DiagnosticoEtapaGeodados[] };

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc";
const NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point";

/** Performance ratio típico de sistema fotovoltaico bem instalado (perdas de cabo, inversor, sujeira, temperatura). */
const PERFORMANCE_RATIO_PADRAO = 0.78;

/** Tempo máximo de espera por fonte externa antes de desistir e tratar como timeout — essas APIs
 * não têm SLA formal, então um valor conservador evita travar o formulário do vendedor. */
const TIMEOUT_MS = 8000;

function agora(): string {
  return new Date().toISOString();
}

function diagnosticoOk(provider: ProvedorGeodados): DiagnosticoEtapaGeodados {
  return { provider, status: "ok", message: "OK.", attemptedAt: agora() };
}

function diagnosticoFalha(
  provider: ProvedorGeodados,
  reasonCode: CodigoDiagnosticoGeodados,
  message: string,
  httpStatus?: number,
): DiagnosticoEtapaGeodados {
  return { provider, status: "falhou", reasonCode, httpStatus, message, attemptedAt: agora() };
}

function ehTimeout(erro: unknown): boolean {
  return erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
}

/** Geocoding por endereço livre (rua, bairro, cidade — o que o vendedor cadastrou no contato). */
export async function geocodificarEndereco(
  endereco: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoGeocodificacao> {
  const termo = endereco.trim();
  if (!termo) {
    return { ok: false, diagnostico: diagnosticoFalha("geocoding", "GEOCODING_NOT_FOUND", "Endereço vazio.") };
  }

  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(termo)}`;
  let resposta: Response;
  try {
    resposta = await fetchImpl(url, {
      headers: { "User-Agent": "RaionCRM/1.0 (contato via app, uso interno de dimensionamento solar)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    if (ehTimeout(erro)) {
      return { ok: false, diagnostico: diagnosticoFalha("geocoding", "GEOCODING_TIMEOUT", `Sem resposta do Nominatim em ${TIMEOUT_MS}ms.`) };
    }
    return {
      ok: false,
      diagnostico: diagnosticoFalha("geocoding", "GEOCODING_HTTP_ERROR", erro instanceof Error ? erro.message : "Falha de rede no geocoding."),
    };
  }
  if (!resposta.ok) {
    return {
      ok: false,
      diagnostico: diagnosticoFalha("geocoding", "GEOCODING_HTTP_ERROR", `Nominatim respondeu HTTP ${resposta.status}.`, resposta.status),
    };
  }

  const dados = (await resposta.json()) as { lat: string; lon: string }[];
  const primeiro = dados[0];
  if (!primeiro) {
    return { ok: false, diagnostico: diagnosticoFalha("geocoding", "GEOCODING_NOT_FOUND", "Nominatim não encontrou esse endereço.") };
  }

  const lat = Number(primeiro.lat);
  const lon = Number(primeiro.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, diagnostico: diagnosticoFalha("geocoding", "GEOCODING_NOT_FOUND", "Nominatim devolveu coordenadas inválidas.") };
  }
  return { ok: true, coordenadas: { lat, lon }, diagnostico: diagnosticoOk("geocoding") };
}

/** PVGIS já devolve a produtividade do sistema (não só irradiância bruta) — é a fonte preferida. */
async function buscarProdutividadePVGIS(
  coordenadas: Coordenadas,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; valor: number } | { ok: false; diagnostico: DiagnosticoEtapaGeodados }> {
  const url = `${PVGIS_URL}?lat=${coordenadas.lat}&lon=${coordenadas.lon}&peakpower=1&loss=14&outputformat=json`;
  let resposta: Response;
  try {
    resposta = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (erro) {
    if (ehTimeout(erro)) {
      return { ok: false, diagnostico: diagnosticoFalha("pvgis", "PVGIS_TIMEOUT", `Sem resposta do PVGIS em ${TIMEOUT_MS}ms.`) };
    }
    return { ok: false, diagnostico: diagnosticoFalha("pvgis", "PVGIS_HTTP_ERROR", erro instanceof Error ? erro.message : "Falha de rede no PVGIS.") };
  }
  if (!resposta.ok) {
    // PVGIS devolve 400 pra coordenada fora da área de cobertura (fora da Europa/América/África/Ásia
    // coberta pelo dataset) — distingue isso de um erro genérico de servidor quando dá pra saber.
    const codigo = resposta.status === 400 ? "PVGIS_UNAVAILABLE_FOR_LOCATION" : "PVGIS_HTTP_ERROR";
    return { ok: false, diagnostico: diagnosticoFalha("pvgis", codigo, `PVGIS respondeu HTTP ${resposta.status}.`, resposta.status) };
  }

  const dados = (await resposta.json()) as { outputs?: { totals?: { fixed?: { E_y?: number } } } };
  const producaoAnualKwh = dados.outputs?.totals?.fixed?.E_y;
  if (!producaoAnualKwh || producaoAnualKwh <= 0) {
    return { ok: false, diagnostico: diagnosticoFalha("pvgis", "PVGIS_INVALID_RESPONSE", "PVGIS respondeu sem E_y (produção anual) válido.") };
  }
  return { ok: true, valor: producaoAnualKwh / 12 };
}

/**
 * NASA POWER só dá irradiância bruta (GHI, kWh/m²/dia) — convertemos pra
 * produtividade de sistema aplicando o performance ratio, a mesma
 * aproximação comercial usada pra estimar geração a partir do dado climático
 * (1 kWp de módulo ≈ 1 kW em condição padrão de 1000 W/m², então GHI em
 * kWh/m²/dia equivale à energia diária de 1 kWp antes das perdas do sistema).
 */
async function buscarProdutividadeNASA(
  coordenadas: Coordenadas,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; valor: number } | { ok: false; diagnostico: DiagnosticoEtapaGeodados }> {
  const url = `${NASA_POWER_URL}?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${coordenadas.lon}&latitude=${coordenadas.lat}&format=JSON`;
  let resposta: Response;
  try {
    resposta = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (erro) {
    if (ehTimeout(erro)) {
      return { ok: false, diagnostico: diagnosticoFalha("nasa", "NASA_TIMEOUT", `Sem resposta da NASA POWER em ${TIMEOUT_MS}ms.`) };
    }
    return { ok: false, diagnostico: diagnosticoFalha("nasa", "NASA_HTTP_ERROR", erro instanceof Error ? erro.message : "Falha de rede na NASA POWER.") };
  }
  if (!resposta.ok) {
    return { ok: false, diagnostico: diagnosticoFalha("nasa", "NASA_HTTP_ERROR", `NASA POWER respondeu HTTP ${resposta.status}.`, resposta.status) };
  }

  const dados = (await resposta.json()) as {
    properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: { ANN?: number } } };
  };
  const ghiMedioAnualKwhM2Dia = dados.properties?.parameter?.ALLSKY_SFC_SW_DWN?.ANN;
  if (!ghiMedioAnualKwhM2Dia || ghiMedioAnualKwhM2Dia <= 0) {
    return { ok: false, diagnostico: diagnosticoFalha("nasa", "NASA_INVALID_RESPONSE", "NASA POWER respondeu sem ALLSKY_SFC_SW_DWN.ANN válido.") };
  }

  const diasPorMes = 30.44;
  return { ok: true, valor: ghiMedioAnualKwhM2Dia * diasPorMes * PERFORMANCE_RATIO_PADRAO };
}

/** Produtividade média mensal real (kWh por kWp) pra uma coordenada: tenta PVGIS primeiro, NASA
 * como fallback se o PVGIS falhar. `diagnosticos` traz uma entrada por fonte realmente tentada
 * (1 quando o PVGIS já funciona, 2 quando precisou cair pro NASA) — nunca esconde em qual etapa
 * a falha aconteceu, mesmo no caminho de sucesso via fallback. */
export async function buscarProdutividadeRegional(
  coordenadas: Coordenadas,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoProdutividadeRegional> {
  const diagnosticos: DiagnosticoEtapaGeodados[] = [];

  const pvgis = await buscarProdutividadePVGIS(coordenadas, fetchImpl);
  if (pvgis.ok) {
    diagnosticos.push(diagnosticoOk("pvgis"));
    return { ok: true, produtividadeKwhKwpMes: Math.round(pvgis.valor * 100) / 100, fonte: "pvgis", diagnosticos };
  }
  diagnosticos.push(pvgis.diagnostico);

  const nasa = await buscarProdutividadeNASA(coordenadas, fetchImpl);
  if (nasa.ok) {
    diagnosticos.push(diagnosticoOk("nasa"));
    return { ok: true, produtividadeKwhKwpMes: Math.round(nasa.valor * 100) / 100, fonte: "nasa", diagnosticos };
  }
  diagnosticos.push(nasa.diagnostico);

  return { ok: false, diagnosticos };
}

/** Arredonda pra 2 casas decimais (~1,1 km) — chave de cache, resolução suficiente pra irradiância. */
export function arredondarCoordenadas(coordenadas: Coordenadas): Coordenadas {
  return {
    lat: Math.round(coordenadas.lat * 100) / 100,
    lon: Math.round(coordenadas.lon * 100) / 100,
  };
}
