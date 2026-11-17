import { NextResponse } from "next/server";
import { z } from "zod";
import { lerMarcaPdf } from "@/lib/marca-pdf";
import { renderizarDocumentoPdf } from "@/lib/pdf-contrato";
import { PROPOSTA_E_CONTRATO } from "@/lib/permissoes";
import { MENSAGEM_SEM_MODELO_PROCURACAO, montarProcuracaoNegocio } from "@/lib/procuracao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** PDF da procuração do negócio: quem faz proposta e contrato, sob a RLS de quem pede. Gerado a cada download. */
export async function GET(_: Request, { params }: RouteContext<"/negocios/[id]/procuracao">) {
  const { atual } = await exigirPapel(...PROPOSTA_E_CONTRATO);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Negócio não encontrado.", { status: 404 });

  const procuracao = await montarProcuracaoNegocio(await criarClienteServidor(), atual.empresaId, id);
  if (procuracao.situacao === "sem_modelo") return new NextResponse(MENSAGEM_SEM_MODELO_PROCURACAO, { status: 409 });
  if (procuracao.situacao === "nao_encontrado") return new NextResponse("Negócio não encontrado.", { status: 404 });

  // A pessoa já provou, pela RLS, que vê o negócio desta empresa: o logo é lido com a chave de serviço.
  const pdf = await renderizarDocumentoPdf({
    rotulo: "Procuração",
    titulo: procuracao.titulo,
    conteudo: procuracao.conteudo,
    marca: await lerMarcaPdf(criarClienteAdmin(), atual.empresaId),
  });
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${procuracao.arquivo}"` },
  });
}
