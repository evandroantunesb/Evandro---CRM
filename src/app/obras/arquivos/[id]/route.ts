import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Download privado: a RLS limita a equipe de Compras, revisor técnico e admin. */
export async function GET(_: Request, { params }: RouteContext<"/obras/arquivos/[id]">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: documento } = await supabase.from("obra_compras_documentos")
    .select("caminho, nome").eq("id", id).maybeSingle();
  if (!documento) return new NextResponse("Documento não encontrado.", { status: 404 });
  const { data } = await supabase.storage.from("obra-compras")
    .createSignedUrl(documento.caminho, 60, { download: documento.nome });
  if (!data) return new NextResponse("Documento não encontrado.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
