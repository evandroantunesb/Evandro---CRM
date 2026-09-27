import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { dadosDeAmostraProposta } from "@/lib/propostas/pdf-amostra";
import { ModeloPdfDocument } from "@/lib/propostas/pdf";
import type { TipoBloco } from "@/lib/propostas/blocos";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const EXPIRA_SEGUNDOS = 300;

/** Pré-visualização do PDF de um modelo, com dados fictícios (sem negócio real ainda). */
export async function GET(_: Request, { params }: RouteContext<"/configuracoes/propostas/modelos/[id]/pdf">) {
  const { atual } = await exigirPapel("admin");
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: modelo } = await supabase.from("proposta_modelos").select("capa_variante").eq("id", id).eq("empresa_id", atual.empresaId).maybeSingle();
  if (!modelo) return new NextResponse("Modelo não encontrado.", { status: 404 });

  const { data: blocosData } = await supabase
    .from("proposta_modelo_blocos")
    .select("tipo, ordem, ativo, quebra_pagina, config")
    .eq("modelo_id", id)
    .order("ordem", { ascending: true });

  const { data: identidadeData } = await supabase.from("proposta_identidades").select("*").eq("empresa_id", atual.empresaId).maybeSingle();

  async function assinar(caminho: string | null) {
    if (!caminho) return null;
    const { data } = await supabase.storage.from("proposta-marca").createSignedUrl(caminho, EXPIRA_SEGUNDOS);
    return data?.signedUrl ?? null;
  }
  const [logoUrl, logoEscuroUrl, fotoCapaUrl] = await Promise.all([
    assinar(identidadeData?.logo_url ?? null),
    assinar(identidadeData?.logo_escuro_url ?? null),
    assinar(identidadeData?.foto_capa_url ?? null),
  ]);

  const buffer = await renderToBuffer(
    ModeloPdfDocument({
      modelo: { capaVariante: modelo.capa_variante },
      blocos: (blocosData ?? []).map((b) => ({
        tipo: b.tipo as TipoBloco,
        ordem: b.ordem,
        ativo: b.ativo,
        quebraPagina: b.quebra_pagina,
        config: b.config,
      })),
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
      dados: dadosDeAmostraProposta(),
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=pre-visualizacao-modelo.pdf" },
  });
}
