import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Download privado de comprovante ou nota fiscal conforme a RLS financeira. */
export async function GET(_: Request, { params }: RouteContext<"/obras/financeiro/[id]/[tipo]">) {
  const { id, tipo } = await params;
  if (tipo !== "comprovante" && tipo !== "nota_fiscal") return new NextResponse("Documento não encontrado.", { status: 404 });
  const supabase = await criarClienteServidor();
  const { data: pagamento } = await supabase.from("obra_pagamentos_fornecedor")
    .select("comprovante_caminho, comprovante_nome, nf_caminho, nf_nome").eq("id", id).maybeSingle();
  if (!pagamento) return new NextResponse("Documento não encontrado.", { status: 404 });
  const caminho = tipo === "comprovante" ? pagamento.comprovante_caminho : pagamento.nf_caminho;
  const nome = tipo === "comprovante" ? pagamento.comprovante_nome : pagamento.nf_nome;
  if (!caminho || !nome) return new NextResponse("Documento não encontrado.", { status: 404 });
  const { data } = await supabase.storage.from("obra-compras").createSignedUrl(caminho, 60, { download: nome });
  if (!data) return new NextResponse("Documento não encontrado.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
