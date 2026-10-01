"use server";

import {
  arredondarCoordenadas,
  buscarProdutividadeRegional,
  geocodificarEndereco,
  type DiagnosticoEtapaGeodados,
} from "@/lib/geodados";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

export type ProdutividadeRegional = { produtividadeKwhKwpMes: number; fonte: "pvgis" | "nasa" };

/** Loga o motivo estruturado da falha nos logs do servidor (Vercel) sem expor dado de cliente
 * nem segredo — Evandro, 2026-10-01 (ponto 3 das correções): "permitir ver/registrar
 * internamente se a falha foi no geocoding, PVGIS ou NASA... não registrar secrets nem dados
 * desnecessários em logs". A UI continua mostrando só a mensagem genérica de sempre. */
function registrarDiagnostico(diagnosticos: DiagnosticoEtapaGeodados[]) {
  console.error("[geodados] produtividade regional não obtida:", JSON.stringify(diagnosticos));
}

/**
 * Produtividade solar real (PVGIS/NASA) pro endereço informado, com cache em
 * `dados_solares_cache` (compartilhado entre empresas — é dado público de
 * geografia/clima, não de negócio). Retorna `null` quando o endereço não é
 * geocodificável ou nenhuma fonte externa responde (motivo estruturado vai pro log do
 * servidor); quem chamou usa a produtividade média configurada como alternativa nesses casos.
 */
export async function buscarProdutividadeRegionalPorEndereco(endereco: string): Promise<ProdutividadeRegional | null> {
  await exigirPapel();
  if (!endereco.trim()) return null;

  const geocodificacao = await geocodificarEndereco(endereco);
  if (!geocodificacao.ok) {
    registrarDiagnostico([geocodificacao.diagnostico]);
    return null;
  }
  const { lat, lon } = arredondarCoordenadas(geocodificacao.coordenadas);

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
  if (!resultado.ok) {
    registrarDiagnostico(resultado.diagnosticos);
    return null;
  }

  // `dados_solares_cache` é cache global (sem empresa_id) e a RLS restringe insert/update
  // a `e_plataforma_admin()` (revisão de segurança, 2026-10-01 — ver a migration
  // 20260930170000): grava com o client admin (service role, que já ignora RLS) em vez do
  // client do usuário comum, pra qualquer vendedor autenticado continuar alimentando o
  // cache compartilhado sem poder escrever nele diretamente por fora desta action.
  await criarClienteAdmin()
    .from("dados_solares_cache")
    .upsert(
      {
        lat_arredondado: lat,
        lon_arredondado: lon,
        produtividade_kwh_kwp_mes: resultado.produtividadeKwhKwpMes,
        fonte: resultado.fonte,
      },
      { onConflict: "lat_arredondado,lon_arredondado" },
    );
  return { produtividadeKwhKwpMes: resultado.produtividadeKwhKwpMes, fonte: resultado.fonte };
}
