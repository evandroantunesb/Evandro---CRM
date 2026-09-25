import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Destino dos links de convite e de recuperação de senha enviados por e-mail. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/inicio";
  // Só redireciona para caminhos internos.
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";

  if (tokenHash && tipo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destino, request.url));
  }

  return NextResponse.redirect(new URL("/login?erro=link-invalido", request.url));
}
