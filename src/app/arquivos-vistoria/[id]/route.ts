import { NextResponse } from "next/server";
import { BUCKET_ARQUIVOS_VISTORIA } from "@/lib/engenharia-vistoria-regras";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Abre um arquivo da vistoria (relatório, foto, comprovante): a RLS decide; link de 60 segundos. */
export async function GET(_: Request, { params }: RouteContext<"/arquivos-vistoria/[id]">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: arq } = await supabase.from("obra_engenharia_vistoria_arquivos").select("caminho, nome").eq("id", id).maybeSingle();
  if (!arq) return new NextResponse("Arquivo não encontrado.", { status: 404 });

  const { data } = await supabase.storage.from(BUCKET_ARQUIVOS_VISTORIA).createSignedUrl(arq.caminho, 60, { download: arq.nome });
  if (!data) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
