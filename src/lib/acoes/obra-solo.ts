"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { mensagemErro } from "@/lib/erros";
import { ehEtapaChecklist, type EtapaChecklist } from "@/lib/obras/checklist";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/*
 * Ações da obra do Solo (subprojeto 4b, 20261207100000_obra_solo.sql). Só o admin (no Solo há uma pessoa só); o banco
 * confere de novo e grava no histórico da obra. As fotos sobem do navegador direto para o bucket `obra-fotos` (a
 * política do Storage só deixa o admin da empresa) e aqui só são registradas ou apagadas.
 */

const uuid = z.string().uuid();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const INVALIDO: ResultadoAcao = { ok: false, mensagem: "Dados inválidos." };

async function preparar(obraId: string, etapa?: EtapaChecklist) {
  const { atual } = await exigirPapel("admin");
  const valido = uuid.safeParse(obraId).success && (etapa === undefined || ehEtapaChecklist(etapa));
  return { atual, valido, supabase: valido ? await criarClienteServidor() : null };
}

function concluir(obraId: string, erro: { message: string; hint?: string | null } | null, padrao: string, ok = "Salvo."): ResultadoAcao {
  if (erro) return { ok: false, mensagem: mensagemErro(erro, padrao) };
  revalidatePath(`/obras/${obraId}`);
  return { ok: true, mensagem: ok };
}

/** Marca a etapa como feita na data (vazia = hoje) ou desmarca. */
export async function marcarEtapa(obraId: string, etapa: EtapaChecklist, feita: boolean, data: string | null): Promise<ResultadoAcao> {
  const { valido, supabase } = await preparar(obraId, etapa);
  if (!valido || !supabase || (data != null && !dataIso.safeParse(data).success)) return INVALIDO;
  const { error } = await supabase.rpc("marcar_etapa_obra", { p_obra_id: obraId, p_etapa: etapa, p_feita: feita, p_data: data } as never);
  return concluir(obraId, error, "Não foi possível salvar a etapa.", feita ? "Etapa marcada." : "Etapa desmarcada.");
}

/** Data prevista da etapa (nula apaga). */
export async function preverEtapa(obraId: string, etapa: EtapaChecklist, data: string | null): Promise<ResultadoAcao> {
  const { valido, supabase } = await preparar(obraId, etapa);
  if (!valido || !supabase || (data != null && !dataIso.safeParse(data).success)) return INVALIDO;
  const { error } = await supabase.rpc("prever_etapa_obra", { p_obra_id: obraId, p_etapa: etapa, p_data: data } as never);
  return concluir(obraId, error, "Não foi possível salvar a data prevista.");
}

/** Anotação interna ("Só você vê"); vazia apaga. */
export async function anotarEtapa(obraId: string, etapa: EtapaChecklist, texto: string): Promise<ResultadoAcao> {
  const { valido, supabase } = await preparar(obraId, etapa);
  if (!valido || !supabase) return INVALIDO;
  if (texto.length > 1000) return { ok: false, mensagem: "A anotação aceita até 1000 caracteres." };
  const { error } = await supabase.rpc("anotar_etapa_obra", { p_obra_id: obraId, p_etapa: etapa, p_texto: texto.trim() || null } as never);
  return concluir(obraId, error, "Não foi possível salvar a anotação.");
}

/** "Não se aplica" com motivo; motivo nulo desfaz. */
export async function etapaNaoSeAplica(obraId: string, etapa: EtapaChecklist, motivo: string | null): Promise<ResultadoAcao> {
  const { valido, supabase } = await preparar(obraId, etapa);
  if (!valido || !supabase) return INVALIDO;
  if (motivo != null && !motivo.trim()) return { ok: false, mensagem: "Informe o motivo." };
  if (motivo != null && motivo.trim().length > 500) return { ok: false, mensagem: "O motivo aceita até 500 caracteres." };
  const { error } = await supabase.rpc("etapa_nao_se_aplica_obra", { p_obra_id: obraId, p_etapa: etapa, p_motivo: motivo?.trim() ?? null } as never);
  return concluir(obraId, error, "Não foi possível salvar a etapa.");
}

/** Registra a foto que o navegador já enviou para `<empresa>/<obra>/<etapa>/<arquivo>`. */
export async function registrarFotoEtapa(obraId: string, etapa: EtapaChecklist, caminho: string): Promise<ResultadoAcao> {
  const { atual, valido, supabase } = await preparar(obraId, etapa);
  const pasta = `${atual.empresaId}/${obraId}/${etapa}/`;
  if (!valido || !supabase || !caminho.startsWith(pasta) || !/^[\w.-]+$/.test(caminho.slice(pasta.length))) return INVALIDO;
  const { error } = await supabase.rpc("registrar_foto_etapa_obra", { p_obra_id: obraId, p_etapa: etapa, p_caminho: caminho } as never);
  return concluir(obraId, error, "Não foi possível guardar a foto.", "Foto adicionada.");
}

/** Apaga a foto: o registro (banco) e o arquivo (Storage). */
export async function apagarFotoEtapa(obraId: string, fotoId: string): Promise<ResultadoAcao> {
  const { valido, supabase } = await preparar(obraId);
  if (!valido || !supabase || !uuid.safeParse(fotoId).success) return INVALIDO;
  const { data: caminho, error } = await supabase.rpc("apagar_foto_etapa_obra", { p_foto_id: fotoId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível apagar a foto.") };
  // O registro já saiu; se o arquivo não sair, ele fica sem uso no bucket (não aparece em lugar nenhum).
  if (typeof caminho === "string") await supabase.storage.from("obra-fotos").remove([caminho]);
  return concluir(obraId, null, "", "Foto apagada.");
}

/** Troca o link do cliente (o antigo para de funcionar) e devolve o novo endereço. */
export async function gerarNovoLink(obraId: string): Promise<{ ok: true; mensagem: string; link: string } | { ok: false; mensagem: string }> {
  const { valido, supabase } = await preparar(obraId);
  if (!valido || !supabase) return { ok: false, mensagem: "Dados inválidos." };
  const { data, error } = await supabase.rpc("gerar_link_cliente_obra", { p_obra_id: obraId });
  if (error || typeof data !== "string") return { ok: false, mensagem: mensagemErro(error, "Não foi possível gerar o link.") };
  revalidatePath(`/obras/${obraId}`);
  return { ok: true, mensagem: "Link novo gerado. O antigo parou de funcionar.", link: linkDoCliente(data) };
}

function linkDoCliente(token: string) {
  return `${env.siteUrl}/obra/${token}`;
}
