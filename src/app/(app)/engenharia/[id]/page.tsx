import Link from "next/link";
import { notFound } from "next/navigation";
import { GestaoFixacao, GestaoSetor } from "@/app/(app)/obras/[id]/gestao";
import { ChecklistEngenharia } from "@/components/engenharia/checklist";
import { EnquadramentoEngenharia } from "@/components/engenharia/enquadramento";
import { RegistroPasso, ResumoPassos, SecaoPasso } from "@/components/engenharia/passos";
import { ProtocolosEngenharia } from "@/components/engenharia/protocolos";
import { VistoriaEngenharia } from "@/components/engenharia/vistoria";
import { ContatoCliente, DadosTecnicos, comUnidade } from "@/components/obras/detalhe-obra";
import { ListaTarefasSetor, NovaTarefaSetor } from "@/components/tarefas-setor";
import { Cartao, CartaoRecolhivel, Selo } from "@/components/ui";
import { formatarDataHora } from "@/lib/crm";
import { carregarChecklistEngenharia } from "@/lib/engenharia-checklist";
import { carregarEnquadramento } from "@/lib/engenharia-enquadramento";
import { enquadramentoCompleto, perguntasSemResposta } from "@/lib/engenharia-enquadramento-regras";
import { carregarRegistrosPassos } from "@/lib/engenharia-passos";
import { acoesPasso, montarPassosEngenharia, passoAtual, type PassoComRegistro } from "@/lib/engenharia-passos-regras";
import { carregarPrazosObras } from "@/lib/engenharia-prazos";
import { seloPrazo } from "@/lib/engenharia-prazos-regras";
import { carregarProtocolosEngenharia } from "@/lib/engenharia-protocolos";
import { carregarVistoriasEngenharia } from "@/lib/engenharia-vistoria";
import { bloqueioPedidoVistoria } from "@/lib/engenharia-vistoria-regras";
import { carregarDetalheObra } from "@/lib/obras/detalhe";
import { ROTULO_ALERTA_OBRA, ROTULO_ESTADO_SETOR, ROTULO_SETOR, ROTULO_SITUACAO_OBRA, type AlertaObra, type SituacaoObra } from "@/lib/obras/rotulos";
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
 * obra: quem decide o que aparece é a RLS e as RPCs, não esta tela. Checklist de documentos (P2), protocolos na
 * concessionária (P3) e vistoria, medição e conexão (P4), organizados nos oito passos guiados (P6b): o topo diz onde
 * a obra está e o que fazer; cada passo tem a sua seção, todas acessíveis.
 */
export default async function CardEngenharia({ params }: PageProps<"/engenharia/[id]">) {
  const { atual } = await exigirPapel(...ENGENHARIA);
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [obra, tarefas, { data: meusSetores }, checklist, protocolos, vistorias, registros, prazos, enquadramento] = await Promise.all([
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
    carregarProtocolosEngenharia(supabase, { empresaId: atual.empresaId, obraId: id }),
    carregarVistoriasEngenharia(supabase, { empresaId: atual.empresaId, obraId: id }),
    carregarRegistrosPassos(supabase, { empresaId: atual.empresaId, obraId: id }),
    carregarPrazosObras(supabase, atual.empresaId),
    carregarEnquadramento(supabase, { empresaId: atual.empresaId, obraId: id }),
  ]);
  // Operação só entra no card de quem atua em Engenharia (mesma regra da lista).
  if (!obra || (atual.papel === "operacao" && (meusSetores ?? []).length === 0)) notFound();

  const { resumo, gestao } = obra;
  const engenharia = obra.setores.find((s) => s.setor === "engenharia");
  const gestaoEngenharia = gestao?.setores.find((s) => s.setor === "engenharia") ?? null;
  // Mesma regra de `autorizacao_setor_obra`: admin, coordenador da Engenharia ou participante ativo dela.
  const autorizacaoEngenharia = gestaoEngenharia?.permissoes.autorizacao ?? null;
  // Na vistoria, quem também atua no Operacional desta obra registra a correção de campo aqui mesmo.
  const atuaOperacional = (gestao?.setores.find((s) => s.setor === "operacional")?.permissoes.autorizacao ?? null) !== null;
  // Gate G2: obrigatórios ainda não resolvidos (null = checklist não aplicado).
  const pendentesChecklist = checklist.length
    ? checklist.filter((i) => i.obrigatorio && i.status !== "valido" && i.status !== "dispensado").length
    : null;
  // Gate G5: protocolo aprovado (ou orçamento emitido) e instalação concluída pelo Operacional.
  const operacional = obra.setores.find((s) => s.setor === "operacional");
  const bloqueioVistoria = bloqueioPedidoVistoria({
    protocoloAprovado: protocolos.some((p) => p.status === "aprovado" || p.status === "orcamento_emitido" || p.status === "encerrado"),
    instalacaoConcluida: operacional?.status === "instalacao_concluida" || operacional?.status === "concluido",
  });
  const local = [resumo.cidade, resumo.uf].filter(Boolean).join("/");
  // Linha do topo no lugar do antigo cartão "Resumo"; o resto da venda fica em "Dados da venda".
  const linhaObra = [
    local,
    comUnidade(resumo.potenciaKwp, "kWp"),
    resumo.tipoLigacao,
    resumo.unidadeConsumidora && `UC ${resumo.unidadeConsumidora}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const resumoVenda = [obra.tecnico.kitNome, comUnidade(obra.tecnico.potenciaKwp, "kWp"), obra.tecnico.distribuidora].filter(Boolean).join(" · ");
  const equipe = (engenharia?.participantes ?? []).map((p) => `${p.nome} (${(p.principal ? `${p.funcaoRotulo} principal` : p.funcaoRotulo).toLowerCase()})`);

  // Oito passos (P6b): status de cada um pelos fatos da obra; os passos 2, 3, 5 e 7 pela confirmação registrada.
  const protocoloAprovado = protocolos.some((p) => p.status === "aprovado" || p.status === "orcamento_emitido" || p.status === "encerrado");
  const passos = montarPassosEngenharia({
    temResponsavel: (engenharia?.participantes ?? []).some((p) => p.principal),
    registros,
    enquadramento: enquadramento && { completo: enquadramentoCompleto(enquadramento), atualizadoEm: enquadramento.atualizadoEm },
    checklist,
    protocolos,
    vistoria: vistorias[0] ?? null,
    etapa: engenharia?.status ?? null,
    engenhariaConcluida: engenharia?.status === "concluido",
  });
  const atualPasso = passoAtual(passos);
  // O prazo mais apertado da obra (interno ou da distribuidora), se houver.
  const prazoMaisProximo = (prazos.get(resumo.id) ?? []).toSorted((a, b) => a.diasRestantes - b.diasRestantes)[0];
  const registro = (passo: PassoComRegistro) => (
    <RegistroPasso
      obraId={resumo.id}
      passo={passo}
      registro={registros[passo]}
      acoes={acoesPasso(passo, {
        status: passos[passo - 1].status,
        autorizacao: autorizacaoEngenharia,
        cancelada: resumo.situacao === "cancelada",
        enquadramentoCompleto: enquadramentoCompleto(enquadramento),
        checklistApto: pendentesChecklist === 0,
        protocoloAprovado,
      })}
    />
  );
  const tituloPasso = (n: number) => passos[n - 1].titulo;
  // Cascata: só o passo atual vem aberto; os que vêm depois dele e ainda não têm nada feito ficam apagados.
  const secao = (n: number) => ({
    aberto: atualPasso?.numero === n,
    futuro: atualPasso != null && n > atualPasso.numero && passos[n - 1].status === "a_fazer",
  });
  const semResposta = perguntasSemResposta(enquadramento);
  // Inversores do kit da venda, para conferir a potência no enquadramento.
  const inversoresKit = obra.tecnico.kit
    .filter((k) => /inversor/i.test(k.tipo))
    .map((k) => `${k.quantidade ?? 1} × ${k.descricao}`)
    .join("; ");
  // Histórico da Engenharia e do que é da obra toda; os outros setores ficam na tela de Obras.
  const historico = obra.historico.filter((h) => !h.setorRotulo || h.setorRotulo === ROTULO_SETOR.engenharia);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <Link href="/engenharia" className="w-fit text-sm text-zinc-600 hover:text-zinc-900">
        ‹ Engenharia
      </Link>

      <p className="sobretitulo -mb-2">Obras · Engenharia</p>
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
      <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {linhaObra && <span className="text-texto-2">{linhaObra}</span>}
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

      <CartaoRecolhivel titulo="Dados da venda" resumo={resumoVenda || "Kit, potência, equipamentos e cliente"}>
        <div className="flex flex-col gap-4">
          <DadosTecnicos tecnico={obra.tecnico} />
          {obra.contatoCliente && (
            <div className="flex flex-col gap-2 border-t border-linha pt-4">
              <p className="sobretitulo">Cliente</p>
              <ContatoCliente contato={obra.contatoCliente} />
            </div>
          )}
        </div>
      </CartaoRecolhivel>

      <Cartao titulo="Passos da Engenharia">
        <ResumoPassos
          passos={passos}
          atual={atualPasso}
          responsavel={engenharia?.participantes.find((p) => p.principal)?.nome ?? null}
          prazo={prazoMaisProximo ? seloPrazo(prazoMaisProximo) : null}
        />
      </Cartao>

      <SecaoPasso passo={passos[0]} titulo={tituloPasso(1)} {...secao(1)}>
        {/* Situação da Engenharia em poucas linhas; status, parada e equipe se mudam em "Atualizar Engenharia". */}
        {engenharia ? (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <Selo>{engenharia.statusRotulo}</Selo>
              {engenharia.estado === "parado" && <Selo tom="atencao">{ROTULO_ESTADO_SETOR.parado}</Selo>}
              {engenharia.aguardando && engenharia.estado !== "concluido" && <span className="text-zinc-700">{engenharia.aguardando}</span>}
              {engenharia.statusDesde && <span className="text-xs text-zinc-500">desde {formatarDataHora(engenharia.statusDesde)}</span>}
            </p>
            {engenharia.paradoMotivo && <p className="text-zinc-700">Motivo da parada: {engenharia.paradoMotivo}</p>}
            <p className="text-zinc-700">Equipe: {equipe.length ? equipe.join(", ") : "ninguém ainda"}</p>
            {gestaoEngenharia && <GestaoSetor key={resumo.id} obraId={resumo.id} setor={engenharia} gestao={gestaoEngenharia} />}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">A Engenharia ainda não começou nesta obra.</p>
        )}
      </SecaoPasso>

      <SecaoPasso passo={passos[1]} titulo={tituloPasso(2)} {...secao(2)}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">{passos[1].ajuda}</p>
          <EnquadramentoEngenharia
            obraId={resumo.id}
            enquadramento={enquadramento}
            podeEditar={autorizacaoEngenharia !== null && resumo.situacao !== "cancelada"}
            kit={{ potenciaKwp: obra.tecnico.potenciaKwp, inversores: inversoresKit || null }}
          />
          {semResposta.length > 0 && semResposta.length < 9 && (
            <p className="text-sm text-zinc-600">Sem resposta: {semResposta.join(", ")}.</p>
          )}
          {registro(2)}
        </div>
      </SecaoPasso>

      <SecaoPasso passo={passos[2]} titulo={tituloPasso(3)} {...secao(3)}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600">{passos[2].ajuda} Kit, potência e equipamentos estão em &quot;Dados da venda&quot;, no topo.</p>
          {(obra.fixacao.podeEditar || obra.fixacao.atual || obra.tecnico.estruturaTelhado) && (
            <dl className="flex min-w-0 flex-col gap-2 text-sm">
              <dt className="text-xs text-zinc-500">Fixação do telhado</dt>
              {!obra.fixacao.podeEditar && <dd className="text-zinc-900">{obra.fixacao.atual?.nome ?? "Não definida"}</dd>}
              {obra.fixacao.podeEditar && (
                <dd>
                  <GestaoFixacao key={resumo.id} obraId={resumo.id} fixacao={obra.fixacao} podeConfigurar={atual.papel === "admin"} />
                </dd>
              )}
              {obra.tecnico.estruturaTelhado && <dd className="text-xs text-zinc-500">Informado na venda: {obra.tecnico.estruturaTelhado}</dd>}
            </dl>
          )}
          {registro(3)}
        </div>
      </SecaoPasso>

      <SecaoPasso passo={passos[3]} titulo={`${tituloPasso(4)}: checklist e documentos`} {...secao(4)}>
        <ChecklistEngenharia
          obraId={resumo.id}
          pasta={`${atual.empresaId}/${resumo.id}`}
          itens={checklist}
          autorizacao={autorizacaoEngenharia}
          cancelada={resumo.situacao === "cancelada"}
          veDocumentos={autorizacaoEngenharia !== null}
        />
      </SecaoPasso>

      <SecaoPasso passo={passos[4]} titulo={tituloPasso(5)} {...secao(5)}>
        <p className="mb-3 text-sm text-zinc-600">{passos[4].ajuda}</p>
        {registro(5)}
      </SecaoPasso>

      <SecaoPasso passo={passos[5]} titulo={`${tituloPasso(6)}: protocolo na concessionária`} {...secao(6)}>
        {autorizacaoEngenharia !== null ? (
          <ProtocolosEngenharia
            obraId={resumo.id}
            pasta={`${atual.empresaId}/${resumo.id}`}
            protocolos={protocolos}
            podeAgir={resumo.situacao !== "cancelada"}
            pendentesChecklist={pendentesChecklist}
          />
        ) : (
          <p className="text-sm text-zinc-500">O protocolo é visto por quem atua na Engenharia da obra.</p>
        )}
      </SecaoPasso>

      <SecaoPasso passo={passos[6]} titulo={tituloPasso(7)} {...secao(7)}>
        <p className="mb-3 text-sm text-zinc-600">{passos[6].ajuda}</p>
        {registro(7)}
      </SecaoPasso>

      <SecaoPasso passo={passos[7]} titulo={`${tituloPasso(8)}: vistoria e conexão`} {...secao(8)}>
        {autorizacaoEngenharia !== null ? (
          <VistoriaEngenharia
            obraId={resumo.id}
            pasta={`${atual.empresaId}/${resumo.id}`}
            vistorias={vistorias}
            podeAgir={resumo.situacao !== "cancelada"}
            atuo={{ engenharia: true, operacional: atuaOperacional }}
            bloqueioPedido={bloqueioVistoria}
            admin={autorizacaoEngenharia === "admin"}
            engenhariaConcluida={engenharia?.status === "concluido"}
          />
        ) : (
          <p className="text-sm text-zinc-500">A vistoria é vista por quem atua na Engenharia ou no Operacional da obra.</p>
        )}
      </SecaoPasso>

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

      <CartaoRecolhivel titulo="Histórico" resumo={historico.length === 1 ? "1 registro" : `${historico.length} registros`}>
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
      </CartaoRecolhivel>
    </div>
  );
}
