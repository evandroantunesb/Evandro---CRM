import Link from "next/link";
import { redirect } from "next/navigation";
import { ModosObras } from "@/components/obras/modos-obras";
import { hojeBrasilia } from "@/lib/obras/apresentacao/dados";
import { carregarCompleta } from "@/lib/obras/completa";
import { carregarObras } from "@/lib/obras/dados";
import { filtrarObras } from "@/lib/obras/derivados";
import { filtrosDeParams, hrefObra, queryDosFiltros } from "@/lib/obras/navegacao";
import { filtrarCompleta, filtrosCompletaDeParams, queryCompleta, usaVisaoCompleta } from "@/lib/obras/semaforo";
import { OBRAS, OPR_COMPLETA, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Entrada do modo Apresentação: abre a 1ª obra da lista (mesmos filtros e permissões da listagem; para admin e
 * gestor, a da visão Completa, vermelhas primeiro).
 */
export default async function EntradaApresentacao({ searchParams }: PageProps<"/obras/apresentacao">) {
  const { atual } = await exigirPapel(...OBRAS);
  const parametros = await searchParams;
  const completa = usaVisaoCompleta(pode(atual.papel, OPR_COMPLETA), parametros);
  const supabase = await criarClienteServidor();
  const entrada = { empresaId: atual.empresaId, papel: atual.papel };

  let query: string;
  let primeira: { id: string } | undefined;
  if (completa) {
    const filtros = filtrosCompletaDeParams(parametros);
    query = queryCompleta(filtros);
    [primeira] = filtrarCompleta((await carregarCompleta(supabase, { ...entrada, hoje: hojeBrasilia() })).obras, filtros);
  } else {
    const filtros = filtrosDeParams(parametros);
    query = queryDosFiltros(filtros);
    [primeira] = filtrarObras((await carregarObras(supabase, { ...entrada, comResponsaveis: false })).obras, filtros);
  }
  if (primeira) redirect(hrefObra("/obras/apresentacao", primeira.id, query));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <ModosObras
        modo="apresentacao"
        rotuloGestao={completa ? "Completa" : "Gestão"}
        hrefGestao={`/obras${query ? `?${query}` : ""}`}
        hrefApresentacao={`/obras/apresentacao${query ? `?${query}` : ""}`}
      />
      <div className="painel p-8 text-center">
        <p className="text-base font-medium text-zinc-900">Nenhuma obra para apresentar.</p>
        <p className="mt-1 text-sm text-zinc-500">{query ? "Nenhuma obra com esses filtros." : "Ainda não há obras visíveis para você."}</p>
        <Link href={`/obras${query ? `?${query}` : ""}`} className="mt-4 inline-block text-sm text-zinc-600 underline hover:text-zinc-900">
          Voltar para a lista
        </Link>
      </div>
    </div>
  );
}
