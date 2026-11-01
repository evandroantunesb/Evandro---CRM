"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CHAVES_PERGUNTA, respostaValida, type CondicoesItem } from "@/lib/engenharia-enquadramento-regras";
import { CHAVES_PRAZO } from "@/lib/engenharia-prazos-regras";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const CAMINHO = "/configuracoes/engenharia";
const DUPLICADO = "Já existe um item com esse título.";

const esquema = z.object({
  grupo: z.string().trim().min(2, "Grupo muito curto").max(60, "Grupo muito longo"),
  titulo: z.string().trim().min(2, "Título muito curto").max(160, "Título muito longo"),
  ordem: z.coerce.number().int("Ordem inválida").min(0).max(9999),
});

const ler = (formData: FormData) =>
  esquema.safeParse({ grupo: formData.get("grupo"), titulo: formData.get("titulo"), ordem: formData.get("ordem") || 0 });

export async function criarItemModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const d = ler(formData);
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("engenharia_checklist_modelo")
    .insert({ empresa_id: atual.empresaId, ...d.data, obrigatorio: formData.get("obrigatorio") === "on" });
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADO : "Não foi possível criar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Item criado." };
}

export async function editarItemModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const d = ler(formData);
  if (!id.success || !d.success) return { ok: false, mensagem: d.error?.issues[0].message ?? "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("engenharia_checklist_modelo")
    .update({ ...d.data, obrigatorio: formData.get("obrigatorio") === "on", ativo: formData.get("ativo") === "on" })
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: error.code === "23505" ? DUPLICADO : "Não foi possível salvar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Salvo." };
}

/** Condições do item (P6c): para cada pergunta, as respostas marcadas. Nenhuma marcada = sem condição naquela pergunta. */
export async function salvarCondicoesModelo(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensagem: "Item inválido." };
  const condicoes: CondicoesItem = {};
  for (const chave of CHAVES_PERGUNTA) {
    const valores = formData.getAll(chave).map(String);
    if (valores.some((v) => !respostaValida(chave, v))) return { ok: false, mensagem: "Resposta inválida." };
    if (valores.length) condicoes[chave] = valores;
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("engenharia_checklist_modelo")
    .update({ condicoes })
    .eq("id", id.data)
    .eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: "Não foi possível salvar as condições." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Condições salvas." };
}

// ---------------------------------------------------------------------------
// Prazos e feriados (P5)
// ---------------------------------------------------------------------------

const dias = z.union([z.literal(""), z.coerce.number().int("Use dias inteiros").min(1, "Mínimo de 1 dia útil").max(365, "Máximo de 365 dias úteis")]);

/** Vazio = sem prazo. Só os dias mudam: as linhas nascem com a empresa. */
export async function salvarPrazos(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const valores: { chave: (typeof CHAVES_PRAZO)[number]; dias: number | null }[] = [];
  for (const chave of CHAVES_PRAZO) {
    const d = dias.safeParse(String(formData.get(chave) ?? "").trim());
    if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };
    valores.push({ chave, dias: d.data === "" ? null : d.data });
  }

  // Só o que mudou: cada linha gravada vira um registro de auditoria, e menos escritas deixam menos espaço para um
  // salvamento parcial se uma delas falhar.
  const supabase = await criarClienteServidor();
  const { data: atuais, error: erroLeitura } = await supabase.from("engenharia_prazos").select("chave, dias_uteis").eq("empresa_id", atual.empresaId);
  if (erroLeitura) return { ok: false, mensagem: "Não foi possível salvar os prazos." };
  const antes = new Map((atuais ?? []).map((p) => [p.chave, p.dias_uteis]));
  for (const v of valores.filter((v) => antes.get(v.chave) !== v.dias)) {
    const { error } = await supabase
      .from("engenharia_prazos")
      .update({ dias_uteis: v.dias })
      .eq("empresa_id", atual.empresaId)
      .eq("chave", v.chave);
    if (error) return { ok: false, mensagem: "Não foi possível salvar os prazos." };
  }
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Prazos salvos." };
}

const esquemaFeriado = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  nome: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
});

export async function adicionarFeriado(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const d = esquemaFeriado.safeParse({ data: formData.get("data"), nome: formData.get("nome") });
  if (!d.success) return { ok: false, mensagem: d.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("empresa_feriados").insert({ empresa_id: atual.empresaId, ...d.data });
  if (error) return { ok: false, mensagem: error.code === "23505" ? "Já existe um feriado nessa data." : "Não foi possível adicionar." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Feriado adicionado." };
}

export async function removerFeriado(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("empresa_feriados").delete().eq("id", id.data).eq("empresa_id", atual.empresaId);
  if (error) return { ok: false, mensagem: "Não foi possível remover." };
  revalidatePath(CAMINHO);
  return { ok: true, mensagem: "Feriado removido." };
}
