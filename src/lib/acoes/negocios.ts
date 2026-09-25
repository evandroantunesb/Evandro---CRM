"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

const valorOpcional = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return null;
    // Aceita "18.500,00", "18500,5" e "18500.50".
    const limpo = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    return Number(limpo);
  })
  .pipe(z.number().nonnegative("Valor inválido").nullable());

const esquemaNovo = z.object({
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  funil_id: z.string().uuid(),
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorOpcional,
  descricao: z.string().trim().optional(),
  contato_id: uuidOpcional,
  contato_tipo: z.enum(["pf", "pj"]).default("pf"),
  contato_nome: z.string().trim().optional(),
  contato_telefone: z.string().trim().optional(),
  contato_email: z.union([z.literal(""), z.string().trim().email("E-mail do contato inválido")]).optional(),
});

export async function criarNegocio(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaNovo.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  let contatoId = d.contato_id;
  if (!contatoId) {
    if (!d.contato_nome || d.contato_nome.length < 2) return { ok: false, mensagem: "Informe o nome do contato." };
    if (!d.contato_telefone && !d.contato_email) {
      return { ok: false, mensagem: "Informe o telefone ou o e-mail do contato." };
    }
    const { data: contato, error } = await supabase
      .from("contatos")
      .insert({
        empresa_id: atual.empresaId,
        tipo: d.contato_tipo,
        nome: d.contato_nome,
        telefone: d.contato_telefone || null,
        email: d.contato_email || null,
      })
      .select("id")
      .single();
    if (error || !contato) return { ok: false, mensagem: "Não foi possível salvar o contato." };
    contatoId = contato.id;
  }

  const { data: etapaInicial } = await supabase
    .from("etapas")
    .select("id")
    .eq("funil_id", d.funil_id)
    .eq("ativa", true)
    .order("inicial", { ascending: false })
    .order("ordem")
    .limit(1)
    .single();
  if (!etapaInicial) return { ok: false, mensagem: "O funil não tem etapas ativas." };

  const { data: negocio, error } = await supabase
    .from("negocios")
    .insert({
      empresa_id: atual.empresaId,
      titulo: d.titulo,
      funil_id: d.funil_id,
      etapa_id: etapaInicial.id,
      origem_id: d.origem_id,
      // Vendedor sempre fica como responsável; admin e gestor podem escolher.
      responsavel_id: atual.papel === "vendedor" ? null : d.responsavel_id,
      valor: d.valor,
      descricao: d.descricao || null,
      contato_id: contatoId,
    })
    .select("id")
    .single();
  if (error || !negocio) {
    return { ok: false, mensagem: "Não foi possível criar o negócio. Confira o responsável escolhido." };
  }

  revalidatePath("/negocios");
  redirect(`/negocios/${negocio.id}`);
}

export async function moverEtapa(negocioId: string, etapaId: string): Promise<ResultadoAcao> {
  await exigirPapel();
  const ids = z.object({ negocioId: z.string().uuid(), etapaId: z.string().uuid() }).safeParse({ negocioId, etapaId });
  if (!ids.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("negocios")
    .update({ etapa_id: etapaId })
    .eq("id", negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: "Não foi possível mover o negócio." };

  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
  return { ok: true, mensagem: "Negócio movido." };
}

const esquemaEdicao = z.object({
  negocioId: z.string().uuid(),
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  etapa_id: z.string().uuid(),
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorOpcional,
  descricao: z.string().trim().optional(),
});

export async function editarNegocio(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaEdicao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("negocios")
    .update({
      titulo: d.titulo,
      etapa_id: d.etapa_id,
      origem_id: d.origem_id,
      valor: d.valor,
      descricao: d.descricao || null,
      ...(atual.papel !== "vendedor" && d.responsavel_id ? { responsavel_id: d.responsavel_id } : {}),
    })
    .eq("id", d.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: "Não foi possível salvar." };

  revalidatePath("/negocios");
  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Salvo." };
}

export type Duplicado = { contatoId: string; nome: string; visivel: boolean; responsavel: string | null };

/** Confere se já existe contato com esse telefone ou e-mail na empresa. */
export async function verificarDuplicado(telefone: string, email: string): Promise<Duplicado[]> {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("buscar_contato_duplicado", {
    p_empresa_id: atual.empresaId,
    p_telefone: telefone,
    p_email: email,
  });
  return (data ?? []).map((d) => ({
    contatoId: d.contato_id,
    // Não expõe o nome de quem o usuário não pode ver.
    nome: d.visivel ? d.nome : "",
    visivel: d.visivel,
    responsavel: d.responsavel_nome,
  }));
}

/** Busca contatos visíveis para o seletor de "contato existente". */
export async function buscarContatos(termo: string) {
  const { atual } = await exigirPapel();
  const t = termo.trim();
  if (t.length < 2) return [];
  const supabase = await criarClienteServidor();
  const digitos = t.replace(/\D/g, "");
  const filtro = [`nome.ilike.%${t.replace(/[%,()]/g, "")}%`, `email.ilike.%${t.replace(/[%,()]/g, "")}%`];
  if (digitos.length >= 4) filtro.push(`telefone_digitos.like.%${digitos}%`);
  const { data } = await supabase
    .from("contatos")
    .select("id, nome, telefone, email")
    .eq("empresa_id", atual.empresaId)
    .or(filtro.join(","))
    .order("nome")
    .limit(8);
  return data ?? [];
}
