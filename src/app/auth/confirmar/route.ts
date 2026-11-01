import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Destino dos links de convite e de recuperação de senha enviados por e-mail. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const destino = destinoInterno(searchParams.get("next"), request.nextUrl.origin);

  if (tokenHash && tipo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(destino);
  }

  return NextResponse.redirect(new URL("/login?erro=link-invalido", request.url));
}

/**
 * Só caminho do próprio site. Comparar a origem depois de o parser de URL resolver o destino cobre o que um teste
 * de prefixo deixa passar: barra invertida (`/\evil`), tab e quebra de linha (removidos pelo parser) e URL absoluta.
 */
function destinoInterno(next: string | null, origem: string): URL {
  const padrao = new URL("/inicio", origem);
  if (!next?.startsWith("/")) return padrao;
  try {
    const url = new URL(next, origem);
    return url.origin === origem ? url : padrao;
  } catch {
    return padrao;
  }
}
