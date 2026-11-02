import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { contratoProntoParaCliente } from "@/lib/contrato";
import { ContratoPdfDocument } from "@/lib/pdf-contrato";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** PDF do contrato público — mesmo token do link, sem login, mesmas regras da página. */
export async function GET(_: Request, { params }: RouteContext<"/contrato/[token]/pdf">) {
  const { token } = await params;
  const { data: contrato } = await criarClienteAdmin()
    .from("contratos")
    .select("conteudo, negocios(titulo)")
    .eq("token", token)
    .maybeSingle();
  if (!contrato) return new NextResponse("Contrato não encontrado.", { status: 404 });
  // Contrato com campo sem resolver não sai em PDF, como não aparece na página.
  if (!contratoProntoParaCliente(contrato.conteudo)) {
    return new NextResponse("Este contrato ainda está sendo preparado pela empresa. Fale com o vendedor.", { status: 409 });
  }

  const titulo = (contrato.negocios as unknown as { titulo: string } | null)?.titulo ?? null;
  const buffer = await renderToBuffer(ContratoPdfDocument({ titulo, conteudo: contrato.conteudo }));
  const arquivo = `contrato-${(titulo ?? "raion").replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${arquivo}"` },
  });
}
