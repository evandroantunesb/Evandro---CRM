"use server";

import { buscarTarifaHomologada, tarifaTotalKwh } from "@/lib/aneel";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const VALIDADE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const SUBGRUPO_PADRAO = "B1";

export type TarifaEncontrada = { tarifaKwh: number; vigenciaInicio: string | null };

/**
 * Tarifa homologada (TUSD + TE) da distribuidora configurada em Parâmetros
 * (Configurações → Kits e calculadora), com cache de 7 dias em
 * `tarifas_aneel_cache`. Retorna `null` quando a empresa não configurou a
 * sigla da distribuidora ou a ANEEL não responde e não há cache anterior —
 * quem chamou usa a tarifa digitada manualmente nesses casos.
 */
export async function buscarTarifaDaEmpresa(): Promise<TarifaEncontrada | null> {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();

  const { data: parametros } = await supabase
    .from("parametros_calculadora")
    .select("sigla_distribuidora_aneel")
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  const sigla = parametros?.sigla_distribuidora_aneel?.trim();
  if (!sigla) return null;

  const { data: emCache } = await supabase
    .from("tarifas_aneel_cache")
    .select("vlr_tusd, vlr_te, vigencia_inicio, atualizado_em")
    .eq("sigla_distribuidora", sigla)
    .eq("sub_grupo", SUBGRUPO_PADRAO)
    .maybeSingle();

  const cacheValido = emCache && Date.now() - new Date(emCache.atualizado_em).getTime() < VALIDADE_CACHE_MS;
  if (cacheValido) {
    return { tarifaKwh: emCache.vlr_tusd + emCache.vlr_te, vigenciaInicio: emCache.vigencia_inicio };
  }

  const tarifa = await buscarTarifaHomologada(sigla);
  if (!tarifa) {
    // ANEEL não respondeu ou a distribuidora não bateu com a base — usa o
    // cache antigo (mesmo vencido) se existir, melhor que nada.
    if (emCache) return { tarifaKwh: emCache.vlr_tusd + emCache.vlr_te, vigenciaInicio: emCache.vigencia_inicio };
    return null;
  }

  await supabase.from("tarifas_aneel_cache").upsert(
    {
      sigla_distribuidora: sigla,
      sub_grupo: tarifa.subGrupo,
      vlr_tusd: tarifa.vlrTusd,
      vlr_te: tarifa.vlrTe,
      modalidade_tarifaria: tarifa.modalidadeTarifaria,
      vigencia_inicio: tarifa.vigenciaInicio || null,
      vigencia_fim: tarifa.vigenciaFim,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "sigla_distribuidora,sub_grupo" },
  );

  return { tarifaKwh: tarifaTotalKwh(tarifa), vigenciaInicio: tarifa.vigenciaInicio || null };
}
