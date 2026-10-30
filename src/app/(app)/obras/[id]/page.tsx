import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ModosObras } from "@/components/obras/modos-obras";
import { NavegacaoObras } from "@/components/obras/navegacao-obras";
import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora, formatarMoeda } from "@/lib/crm";
import { carregarObras } from "@/lib/obras/dados";
import { filtrosDeParams, hrefObra, montarNavegacao, queryDosFiltros, temFiltroAtivo } from "@/lib/obras/navegacao";
import { GestaoFixacao, GestaoMarco, GestaoSetor } from "./gestao";
import { ResumoVistoria } from "@/components/engenharia/vistoria-resumo";
import { Campo, CartaoSetor, ContatoCliente, DadosTecnicos, ListaParticipantes, comUnidade } from "@/components/obras/detalhe-obra";
import { ListaTarefasSetor, NovaTarefaSetor } from "@/components/tarefas-setor";
import { carregarTarefasSetor } from "@/lib/tarefas-setor";
import { carregarSituacaoVistoria } from "@/lib/engenharia-vistoria";
import { carregarDetalheObra, type MarcoDetalheVM } from "@/lib/obras/detalhe";
import {
  ROTULO_ALERTA_OBRA,
  ROTULO_SITUACAO_OBRA,
  type AlertaObra,
  type SituacaoObra,
} from "@/lib/obras/rotulos";
import { OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

type Tom = "neutro" | "negativo" | "atencao";
// Sem verde (reservado ao WhatsApp): "Concluída" fica neutra. Vermelho só para o que é perda/erro.
const TOM_SITUACAO: Record<SituacaoObra, Tom> = { em_andamento: "neutro", concluida: "neutro", pausada: "atencao", cancelada: "negativo" };
const TOM_ALERTA: Record<AlertaObra, Tom> = { estorno: "negativo", venda_alterada: "atencao", parado: "atencao", aguardando: "neutro" };

export default async function DetalheObra({ params, searchParams }: PageProps<"/obras/[id]">) {
  // Lista positiva (OBRAS): os quatro papéis comerciais e `operacao`. A RLS decide o que cada um vê.
  const { atual } = await exigirPapel(...OBRAS);
  const { id } = await params;
  const filtros = filtrosDeParams(await searchParams);
  const query = queryDosFiltros(filtros);

  const supabase = await criarClienteServidor();
  // A lista navegável é recalculada aqui, a cada obra: mesma empresa, mesma RLS, mesmos filtros.
  const [obra, lista, tarefasSetor, vistoria] = await Promise.all([
    carregarDetalheObra(supabase, { empresaId: atual.empresaId, papel: atual.papel, obraId: id, membroId: atual.membroId }),
    carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel, comResponsaveis: false }),
    carregarTarefasSetor(supabase, { empresaId: atual.empresaId, membroId: atual.membroId, papel: atual.papel, obraId: id, filtro: "todas" }),
    carregarSituacaoVistoria(supabase, id),
  ]);
  if (!obra) notFound();
  const navegacao = montarNavegacao(lista.obras, filtros, id);

  const { resumo, gestao } = obra;
  const local = [resumo.cidade, resumo.uf].filter(Boolean).join("/");
  const gestaoDoSetor = (setor: string) => gestao?.setores.find((s) => s.setor === setor) ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ModosObras modo="gestao" hrefGestao={hrefObra("/obras", id, query)} hrefApresentacao={hrefObra("/obras/apresentacao", id, query)} />
        {temFiltroAtivo(filtros) && <span className="text-xs text-zinc-500">Navegando pela lista filtrada</span>}
      </div>
      <NavegacaoObras navegacao={navegacao} atualId={id} base="/obras" query={query} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-light tracking-tight text-texto md:text-4xl">{resumo.clienteNome}</h1>
        <Selo>Obra #{resumo.numero}</Selo>
        <Selo tom={TOM_SITUACAO[resumo.situacao]}>{ROTULO_SITUACAO_OBRA[resumo.situacao]}</Selo>
        {resumo.alertas.map((a) => (
          <Selo key={a} tom={TOM_ALERTA[a]}>
            {ROTULO_ALERTA_OBRA[a]}
          </Selo>
        ))}
      </div>
      {resumo.negocioId && (
        <Link href={`/negocios/${resumo.negocioId}`} className="w-fit text-sm text-zinc-600 underline hover:text-zinc-900">
          Ver negócio
        </Link>
      )}

      <Cartao titulo="Resumo">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Cliente">{resumo.clienteNome}</Campo>
          <Campo rotulo="Cidade/UF">{local || "—"}</Campo>
          <Campo rotulo="Potência">{comUnidade(resumo.potenciaKwp, "kWp") ?? "—"}</Campo>
          <Campo rotulo="Tipo de ligação">{resumo.tipoLigacao ?? "—"}</Campo>
          <Campo rotulo="Unidade consumidora">{resumo.unidadeConsumidora ?? "—"}</Campo>
          <Campo rotulo="Criada em">{formatarDataHora(resumo.criadaEm)}</Campo>
        </dl>
        {resumo.pausaMotivo && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-medium">Obra pausada.</span> Motivo: {resumo.pausaMotivo}
          </p>
        )}
        {resumo.cancelamentoMotivo && (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900">
            <span className="font-medium">Obra cancelada.</span> Motivo: {resumo.cancelamentoMotivo}
          </p>
        )}
        {obra.participantesComerciais.length > 0 && (
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <p className="mb-1 text-xs text-zinc-500">Comercial</p>
            <ListaParticipantes participantes={obra.participantesComerciais} />
          </div>
        )}
      </Cartao>

      {gestao?.bloqueio && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{gestao.bloqueio}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Setores</h2>
        {/* 3 colunas só a partir de 1280px: no tablet o menu lateral deixa ~430px para o conteúdo. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {obra.setores.map((s) => {
            const g = gestaoDoSetor(s.setor);
            return (
              <CartaoSetor key={s.setor} setor={s}>
                {/* key pela obra: ao navegar para outra obra, nenhum estado de formulário da anterior sobrevive. */}
                {/* A vistoria é registrada pela Engenharia; o Operacional acompanha a situação e as datas. */}
                {s.setor === "operacional" && vistoria && <ResumoVistoria situacao={vistoria} />}
                {g && <GestaoSetor key={resumo.id} obraId={resumo.id} setor={s} gestao={g} />}
              </CartaoSetor>
            );
          })}
        </div>
      </section>

      <Cartao titulo="Tarefas dos setores">
        <div className="flex flex-col gap-4">
          <ListaTarefasSetor
            tarefas={tarefasSetor.tarefas.filter((t) => t.status !== "cancelada")}
            membrosPorSetor={tarefasSetor.membrosPorSetor}
            vazio="Nenhuma tarefa nesta obra."
            mostrarReferencia={false}
          />
          {resumo.situacao !== "cancelada" && (
            <NovaTarefaSetor obraId={resumo.id} exemplo="O que o setor precisa fazer? Ex.: comprar a estrutura de fixação" />
          )}
        </div>
      </Cartao>

      <Cartao titulo="Marcos">
        <ul className="flex flex-col gap-3 text-sm">
          {obra.marcos.map((m) => (
            <ItemMarco key={m.marco} marco={m}>
              {gestao?.podeAtualizarMarcos && <GestaoMarco key={resumo.id} obraId={resumo.id} marco={m} />}
            </ItemMarco>
          ))}
        </ul>
      </Cartao>

      <Cartao titulo="Dados técnicos">
        <DadosTecnicos
          tecnico={obra.tecnico}
          fixacao={
            (obra.fixacao.podeEditar || obra.fixacao.atual || obra.tecnico.estruturaTelhado) && (
              <div className="flex flex-col gap-2 text-sm">
                <dt className="text-xs text-zinc-500">Fixação do telhado</dt>
                {!obra.fixacao.podeEditar && <dd className="text-zinc-900">{obra.fixacao.atual?.nome ?? "Não definida"}</dd>}
                {obra.fixacao.podeEditar && (
                  <dd>
                    <GestaoFixacao key={resumo.id} obraId={resumo.id} fixacao={obra.fixacao} podeConfigurar={atual.papel === "admin"} />
                  </dd>
                )}
                {obra.tecnico.estruturaTelhado && (
                  <dd className="text-xs text-zinc-500">Informado na venda: {obra.tecnico.estruturaTelhado}</dd>
                )}
              </div>
            )
          }
        />
      </Cartao>

      {obra.valorVendido != null && (
        <Cartao titulo="Valor vendido">
          <p className="text-2xl font-semibold text-zinc-900">{formatarMoeda(obra.valorVendido)}</p>
        </Cartao>
      )}

      {obra.contatoCliente && (
        <Cartao titulo="Contato do cliente">
          <ContatoCliente contato={obra.contatoCliente} />
        </Cartao>
      )}

      <Cartao titulo="Histórico">
        {obra.historico.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum evento registrado.</p>
        ) : (
          <ol className="flex flex-col">
            {obra.historico.map((h, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-t border-zinc-100 py-2 text-sm first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900">{h.tipoRotulo}</span>
                  {h.setorRotulo && <Selo>{h.setorRotulo}</Selo>}
                </div>
                {h.descricao && <p className="text-zinc-700">{h.descricao}</p>}
                <p className="text-xs text-zinc-500">
                  {formatarDataHora(h.quando)} · {h.autor}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Cartao>
    </div>
  );
}

function ItemMarco({ marco, children }: { marco: MarcoDetalheVM; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-900">{marco.rotulo}</span>
        <span className="flex flex-wrap items-center gap-2">
          <Selo>{marco.statusRotulo}</Selo>
          {marco.motivo && <span className="text-xs text-zinc-600">{marco.motivo}</span>}
        </span>
      </div>
      {children}
    </li>
  );
}
