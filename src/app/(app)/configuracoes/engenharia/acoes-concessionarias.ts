"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CHAVES_PRAZO_DISTRIBUIDORA } from "@/lib/engenharia-prazos-regras";
import { TIPOS_SOLICITACAO } from "@/lib/engenharia-protocolos-regras";
import { mensagemErro } from "@/lib/erros";
import { PRAZOS_OBRA } from "@/lib/permissoes";
import { coordenaSetor } from "@/lib/prazos-permissao";
import { exigirPapel } from "@/lib/sessao";
import { carregarSetoresCoordenados } from "@/lib/setores-coordenados";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";
import { gravarPrazos } from "./gravar-prazos";

/**
 * Concessionárias da empresa em Configurações › Engenharia (entrega 3 do item 6; prévia aprovada em 26/11/2026). O banco
 * confere de novo: só o admin cria e edita concessionária e canais; os prazos da distribuidora, quem edita os prazos.
 */

const CAMINHO = "/configuracoes/engenharia";
const uuid = z.string().uuid();
const nome = z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo");
const TIPOS_CANAL = TIPOS_SOLICITACAO.filter((t) => t !== "outro");

/** Cópia da Copel da empresa ou vazia; abre a tela na concessionária criada. */
export async function criarConcessionaria(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const d = z
    .object({ nome, distribuidora: z.string().trim().min(2, "Escolha a distribuidora.").max(60), base: z.enum(["copel", "vazia"]) })
    .safeParse({ nome: formData.get("nome"), distribuidora: formData.get("distribuidora"), base: formData.get("base") });
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  let copiarDe: string | null = null;
  if (d.data.base === "copel") {
    const { data: copel } = await supabase
      .from("concessionarias")
      .select("id")
      .eq("empresa_id", atual.empresaId)
      .eq("distribuidora", "COPEL-DIS")
      .maybeSingle();
    if (!copel) return { ok: false, mensagem: "A empresa não tem a Copel para copiar." };
    copiarDe = copel.id;
  }
  const { data: id, error } = await supabase.rpc("criar_concessionaria", {
    p_empresa_id: atual.empresaId,
    p_nome: d.data.nome,
    p_distribuidora: d.data.distribuidora,
    p_copiar_de: copiarDe ?? undefined,
  });
  if (error || !id) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a concessionária.") };
  revalidatePath(CAMINHO);
  redirect(`${CAMINHO}?c=${id}`);
}

export async function renomearConcessionaria(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const d = z.object({ id: uuid, nome }).safeParse({ id: formData.get("id"), nome: formData.get("nome") });
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("concessionarias")
    .update({ nome: d.data.nome })
    .eq("id", d.data.id)
    .eq("empresa_id", atual.empresaId)
    .select("id");
  if (error) return { ok: false, mensagem: error.code === "23505" ? "Já existe uma concessionária com esse nome." : "Não foi possível salvar o nome." };
  if (!data?.length) return { ok: false, mensagem: "Não foi possível salvar o nome." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Nome salvo." };
}

/** Cria (sem `id`) ou edita um canal de entrada. `tipos` e `tensoes` vêm repetidos no formulário. */
export async function salvarCanal(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const tipos = formData.getAll("tipos").map(String);
  const tensoes = formData.getAll("tensoes").map(String);
  if (tipos.some((t) => !(TIPOS_CANAL as readonly string[]).includes(t))) return { ok: false, mensagem: "Tipo de solicitação inválido." };
  if (tensoes.some((t) => t !== "baixa" && t !== "media")) return { ok: false, mensagem: "Tensão inválida." };
  const d = z
    .object({
      id: uuid.optional(),
      concessionariaId: uuid,
      nome: z.string().trim().min(1, "Informe o nome do canal.").max(60, "Nome muito longo"),
      ordem: z.coerce.number().int("Ordem inválida").min(0).max(9999),
    })
    .safeParse({
      id: formData.get("id") || undefined,
      concessionariaId: formData.get("concessionariaId"),
      nome: formData.get("nome"),
      ordem: formData.get("ordem") || 0,
    });
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
  if (d.data.nome.toLowerCase() === "outro") return { ok: false, mensagem: 'Use outro nome: "Outro" já é a opção fixa do protocolo.' };
  const campos = { nome: d.data.nome, ordem: d.data.ordem, ativo: formData.get("ativo") === "on", tipos, tensoes };
  const supabase = await criarClienteServidor();
  const { data, error } = d.data.id
    ? await supabase
        .from("concessionaria_canais")
        .update(campos)
        .eq("id", d.data.id)
        .eq("empresa_id", atual.empresaId)
        .eq("concessionaria_id", d.data.concessionariaId)
        .select("id")
    : await supabase
        .from("concessionaria_canais")
        .insert({ empresa_id: atual.empresaId, concessionaria_id: d.data.concessionariaId, ...campos })
        .select("id");
  if (error) return { ok: false, mensagem: error.code === "23505" ? "Já existe um canal com esse nome." : "Não foi possível salvar o canal." };
  if (!data?.length) return { ok: false, mensagem: "Não foi possível salvar o canal." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Canal salvo." };
}

/** Prazos da distribuidora de uma concessionária: admin, gestor e quem coordena a Engenharia (como os da empresa). */
export async function salvarPrazosConcessionaria(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...PRAZOS_OBRA);
  const concessionaria = uuid.safeParse(formData.get("concessionariaId"));
  if (!concessionaria.success) return { ok: false, mensagem: "Escolha a concessionária." };
  const supabase = await criarClienteServidor();
  if (!coordenaSetor(atual.papel, await carregarSetoresCoordenados(supabase, atual), "engenharia")) {
    return { ok: false, mensagem: "Só quem coordena a Engenharia muda estes prazos." };
  }
  const r = await gravarPrazos(
    formData,
    CHAVES_PRAZO_DISTRIBUIDORA,
    async () => {
      const { data, error } = await supabase
        .from("concessionaria_prazos")
        .select("chave, dias_uteis, contagem")
        .eq("empresa_id", atual.empresaId)
        .eq("concessionaria_id", concessionaria.data);
      return error ? null : data;
    },
    async (chave, dias, contagem) => {
      const { data, error } = await supabase
        .from("concessionaria_prazos")
        .update({ dias_uteis: dias, contagem })
        .eq("empresa_id", atual.empresaId)
        .eq("concessionaria_id", concessionaria.data)
        .eq("chave", chave)
        .select("chave");
      return !error && (data ?? []).length > 0;
    },
  );
  if (r?.ok) revalidatePath(CAMINHO);
  return r;
}
