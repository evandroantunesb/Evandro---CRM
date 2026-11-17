import { NextResponse } from "next/server";
import { contratoProntoParaCliente } from "@/lib/contrato";
import { lerMarcaPdf } from "@/lib/marca-pdf";
import { renderizarDocumentoPdf } from "@/lib/pdf-contrato";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** PDF do contrato público — mesmo token do link, sem login, mesmas regras da página. */
export async function GET(_: Request, { params }: RouteContext<"/contrato/[token]/pdf">) {
  const { token } = await params;
  const admin = criarClienteAdmin();
  const { data: contrato } = await admin
    .from("contratos")
    .select("conteudo, empresa_id, negocios(titulo)")
    .eq("token", token)
    .maybeSingle();
  if (!contrato) return new NextResponse("Contrato não encontrado.", { status: 404 });
  // Contrato com campo sem resolver não sai em PDF, como não aparece na página.
  if (!contratoProntoParaCliente(contrato.conteudo)) {
    return new NextResponse("Este contrato ainda está sendo preparado pela empresa. Fale com o vendedor.", { status: 409 });
  }

  const titulo = (contrato.negocios as unknown as { titulo: string } | null)?.titulo ?? null;
  const pdf = await renderizarDocumentoPdf({
    rotulo: "Contrato",
    titulo,
    conteudo: contrato.conteudo,
    marca: await lerMarcaPdf(contrato.empresa_id, admin),
  });
  const arquivo = `contrato-${(titulo ?? "raion").replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${arquivo}"` },
  });
}
