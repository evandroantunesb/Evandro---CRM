"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_TEMA, TEMAS, type Tema } from "@/lib/tema";

/** Guarda a escolha de tema neste navegador e redesenha o app (o atributo vem do servidor: sem piscar). */
export async function definirTema(formData: FormData) {
  const tema = String(formData.get("tema") ?? "");
  if (!TEMAS.includes(tema as Tema)) return;
  (await cookies()).set(COOKIE_TEMA, tema, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
