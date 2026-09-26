import Link from "next/link";
import { notFound } from "next/navigation";
import { ListaTarefas } from "@/components/lista-tarefas";
import { MoverEtapa } from "@/components/mover-etapa";
import { NovaTarefa } from "@/components/nova-tarefa";
import { Cartao, Selo } from "@/components/ui";
import { apagarAnexo } from "@/lib/acoes/anexos";
import { alternarEtiqueta } from "@/lib/acoes/negocios";
import { apagarNota } from "@/lib/acoes/notas";
import { carregarConfiguracao, formatarDataHora, formatarMoeda } from "@/lib/crm";
import { env } from "@/lib/env";
import { descreverAtividade } from "@/lib/linha-do-tempo";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  ROTULO_CATEGORIA_ANEXO,
  type CategoriaAnexo,
  type ModoPreco,
  type StatusContrato,
  type TipoComponenteKit,
  type TipoLigacao,
  type TipoTarefa,
} from "@/lib/tipos";
import { Contrato } from "./contrato";
import { EdicaoNegocio } from "./edicao";
import { EnviarAnexo } from "./enviar-anexo";
import { Fechamento } from "./fechamento";
import { KitPersonalizado } from "./kit-personalizado";
import { NovaNota } from "./nova-nota";
import { Proposta } from "./proposta";

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default async function DetalheNegocio({ params }: PageProps<"/negocios/[id]">) {
  const { atual } = await exigirPapel();
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: negocio }, config, { data: parametros }] = await Promise.all([
    supabase
      .from("negocios")
      .select(
        "id, numero, titulo, valor, descricao, status, funil_id, etapa_id, origem_id, responsavel_id, motivo_perda_id, motivo_perda_detalhe, fechado_em, created_at, updated_at, tipo_telhado, unidade_consumidora, padrao_cliente, estrutura_telhado, contatos(id, nome, tipo, telefone, email, cidade, uf)",
      )
      .eq("id", id)
      .maybeSingle(),
    carregarConfiguracao(atual.empresaId),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).maybeSingle(),
  ]);
  if (!negocio) notFound();

  const [{ data: atividades }, { data: notas }, { data: tarefas }, { data: anexos }, { data: marcadas }, { data: calculo }] =
    await Promise.all([
      supabase
        .from("atividades")
        .select("id, tipo, dados, ator_id, created_at")
        .eq("negocio_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("notas")
        .select("id, texto, autor_id, created_at")
        .eq("negocio_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("tarefas")
        .select("id, titulo, tipo, vence_em, concluida_em, responsavel_id, criado_por")
        .eq("negocio_id", id)
        .order("concluida_em", { ascending: true, nullsFirst: true })
        .order("vence_em"),
      supabase
        .from("anexos")
        .select("id, nome, tamanho, categoria, enviado_por, created_at")
        .eq("negocio_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("negocio_etiquetas").select("etiqueta_id").eq("negocio_id", id),
      supabase
        .from("calculos_solares")
        .select(
          "id, kit_nome, tipo_ligacao, consumo_medio_kwh, tarifa_kwh, geracao_estimada_kwh_mes, economia_mensal, payback_meses, observacoes",
        )
        .eq("negocio_id", id)
        .maybeSingle(),
    ]);

  const { data: componentes } = await supabase
    .from("kit_componentes")
    .select("tipo, descricao, potencia_w, quantidade")
    .eq("negocio_id", id)
    .order("ordem");

  const { data: proposta } = await supabase
    .from("propostas")
    .select("id, token, modo_preco")
    .eq("negocio_id", id)
    .maybeSingle();
  const { data: aberturas } = proposta
    ? await supabase
        .from("propostas_aberturas")
        .select("aberta_em")
        .eq("proposta_id", proposta.id)
        .order("aberta_em", { ascending: false })
    : { data: null };

  const { data: contrato } = await supabase
    .from("contratos")
    .select("token, status")
    .eq("negocio_id", id)
    .maybeSingle();

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
  const motivos = mapa(config.motivos);
  const nomes = {
    etapa: (i: string) => etapas.get(i) ?? "etapa removida",
    origem: (i: string) => origens.get(i) ?? "origem removida",
    membro: (i: string) => membros.get(i) ?? "usuário removido",
    motivo: (i: string) => motivos.get(i) ?? "motivo removido",
  };
  const souAdmin = atual.papel === "admin";
  const etiquetasMarcadas = new Set((marcadas ?? []).map((m) => m.etiqueta_id));
  const etiquetasVisiveis = config.etiquetas.filter((e) => e.ativa || etiquetasMarcadas.has(e.id));

  // Linha do tempo: atividades do sistema e notas, da mais recente para a mais antiga.
  const linha = [
    ...(atividades ?? []).map((a) => ({
      chave: `a${a.id}`,
      quando: a.created_at,
      nota: null,
      texto: descreverAtividade(a.tipo, a.dados, nomes),
    })),
    ...(notas ?? []).map((n) => ({ chave: `n${n.id}`, quando: n.created_at, nota: n, texto: n.texto })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));
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
        {config.etiquetas
          .filter((e) => etiquetasMarcadas.has(e.id))
          .map((e) => (
            <span
              key={e.id}
              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ background: e.cor ?? "#71717a" }}
            >
              {e.nome}
            </span>
          ))}
        {negocio.status === "aberto" && (
          <MoverEtapa
            negocioId={negocio.id}
            etapaAtualId={negocio.etapa_id}
            etapas={config.etapas.filter((e) => e.funilId === negocio.funil_id && e.ativa)}
          />
        )}
      </div>
      <p className="text-sm text-zinc-600">
        {negocio.titulo}
        {negocio.valor != null && <> · {formatarMoeda(negocio.valor)}</>}
        {negocio.origem_id && <> · {nomes.origem(negocio.origem_id)}</>} · Responsável:{" "}
        {negocio.responsavel_id ? nomes.membro(negocio.responsavel_id) : "ninguém"} · Criado em{" "}
        {formatarDataHora(negocio.created_at)}
        {negocio.fechado_em && <> · Fechado em {formatarDataHora(negocio.fechado_em)}</>}
      </p>
      {negocio.status === "perdido" && negocio.motivo_perda_id && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Motivo da perda: {nomes.motivo(negocio.motivo_perda_id)}
          {negocio.motivo_perda_detalhe && <> · {negocio.motivo_perda_detalhe}</>}
        </p>
      )}

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
                tipoTelhado: negocio.tipo_telhado,
                unidadeConsumidora: negocio.unidade_consumidora,
                padraoCliente: negocio.padrao_cliente,
              }}
              etapas={config.etapas.filter(
                (e) => e.funilId === negocio.funil_id && (e.ativa || e.id === negocio.etapa_id),
              )}
              origens={config.origens.filter((o) => o.ativa || o.id === negocio.origem_id)}
              responsaveis={atual.papel === "vendedor" ? [] : config.membros.filter((m) => m.ativo)}
            />
          </Cartao>
          <Cartao titulo="Kit personalizado">
            <KitPersonalizado
              negocioId={negocio.id}
              negocioValor={negocio.valor}
              estruturaTelhado={negocio.estrutura_telhado}
              componentesSalvos={(componentes ?? []).map((c) => ({
                tipo: c.tipo as TipoComponenteKit,
                descricao: c.descricao,
                potenciaW: c.potencia_w,
                quantidade: c.quantidade,
              }))}
              parametros={
                parametros
                  ? {
                      produtividadeKwhKwpMes: parametros.produtividade_kwh_kwp_mes,
                      percentualFioB: parametros.percentual_fio_b,
                      disponibilidadeMonoKwh: parametros.disponibilidade_mono_kwh,
                      disponibilidadeBiKwh: parametros.disponibilidade_bi_kwh,
                      disponibilidadeTriKwh: parametros.disponibilidade_tri_kwh,
                    }
                  : null
              }
              calculo={
                calculo
                  ? {
                      id: calculo.id,
                      kitNome: calculo.kit_nome,
                      tipoLigacao: calculo.tipo_ligacao as TipoLigacao,
                      consumoMedioKwh: calculo.consumo_medio_kwh,
                      tarifaKwh: calculo.tarifa_kwh,
                      geracaoEstimadaKwhMes: calculo.geracao_estimada_kwh_mes,
                      economiaMensal: calculo.economia_mensal,
                      paybackMeses: calculo.payback_meses,
                      observacoes: calculo.observacoes,
                    }
                  : null
              }
            />
          </Cartao>
          <Cartao titulo="Proposta">
            <Proposta
              negocioId={negocio.id}
              temCalculo={!!calculo}
              siteUrl={env.siteUrl}
              proposta={
                proposta
                  ? {
                      token: proposta.token,
                      modoPreco: proposta.modo_preco as ModoPreco,
                      aberturas: aberturas?.length ?? 0,
                      ultimaAbertura: aberturas?.[0]?.aberta_em ?? null,
                    }
                  : null
              }
            />
          </Cartao>
          <Cartao titulo="Contrato">
            <Contrato
              negocioId={negocio.id}
              siteUrl={env.siteUrl}
              contrato={contrato ? { token: contrato.token, status: contrato.status as StatusContrato } : null}
            />
          </Cartao>
          <Cartao titulo="Tarefas">
            <div className="flex flex-col gap-3">
              <ListaTarefas
                vazio="Nenhuma tarefa. Crie a próxima ação para este cliente não esfriar."
                tarefas={(tarefas ?? []).map((t) => ({
                  id: t.id,
                  titulo: t.titulo,
                  tipo: t.tipo as TipoTarefa,
                  vence_em: t.vence_em,
                  concluida_em: t.concluida_em,
                  responsavel: t.responsavel_id ? nomes.membro(t.responsavel_id) : null,
                  podeApagar: souAdmin || t.criado_por === atual.membroId,
                }))}
              />
              <NovaTarefa
                negocioId={negocio.id}
                responsaveis={atual.papel === "vendedor" ? [] : config.membros.filter((m) => m.ativo)}
                responsavelPadrao={negocio.responsavel_id}
              />
            </div>
          </Cartao>
          <Cartao titulo="Notas e linha do tempo">
            <NovaNota negocioId={negocio.id} />
            <ol className="flex flex-col">
              {linha.map((item) =>
                item.nota ? (
                  <li
                    key={item.chave}
                    className="my-1 flex flex-col rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <span className="whitespace-pre-wrap text-zinc-900">{item.texto}</span>
                    <span className="flex gap-2 text-xs text-zinc-500">
                      {item.nota.autor_id ? nomes.membro(item.nota.autor_id) : "usuário removido"} ·{" "}
                      {formatarDataHora(item.quando)}
                      {item.nota.autor_id === atual.membroId && (
                        <form action={apagarNota} className="ml-auto">
                          <input type="hidden" name="notaId" value={item.nota.id} />
                          <button className="hover:text-red-700">Apagar</button>
                        </form>
                      )}
                    </span>
                  </li>
                ) : (
                  <li key={item.chave} className="flex flex-col border-l-2 border-zinc-200 py-2 pl-3 text-sm">
                    <span className="text-zinc-800">{item.texto}</span>
                    <span className="text-xs text-zinc-500">{formatarDataHora(item.quando)}</span>
                  </li>
                ),
              )}
            </ol>
          </Cartao>
        </div>
        <div className="flex flex-col gap-4">
          <Cartao titulo="Situação">
            <Fechamento
              negocioId={negocio.id}
              status={negocio.status}
              motivos={config.motivos.filter((m) => m.ativo || m.id === negocio.motivo_perda_id)}
            />
          </Cartao>
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
          {etiquetasVisiveis.length > 0 && (
            <Cartao titulo="Etiquetas">
              <div className="flex flex-wrap gap-2">
                {etiquetasVisiveis.map((e) => {
                  const marcada = etiquetasMarcadas.has(e.id);
                  return (
                    <form key={e.id} action={alternarEtiqueta}>
                      <input type="hidden" name="negocioId" value={negocio.id} />
                      <input type="hidden" name="etiquetaId" value={e.id} />
                      <input type="hidden" name="marcar" value={String(!marcada)} />
                      <button
                        aria-pressed={marcada}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${marcada ? "text-white" : "bg-white text-zinc-700"}`}
                        style={
                          marcada
                            ? { background: e.cor ?? "#71717a", borderColor: e.cor ?? "#71717a" }
                            : { borderColor: e.cor ?? "#d4d4d8" }
                        }
                      >
                        {marcada ? "✓ " : ""}
                        {e.nome}
                      </button>
                    </form>
                  );
                })}
              </div>
            </Cartao>
          )}
          <Cartao titulo={`Arquivos (${anexos?.length ?? 0})`}>
            <ul className="mb-3 flex flex-col">
              {(anexos ?? []).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 border-t border-zinc-100 py-2 text-sm first:border-t-0"
                >
                  <a
                    href={`/anexos/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-amber-700 hover:underline"
                  >
                    {a.nome}
                  </a>
                  {a.categoria !== "geral" && <Selo tom="atencao">{ROTULO_CATEGORIA_ANEXO[a.categoria as CategoriaAnexo]}</Selo>}
                  <span className="text-xs text-zinc-500">{tamanhoLegivel(a.tamanho)}</span>
                  {(souAdmin || a.enviado_por === atual.membroId) && (
                    <form action={apagarAnexo}>
                      <input type="hidden" name="anexoId" value={a.id} />
                      <button className="text-xs text-zinc-400 hover:text-red-700">Apagar</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <EnviarAnexo empresaId={atual.empresaId} negocioId={negocio.id} />
          </Cartao>
        </div>
      </div>
    </div>
  );
}
