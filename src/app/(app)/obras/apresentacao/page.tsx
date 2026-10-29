import Link from "next/link";
import { redirect } from "next/navigation";
import { ModosObras } from "@/components/obras/modos-obras";
import { carregarObras } from "@/lib/obras/dados";
import { filtrarObras } from "@/lib/obras/derivados";
import { filtrosDeParams, hrefObra, queryDosFiltros } from "@/lib/obras/navegacao";
import { OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Entrada do modo Apresentação: abre a 1ª obra da lista (mesmos filtros e permissões da listagem). */
export default async function EntradaApresentacao({ searchParams }: PageProps<"/obras/apresentacao">) {
  const { atual } = await exigirPapel(...OBRAS);
  const filtros = filtrosDeParams(await searchParams);
  const query = queryDosFiltros(filtros);

  const supabase = await criarClienteServidor();
  const { obras } = await carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel, comResponsaveis: false });
  const [primeira] = filtrarObras(obras, filtros);
  if (primeira) redirect(hrefObra("/obras/apresentacao", primeira.id, query));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <ModosObras modo="apresentacao" hrefGestao={`/obras${query ? `?${query}` : ""}`} hrefApresentacao={`/obras/apresentacao${query ? `?${query}` : ""}`} />
      <div className="painel p-8 text-center">
        <p className="text-base font-medium text-texto">Nenhuma obra para apresentar.</p>
        <p className="mt-1 text-sm text-texto-2">{query ? "Nenhuma obra com esses filtros." : "Ainda não há obras visíveis para você."}</p>
        <Link href={`/obras${query ? `?${query}` : ""}`} className="mt-4 inline-block text-sm text-texto-2 underline hover:text-texto">
          Voltar para a lista
        </Link>
      </div>
    </div>
  );
}
