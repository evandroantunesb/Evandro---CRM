"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { garantirUsuario } from "@/lib/convites";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, TIPOS_VENDEDOR, type ResultadoAcao } from "@/lib/tipos";

const esquemaConvite = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().email("E-mail inválido"),
  papel: z.enum(PAPEIS),
  tipo_vendedor: z.enum(TIPOS_VENDEDOR),
});

export async function convidarMembro(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaConvite.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  let userId: string;
  let novo: boolean;
  try {
    ({ userId, novo } = await garantirUsuario(dados.data.email, dados.data.nome));
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }

  // O vínculo é gravado com a sessão do admin: o RLS confere a permissão de novo.
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("empresa_membros").insert({
    empresa_id: atual.empresaId,
    user_id: userId,
    papel: dados.data.papel,
    tipo_vendedor: dados.data.papel === "vendedor" ? dados.data.tipo_vendedor : null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, mensagem: "Essa pessoa já faz parte da empresa." };
    return { ok: false, mensagem: "Não foi possível adicionar o usuário." };
  }

  revalidatePath("/configuracoes/usuarios");
  return {
    ok: true,
    mensagem: novo
      ? `Convite enviado para ${dados.data.email}.`
      : `${dados.data.email} já tinha conta e foi adicionado à empresa.`,
  };
}

const esquemaAtualizacao = z.object({
  membroId: z.string().uuid(),
  papel: z.enum(PAPEIS),
  tipo_vendedor: z.enum(TIPOS_VENDEDOR),
  recebe_leads: z.enum(["on"]).optional(),
  ativo: z.enum(["on"]).optional(),
});

export async function atualizarMembro(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaAtualizacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("empresa_membros")
    .update({
      papel: dados.data.papel,
      tipo_vendedor: dados.data.papel === "vendedor" ? dados.data.tipo_vendedor : null,
      recebe_leads: dados.data.recebe_leads === "on",
      ativo: dados.data.ativo === "on",
    })
    .eq("id", dados.data.membroId)
    .eq("empresa_id", atual.empresaId);

  if (error) {
    if (error.message.includes("admin ativo")) {
      return { ok: false, mensagem: "A empresa precisa ter pelo menos um admin ativo." };
    }
    return { ok: false, mensagem: "Não foi possível salvar." };
  }
  revalidatePath("/configuracoes/usuarios");
  return { ok: true, mensagem: "Salvo." };
}
