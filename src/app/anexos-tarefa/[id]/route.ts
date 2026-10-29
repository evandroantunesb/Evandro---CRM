import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BUCKET_ANEXOS_TAREFA } from "@/lib/tarefas-setor-regras";

/** Abre um anexo de tarefa de setor: a RLS (quem vê a tarefa) decide; depois, link temporário de 60 segundos. */
export async function GET(_: Request, { params }: RouteContext<"/anexos-tarefa/[id]">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: anexo } = await supabase.from("tarefas_setor_anexos").select("caminho, nome").eq("id", id).maybeSingle();
  if (!anexo) return new NextResponse("Arquivo não encontrado.", { status: 404 });

  const { data } = await supabase.storage.from(BUCKET_ANEXOS_TAREFA).createSignedUrl(anexo.caminho, 60, { download: anexo.nome });
  if (!data) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
