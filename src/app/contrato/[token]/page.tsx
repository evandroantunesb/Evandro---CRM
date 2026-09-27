import { notFound } from "next/navigation";
import { LogoRaion } from "@/components/marca";
import { Selo } from "@/components/ui";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ROTULO_STATUS_CONTRATO, type StatusContrato } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/** Página pública do contrato: o cliente abre pelo link, sem login. */
export default async function ContratoPublico({ params }: PageProps<"/contrato/[token]">) {
  const { token } = await params;
  const admin = criarClienteAdmin();

  const { data: contrato } = await admin
    .from("contratos")
    .select("conteudo, status, negocios(titulo)")
    .eq("token", token)
    .maybeSingle();
  if (!contrato) notFound();

  const negocio = contrato.negocios as unknown as { titulo: string } | null;
  const status = contrato.status as StatusContrato;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <LogoRaion altura={32} />
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.3em] text-zinc-500 uppercase">Contrato</p>
          {negocio && <h1 className="mt-1 text-2xl font-semibold text-carvao">{negocio.titulo}</h1>}
        </div>
        <Selo tom={status === "assinado" ? "positivo" : status === "aguardando_assinatura" ? "atencao" : "neutro"}>
          {ROTULO_STATUS_CONTRATO[status]}
        </Selo>
      </div>

      <article className="rounded-xl border border-zinc-200/80 bg-white p-6 whitespace-pre-wrap text-sm text-zinc-800 shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
        {contrato.conteudo}
      </article>

      {status !== "assinado" && (
        <p className="text-xs text-zinc-400">
          Este contrato ainda não foi assinado. A assinatura é combinada diretamente com o vendedor.
        </p>
      )}
    </main>
  );
}
