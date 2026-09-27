import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AdicionarBloco } from "./adicionar-bloco";
import { BlocoLinha } from "./bloco-linha";
import { DetalhesModelo } from "./detalhes-modelo";

export default async function ConstrutorModelo({ params }: PageProps<"/configuracoes/propostas/modelos/[id]">) {
  const { atual } = await exigirPapel("admin");
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: modelo } = await supabase
    .from("proposta_modelos")
    .select("id, nome, descricao, capa_variante")
    .eq("id", id)
    .eq("empresa_id", atual.empresaId)
    .maybeSingle();
  if (!modelo) notFound();

  const { data: blocosData } = await supabase
    .from("proposta_modelo_blocos")
    .select("id, tipo, ativo, quebra_pagina, config")
    .eq("modelo_id", id)
    .order("ordem", { ascending: true });
  const blocos = blocosData ?? [];

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/configuracoes/propostas" className="inline-flex w-fit items-center gap-1 text-sm text-zinc-500 hover:text-carvao">
          <ArrowLeft size={14} /> Voltar aos modelos
        </Link>
        <Link
          href={`/configuracoes/propostas/modelos/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-carvao hover:border-dourado"
        >
          Pré-visualizar PDF
        </Link>
      </div>
      <DetalhesModelo modelo={{ id: modelo.id, nome: modelo.nome, descricao: modelo.descricao, capaVariante: modelo.capa_variante }} />
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Blocos do modelo</h2>
        {blocos.length === 0 && <p className="text-sm text-zinc-500">Nenhum bloco neste modelo ainda.</p>}
        {blocos.map((b, i) => (
          <BlocoLinha
            key={b.id}
            modeloId={id}
            bloco={{ id: b.id, tipo: b.tipo, ativo: b.ativo, quebraPagina: b.quebra_pagina, config: b.config }}
            posicao={i}
            total={blocos.length}
          />
        ))}
      </div>
      <AdicionarBloco modeloId={id} tiposUsados={blocos.map((b) => b.tipo)} />
    </div>
  );
}
