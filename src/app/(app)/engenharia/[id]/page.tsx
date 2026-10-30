import Link from "next/link";
import { notFound } from "next/navigation";
import { GestaoFixacao, GestaoSetor } from "@/app/(app)/obras/[id]/gestao";
import { ChecklistEngenharia } from "@/components/engenharia/checklist";
import { Campo, CartaoSetor, ContatoCliente, DadosTecnicos, comUnidade } from "@/components/obras/detalhe-obra";
import { ListaTarefasSetor, NovaTarefaSetor } from "@/components/tarefas-setor";
import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora } from "@/lib/crm";
import { carregarChecklistEngenharia } from "@/lib/engenharia-checklist";
import { carregarDetalheObra } from "@/lib/obras/detalhe";
import { ROTULO_ALERTA_OBRA, ROTULO_SETOR, ROTULO_SITUACAO_OBRA, type AlertaObra, type SituacaoObra } from "@/lib/obras/rotulos";
import { ENGENHARIA, OBRAS, VER_NEGOCIO_DA_OBRA, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarTarefasSetor } from "@/lib/tarefas-setor";

type Tom = "neutro" | "negativo" | "atencao";
// Mesmos tons da tela de Obras: sem verde (reservado ao WhatsApp), vermelho só para perda e erro.
const TOM_SITUACAO: Record<SituacaoObra, Tom> = { em_andamento: "neutro", concluida: "neutro", pausada: "atencao", cancelada: "negativo" };
const TOM_ALERTA: Record<AlertaObra, Tom> = { estorno: "negativo", venda_alterada: "atencao", parado: "atencao", aguardando: "neutro" };

/**
 * Card da obra para a Engenharia: o que o engenheiro precisa para trabalhar numa obra só (etapa do projeto, tarefas
 * do setor, dados técnicos, dados do cliente que a Engenharia pode ver e o histórico). Reaproveita o detalhe da
 * obra: quem decide o que aparece é a RLS e as RPCs, não esta tela. O checklist de documentos está aqui (P2);
 * protocolos e vistoria entram nas próximas etapas.
 */
export default async function CardEngenharia({ params }: PageProps<"/engenharia/[id]">) {
  const { atual } = await exigirPapel(...ENGENHARIA);
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [obra, tarefas, { data: meusSetores }, checklist] = await Promise.all([
    carregarDetalheObra(supabase, { empresaId: atual.empresaId, papel: atual.papel, obraId: id, membroId: atual.membroId }),
    carregarTarefasSetor(supabase, {
      empresaId: atual.empresaId,
      membroId: atual.membroId,
      papel: atual.papel,
      obraId: id,
      setor: "engenharia",
      filtro: "todas",
    }),
    supabase
      .from("membro_setores_obra")
      .select("capacidade")
      .eq("empresa_id", atual.empresaId)
      .eq("membro_id", atual.membroId)
      .eq("setor", "engenharia"),
    carregarChecklistEngenharia(supabase, { empresaId: atual.empresaId, obraId: id }),
  ]);
  // Operação só entra no card de quem atua em Engenharia (mesma regra da lista).
  if (!obra || (atual.papel === "operacao" && (meusSetores ?? []).length === 0)) notFound();

  const { resumo, gestao } = obra;
  const engenharia = obra.setores.find((s) => s.setor === "engenharia");
  const gestaoEngenharia = gestao?.setores.find((s) => s.setor === "engenharia") ?? null;
  // Mesma regra de `autorizacao_setor_obra`: admin, coordenador da Engenharia ou participante ativo dela.
  const autorizacaoEngenharia = gestaoEngenharia?.permissoes.autorizacao ?? null;
  const local = [resumo.cidade, resumo.uf].filter(Boolean).join("/");
  // Histórico da Engenharia e do que é da obra toda; os outros setores ficam na tela de Obras.
  const historico = obra.historico.filter((h) => !h.setorRotulo || h.setorRotulo === ROTULO_SETOR.engenharia);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link href="/engenharia" className="w-fit text-sm text-zinc-600 hover:text-zinc-900">
        ‹ Engenharia
      </Link>

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
      <div className="flex flex-wrap gap-4 text-sm">
        {pode(atual.papel, OBRAS) && (
          <Link href={`/obras/${resumo.id}`} className="text-zinc-600 underline hover:text-zinc-900">
            Ver obra completa
          </Link>
        )}
        {resumo.negocioId && pode(atual.papel, VER_NEGOCIO_DA_OBRA) && (
          <Link href={`/negocios/${resumo.negocioId}`} className="text-zinc-600 underline hover:text-zinc-900">
            Ver negócio
          </Link>
        )}
      </div>

      {resumo.pausaMotivo && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-medium">Obra pausada.</span> Motivo: {resumo.pausaMotivo}
        </p>
      )}
      {resumo.cancelamentoMotivo && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-900">
          <span className="font-medium">Obra cancelada.</span> Motivo: {resumo.cancelamentoMotivo}
        </p>
      )}
      {gestao?.bloqueio && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{gestao.bloqueio}</p>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        {engenharia && (
          <CartaoSetor setor={engenharia}>
            {gestaoEngenharia && <GestaoSetor key={resumo.id} obraId={resumo.id} setor={engenharia} gestao={gestaoEngenharia} />}
          </CartaoSetor>
        )}
        <Cartao titulo="Resumo">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Campo rotulo="Cidade/UF">{local || "—"}</Campo>
            <Campo rotulo="Potência">{comUnidade(resumo.potenciaKwp, "kWp") ?? "—"}</Campo>
            <Campo rotulo="Tipo de ligação">{resumo.tipoLigacao ?? "—"}</Campo>
            <Campo rotulo="Unidade consumidora">{resumo.unidadeConsumidora ?? "—"}</Campo>
          </dl>
        </Cartao>
      </div>

      <Cartao titulo="Checklist e documentos">
        <ChecklistEngenharia
          obraId={resumo.id}
          pasta={`${atual.empresaId}/${resumo.id}`}
          itens={checklist}
          autorizacao={autorizacaoEngenharia}
          cancelada={resumo.situacao === "cancelada"}
          veDocumentos={autorizacaoEngenharia !== null}
        />
      </Cartao>

      <Cartao titulo="Tarefas de Engenharia">
        <div className="flex flex-col gap-4">
          <ListaTarefasSetor
            tarefas={tarefas.tarefas.filter((t) => t.status !== "cancelada")}
            membrosPorSetor={tarefas.membrosPorSetor}
            vazio="Nenhuma tarefa de Engenharia nesta obra."
            mostrarReferencia={false}
          />
          {resumo.situacao !== "cancelada" && (
            <NovaTarefaSetor obraId={resumo.id} setorPadrao="engenharia" exemplo="O que a Engenharia precisa fazer? Ex.: pedir a vistoria" />
          )}
        </div>
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
                {obra.tecnico.estruturaTelhado && <dd className="text-xs text-zinc-500">Informado na venda: {obra.tecnico.estruturaTelhado}</dd>}
              </div>
            )
          }
        />
      </Cartao>

      {obra.contatoCliente && (
        <Cartao titulo="Dados do cliente">
          <ContatoCliente contato={obra.contatoCliente} />
        </Cartao>
      )}

      <Cartao titulo="Histórico">
        {historico.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum evento registrado.</p>
        ) : (
          <ol className="flex flex-col">
            {historico.map((h, i) => (
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
