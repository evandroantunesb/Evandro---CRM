import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { PropostaPdfDocument } from "@/lib/pdf-proposta";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { ModoPreco, TipoLigacao } from "@/lib/tipos";

export const runtime = "nodejs";

/** PDF da proposta pública — mesmo token do link, sem login. Não conta como abertura (isso já é feito pela página). */
export async function GET(_: Request, { params }: RouteContext<"/proposta/[token]/pdf">) {
  const { token } = await params;
  const admin = criarClienteAdmin();

  const { data: proposta } = await admin
    .from("propostas")
    .select("negocio_id, modo_preco, mensagem, negocios(titulo, contatos(nome, endereco, cidade, uf))")
    .eq("token", token)
    .maybeSingle();
  if (!proposta) return new NextResponse("Proposta não encontrada.", { status: 404 });

  const negocio = proposta.negocios as unknown as {
    titulo: string;
    contatos: { nome: string; endereco: string | null; cidade: string | null; uf: string | null } | null;
  } | null;
  const contato = negocio?.contatos;

  const { data: calculo } = await admin
    .from("calculos_solares")
    .select(
      "kit_nome, kit_potencia_kwp, kit_preco, tipo_ligacao, geracao_estimada_kwh_mes, economia_mensal, payback_meses, conta_sem_solar, conta_com_solar",
    )
    .eq("negocio_id", proposta.negocio_id)
    .maybeSingle();
  if (!calculo || !contato) return new NextResponse("Proposta não encontrada.", { status: 404 });

  const buffer = await renderToBuffer(
    PropostaPdfDocument({
      dados: {
        clienteNome: contato.nome,
        clienteEndereco: [contato.endereco, contato.cidade, contato.uf].filter(Boolean).join(" · ") || null,
        mensagem: proposta.mensagem,
        modoPreco: proposta.modo_preco as ModoPreco,
        kitNome: calculo.kit_nome,
        kitPotenciaKwp: calculo.kit_potencia_kwp,
        tipoLigacao: calculo.tipo_ligacao as TipoLigacao,
        geracaoEstimadaKwhMes: calculo.geracao_estimada_kwh_mes,
        contaSemSolar: calculo.conta_sem_solar,
        contaComSolar: calculo.conta_com_solar,
        economiaMensal: calculo.economia_mensal,
        paybackMeses: calculo.payback_meses,
        kitPreco: calculo.kit_preco,
      },
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proposta-${contato.nome.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf"`,
    },
  });
}
