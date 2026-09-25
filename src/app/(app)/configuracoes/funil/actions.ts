"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CAMPOS_OBRIGATORIOS, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/funil";
const nome = z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo");

function concluir(mensagem: string): ResultadoAcao {
  revalidatePath(CAMINHO);
  revalidatePath("/negocios");
  return { ok: true, mensagem };
}

export async function criarFunil(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const n = nome.safeParse(formData.get("nome"));
  if (!n.success) return { ok: false, mensagem: n.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data: funil, error } = await supabase
    .from("funis")
    .insert({ empresa_id: atual.empresaId, nome: n.data })
    .select("id")
    .single();
  if (error || !funil) {
    return { ok: false, mensagem: error?.code === "23505" ? "Já existe um funil com esse nome." : "Não foi possível criar." };
  }
  await supabase.from("etapas").insert({ empresa_id: atual.empresaId, funil_id: funil.id, nome: "Novo lead", ordem: 1, inicial: true });
  return concluir("Funil criado com a etapa Novo lead.");
}

export async function criarEtapa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const funilId = z.string().uuid().safeParse(formData.get("funilId"));
  const n = nome.safeParse(formData.get("nome"));
  if (!funilId.success || !n.success) return { ok: false, mensagem: "Informe o nome da etapa." };

  const supabase = await criarClienteServidor();
  const { data: ultima } = await supabase
    .from("etapas")
    .select("ordem")
    .eq("funil_id", funilId.data)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("etapas").insert({
    empresa_id: atual.empresaId,
    funil_id: funilId.data,
    nome: n.data,
    ordem: (ultima?.ordem ?? 0) + 1,
  });
  if (error) return { ok: false, mensagem: "Não foi possível criar a etapa." };
  return concluir("Etapa criada.");
}

export async function renomear(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const dados = z
    .object({ tabela: z.enum(["funis", "etapas"]), id: z.string().uuid(), nome })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from(dados.data.tabela).update({ nome: dados.data.nome }).eq("id", dados.data.id);
  if (error) return { ok: false, mensagem: "Não foi possível renomear." };
  return concluir("Salvo.");
}

/** Troca a ordem da etapa com a vizinha de cima ou de baixo. */
export async function reordenarEtapa(formData: FormData) {
  await exigirPapel("admin");
  const etapaId = String(formData.get("etapaId"));
  const direcao = formData.get("direcao") === "cima" ? "cima" : "baixo";
  const supabase = await criarClienteServidor();

  const { data: etapa } = await supabase.from("etapas").select("id, funil_id, ordem").eq("id", etapaId).single();
  if (!etapa) return;
  const { data: vizinha } = await supabase
    .from("etapas")
    .select("id, ordem")
    .eq("funil_id", etapa.funil_id)
    [direcao === "cima" ? "lt" : "gt"]("ordem", etapa.ordem)
    .order("ordem", { ascending: direcao !== "cima" })
    .limit(1)
    .maybeSingle();
  if (!vizinha) return;

  await supabase.from("etapas").update({ ordem: vizinha.ordem }).eq("id", etapa.id);
  await supabase.from("etapas").update({ ordem: etapa.ordem }).eq("id", vizinha.id);
  concluir("");
}

export async function alternarEtapa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const etapaId = String(formData.get("etapaId"));
  const ativar = formData.get("ativa") === "true";
  const supabase = await criarClienteServidor();

  if (!ativar) {
    const { data: etapa } = await supabase.from("etapas").select("inicial").eq("id", etapaId).single();
    if (etapa?.inicial) return { ok: false, mensagem: "Escolha outra etapa inicial antes de desativar esta." };
    const { count } = await supabase
      .from("negocios")
      .select("id", { count: "exact", head: true })
      .eq("etapa_id", etapaId)
      .eq("status", "aberto");
    if (count) return { ok: false, mensagem: `Mova os ${count} negócios abertos desta etapa antes de desativar.` };
  }

  const { error } = await supabase.from("etapas").update({ ativa: ativar }).eq("id", etapaId);
  if (error) return { ok: false, mensagem: "Não foi possível alterar." };
  return concluir(ativar ? "Etapa reativada." : "Etapa desativada.");
}

export async function definirInicial(formData: FormData) {
  await exigirPapel("admin");
  const etapaId = String(formData.get("etapaId"));
  const supabase = await criarClienteServidor();
  const { data: etapa } = await supabase.from("etapas").select("funil_id, ativa").eq("id", etapaId).single();
  if (!etapa?.ativa) return;
  await supabase.from("etapas").update({ inicial: false }).eq("funil_id", etapa.funil_id).eq("inicial", true);
  await supabase.from("etapas").update({ inicial: true }).eq("id", etapaId);
  concluir("");
}

export async function alternarFunil(formData: FormData) {
  await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  await supabase
    .from("funis")
    .update({ ativo: formData.get("ativo") === "true" })
    .eq("id", String(formData.get("funilId")));
  concluir("");
}

export async function definirCamposObrigatorios(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const etapaId = z.string().uuid().safeParse(formData.get("etapaId"));
  const campos = z.array(z.enum(CAMPOS_OBRIGATORIOS)).safeParse(formData.getAll("campos"));
  if (!etapaId.success || !campos.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("etapas").update({ campos_obrigatorios: campos.data }).eq("id", etapaId.data);
  if (error) return { ok: false, mensagem: "Não foi possível salvar." };
  return concluir("Campos obrigatórios salvos.");
}
