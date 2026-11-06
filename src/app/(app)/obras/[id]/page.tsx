import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { CabecalhoPagina, CLASSE_ACAO_CABECALHO, CLASSE_VIDRO_CABECALHO, SeloCabecalho } from "@/components/cabecalho-pagina";
import { ModosObras } from "@/components/obras/modos-obras";
import { NavegacaoObras } from "@/components/obras/navegacao-obras";
import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora, formatarMoeda } from "@/lib/crm";
import { carregarObras } from "@/lib/obras/dados";
import { filtrosDeParams, hrefObra, montarNavegacao, queryDosFiltros, temFiltroAtivo } from "@/lib/obras/navegacao";
import { AjusteEntregaContratada, GestaoFixacao, GestaoMarco, GestaoSetor } from "./gestao";
import { CustosObraFicha } from "./custos";
import { PedidosCompraObra } from "./compras";
import { IniciarCompra } from "@/components/compras/acoes-pedido";
import { acessaCompras, carregarObraParaPedido, carregarPedidos } from "@/lib/compras/dados";
import { PagamentosFornecedores } from "./financeiro";
import { NotaFiscalCliente, PagamentoCliente } from "./financeiro-cliente";
import { AtrasosObra, EscalonamentosObra } from "./opr";
import { VistoriaEngenharia } from "@/components/engenharia/vistoria";
import { ResumoVistoria } from "@/components/engenharia/vistoria-resumo";
import { Campo, CartaoSetor, ContatoCliente, DadosTecnicos, ListaParticipantes, comUnidade } from "@/components/obras/detalhe-obra";
import { ListaTarefasSetor, NovaTarefaSetor } from "@/components/tarefas-setor";
import { carregarTarefasSetor } from "@/lib/tarefas-setor";
import { carregarSituacaoVistoria, carregarVistoriasEngenharia } from "@/lib/engenharia-vistoria";
import { carregarDetalheObra, type MarcoDetalheVM } from "@/lib/obras/detalhe";
import { carregarFinanceiroObra } from "@/lib/obras/financeiro";
import { resumoContas } from "@/lib/obras/financeiro-regras";
import {
  ROTULO_ALERTA_OBRA,
  ROTULO_SITUACAO_OBRA,
  type AlertaObra,
  type SituacaoObra,
} from "@/lib/obras/rotulos";
import { ESCALONAMENTO_OBRA, FINANCEIRO_OBRA, OBRAS, OPR_COMPLETA, pode } from "@/lib/permissoes";
import { ehCategoriaCusto, montarCustos, resultadoObra, type CategoriaCustoObra } from "@/lib/obras/custos";
import { prazosDaLinha, ROTULO_COR, semaforoObra, type CorSemaforo } from "@/lib/obras/semaforo";
import { COLUNAS_JUSTIFICATIVA, atrasosDaObra, justificativasPorEtapa } from "@/lib/obras/justificativas";
import { hojeEmSaoPaulo } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { carregarSubstituicoes } from "@/lib/substituicoes";
import { criarClienteServidor } from "@/lib/supabase/server";

type Tom = "neutro" | "positivo" | "negativo" | "atencao";
// Sem verde (reservado ao WhatsApp): "Concluída" fica neutra. Vermelho só para o que é perda/erro.
const TOM_SITUACAO: Record<SituacaoObra, Tom> = { em_andamento: "neutro", concluida: "neutro", pausada: "atencao", cancelada: "negativo" };
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const TOM_ALERTA: Record<AlertaObra, Tom> = { estorno: "negativo", venda_alterada: "atencao", parado: "atencao", aguardando: "neutro" };
// Exceção de cor das Obras (CLAUDE.md): verde `energia` no prazo, dourado para atenção, vermelho `erro` para atraso.
const TOM_COR: Record<CorSemaforo, Tom> = { verde: "positivo", amarela: "atencao", vermelha: "negativo" };
const COR_SEMAFORO: Record<CorSemaforo, string> = { verde: "#5cc796", amarela: "#d4af37", vermelha: "#f2867d" };

export default async function DetalheObra({ params, searchParams }: PageProps<"/obras/[id]">) {
  // Lista positiva (OBRAS): os quatro papéis comerciais e `operacao`. A RLS decide o que cada um vê.
  const { atual } = await exigirPapel(...OBRAS);
  const { id } = await params;
  const filtros = filtrosDeParams(await searchParams);
  const query = queryDosFiltros(filtros);

  const supabase = await criarClienteServidor();
  // A lista navegável é recalculada aqui, a cada obra: mesma empresa, mesma RLS, mesmos filtros.
  const [obra, lista, tarefasSetor, vistoria, vistorias, cronograma, orcamento, lancamentos, justificativasRes, escalonamentosRes, identidades, prazosRes, substituicoes, pedidosCompra, obraCompras, atuoEmCompras, orcamentosCompra] = await Promise.all([
    carregarDetalheObra(supabase, { empresaId: atual.empresaId, papel: atual.papel, obraId: id, membroId: atual.membroId }),
    carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel, comResponsaveis: false }),
    carregarTarefasSetor(supabase, { empresaId: atual.empresaId, membroId: atual.membroId, papel: atual.papel, obraId: id, filtro: "todas" }),
    carregarSituacaoVistoria(supabase, id),
    // Registros completos só para admin e quem atua em Engenharia ou no Operacional na obra (a RLS devolve vazio aos demais).
    carregarVistoriasEngenharia(supabase, { empresaId: atual.empresaId, obraId: id }),
    // Zero linhas para quem não vê a obra; cada linha repete a entrega contratada e a previsão do material.
    supabase.rpc("cronograma_obra", { p_obra_id: id }),
    // A RLS devolve orçamento e lançamentos só a quem vê os custos da obra (admin, gestor, Operacional dela).
    supabase.from("obra_orcamento").select("categoria, planejado").eq("obra_id", id),
    supabase.from("obra_custos").select("id, categoria, valor, ocorrido_em, descricao, estorna_id, created_at").eq("obra_id", id).order("created_at", { ascending: false }),
    supabase.from("obra_justificativas_atraso").select(COLUNAS_JUSTIFICATIVA).eq("obra_id", id),
    // Mesma visibilidade dos custos (admin, gestor, Operacional da obra).
    supabase
      .from("obra_escalonamentos")
      .select("id, titulo, valor, aberto_por, aberto_em, resolucao, fechado_por, fechado_em")
      .eq("obra_id", id)
      .order("aberto_em", { ascending: false }),
    supabase.rpc("identidade_membros", { p_empresa_id: atual.empresaId }),
    // Semáforo da faixa: os mesmos prazos em dias úteis da visão Completa.
    supabase.rpc("prazos_obras", { p_obra_ids: [id] }),
    // Onde sou o substituto do setor (responde a justificativa pedida ao principal).
    carregarSubstituicoes(supabase, atual.empresaId, atual.papel),
    // Pedidos de compra: quem atua em Compras na obra e quem vê os custos (RLS); o kit vendido, pela posição gravada.
    carregarPedidos(supabase, { empresaId: atual.empresaId, obraId: id }),
    carregarObraParaPedido(supabase, { papel: atual.papel, obraId: id }),
    acessaCompras(supabase, atual.empresaId, atual.papel),
    // Orçamentos em comparação (mesma visibilidade dos pedidos), para o link "Orçamentos e arquivos".
    supabase.from("compras_orcamentos").select("id", { count: "exact", head: true }).eq("obra_id", id).is("descartado_em", null),
  ]);
  if (!obra) notFound();
  for (const r of [justificativasRes, escalonamentosRes, identidades, prazosRes, orcamentosCompra]) if (r.error) throw r.error;
  const navegacao = montarNavegacao(lista.obras, filtros, id);

  const { resumo, gestao } = obra;
  const local = [resumo.cidade, resumo.uf].filter(Boolean).join("/");
  const gestaoDoSetor = (setor: string) => gestao?.setores.find((s) => s.setor === setor) ?? null;
  // Coordenar um setor (admin, gestor ou o coordenador) dá os prazos padrão dele; o Operacional, também a entrega.
  const coordena = (a: string | null | undefined) => a === "admin" || a === "coordenar";
  const coordenaOperacional = coordena(gestaoDoSetor("operacional")?.permissoes.autorizacao);
  const coordenaAlgum = (gestao?.setores ?? []).some((s) => coordena(s.permissoes.autorizacao));
  const etapas = cronograma.data ?? [];
  const custos = (orcamento.data ?? []).length
    ? montarCustos({
        orcamento: orcamento.data ?? [],
        lancamentos: lancamentos.data ?? [],
        etapasConcluidas: new Set(etapas.filter((e) => e.situacao === "concluida").map((e) => e.etapa)),
      })
    : null;
  const estornados = new Set((lancamentos.data ?? []).map((l) => l.estorna_id).filter(Boolean));
  const entrega = etapas[0] ? { contratada: etapas[0].entrega_contratada, prevista: etapas.at(-1)!.previsao_fim, material: etapas[0].entrega_material_prevista } : null;

  // Atrasos próprios de etapa (e etapas que já têm justificativa), na ordem do cronograma.
  const nomes = new Map((identidades.data ?? []).map((m) => [m.membro_id, m.nome]));
  const justificativas = justificativasPorEtapa(justificativasRes.data ?? [], nomes);
  const atrasos = atrasosDaObra({
    etapas,
    justificativas,
    membroId: atual.membroId,
    autorizacao: (setor) => gestaoDoSetor(setor)?.permissoes.autorizacao,
    substituo: (setor) => substituicoes.some((s) => s.obraId === id && s.setor === setor),
  });
  const cancelada = resumo.situacao === "cancelada";
  const hoje = hojeEmSaoPaulo();
  // Financeiro (contas a fornecedor, pagamento e NF do cliente): mesma visibilidade dos custos; a NF do cliente, sem o
  // Operacional. Escreve quem atua no Administrativo da obra (ou admin); a obra pausada também aceita.
  const autorizacaoAdministrativo = gestaoDoSetor("administrativo")?.permissoes.autorizacao ?? null;
  const financeiro = custos
    ? await carregarFinanceiroObra(supabase, {
        empresaId: atual.empresaId,
        obraId: id,
        podeVerNfCliente: atual.papel === "admin" || atual.papel === "gestor" || autorizacaoAdministrativo != null,
        nomes,
      })
    : null;
  const podeFinanceiro = autorizacaoAdministrativo != null && !cancelada;
  // Compras: escreve quem atua em Compras na obra (ou no setor que atende no lugar dele), o coordenador, o gestor ou o
  // admin; pedidos só depois do "Iniciar compra" e com a obra em andamento (o banco confere de novo).
  const autorizacaoCompras = gestaoDoSetor("compras")?.permissoes.autorizacao ?? null;
  const statusCompras = obra.setores.find((x) => x.setor === "compras")?.status ?? null;
  const emAndamento = resumo.situacao === "em_andamento";
  const podeIniciarCompra = statusCompras === "a_comprar" && emAndamento && (autorizacaoCompras != null || atuoEmCompras);
  const qtdOrcamentos = orcamentosCompra.count ?? 0;
  const mostrarPedidos = pedidosCompra.length > 0 || qtdOrcamentos > 0 || autorizacaoCompras != null;
  const resumoFinanceiro = financeiro ? resumoContas(financeiro.contas, hoje) : null;
  const escalonamentos = (escalonamentosRes.data ?? []).map((e) => ({
    id: e.id,
    titulo: e.titulo,
    valor: e.valor == null ? null : Number(e.valor),
    abertoPor: (e.aberto_por && nomes.get(e.aberto_por)) || "Usuário não identificado",
    abertoEm: e.aberto_em,
    resolucao: e.resolucao,
    fechadoPor: e.fechado_em ? (e.fechado_por && nomes.get(e.fechado_por)) || "Usuário não identificado" : null,
    fechadoEm: e.fechado_em,
  }));
  // Espelho da RPC: gestor, admin ou quem atua no Operacional da obra.
  const podeEscalonar =
    !cancelada && pode(atual.papel, ESCALONAMENTO_OBRA) && (atual.papel === "gestor" || gestaoDoSetor("operacional")?.permissoes.autorizacao != null);

  // Faixa: semáforo e margem pelas regras da Completa (orçamento todo zerado e nada lançado = sem orçamento; o motivo
  // é a justificativa respondida mais recente, senão a regra que deu a cor). Só para a obra em execução.
  const custosValidos = custos && (custos.planejado > 0 || custos.realizado > 0) ? custos : null;
  const margemPct = custosValidos && obra.valorVendido != null ? resultadoObra(obra.valorVendido, custosValidos, 0).margemProjetadaPct : null;
  const linhaPrazos = prazosRes.data?.[0];
  const semaforo =
    resumo.situacao === "em_andamento" && linhaPrazos
      ? semaforoObra({ prazos: prazosDaLinha(linhaPrazos), custos: custosValidos, margemProjetadaPct: margemPct, contasVencidas: resumoFinanceiro?.vencidas })
      : null;
  const ultimaJustificativa = [...(justificativasRes.data ?? [])]
    .filter((j) => j.texto && j.respondido_em)
    .sort((a, b) => (b.respondido_em ?? "").localeCompare(a.respondido_em ?? ""))[0]?.texto;
  const motivoSemaforo = semaforo && semaforo.cor !== "verde" ? (ultimaJustificativa ?? semaforo.motivo) : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: `/obras${query ? `?${query}` : ""}`, rotulo: temFiltroAtivo(filtros) ? "Obras · lista filtrada" : "Obras" }}
        sobretitulo={[`Obra nº ${resumo.numero}`, local].filter(Boolean).join(" · ")}
        titulo={[resumo.clienteNome, comUnidade(resumo.potenciaKwp, "kWp")].filter(Boolean).join(" · ")}
        selos={
          <>
            {semaforo ? (
              <SeloCabecalho tom={TOM_COR[semaforo.cor]}>
                <span className="size-2 rounded-full" style={{ background: COR_SEMAFORO[semaforo.cor] }} aria-hidden />
                {ROTULO_COR[semaforo.cor]}
                {motivoSemaforo && <> · {motivoSemaforo}</>}
              </SeloCabecalho>
            ) : (
              <SeloCabecalho tom={TOM_SITUACAO[resumo.situacao]}>{ROTULO_SITUACAO_OBRA[resumo.situacao]}</SeloCabecalho>
            )}
            {entrega && resumo.situacao !== "concluida" && resumo.situacao !== "cancelada" && (
              <SeloCabecalho>Entrega prevista {dataBr(entrega.prevista).slice(0, 5)}</SeloCabecalho>
            )}
            {resumo.alertas.map((a) => (
              <SeloCabecalho key={a} tom={TOM_ALERTA[a]}>
                {ROTULO_ALERTA_OBRA[a]}
              </SeloCabecalho>
            ))}
          </>
        }
        acoes={
          <>
            <NavegacaoObras navegacao={navegacao} atualId={id} base="/obras" query={query} escuro />
            <ModosObras modo="gestao" hrefGestao={hrefObra("/obras", id, query)} hrefApresentacao={hrefObra("/obras/apresentacao", id, query)} escuro />
            {resumo.negocioId && (
              <Link href={`/negocios/${resumo.negocioId}`} className={CLASSE_VIDRO_CABECALHO}>
                Ver negócio
              </Link>
            )}
            {!cancelada && (
              <a href="#tarefas-setor" className={CLASSE_ACAO_CABECALHO}>
                <Plus size={16} aria-hidden />
                Pedir ao setor
              </a>
            )}
          </>
        }
        valor={
          obra.valorVendido != null && (
            <>
              {formatarMoeda(obra.valorVendido)}
              <span className="block font-sans text-xs tracking-normal text-offwhite/65">
                valor vendido{margemPct != null && <> · margem projetada {margemPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</>}
              </span>
            </>
          )
        }
      />

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

      {entrega && (
        <Cartao titulo="Entrega ao cliente">
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Campo rotulo="Entrega contratada">{dataBr(entrega.contratada)}</Campo>
              <Campo rotulo="Entrega prevista">{dataBr(entrega.prevista)}</Campo>
            </dl>
            {/* Quem coordena o Operacional ajusta (admin, gestor ou o coordenador; 20261124100000). */}
            {coordenaOperacional && resumo.situacao !== "cancelada" && (
              <AjusteEntregaContratada key={resumo.id} obraId={resumo.id} data={entrega.contratada} />
            )}
            {/* Os outros coordenadores chegam aos prazos padrão do seu setor por aqui (o ajuste já tem o atalho). */}
            {!coordenaOperacional && coordenaAlgum && (
              <Link href="/configuracoes/prazos-obras" className="w-fit text-xs text-zinc-600 underline hover:text-zinc-900">
                Prazos padrão das etapas
              </Link>
            )}
          </div>
        </Cartao>
      )}

      {custos && (
        <Cartao titulo="Custos da obra">
          <CustosObraFicha
            key={resumo.id}
            obraId={resumo.id}
            custos={custos}
            lancamentos={(lancamentos.data ?? [])
              .filter((l) => ehCategoriaCusto(l.categoria))
              .map((l) => ({
                id: l.id,
                categoria: l.categoria as CategoriaCustoObra,
                valor: Number(l.valor),
                data: l.ocorrido_em,
                descricao: l.descricao,
                estornaId: l.estorna_id,
                estornado: estornados.has(l.id),
              }))}
            podeAjustar={pode(atual.papel, FINANCEIRO_OBRA) && resumo.situacao !== "cancelada"}
            podeLancar={(gestaoDoSetor("operacional")?.permissoes.autorizacao != null || autorizacaoAdministrativo != null) && !cancelada}
            hoje={hoje}
          />
        </Cartao>
      )}

      {financeiro && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Cartao titulo="Pagamentos a fornecedores">
            <PagamentosFornecedores
              key={resumo.id}
              obra={{ obraId: resumo.id, empresaId: atual.empresaId }}
              contas={financeiro.contas}
              planejado={custos?.planejado ?? null}
              podeEscrever={podeFinanceiro}
              hoje={hoje}
              fornecedores={financeiro.fornecedores}
            />
          </Cartao>
          <div className="flex flex-col gap-4">
            {financeiro.cliente?.situacao && (
              <Cartao titulo="Pagamento do cliente">
                <PagamentoCliente cliente={financeiro.cliente} />
              </Cartao>
            )}
            {financeiro.nfCliente && (
              <Cartao titulo="Nota fiscal do cliente">
                <NotaFiscalCliente key={resumo.id} obra={{ obraId: resumo.id, empresaId: atual.empresaId }} nf={financeiro.nfCliente.nf} podeAnexar={podeFinanceiro} />
              </Cartao>
            )}
          </div>
        </div>
      )}

      {mostrarPedidos && (
        <div id="pedidos-compra" className="scroll-mt-4">
          <Cartao titulo="Pedidos de compra">
            <PedidosCompraObra
              obra={{ obraId: resumo.id, empresaId: atual.empresaId }}
              pedidos={pedidosCompra}
              kit={obraCompras?.kit ?? []}
              podeEscrever={autorizacaoCompras != null && emAndamento}
              podeNovoPedido={autorizacaoCompras != null && emAndamento && statusCompras != null && statusCompras !== "a_comprar"}
              hoje={hoje}
              qtdOrcamentos={qtdOrcamentos}
            />
          </Cartao>
        </div>
      )}

      {atrasos.length > 0 && (
        <div id="atrasos" className="scroll-mt-4">
          <Cartao titulo="Atrasos e justificativas">
            <AtrasosObra key={resumo.id} obraId={resumo.id} atrasos={atrasos} podePedir={pode(atual.papel, OPR_COMPLETA) && !cancelada} />
          </Cartao>
        </div>
      )}

      {/* Escalonamentos: mesma visibilidade dos custos. */}
      {custos && (
        <div id="escalonamentos" className="scroll-mt-4">
          <Cartao titulo="Escalonamentos">
            <EscalonamentosObra key={resumo.id} obraId={resumo.id} itens={escalonamentos} podeEscalonar={podeEscalonar} />
          </Cartao>
        </div>
      )}

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
                {/* Vistoria: quem atua no Operacional registra o agendamento, a vistoria feita em campo e a correção de
                    campo; quem só vê a obra acompanha a situação e as datas. */}
                {s.setor === "operacional" &&
                  (g?.permissoes.autorizacao ? (
                    <VistoriaEngenharia
                      key={resumo.id}
                      obraId={resumo.id}
                      pasta={`${atual.empresaId}/${resumo.id}`}
                      vistorias={vistorias}
                      podeAgir={resumo.situacao !== "cancelada"}
                      // Aqui só a parte do Operacional; pedido, resultado, medidor e conexão ficam no card da Engenharia.
                      atuo={{ engenharia: false, operacional: true }}
                      bloqueioPedido={null}
                      admin={false}
                      engenhariaConcluida={obra.setores.find((x) => x.setor === "engenharia")?.status === "concluido"}
                    />
                  ) : (
                    vistoria && <ResumoVistoria situacao={vistoria} />
                  ))}
                {s.setor === "compras" && podeIniciarCompra && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-texto-2">
                      {atual.papel === "operacao"
                        ? "Ao iniciar, você vira o responsável de Compras nesta obra (se ainda não houver) e vai buscar os orçamentos."
                        : "Ao iniciar, Compras desta obra passa a Em cotação."}
                    </p>
                    <IniciarCompra key={resumo.id} obraId={resumo.id} />
                  </div>
                )}
                {s.setor === "administrativo" && resumoFinanceiro && resumoFinanceiro.total > 0 && (
                  <p className="text-xs text-texto-2">
                    {resumoFinanceiro.pagas} de {resumoFinanceiro.total} {resumoFinanceiro.total === 1 ? "pagamento a fornecedor pago" : "pagamentos a fornecedores pagos"}
                  </p>
                )}
                {g && (
                  <GestaoSetor
                    key={resumo.id}
                    obraId={resumo.id}
                    setor={s}
                    gestao={g}
                    previsaoMaterial={s.setor === "compras" && entrega ? { data: entrega.material } : undefined}
                  />
                )}
              </CartaoSetor>
            );
          })}
        </div>
      </section>

      <div id="tarefas-setor" className="scroll-mt-4">
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
      </div>

      <Cartao titulo="Marcos">
        <ul className="flex flex-col gap-3 text-sm">
          {obra.marcos.map((m) => (
            <ItemMarco key={m.marco} marco={m}>
              {gestao?.marcosAtualizaveis.includes(m.marco) && <GestaoMarco key={resumo.id} obraId={resumo.id} marco={m} />}
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
