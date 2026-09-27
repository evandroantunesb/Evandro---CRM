import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { CapturaPdfDocument } from "@/lib/pdf-captura";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** PDF "cartão" do formulário (QR Code + link) para o admin baixar e enviar/imprimir. */
export async function GET(_: Request, { params }: RouteContext<"/configuracoes/captura/[id]/pdf">) {
  const { atual } = await exigirPapel("admin");
  const { id } = await params;

  const supabase = await criarClienteServidor();
  const { data: formulario } = await supabase
    .from("formularios")
    .select("nome, token")
    .eq("id", id)
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  if (!formulario) return new NextResponse("Formulário não encontrado.", { status: 404 });

  const link = `${env.siteUrl}/captura/${formulario.token}`;
  const qrCode = await QRCode.toDataURL(link, { margin: 4, width: 440, errorCorrectionLevel: "M" });

  const buffer = await renderToBuffer(CapturaPdfDocument({ nome: formulario.nome, qrCode }));

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="raion-qr-${formulario.nome.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.pdf"`,
    },
  });
}
