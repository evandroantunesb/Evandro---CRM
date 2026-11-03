import Link from "next/link";
import { Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO, CLASSE_VIDRO_CABECALHO } from "@/components/cabecalho-pagina";
import { NovoNegocio } from "@/components/novo-negocio";
import { iniciais } from "@/components/avatar";
import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarDataHora, formatarMoeda } from "@/lib/crm";
import { eletropostoDisponivel } from "@/lib/eletroposto-servidor";
import { formatarMesAno } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { FICHA_CONTATO } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { EdicaoContato } from "./edicao";
import { OpcoesContato } from "./excluir";

export default async function DetalheContato({ params }: PageProps<"/contatos/[id]">) {
  const { atual } = await exigirPapel(...FICHA_CONTATO);
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: contato }, config, eletroposto] = await Promise.all([
    supabase
      .from("contatos")
      .select("id, tipo, nome, telefone, telefone2, email, documento, endereco, cidade, uf, created_at")
      .eq("id", id)
      .maybeSingle(),
    carregarConfiguracao(atual.empresaId),
    eletropostoDisponivel(supabase, atual),
  ]);
  if (!contato) notFound();

  // Só aparecem os negócios que o usuário pode ver (RLS).
  const { data: negocios } = await supabase
    .from("negocios")
    .select("id, numero, titulo, valor, status, etapa_id, created_at, arquivado_em")
    .eq("contato_id", id)
    .order("created_at", { ascending: false });
  const etapas = new Map(config.etapas.map((e) => [e.id, e.nome]));
  const whatsapp = contato.telefone?.replace(/\D/g, "");
  const local = [contato.cidade, contato.uf].filter(Boolean).join(" / ");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/contatos", rotulo: "Contatos" }}
        inicio={
          <span className="hidden size-[72px] shrink-0 items-center justify-center rounded-full bg-dourado font-titulo text-2xl font-semibold text-carvao sm:flex" aria-hidden>
            {iniciais(contato.nome) || "?"}
          </span>
        }
        sobretitulo={[contato.tipo === "pj" ? "Pessoa jurídica" : "Pessoa física", local, `cliente desde ${formatarMesAno(contato.created_at)}`]
          .filter(Boolean)
          .join(" · ")}
        titulo={contato.nome}
        acoes={
          <>
            {whatsapp && whatsapp.length >= 10 && (
              <a
                href={`https://wa.me/${whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`}`}
                target="_blank"
                rel="noreferrer"
                className={`${CLASSE_VIDRO_CABECALHO} border-[#5cc796]/60 text-[#5cc796]`}
              >
                WhatsApp
              </a>
            )}
            {(atual.papel === "admin" || atual.papel === "gestor") && <OpcoesContato contatoId={contato.id} />}
            <NovoNegocio href={`/negocios/novo?${new URLSearchParams({ contato: contato.id })}`} eletroposto={eletroposto} className={CLASSE_ACAO_CABECALHO}>
              <Plus size={16} aria-hidden />
              Novo negócio para este cliente
            </NovoNegocio>
          </>
        }
      />
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
              {n.arquivado_em && <Selo>Arquivado</Selo>}
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
