import { NextResponse } from "next/server";
import { BUCKET_DOCUMENTOS_ENGENHARIA } from "@/lib/engenharia-checklist-regras";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Abre um documento da Engenharia: a RLS (admin ou quem atua em Engenharia na obra) decide; link de 60 segundos. */
export async function GET(_: Request, { params }: RouteContext<"/documentos-engenharia/[id]">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: doc } = await supabase.from("obra_engenharia_documentos").select("caminho, nome").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Arquivo não encontrado.", { status: 404 });

  const { data } = await supabase.storage.from(BUCKET_DOCUMENTOS_ENGENHARIA).createSignedUrl(doc.caminho, 60, { download: doc.nome });
  if (!data) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
