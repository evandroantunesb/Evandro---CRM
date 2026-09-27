import { NextResponse, type NextRequest } from "next/server";
import { obterEmailConta, trocarCodigoPorTokens } from "@/lib/google-agenda";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/** Volta do Google com o código de autorização: troca por tokens e salva a conexão do membro. */
export async function GET(request: NextRequest) {
  const { atual } = await exigirPapel();
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const stateCookie = request.cookies.get("google_oauth_state")?.value;

  function falhar() {
    const resposta = NextResponse.redirect(new URL("/perfil?google=erro", request.url));
    resposta.cookies.delete("google_oauth_state");
    return resposta;
  }

  if (!code || !state || !stateCookie || state !== stateCookie) return falhar();

  const redirectUri = new URL("/api/google-agenda/callback", request.url).toString();
  const tokens = await trocarCodigoPorTokens(code, redirectUri);
  if (!tokens) return falhar();

  const email = await obterEmailConta(tokens.accessToken);

  const admin = criarClienteAdmin();
  const { error } = await admin
    .from("google_agenda_conexoes")
    .upsert(
      { membro_id: atual.membroId, empresa_id: atual.empresaId, refresh_token: tokens.refreshToken, email_google: email },
      { onConflict: "membro_id" },
    );
  if (error) return falhar();

  const resposta = NextResponse.redirect(new URL("/perfil?google=conectado", request.url));
  resposta.cookies.delete("google_oauth_state");
  return resposta;
}
