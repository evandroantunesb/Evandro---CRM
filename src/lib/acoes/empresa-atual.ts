"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EMPRESA, OPCOES_COOKIE_EMPRESA, obterSessao } from "@/lib/sessao";

export async function trocarEmpresa(formData: FormData) {
  const empresaId = String(formData.get("empresaId") ?? "");
  const sessao = await obterSessao();
  if (!sessao.vinculos.some((v) => v.empresaId === empresaId)) return;

  (await cookies()).set(COOKIE_EMPRESA, empresaId, OPCOES_COOKIE_EMPRESA);
  redirect("/inicio");
}
