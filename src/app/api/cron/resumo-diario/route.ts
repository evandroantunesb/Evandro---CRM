import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { chamadaDoAgendadorAutorizada } from "@/lib/resumo-email";
import { enviarPeloResend, executarResumoDiario, resumoEmailConfigurado } from "@/lib/resumo-email-envio";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Resumo diário por e-mail, chamado pelo Cron da Vercel (`vercel.json`). A resposta só tem contagens. */
export async function GET(request: NextRequest) {
  if (!chamadaDoAgendadorAutorizada(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  if (!resumoEmailConfigurado()) {
    return NextResponse.json({ enviado: false, motivo: "Envio de e-mail não configurado." }, { status: 200 });
  }
  const resultado = await executarResumoDiario({
    admin: criarClienteAdmin(),
    agora: new Date(),
    siteUrl: env.siteUrl,
    enviar: enviarPeloResend,
  });
  return NextResponse.json(resultado);
}
