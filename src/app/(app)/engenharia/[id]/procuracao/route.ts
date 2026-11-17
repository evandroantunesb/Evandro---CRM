import { NextResponse } from "next/server";
import { z } from "zod";
import { lerMarcaPdf } from "@/lib/marca-pdf";
import { renderizarDocumentoPdf } from "@/lib/pdf-contrato";
import { ENGENHARIA } from "@/lib/permissoes";
import { MENSAGEM_SEM_MODELO_PROCURACAO, montarProcuracaoObra, type DadosProcuracaoObra } from "@/lib/procuracao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * PDF da procuração pela obra (item da procuração no checklist da Copel). Quem pode é decidido no banco
 * (`dados_procuracao_obra`: mesma regra de `autorizacao_setor_obra` na Engenharia), que só entrega os dados da
 * procuração. Gerado a cada download.
 */
export async function GET(_: Request, { params }: RouteContext<"/engenharia/[id]/procuracao">) {
  await exigirPapel(...ENGENHARIA);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Obra não encontrada.", { status: 404 });

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("dados_procuracao_obra", { p_obra_id: id });
  if (error?.code === "42501") return new NextResponse("Você não pode gerar a procuração desta obra.", { status: 403 });
  if (error) return new NextResponse("Não foi possível gerar a procuração. Tente de novo.", { status: 500 });
  if (!data) return new NextResponse("Obra não encontrada.", { status: 404 });

  const dados = data as unknown as DadosProcuracaoObra;
  const procuracao = montarProcuracaoObra(dados);
  if (procuracao.situacao !== "ok") return new NextResponse(MENSAGEM_SEM_MODELO_PROCURACAO, { status: 409 });

  const pdf = await renderizarDocumentoPdf({
    rotulo: "Procuração",
    titulo: procuracao.titulo,
    conteudo: procuracao.conteudo,
    marca: await lerMarcaPdf(dados.empresa_id),
  });
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${procuracao.arquivo}"` },
  });
}
