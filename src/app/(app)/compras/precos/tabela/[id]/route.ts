import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Baixa a planilha original de uma tabela de preços: a RLS confere quem vê e o link temporário entrega o arquivo. */
export async function GET(_: Request, { params }: RouteContext<"/compras/precos/tabela/[id]">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: tabela } = await supabase.from("compras_tabelas_preco").select("caminho, nome_arquivo").eq("id", id).maybeSingle();
  if (!tabela) return new NextResponse("Planilha não encontrada.", { status: 404 });
  const { data } = await supabase.storage.from("compras-precos").createSignedUrl(tabela.caminho, 60, { download: tabela.nome_arquivo });
  if (!data) return new NextResponse("Planilha não encontrada.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
