"use server";

import {
  arredondarCoordenadas,
  buscarProdutividadeRegional,
  geocodificarEndereco,
  type ProdutividadeRegional,
} from "@/lib/geodados";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Produtividade solar real (PVGIS/NASA) pro endereço informado, com cache em
 * `dados_solares_cache` (compartilhado entre empresas — é dado público de
 * geografia/clima, não de negócio). Retorna `null` quando o endereço não é
 * geocodificável ou nenhuma fonte externa responde; quem chamou usa a
 * produtividade média configurada como alternativa nesses casos.
 */
export async function buscarProdutividadeRegionalPorEndereco(endereco: string): Promise<ProdutividadeRegional | null> {
  await exigirPapel();
  if (!endereco.trim()) return null;

  const coordenadas = await geocodificarEndereco(endereco);
  if (!coordenadas) return null;
  const { lat, lon } = arredondarCoordenadas(coordenadas);

  const supabase = await criarClienteServidor();
  const { data: emCache } = await supabase
    .from("dados_solares_cache")
    .select("produtividade_kwh_kwp_mes, fonte")
    .eq("lat_arredondado", lat)
    .eq("lon_arredondado", lon)
    .maybeSingle();
  if (emCache) {
    return { produtividadeKwhKwpMes: emCache.produtividade_kwh_kwp_mes, fonte: emCache.fonte as "pvgis" | "nasa" };
  }

  const resultado = await buscarProdutividadeRegional({ lat, lon });
  if (!resultado) return null;

  await supabase.from("dados_solares_cache").upsert(
    {
      lat_arredondado: lat,
      lon_arredondado: lon,
      produtividade_kwh_kwp_mes: resultado.produtividadeKwhKwpMes,
      fonte: resultado.fonte,
    },
    { onConflict: "lat_arredondado,lon_arredondado" },
  );
  return resultado;
}
