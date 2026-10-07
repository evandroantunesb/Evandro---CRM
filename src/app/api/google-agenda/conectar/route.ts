import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { integracaoConfigurada, urlAutorizacao } from "@/lib/google-agenda";
import { exigirPapel } from "@/lib/sessao";
import { GOOGLE_AGENDA } from "@/lib/permissoes";

/** Início do fluxo OAuth: manda o usuário pro consentimento do Google. */
export async function GET(request: NextRequest) {
  await exigirPapel(...GOOGLE_AGENDA);
  if (!integracaoConfigurada()) return NextResponse.redirect(new URL("/perfil?google=nao-configurado", request.url));

  const redirectUri = new URL("/api/google-agenda/callback", request.url).toString();
  const state = randomBytes(16).toString("hex");
  const url = urlAutorizacao(redirectUri, state);
  if (!url) return NextResponse.redirect(new URL("/perfil?google=nao-configurado", request.url));

  const resposta = NextResponse.redirect(url);
  // Confere no callback que a volta é a mesma que saiu daqui (evita CSRF).
  resposta.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google-agenda",
  });
  return resposta;
}
