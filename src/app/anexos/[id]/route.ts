import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Abre um anexo: confere a permissão pelo banco e redireciona para um link temporário. */
export async function GET(_: Request, { params }: RouteContext<"/anexos/[id]">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: anexo } = await supabase.from("anexos").select("caminho, nome").eq("id", id).maybeSingle();
  if (!anexo) return new NextResponse("Arquivo não encontrado.", { status: 404 });

  const { data } = await supabase.storage.from("anexos").createSignedUrl(anexo.caminho, 60, { download: anexo.nome });
  if (!data) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
