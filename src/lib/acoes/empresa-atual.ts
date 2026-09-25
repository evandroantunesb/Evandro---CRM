"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EMPRESA, obterSessao } from "@/lib/sessao";

export async function trocarEmpresa(formData: FormData) {
  const empresaId = String(formData.get("empresaId") ?? "");
  const sessao = await obterSessao();
  if (!sessao.vinculos.some((v) => v.empresaId === empresaId)) return;

  (await cookies()).set(COOKIE_EMPRESA, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/inicio");
}
