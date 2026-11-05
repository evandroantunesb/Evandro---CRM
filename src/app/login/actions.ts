"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COOKIE_EMPRESA, OPCOES_COOKIE_EMPRESA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { escolherEmpresaLembrada } from "@/lib/tela-entrada";
import type { ResultadoAcao } from "@/lib/tipos";

const esquema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(1, "Informe a senha"),
});

export async function entrar(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) {
    if (error.code === "invalid_credentials") return { ok: false, mensagem: "E-mail ou senha incorretos." };
    // Chave ou endereço do Supabase errados, serviço fora do ar etc.: aparece nos logs da Vercel.
    console.error("Falha ao entrar:", error.status, error.code, error.message);
    return { ok: false, mensagem: "Não foi possível conectar ao servidor. Tente de novo em instantes." };
  }

  await lembrarEmpresa(supabase, data.user.id);
  redirect("/inicio");
}

/**
 * Grava no aparelho a empresa em uso (a mesma que o app escolhe), para a próxima tela de entrada mostrar a
 * imagem dela. É só um enfeite: se a consulta falhar, o login segue e a tela fica no padrão.
 */
async function lembrarEmpresa(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, userId: string) {
  const { data: membros, error } = await supabase
    .from("empresa_membros")
    .select("empresa_id, empresas!inner(situacao)")
    .eq("user_id", userId)
    .eq("ativo", true)
    .eq("empresas.situacao", "ativa")
    .order("created_at");
  if (error) return;
  const loja = await cookies();
  const empresa = escolherEmpresaLembrada(
    loja.get(COOKIE_EMPRESA)?.value,
    (membros ?? []).map((m) => m.empresa_id),
  );
  if (empresa) loja.set(COOKIE_EMPRESA, empresa, OPCOES_COOKIE_EMPRESA);
}
