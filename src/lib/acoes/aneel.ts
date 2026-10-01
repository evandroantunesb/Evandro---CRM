"use server";

import { buscarTarifaHomologada } from "@/lib/aneel";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

const VALIDADE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const SUBGRUPO_PADRAO = "B1";

export type TarifaEncontrada = {
  tarifaKwh: number;
  vigenciaInicio: string | null;
  resolucaoHomologatoria: string | null;
};

function doCache(linha: {
  tarifa_final_kwh: number;
  vigencia_inicio: string | null;
  resolucao_homologatoria: string | null;
}): TarifaEncontrada {
  return {
    tarifaKwh: linha.tarifa_final_kwh,
    vigenciaInicio: linha.vigencia_inicio,
    resolucaoHomologatoria: linha.resolucao_homologatoria,
  };
}

/**
 * Tarifa homologada (TUSD + TE, já convertida pra R$/kWh) pra uma sigla de
 * distribuidora (SigAgente da ANEEL) já conhecida — ex.: a distribuidora
 * resolvida por município (`resolverDistribuidoraPorIbge`/
 * `resolverDistribuidoraPorCidadeUf`, em `src/lib/acoes/distribuidoras.ts`,
 * Fase 2). Mesmo cache de 7 dias em `tarifas_aneel_cache` de
 * `buscarTarifaDaEmpresa`, só que recebe a sigla diretamente em vez de
 * depender da configuração da empresa. Retorna `null` quando a sigla é
 * vazia, a ANEEL não responde e não há cache anterior.
 */
export async function buscarTarifaPorSigla(sigla: string): Promise<TarifaEncontrada | null> {
  await exigirPapel();
  const siglaLimpa = sigla.trim();
  if (!siglaLimpa) return null;
  return buscarTarifaComCache(siglaLimpa);
}

/**
 * Tarifa homologada (TUSD + TE, já convertida pra R$/kWh) da distribuidora
 * configurada em Parâmetros (Configurações → Kits e calculadora), com cache
 * de 7 dias em `tarifas_aneel_cache`. Retorna `null` quando a empresa não
 * configurou a sigla da distribuidora ou a ANEEL não responde e não há
 * cache anterior — quem chamou usa a tarifa digitada manualmente nesses casos.
 *
 * Fallback temporário de desenvolvimento (Fase 2, 2026-10-01): enquanto a
 * resolução por município (`buscarTarifaPorSigla`, acima) ainda não está
 * integrada ao wizard, esta função usa a sigla fixa configurada por empresa.
 * Isso nunca deve se comportar como se fosse o resultado oficial da
 * resolução por município — é só um valor fixo por empresa até a
 * integração (Fase 4/5).
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

  return buscarTarifaComCache(sigla);
}

async function buscarTarifaComCache(sigla: string): Promise<TarifaEncontrada | null> {
  const supabase = await criarClienteServidor();
  const { data: emCache } = await supabase
    .from("tarifas_aneel_cache")
    .select("tarifa_final_kwh, vigencia_inicio, resolucao_homologatoria, atualizado_em")
    .eq("sigla_distribuidora", sigla)
    .eq("sub_grupo", SUBGRUPO_PADRAO)
    .maybeSingle();

  const cacheValido = emCache && Date.now() - new Date(emCache.atualizado_em).getTime() < VALIDADE_CACHE_MS;
  if (cacheValido) return doCache(emCache);

  const tarifa = await buscarTarifaHomologada(sigla);
  if (!tarifa) {
    // ANEEL não respondeu ou nenhum registro bateu com todos os filtros —
    // usa o cache antigo (mesmo vencido) se existir, melhor que nada.
    return emCache ? doCache(emCache) : null;
  }

  // `tarifas_aneel_cache` é cache global (sem empresa_id) e a RLS restringe insert/update
  // a `e_plataforma_admin()` (revisão de segurança, 2026-10-01 — ver a migration
  // 20260930190000): grava com o client admin (service role, que já ignora RLS) em vez do
  // client do usuário comum, pra qualquer empresa continuar alimentando o cache
  // compartilhado sem poder escrever nele diretamente por fora desta action.
  const { data: gravado } = await criarClienteAdmin()
    .from("tarifas_aneel_cache")
    .upsert(
      {
        sigla_distribuidora: sigla,
        sub_grupo: tarifa.subGrupo,
        vlr_tusd: tarifa.vlrTusd,
        vlr_te: tarifa.vlrTe,
        unidade_terciaria: tarifa.unidadeTerciaria,
        tarifa_final_kwh: tarifa.tarifaFinalKwh,
        modalidade_tarifaria: tarifa.modalidadeTarifaria,
        resolucao_homologatoria: tarifa.resolucaoHomologatoria,
        vigencia_inicio: tarifa.vigenciaInicio || null,
        vigencia_fim: tarifa.vigenciaFim,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "sigla_distribuidora,sub_grupo" },
    )
    .select("tarifa_final_kwh, vigencia_inicio, resolucao_homologatoria")
    .single();

  return gravado
    ? doCache(gravado)
    : {
        tarifaKwh: tarifa.tarifaFinalKwh,
        vigenciaInicio: tarifa.vigenciaInicio || null,
        resolucaoHomologatoria: tarifa.resolucaoHomologatoria || null,
      };
}
