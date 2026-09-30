/**
 * Geocoding + irradiância solar real por localização (fase 2 do kit
 * automático — ver especificação V2 enviada pelo Evandro em 2026-09-30).
 *
 * Fontes externas, ambas gratuitas: Nominatim (OpenStreetMap) pro geocoding
 * e PVGIS (Comissão Europeia, cobre a América do Sul) pra irradiância/
 * produtividade — com NASA POWER como fallback quando o PVGIS não responde
 * (fora da área de cobertura ou instável). `fetch` é recebido por parâmetro
 * pra dar pra testar sem rede.
 */

export type Coordenadas = { lat: number; lon: number };

export type ProdutividadeRegional = {
  produtividadeKwhKwpMes: number;
  fonte: "pvgis" | "nasa";
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc";
const NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point";

/** Performance ratio típico de sistema fotovoltaico bem instalado (perdas de cabo, inversor, sujeira, temperatura). */
const PERFORMANCE_RATIO_PADRAO = 0.78;

/** Geocoding por endereço livre (rua, bairro, cidade — o que o vendedor cadastrou no contato). */
export async function geocodificarEndereco(
  endereco: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Coordenadas | null> {
  const termo = endereco.trim();
  if (!termo) return null;

  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(termo)}`;
  const resposta = await fetchImpl(url, {
    headers: { "User-Agent": "RaionCRM/1.0 (contato via app, uso interno de dimensionamento solar)" },
  });
  if (!resposta.ok) return null;

  const dados = (await resposta.json()) as { lat: string; lon: string }[];
  const primeiro = dados[0];
  if (!primeiro) return null;

  const lat = Number(primeiro.lat);
  const lon = Number(primeiro.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/** PVGIS já devolve a produtividade do sistema (não só irradiância bruta) — é a fonte preferida. */
async function buscarProdutividadePVGIS(
  coordenadas: Coordenadas,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const url = `${PVGIS_URL}?lat=${coordenadas.lat}&lon=${coordenadas.lon}&peakpower=1&loss=14&outputformat=json`;
  const resposta = await fetchImpl(url);
  if (!resposta.ok) return null;

  const dados = (await resposta.json()) as { outputs?: { totals?: { fixed?: { E_y?: number } } } };
  const producaoAnualKwh = dados.outputs?.totals?.fixed?.E_y;
  if (!producaoAnualKwh || producaoAnualKwh <= 0) return null;
  return producaoAnualKwh / 12;
}

/**
 * NASA POWER só dá irradiância bruta (GHI, kWh/m²/dia) — convertemos pra
 * produtividade de sistema aplicando o performance ratio, a mesma
 * aproximação comercial usada pra estimar geração a partir do dado climático
 * (1 kWp de módulo ≈ 1 kW em condição padrão de 1000 W/m², então GHI em
 * kWh/m²/dia equivale à energia diária de 1 kWp antes das perdas do sistema).
 */
async function buscarProdutividadeNASA(coordenadas: Coordenadas, fetchImpl: typeof fetch): Promise<number | null> {
  const url = `${NASA_POWER_URL}?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${coordenadas.lon}&latitude=${coordenadas.lat}&format=JSON`;
  const resposta = await fetchImpl(url);
  if (!resposta.ok) return null;

  const dados = (await resposta.json()) as {
    properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: { ANN?: number } } };
  };
  const ghiMedioAnualKwhM2Dia = dados.properties?.parameter?.ALLSKY_SFC_SW_DWN?.ANN;
  if (!ghiMedioAnualKwhM2Dia || ghiMedioAnualKwhM2Dia <= 0) return null;

  const diasPorMes = 30.44;
  return ghiMedioAnualKwhM2Dia * diasPorMes * PERFORMANCE_RATIO_PADRAO;
}

/** Produtividade média mensal real (kWh por kWp) pra uma coordenada, com PVGIS como fonte primária e NASA como fallback. */
export async function buscarProdutividadeRegional(
  coordenadas: Coordenadas,
  fetchImpl: typeof fetch = fetch,
): Promise<ProdutividadeRegional | null> {
  try {
    const pvgis = await buscarProdutividadePVGIS(coordenadas, fetchImpl);
    if (pvgis) return { produtividadeKwhKwpMes: Math.round(pvgis * 100) / 100, fonte: "pvgis" };
  } catch {
    // segue pro fallback
  }
  try {
    const nasa = await buscarProdutividadeNASA(coordenadas, fetchImpl);
    if (nasa) return { produtividadeKwhKwpMes: Math.round(nasa * 100) / 100, fonte: "nasa" };
  } catch {
    // sem dado real disponível — quem chamou cai pra produtividade média configurada
  }
  return null;
}

/** Arredonda pra 2 casas decimais (~1,1 km) — chave de cache, resolução suficiente pra irradiância. */
export function arredondarCoordenadas(coordenadas: Coordenadas): Coordenadas {
  return {
    lat: Math.round(coordenadas.lat * 100) / 100,
    lon: Math.round(coordenadas.lon * 100) / 100,
  };
}
