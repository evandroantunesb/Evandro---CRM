import Link from "next/link";
import { notFound } from "next/navigation";
import { Cartao, Selo } from "@/components/ui";
import { carregarConfiguracao, formatarDataHora, formatarMoeda } from "@/lib/crm";
import { descreverAtividade } from "@/lib/linha-do-tempo";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { EdicaoNegocio } from "./edicao";

export default async function DetalheNegocio({ params }: PageProps<"/negocios/[id]">) {
  const { atual } = await exigirPapel();
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: negocio }, config] = await Promise.all([
    supabase
      .from("negocios")
      .select(
        "id, numero, titulo, valor, descricao, status, funil_id, etapa_id, origem_id, responsavel_id, created_at, updated_at, contatos(id, nome, tipo, telefone, email, cidade, uf)",
      )
      .eq("id", id)
      .maybeSingle(),
    carregarConfiguracao(atual.empresaId),
  ]);
  if (!negocio) notFound();

  const { data: atividades } = await supabase
    .from("atividades")
    .select("id, tipo, dados, ator_id, created_at")
    .eq("negocio_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  const contato = negocio.contatos as unknown as {
    id: string;
    nome: string;
    tipo: string;
    telefone: string | null;
    email: string | null;
    cidade: string | null;
    uf: string | null;
  };
  const mapa = <T extends { id: string; nome: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x.nome]));
  const etapas = mapa(config.etapas);
  const origens = mapa(config.origens);
  const membros = mapa(config.membros);
  const nomes = {
    etapa: (i: string) => etapas.get(i) ?? "etapa removida",
    origem: (i: string) => origens.get(i) ?? "origem removida",
    membro: (i: string) => membros.get(i) ?? "usuário removido",
  };
  const whatsapp = contato.telefone?.replace(/\D/g, "");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link href={`/negocios?funil=${negocio.funil_id}`} className="text-sm text-zinc-600 hover:underline">
        ← Negócios
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">{contato.nome}</h1>
        <Selo>#{negocio.numero}</Selo>
        <Selo tom="atencao">{nomes.etapa(negocio.etapa_id)}</Selo>
        {negocio.status !== "aberto" && (
          <Selo tom={negocio.status === "ganho" ? "positivo" : "negativo"}>
            {negocio.status === "ganho" ? "Ganho" : "Perdido"}
          </Selo>
        )}
      </div>
      <p className="text-sm text-zinc-600">
        {negocio.titulo}
        {negocio.valor != null && <> · {formatarMoeda(negocio.valor)}</>}
        {negocio.origem_id && <> · {nomes.origem(negocio.origem_id)}</>} · Responsável:{" "}
        {negocio.responsavel_id ? nomes.membro(negocio.responsavel_id) : "ninguém"} · Criado em{" "}
        {formatarDataHora(negocio.created_at)}
      </p>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Cartao titulo="Dados do negócio">
            <EdicaoNegocio
              negocio={{
                id: negocio.id,
                titulo: negocio.titulo,
                etapaId: negocio.etapa_id,
                origemId: negocio.origem_id,
                responsavelId: negocio.responsavel_id,
                valor: negocio.valor,
                descricao: negocio.descricao,
              }}
              etapas={config.etapas.filter((e) => e.funilId === negocio.funil_id && (e.ativa || e.id === negocio.etapa_id))}
              origens={config.origens.filter((o) => o.ativa || o.id === negocio.origem_id)}
              responsaveis={atual.papel === "vendedor" ? [] : config.membros.filter((m) => m.ativo)}
            />
          </Cartao>
          <Cartao titulo="Linha do tempo">
            <ol className="flex flex-col">
              {(atividades ?? []).map((a) => (
                <li key={a.id} className="flex flex-col border-l-2 border-amber-200 py-2 pl-3 text-sm">
                  <span className="text-zinc-900">{descreverAtividade(a.tipo, a.dados, nomes)}</span>
                  <span className="text-xs text-zinc-500">{formatarDataHora(a.created_at)}</span>
                </li>
              ))}
            </ol>
          </Cartao>
        </div>
        <Cartao titulo="Contato">
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="text-zinc-500">{contato.tipo === "pj" ? "Razão social" : "Nome"}</dt>
              <dd>
                <Link href={`/contatos/${contato.id}`} className="font-medium text-amber-700 hover:underline">
                  {contato.nome}
                </Link>
              </dd>
            </div>
            {contato.telefone && (
              <div>
                <dt className="text-zinc-500">Telefone</dt>
                <dd>{contato.telefone}</dd>
              </div>
            )}
            {contato.email && (
              <div>
                <dt className="text-zinc-500">E-mail</dt>
                <dd>{contato.email}</dd>
              </div>
            )}
            {(contato.cidade || contato.uf) && (
              <div>
                <dt className="text-zinc-500">Cidade</dt>
                <dd>{[contato.cidade, contato.uf].filter(Boolean).join(" / ")}</dd>
              </div>
            )}
          </dl>
          {whatsapp && whatsapp.length >= 10 && (
            <a
              href={`https://wa.me/${whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Abrir no WhatsApp
            </a>
          )}
        </Cartao>
      </div>
    </div>
  );
}
