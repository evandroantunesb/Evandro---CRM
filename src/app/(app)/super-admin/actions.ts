"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { garantirUsuario } from "@/lib/convites";
import { exigirSuperAdmin } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

const esquemaEmpresa = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa"),
  cnpj: z.string().trim().optional(),
  admin_nome: z.string().trim().min(2, "Informe o nome do admin"),
  admin_email: z.string().trim().email("E-mail do admin inválido"),
});

/** Cria a empresa e convida o primeiro admin dela. */
export async function criarEmpresa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirSuperAdmin();
  const dados = esquemaEmpresa.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  // Convida primeiro: se o e-mail falhar, nenhuma empresa fica criada sem admin.
  let admin: { userId: string; novo: boolean };
  try {
    admin = await garantirUsuario(dados.data.admin_email, dados.data.admin_nome);
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { data: empresa, error } = await supabase
    .from("empresas")
    .insert({ nome: dados.data.nome, cnpj: dados.data.cnpj || null })
    .select("id")
    .single();
  if (error || !empresa) return { ok: false, mensagem: "Não foi possível criar a empresa." };

  const { error: erroVinculo } = await supabase
    .from("empresa_membros")
    .insert({ empresa_id: empresa.id, user_id: admin.userId, papel: "admin" });
  if (erroVinculo) {
    return { ok: false, mensagem: "Empresa criada, mas o admin não foi vinculado. Adicione pela página da empresa." };
  }
  redirect(`/super-admin/empresas/${empresa.id}`);
}

export async function adicionarAdmin(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirSuperAdmin();
  const dados = z
    .object({ empresaId: z.string().uuid(), nome: z.string().trim().min(2), email: z.string().trim().email() })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Informe nome e e-mail válidos." };

  const resultado = await vincularAdmin(dados.data.empresaId, dados.data.nome, dados.data.email);
  revalidatePath(`/super-admin/empresas/${dados.data.empresaId}`);
  return resultado;
}

async function vincularAdmin(empresaId: string, nome: string, email: string): Promise<{ ok: boolean; mensagem: string }> {
  let userId: string;
  let novo: boolean;
  try {
    ({ userId, novo } = await garantirUsuario(email, nome));
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("empresa_membros")
    .upsert({ empresa_id: empresaId, user_id: userId, papel: "admin", ativo: true }, { onConflict: "empresa_id,user_id" });
  if (error) return { ok: false, mensagem: "Não foi possível vincular o admin." };

  return { ok: true, mensagem: novo ? `Convite enviado para ${email}.` : `${email} já tinha conta e virou admin.` };
}

export async function alterarSituacao(formData: FormData) {
  await exigirSuperAdmin();
  const dados = z
    .object({ empresaId: z.string().uuid(), situacao: z.enum(["ativa", "suspensa", "cancelada"]) })
    .parse(Object.fromEntries(formData));
  const supabase = await criarClienteServidor();
  await supabase.from("empresas").update({ situacao: dados.situacao }).eq("id", dados.empresaId);
  revalidatePath("/super-admin");
  revalidatePath(`/super-admin/empresas/${dados.empresaId}`);
}
