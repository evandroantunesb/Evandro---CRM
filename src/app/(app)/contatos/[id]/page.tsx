import Link from "next/link";
import { notFound } from "next/navigation";
import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarDataHora, formatarMoeda } from "@/lib/crm";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { EdicaoContato } from "./edicao";

export default async function DetalheContato({ params }: PageProps<"/contatos/[id]">) {
  const { atual } = await exigirPapel();
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: contato }, config] = await Promise.all([
    supabase
      .from("contatos")
      .select("id, tipo, nome, telefone, telefone2, email, documento, cidade, uf")
      .eq("id", id)
      .maybeSingle(),
    carregarConfiguracao(atual.empresaId),
  ]);
  if (!contato) notFound();

  // Só aparecem os negócios que o usuário pode ver (RLS).
  const { data: negocios } = await supabase
    .from("negocios")
    .select("id, numero, titulo, valor, status, etapa_id, created_at")
    .eq("contato_id", id)
    .order("created_at", { ascending: false });
  const etapas = new Map(config.etapas.map((e) => [e.id, e.nome]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href="/contatos" className="text-sm text-zinc-600 hover:underline">
        ← Contatos
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">{contato.nome}</h1>
      <Cartao titulo="Dados do contato">
        <EdicaoContato contato={{ ...contato, email: contato.email as string | null }} />
      </Cartao>
      <Cartao titulo={`Negócios (${negocios?.length ?? 0})`}>
        <ul>
          {(negocios ?? []).map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 text-sm">
              <Link href={`/negocios/${n.id}`} className="font-medium text-amber-700 hover:underline">
                #{n.numero} · {n.titulo}
              </Link>
              <Selo>{etapas.get(n.etapa_id)}</Selo>
              {n.status !== "aberto" && (
                <Selo tom={n.status === "ganho" ? "positivo" : "negativo"}>{n.status === "ganho" ? "Ganho" : "Perdido"}</Selo>
              )}
              <span className="ml-auto text-zinc-500">
                {formatarMoeda(n.valor)} {formatarDataHora(n.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}
