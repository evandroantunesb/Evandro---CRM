import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { PropostaPdfDocument } from "@/lib/pdf-proposta";
import type { TipoBloco } from "@/lib/propostas/blocos";
import { montarDadosSistemaProposta } from "@/lib/propostas/pdf-dados";
import { ModeloPdfDocument } from "@/lib/propostas/pdf";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { ModoPreco, TipoLigacao } from "@/lib/tipos";

export const runtime = "nodejs";

const EXPIRA_SEGUNDOS = 300;

/** PDF da proposta pública — mesmo token do link, sem login. Não conta como abertura (isso já é feito pela página). */
export async function GET(_: Request, { params }: RouteContext<"/proposta/[token]/pdf">) {
  const { token } = await params;
  const admin = criarClienteAdmin();

  const { data: proposta } = await admin
    .from("propostas")
    .select("empresa_id, negocio_id, modo_preco, mensagem, modelo_id, capa_variante, blocos_emitidos, negocios(titulo, contatos(nome, endereco, cidade, uf))")
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
      "kit_nome, kit_potencia_kwp, kit_preco, tipo_ligacao, consumo_medio_kwh, geracao_estimada_kwh_mes, economia_mensal, payback_meses, conta_sem_solar, conta_com_solar",
    )
    .eq("negocio_id", proposta.negocio_id)
    .maybeSingle();
  if (!calculo || !contato) return new NextResponse("Proposta não encontrada.", { status: 404 });

  const modoPreco = proposta.modo_preco as ModoPreco;

  // Proposta emitida com um modelo do construtor: usa o motor novo (capa +
  // blocos, com paginação A4 de verdade). Sem modelo (proposta antiga, ou
  // empresa que ainda não montou nenhum modelo): mantém o PDF de sempre.
  if (proposta.modelo_id && proposta.blocos_emitidos && proposta.capa_variante) {
    const [{ data: componentesData }, { data: identidadeData }] = await Promise.all([
      admin.from("kit_componentes").select("tipo, descricao, potencia_w, quantidade").eq("negocio_id", proposta.negocio_id).order("ordem"),
      admin.from("proposta_identidades").select("*").eq("empresa_id", proposta.empresa_id).maybeSingle(),
    ]);

    async function assinar(caminho: string | null) {
      if (!caminho) return null;
      const { data } = await admin.storage.from("proposta-marca").createSignedUrl(caminho, EXPIRA_SEGUNDOS);
      return data?.signedUrl ?? null;
    }
    const [logoUrl, logoEscuroUrl, fotoCapaUrl] = await Promise.all([
      assinar(identidadeData?.logo_url ?? null),
      assinar(identidadeData?.logo_escuro_url ?? null),
      assinar(identidadeData?.foto_capa_url ?? null),
    ]);

    const dados = montarDadosSistemaProposta({
      contato,
      calculo,
      modoPreco,
      componentes: componentesData ?? [],
    });

    const blocosEmitidos = proposta.blocos_emitidos as unknown as {
      tipo: string;
      ordem: number;
      ativo: boolean;
      quebra_pagina: "auto" | "nova_pagina" | "pagina_exclusiva";
      config: unknown;
    }[];

    const buffer = await renderToBuffer(
      ModeloPdfDocument({
        modelo: { capaVariante: proposta.capa_variante },
        blocos: blocosEmitidos.map((b) => ({ tipo: b.tipo as TipoBloco, ordem: b.ordem, ativo: b.ativo, quebraPagina: b.quebra_pagina, config: b.config })),
        identidade: {
          nomeExibicao: identidadeData?.nome_exibicao ?? "",
          corPrimaria: identidadeData?.cor_primaria ?? "",
          corDestaque: identidadeData?.cor_destaque ?? "",
          whatsapp: identidadeData?.whatsapp ?? "",
          rodapeTexto: identidadeData?.rodape_texto ?? "",
          logoUrl,
          logoEscuroUrl,
          fotoCapaUrl,
        },
        dados,
      }),
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="proposta-${contato.nome.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf"`,
      },
    });
  }

  const buffer = await renderToBuffer(
    PropostaPdfDocument({
      dados: {
        clienteNome: contato.nome,
        clienteEndereco: [contato.endereco, contato.cidade, contato.uf].filter(Boolean).join(" · ") || null,
        mensagem: proposta.mensagem,
        modoPreco,
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
