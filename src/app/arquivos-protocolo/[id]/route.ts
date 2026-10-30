import { NextResponse } from "next/server";
import { BUCKET_DOCUMENTOS_ENGENHARIA } from "@/lib/engenharia-checklist-regras";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Abre um arquivo de protocolo (comprovante, ofício, orçamento): a RLS decide; link de 60 segundos. */
export async function GET(_: Request, { params }: RouteContext<"/arquivos-protocolo/[id]">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: arq } = await supabase.from("obra_engenharia_protocolo_arquivos").select("caminho, nome").eq("id", id).maybeSingle();
  if (!arq) return new NextResponse("Arquivo não encontrado.", { status: 404 });

  const { data } = await supabase.storage.from(BUCKET_DOCUMENTOS_ENGENHARIA).createSignedUrl(arq.caminho, 60, { download: arq.nome });
  if (!data) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
