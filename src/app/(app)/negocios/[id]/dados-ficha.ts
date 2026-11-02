import { carregarDescontoNegocio } from "@/lib/descontos";
import type { Vinculo } from "@/lib/sessao";
import { notFound } from "next/navigation";
import { carregarTarefasSetor } from "@/lib/tarefas-setor";
import { eletropostoDisponivel } from "@/lib/eletroposto-servidor";
import { conferirArquivos } from "@/lib/anexos-servidor";
import { carregarConfiguracao } from "@/lib/crm";
import { precoDoCalculoDesatualizado } from "@/lib/calculo-preco";
import { calculoEhIncompleto, calculoEhLegado, carregarVigencia, ENTRADAS_NAO_VERIFICAVEIS, MENSAGEM_PROPOSTA_ECONOMIA_INDISPONIVEL, mensagemDeRecusa, motivosDaAcao, type MotivoDesatualizacao } from "@/lib/calculo-vigencia";
import { carregarContextoEstimativa } from "@/lib/contexto-estimativa";
import { mensagemPropostaIncompleta, pendenciasSemDados } from "@/lib/estimativa-financeira";
import { PEDIDOS_AOS_SETORES, PROPOSTA_E_CONTRATO, pode } from "@/lib/permissoes";
import { listarEmissoesDoNegocio } from "@/lib/propostas/emissoes-dados";
import { extrairConteudoDoModelo, validadePadraoDaEmpresa, produtividadeConfirmada } from "@/lib/propostas/proposta-simples";
import { avisarSchemaAusente, funcaoAusente, tabelaAusente } from "@/lib/schema-ausente";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cartaoFechamento } from "@/lib/venda";
import { type StatusContrato, type StatusPagamentoContrato } from "@/lib/tipos";
import { type DadosClienteFicha } from "./dados-cliente";
import { pendenciasDadosContrato } from "@/lib/dados-cliente-contrato";
import { type SituacaoRegistro } from "./pagamento-solo";
import { carregarTemperaturas } from "@/lib/temperatura";

/**
 * Tudo o que a ficha do negócio lê do banco e o que deriva disso, sem JSX: a página e cada aba usam a sua parte.
 * A RLS decide o que chega; as permissões de tela seguem as mesmas regras de antes da divisão.
 */
export async function carregarFicha(atual: Vinculo, id: string, abaParam: string | string[] | undefined) {
  const supabase = await criarClienteServidor();

  const [{ data: negocio }, config, { data: parametros }] = await Promise.all([
    supabase
      .from("negocios")
      .select(
        "id, empresa_id, tipo, numero, titulo, valor, descricao, status, arquivado_em, arquivado_por, motivo_arquivamento, funil_id, etapa_id, origem_id, responsavel_id, motivo_perda_id, motivo_perda_detalhe, fechado_em, created_at, updated_at, tipo_telhado, unidade_consumidora, padrao_cliente, estrutura_telhado, consumo_medio_kwh, consumo_estimado_kwh, tarifa_efetiva_kwh, valor_conta_energia, fechamento_previsto, qualif_tipo_cliente, qualif_possui_conta_energia, qualif_distribuidora, qualif_imovel_proprio, qualif_objetivo, qualif_prazo_instalacao, qualif_busca_financiamento, qualif_orcamento_outra_empresa, qualif_e_decisor, qualif_outro_decisor, qualif_participantes_decisao, qualif_observacoes, contatos(id, nome, tipo, telefone, email, endereco, cidade, uf, documento, rg, data_nascimento, inscricao_estadual, cep, logradouro, numero, bairro, complemento)",
      )
      .eq("id", id)
      .maybeSingle(),
    carregarConfiguracao(atual.empresaId),
    supabase.from("parametros_calculadora").select("*").eq("empresa_id", atual.empresaId).maybeSingle(),
  ]);
  if (!negocio) notFound();
  const temperatura = (await carregarTemperaturas(supabase, [negocio.id])).get(negocio.id) ?? null;

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
        .select("id, nome, tamanho, categoria, enviado_por, created_at, caminho")
        .eq("negocio_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("negocio_etiquetas").select("etiqueta_id").eq("negocio_id", id),
      supabase
        .from("calculos_solares")
        .select(
          "id, kit_nome, kit_potencia_kwp, kit_preco, tipo_ligacao, consumo_medio_kwh, valor_fatura_medio, tarifa_kwh, geracao_estimada_kwh_mes, economia_mensal, payback_meses, observacoes, estado_financeiro, conta_sem_solar, conta_com_solar, kwh_compensado, kwh_nao_compensado, custo_fio_b, tarifa_base_tributaria, tarifa_origem, distribuidora, fio_b_rs_mwh, percentual_legal_fio_b, fio_b_vigencia_inicio, fio_b_vigencia_fim, disponibilidade_kwh, data_referencia, ressalvas",
        )
        .eq("negocio_id", id)
        .maybeSingle(),
    ]);

  // Confere a pasta no Storage: arquivo que chegou sem registro (envio parou no meio) e registro
  // sem arquivo. Se não der para conferir, a ficha diz isso em vez de esconder a pendência.
  const conferencia = await conferirArquivos(supabase, negocio.empresa_id, id, anexos ?? []);
  const semArquivo = conferencia.conferido ? conferencia.semArquivo : new Set<string>();

  const { data: componentes } = await supabase
    .from("kit_componentes")
    .select("tipo, descricao, potencia_w, quantidade")
    .eq("negocio_id", id)
    .order("ordem");

  // Eletroposto: a ficha troca as abas "Sistema" e "Proposta e contrato" pela aba do eletroposto. O SDR também tem
  // a aba, mas a RLS só lhe mostra o registro sem modelos (sem proposta); a proposta existe quando há modelos.
  const ehEletroposto = negocio.tipo === "eletroposto";
  const { data: eletroposto } = ehEletroposto
    ? await supabase.from("negocios_eletroposto").select("token, modelos, precos, local_proprio, usina_fv, emitida_em").eq("negocio_id", id).maybeSingle()
    : { data: null };
  const propostaEletroposto = !!eletroposto && eletroposto.modelos.length > 0;

  // Outros negócios do mesmo cliente (ex.: usina e eletroposto), só os que quem consulta vê (RLS), e o atalho para
  // abrir mais um negócio para ele.
  const [{ data: outrosNegocios }, eletropostoNaEmpresa] = await Promise.all([
    supabase
      .from("negocios")
      .select("id, numero, titulo, tipo, status, arquivado_em")
      .eq("contato_id", negocio.contatos.id)
      .neq("id", negocio.id)
      .order("created_at", { ascending: false })
      .limit(10),
    eletropostoDisponivel(supabase, atual),
  ]);

  const { data: proposta } = await supabase
    .from("propostas")
    .select("id, token, modo_preco, mostrar_sistema, mostrar_economia")
    .eq("negocio_id", id)
    .maybeSingle();
  const { data: modelosProposta } = proposta
    ? { data: null }
    : await supabase.from("proposta_modelos").select("id, nome, padrao").eq("empresa_id", atual.empresaId).eq("status", "publicado").order("nome");
  // Emissões preservadas (proposta simples). Antes da migration (preview usa o banco de produção) a tabela não existe:
  // o card some em vez de quebrar a ficha.
  const emissoesRes = pode(atual.papel, PROPOSTA_E_CONTRATO) ? await listarEmissoesDoNegocio(supabase, id) : null;
  const emissoesAusente = emissoesRes ? tabelaAusente(emissoesRes.erro, "propostas_emissoes") : false;
  if (emissoesRes?.erro && emissoesAusente) avisarSchemaAusente("propostas_emissoes", emissoesRes.erro);
  else if (emissoesRes?.erro) throw new Error("Não foi possível ler as propostas emitidas.");
  const emissoes = emissoesRes?.emissoes ?? [];
  // Sugestão das condições de pagamento: texto do bloco "Condições comerciais" do modelo padrão publicado (só leitura).
  const { data: modeloPadrao } = emissoesRes && !emissoesAusente
    ? await supabase
        .from("proposta_modelos")
        .select("proposta_modelo_blocos(tipo, ativo, config)")
        .eq("empresa_id", atual.empresaId)
        .eq("status", "publicado")
        .eq("padrao", true)
        .maybeSingle()
    : { data: null };
  const conteudoModelo = extrairConteudoDoModelo(modeloPadrao?.proposta_modelo_blocos);
  // Validade definida por admin/gestor (Configurações › Validade da proposta). Sem a tabela (antes da migration, o
  // preview usa o banco de produção) ou sem linha, vale a do modelo padrão.
  const { data: preferenciaProposta } = emissoesRes && !emissoesAusente
    ? await supabase.from("proposta_preferencias").select("validade_dias").eq("empresa_id", atual.empresaId).maybeSingle()
    : { data: null };
  const validadePadraoDias = validadePadraoDaEmpresa(preferenciaProposta?.validade_dias, modeloPadrao?.proposta_modelo_blocos);
  const { data: parametrosEmissao } = emissoesRes && !emissoesAusente
    ? await supabase
        .from("parametros_calculadora")
        .select("produtividade_kwh_kwp_mes, produtividade_confirmada_valor, produtividade_confirmada_em, produtividade_confirmada_fonte, produtividade_confirmada_responsavel")
        .eq("empresa_id", atual.empresaId)
        .maybeSingle()
    : { data: null };
  const geracaoConfirmada = produtividadeConfirmada(parametrosEmissao) != null;
  const { data: aberturas } = proposta
    ? await supabase
        .from("propostas_aberturas")
        .select("aberta_em")
        .eq("proposta_id", proposta.id)
        .order("aberta_em", { ascending: false })
    : { data: null };

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, token, status, responsavel_assinatura_id")
    .eq("negocio_id", id)
    .maybeSingle();
  const { data: statusPagamento } = contrato
    ? await supabase.rpc("status_pagamento_contrato", { p_contrato_id: contrato.id })
    : { data: null };

  // Registro manual de pagamento do Solo (PR #186): por negócio, pode existir sem contrato. Só para
  // quem já vê contrato e pagamento; o SDR continua sem esses dados.
  const veContratoEPagamento = pode(atual.papel, PROPOSTA_E_CONTRATO);
  const [registrosRes, situacaoRes] = veContratoEPagamento
    ? await Promise.all([
        supabase
          .from("registros_pagamento")
          .select("id, data_recebimento, observacao, registrado_por_membro_id, registrado_em, substitui_id, estornado_em, estornado_por_membro_id, motivo_estorno")
          .eq("negocio_id", id)
          .order("registrado_em", { ascending: false }),
        supabase.rpc("situacao_registro_pagamento", { p_negocio_id: id }),
      ])
    : [null, null];
  // Só "tabela/função nova ainda não existe" vira fallback (preview antes da migration); qualquer outro
  // erro estoura em vez de virar "nenhum pagamento".
  const registroManualIndisponivel =
    tabelaAusente(registrosRes?.error, "registros_pagamento") || funcaoAusente(situacaoRes?.error, "situacao_registro_pagamento");
  for (const [res, ausente, objeto] of [
    [registrosRes, tabelaAusente(registrosRes?.error, "registros_pagamento"), "registros_pagamento"],
    [situacaoRes, funcaoAusente(situacaoRes?.error, "situacao_registro_pagamento"), "situacao_registro_pagamento"],
  ] as const) {
    if (!res?.error) continue;
    if (!ausente) throw res.error;
    avisarSchemaAusente(objeto, res.error);
  }
  const registrosPagamento = registrosRes?.data ?? null;
  const situacaoPagamentoSolo = (registroManualIndisponivel ? "indisponivel" : (situacaoRes?.data ?? "indisponivel")) as SituacaoRegistro;
  const registroPagamentoAtivo = (registrosPagamento ?? []).some((r) => r.estornado_em == null);
  // Cartão do Solo: quando dá para registrar, quando o banco explica por que não dá, ou quando há histórico.
  const mostrarPagamentoSolo = veContratoEPagamento && ((registrosPagamento ?? []).length > 0 || situacaoPagamentoSolo !== "indisponivel");
  // Confirmação do Pro: não aparece com registro ativo (o banco recusaria) nem para o admin único do Solo
  // diante de um contrato só "a confirmar" — no Solo, o caminho é o registro.
  const mostrarPagamentoPro =
    veContratoEPagamento &&
    !!contrato &&
    !!statusPagamento &&
    !registroPagamentoAtivo &&
    !(situacaoPagamentoSolo === "permitido" && statusPagamento === "pendente");

  const desconto = veContratoEPagamento ? await carregarDescontoNegocio(supabase, atual.empresaId, id) : null;

  const { data: ultimoHandoff } = await supabase
    .from("handoffs")
    .select("id, para_membro_id, de_membro_id, status, motivo_devolucao, created_at, qualificacao_snapshot, handoffs_feedback(feedback, autor_id)")
    .eq("negocio_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Botões de aceite/devolução só para quem o banco deixa responder: destinatário, admin ou
  // gestor de uma equipe ativa do destinatário (mesma regra de aceitar_handoff/devolver_handoff).
  const { data: podeResponderHandoff } =
    ultimoHandoff?.status === "pendente"
      ? await supabase.rpc("pode_responder_handoff", { p_handoff_id: ultimoHandoff.id })
      : { data: false };

  // Obra gerada por esta venda (a RLS decide se a pessoa a enxerga).
  const { data: obraDoNegocio } = await supabase.from("obras").select("id, numero").eq("negocio_id", negocio.id).maybeSingle();

  // Arquivado (P1a-0): somente leitura no banco; a ficha esconde as ações que seriam recusadas.
  const arquivado = negocio.arquivado_em != null;
  // Preço do cálculo x valor do negócio só importa para cálculo não legado: o legado não aparece como atual, a proposta
  // não mostra preço e o contrato usa o valor do negócio (mesma regra de contratos-geracao.ts).
  // Resultado técnico incompleto também fica de fora: não tem payback para atualizar com o preço.
  const precoDesatualizado =
    !!calculo && !calculoEhLegado(calculo) && !calculoEhIncompleto(calculo) && precoDoCalculoDesatualizado(calculo.kit_preco, negocio.valor);
  // Vigência do cálculo salvo: toda linha existente é legada (fórmula antiga, não validada) e nunca vale como resultado
  // atual. Falha de leitura também nunca vale como vigente: cai no motivo `legado`, que vale para toda linha hoje.
  const [carregamento, contextoEstimativa, { data: historicoCalculo }] = await Promise.all([
    calculo ? carregarVigencia(supabase, id) : Promise.resolve(null),
    // Mesmo contexto que o servidor usa ao salvar (data em São Paulo, qualificação, tarifas oficiais): a prévia é o que será gravado.
    carregarContextoEstimativa(supabase, { tipoCliente: negocio.qualif_tipo_cliente, distribuidoraInformada: negocio.qualif_distribuidora }),
    supabase
      .from("calculos_solares_historico")
      .select("arquivado_em, motivo, linha")
      .eq("negocio_id", id)
      .order("arquivado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const leituraOk = carregamento?.ok === true && carregamento.calculo != null;
  const motivosCalculo: MotivoDesatualizacao[] = !calculo
    ? []
    : carregamento?.ok === true && carregamento.calculo != null
      ? carregamento.vigencia.motivos
      : ["legado"];
  const vigenciaDaTela = calculo
    ? {
        motivos: motivosCalculo,
        naoVerificavel: carregamento?.ok === true && carregamento.calculo != null ? carregamento.vigencia.naoVerificavel : [...ENTRADAS_NAO_VERIFICAVEIS],
      }
    : null;
  // Mensagens de bloqueio (as mesmas que o servidor devolve). Proposta: sempre bloqueada hoje (sem linha = estimativa
  // incompleta; linha legada = fórmula antiga). Contrato: só o que o afeta (não bloqueia por `legado`); o preço tem aviso próprio.
  const motivosProposta = motivosDaAcao(motivosCalculo, "proposta");
  const bloqueioProposta = !calculo
    ? mensagemPropostaIncompleta(pendenciasSemDados())
    : motivosProposta.length > 0
      ? mensagemDeRecusa(motivosProposta, "proposta")
      : MENSAGEM_PROPOSTA_ECONOMIA_INDISPONIVEL;
  // Emissão da proposta simples: não usa o cálculo salvo (legado). Potência e geração saem do kit atual e da produtividade
  // da empresa; consumo e preço, do negócio. O servidor confere tudo de novo; aqui só o aviso mais comum.
  const bloqueioEmissao = (componentes ?? []).some((c) => c.tipo === "modulo" && c.potencia_w)
    ? null
    : "Cadastre ao menos um módulo com potência no kit do negócio antes de emitir.";
  const motivosContrato = motivosDaAcao(motivosCalculo, "contrato").filter((m) => m !== "preco");
  const bloqueioContrato = calculo && leituraOk && motivosContrato.length > 0 ? mensagemDeRecusa(motivosContrato, "contrato") : null;
  const responsavelAtual = config.membros.find((m) => m.id === negocio.responsavel_id);
  const responsavelInativo = negocio.responsavel_id != null && !responsavelAtual?.ativo;

  // Fechamento em 3 marcos: quem não pode ver contrato/pagamento (SDR) recebe só a situação.
  const cartao = cartaoFechamento(pode(atual.papel, PROPOSTA_E_CONTRATO), {
    negocio: negocio.status,
    contrato: contrato ? (contrato.status as StatusContrato) : "nao_gerado",
    pagamento: (statusPagamento as StatusPagamentoContrato | null) ?? null,
    registro: mostrarPagamentoSolo ? { ativo: registroPagamentoAtivo, disponivel: situacaoPagamentoSolo === "permitido" } : undefined,
  });

  const contato = negocio.contatos as unknown as DadosClienteFicha & { endereco: string | null };
  // Dados do cliente que faltam para o contrato (o servidor e o banco conferem de novo ao gerar).
  const pendenciasCliente = pendenciasDadosContrato(contato);
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

  // Abas da ficha (?aba=): cada uma mostra só o seu conteúdo. Proposta e contrato só para quem pode.
  const abas: { id: string; rotulo: string; contador?: number }[] = [
    { id: "visao", rotulo: "Negócio" },
    ...(ehEletroposto ? [] : [{ id: "sistema", rotulo: "Conta e sistema" }]),
    ...(ehEletroposto
      ? [{ id: "proposta", rotulo: "Eletroposto" }]
      : pode(atual.papel, PROPOSTA_E_CONTRATO)
        ? [{ id: "proposta", rotulo: "Proposta e contrato" }]
        : []),
    { id: "atividades", rotulo: "Atividades", contador: (tarefas ?? []).filter((t) => !t.concluida_em).length },
    { id: "arquivos", rotulo: "Arquivos", contador: anexos?.length ?? 0 },
  ];
  const aba = abas.find((a) => a.id === abaParam)?.id ?? "visao";
  // Pedidos aos setores (Compras, Engenharia, Operacional): só na aba Atividades, para não pesar as outras.
  const pedidosSetor =
    aba === "atividades" && pode(atual.papel, PEDIDOS_AOS_SETORES)
      ? await carregarTarefasSetor(supabase, { empresaId: atual.empresaId, membroId: atual.membroId, papel: atual.papel, negocioId: negocio.id, filtro: "todas" })
      : null;

  return {
    atual, negocio, config, parametros, temperatura, atividades, notas, tarefas, anexos, calculo, conferencia, semArquivo,
    componentes, ehEletroposto, eletroposto, propostaEletroposto, outrosNegocios, eletropostoNaEmpresa, proposta, modelosProposta,
    emissoesAusente, emissoes, conteudoModelo, validadePadraoDias, geracaoConfirmada, aberturas, contrato, statusPagamento,
    registroManualIndisponivel, registrosPagamento, situacaoPagamentoSolo, mostrarPagamentoSolo, mostrarPagamentoPro, ultimoHandoff,
    podeResponderHandoff, obraDoNegocio, arquivado, precoDesatualizado, vigenciaDaTela, contextoEstimativa, historicoCalculo,
    bloqueioProposta, bloqueioEmissao, bloqueioContrato, responsavelInativo, cartao, contato, pendenciasCliente, nomes, souAdmin,
    etiquetasMarcadas, etiquetasVisiveis, abas, aba, pedidosSetor, desconto,
  };
}

export type Ficha = Awaited<ReturnType<typeof carregarFicha>>;
