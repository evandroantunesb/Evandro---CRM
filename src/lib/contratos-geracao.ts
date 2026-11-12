import "server-only";
import { mensagemPendenciasDocumentos, pendenciasDocumentosContrato } from "@/lib/documentos-cliente";
import {
  camposSemDado,
  contratoProntoParaCliente,
  marcadoresPendentes,
  montarDadosContrato,
  preencherModeloContrato,
  validarModeloContrato,
  type FontesContrato,
} from "@/lib/contrato";
import { calculoEhIncompleto, calculoEhLegado, carregarVigencia, mensagemDeRecusa, motivosDaAcao } from "@/lib/calculo-vigencia";
import { MENSAGEM_PRECO_DESATUALIZADO, precoDoCalculoDesatualizado } from "@/lib/calculo-preco";
import { mensagemPendenciasContrato, pendenciasDadosContrato, type DadosClienteContrato } from "@/lib/dados-cliente-contrato";
import { mensagemErro } from "@/lib/erros";
import type { CondicaoRegistrada } from "@/lib/condicao-escolhida";
import { carregarEscolhaCondicao, carregarRegrasCondicoes } from "@/lib/condicoes-pagamento-dados";
import { pendenciaValorNegocio } from "@/lib/condicoes-pagamento-proposta";
import { formatarMoeda, hojeEmSaoPaulo } from "@/lib/formatacao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { ResultadoAcao, StatusContrato } from "@/lib/tipos";

/**
 * Núcleo da geração e da mudança de status do contrato. O cliente vem por parâmetro (as ações
 * em `@/lib/acoes/contratos` cuidam de sessão, papel e revalidação; os testes de banco chamam
 * direto com o cliente de cada usuário). Tudo sob a RLS de quem chama.
 */

/**
 * Gera (ou regera, enquanto ainda for rascunho) o contrato do negócio a partir do modelo da empresa. Com a última
 * proposta por modalidade dentro da validade, exige a condição que o cliente escolheu (`condicao`, id da opção): o
 * contrato cita a condição e o valor do negócio passa ao que a regra da empresa define, na mesma transação
 * (`gerar_contrato_com_condicao`; negócio ganho só por admin ou gestor, como correção de valor).
 */
export async function gerarContratoComCliente(
  supabase: SupabaseServidor,
  {
    empresaId,
    negocioId,
    condicao = null,
    agora = new Date(),
  }: {
    empresaId: string;
    /** Mantido por compatibilidade; o autor do contrato vem do banco (`meu_membro_id`). */
    membroId: string;
    negocioId: string;
    condicao?: string | null;
    agora?: Date;
  },
): Promise<NonNullable<ResultadoAcao>> {
  const [{ data: modelo }, { data: negocio }, { data: calculo }, { data: itensKit }, { data: empresa }, { data: existente }, { data: identidades }, { data: anexos }] =
    await Promise.all([
      supabase.from("modelos_contrato").select("conteudo").eq("empresa_id", empresaId).maybeSingle(),
      supabase
        .from("negocios")
        .select(
          "titulo, numero, valor, unidade_consumidora, qualif_distribuidora, consumo_medio_kwh, responsavel_id, contatos(tipo, nome, documento, rg, data_nascimento, inscricao_estadual, endereco, cep, logradouro, numero, bairro, cidade, uf, email, telefone, telefone2)",
        )
        .eq("id", negocioId)
        .maybeSingle(),
      supabase
        .from("calculos_solares")
        .select("kit_nome, kit_potencia_kwp, kit_preco, tipo_ligacao, consumo_medio_kwh, geracao_estimada_kwh_mes, estado_financeiro")
        .eq("negocio_id", negocioId)
        .maybeSingle(),
      supabase.from("kit_componentes").select("tipo, descricao, quantidade, potencia_w").eq("negocio_id", negocioId).order("ordem"),
      supabase.from("empresas").select("nome, cnpj").eq("id", empresaId).maybeSingle(),
      supabase.from("contratos").select("id, status").eq("negocio_id", negocioId).maybeSingle(),
      // Nome do vendedor responsável (só nome; nunca e-mail ou telefone).
      supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
      // Documentos do cliente anexados no negócio (só as categorias).
      supabase.from("anexos").select("categoria").eq("negocio_id", negocioId),
    ]);
  if (!modelo?.conteudo.trim()) return { ok: false, mensagem: "Cadastre o modelo de contrato em Configurações antes." };
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };
  if (existente && existente.status !== "rascunho") {
    return { ok: false, mensagem: "Este contrato já saiu do rascunho — o texto não muda mais automaticamente." };
  }
  const { escolha, erro: erroEscolha } = await carregarEscolhaCondicao(supabase, empresaId, negocioId, hojeEmSaoPaulo(agora.getTime()));
  if (erroEscolha) return { ok: false, mensagem: "Não foi possível ler a proposta do negócio. Tente de novo." };
  const opcao = escolha?.opcoes.find((o) => o.id === condicao) ?? null;
  if (escolha && !condicao) return { ok: false, mensagem: "Marque a condição de pagamento que o cliente escolheu." };
  if (escolha && !opcao) return { ok: false, mensagem: "A condição marcada não está na proposta atual. Atualize a página e marque de novo." };
  // Sem proposta por modalidade, o contrato usa o valor atual do negócio: o desconto sobre o preço sugerido passa pela
  // mesma regra da emissão da proposta (Compras P4c). Com proposta, as condições já foram conferidas na emissão.
  if (!escolha && negocio.valor != null && negocio.valor > 0) {
    const regras = await carregarRegrasCondicoes(supabase, empresaId, negocioId);
    if (!regras) return { ok: false, mensagem: "Não foi possível conferir o desconto do negócio. Tente de novo." };
    const pendenciaDesconto = pendenciaValorNegocio(negocio.valor, regras);
    if (pendenciaDesconto) return { ok: false, mensagem: pendenciaDesconto };
  }
  // Com condição, o valor parte sempre do preço da proposta (trocar de condição não acumula desconto).
  const valorContrato = opcao ? opcao.valorNegocio : negocio.valor;
  const precoReferencia = escolha ? escolha.emissao.preco : negocio.valor;
  // O contrato usa o valor atual do negócio e a proposta, o preço do cálculo: com os dois diferentes, não gera.
  // Com cálculo legado (fórmula antiga) a proposta não mostra preço nenhum e "Atualizar preço" é recusado: a guarda
  // não protege nada e só travaria o contrato, que segue usando o valor atual do negócio (decisão de Nora, M2-B8).
  // O mesmo vale para o resultado técnico incompleto (sem parte financeira, nunca entra em proposta).
  const legado = !!calculo && (calculoEhLegado(calculo) || calculoEhIncompleto(calculo));
  if (calculo && !legado && precoDoCalculoDesatualizado(calculo.kit_preco, precoReferencia)) {
    return { ok: false, mensagem: MENSAGEM_PRECO_DESATUALIZADO };
  }
  // Potência, consumo e geração do contrato vêm do cálculo: só gera se o que os determina continua valendo (kit,
  // preço, produtividade, consumo/fatura). `legado` (fórmula financeira antiga) e os parâmetros financeiros NÃO
  // afetam o contrato e são ignorados. Falha ao conferir nunca vale como vigente.
  if (calculo) {
    const lido = await carregarVigencia(supabase, negocioId);
    if (!lido.ok) return { ok: false, mensagem: "Não foi possível conferir o cálculo. Tente de novo." };
    const motivos = lido.calculo ? motivosDaAcao(lido.vigencia.motivos, "contrato").filter((m) => !(legado && m === "preco")) : [];
    if (motivos.length) return { ok: false, mensagem: mensagemDeRecusa(motivos, "contrato") };
  }
  // Modelo salvo antes da validação pode ter campo desconhecido: não gera.
  const validacao = validarModeloContrato(modelo.conteudo);
  if (validacao.desconhecidos.length || validacao.chavesSoltas) {
    return { ok: false, mensagem: "O modelo de contrato tem campos inválidos. Peça ao admin para corrigir em Configurações." };
  }

  const dados = montarDadosContrato({
    empresa,
    negocio: { ...negocio, valor: valorContrato },
    contato: negocio.contatos as unknown as FontesContrato["contato"],
    calculo,
    itensKit: itensKit ?? [],
    vendedorNome: (identidades ?? []).find((m) => m.membro_id === negocio.responsavel_id)?.nome ?? null,
    condicaoPagamento: opcao?.descricao ?? null,
    agora,
    formatarMoeda: (v) => formatarMoeda(v),
  });
  // Todo campo usado no modelo precisa de dado: o contrato não sai com "—" no lugar de informação.
  const faltando = camposSemDado(modelo.conteudo, dados);
  if (faltando.length) return { ok: false, mensagem: `Para gerar o contrato, preencha: ${faltando.join(", ")}.` };

  const conteudoPreenchido = preencherModeloContrato(modelo.conteudo, dados);
  if (!contratoProntoParaCliente(conteudoPreenchido)) {
    return { ok: false, mensagem: `O contrato ficaria com campos sem resolver: ${marcadoresPendentes(conteudoPreenchido).join(", ") || "chaves sem par"}.` };
  }

  // Dados do cliente obrigatórios, além dos que o modelo usa (a mesma regra trava o contrato no banco, ver
  // `pendencias_contrato_contato`). Por último: as recusas que já existiam continuam com a mesma mensagem.
  const pendencias = pendenciasDadosContrato(negocio.contatos as unknown as DadosClienteContrato | null);
  if (pendencias.length) return { ok: false, mensagem: mensagemPendenciasContrato(pendencias) };
  const tipoCliente = (negocio.contatos as unknown as { tipo: string | null } | null)?.tipo;
  const faltam = pendenciasDocumentosContrato((anexos ?? []).map((a) => a.categoria), tipoCliente);
  if (faltam.length) return { ok: false, mensagem: mensagemPendenciasDocumentos(faltam) };

  const registrada: CondicaoRegistrada | null =
    escolha && opcao
      ? {
          emissaoId: escolha.emissao.id,
          versao: escolha.emissao.versao,
          opcao: opcao.id,
          modalidade: opcao.modalidade,
          descricao: opcao.descricao,
          precoProposta: escolha.emissao.preco,
          valorNegocio: opcao.valorNegocio,
          base: opcao.base,
        }
      : null;
  // Texto, condição e valor do negócio na mesma transação (o banco confere rascunho, RLS e negócio ganho).
  const { error } = await supabase.rpc("gerar_contrato_com_condicao", {
    p_negocio_id: negocioId,
    p_conteudo: conteudoPreenchido,
    p_condicao: registrada,
    // Sem condição o banco ignora o valor (o negócio fica como está).
    p_valor: registrada ? registrada.valorNegocio : 0,
    p_motivo: registrada ? `Condição escolhida pelo cliente: ${registrada.descricao}` : "",
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível gerar o contrato.") };
  return { ok: true, mensagem: "Contrato pronto." };
}

/**
 * Muda o status; enviar para assinatura ou marcar assinado só com o texto completo (contrato antigo pode ter sobra).
 * Só devolve sucesso com a gravação COMPROVADA: o UPDATE devolve a linha e ela precisa vir com o
 * status pedido. Sem linha (sem acesso pela RLS ou contrato inexistente) ou com outro status, é erro —
 * nunca "Status atualizado." sem o banco ter mudado.
 */
export async function atualizarStatusContratoComCliente(
  supabase: SupabaseServidor,
  { membroId, negocioId, status }: { membroId: string; negocioId: string; status: StatusContrato },
): Promise<NonNullable<ResultadoAcao>> {
  const { data: contrato, error: erroLeitura } = await supabase
    .from("contratos")
    .select("conteudo")
    .eq("negocio_id", negocioId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, mensagem: mensagemErro(erroLeitura, "Não foi possível ler o contrato.") };
  if (!contrato) return { ok: false, mensagem: "Contrato não encontrado." };
  if (status !== "rascunho" && !contratoProntoParaCliente(contrato.conteudo)) {
    return { ok: false, mensagem: "O contrato tem campos sem resolver. Corrija o modelo e gere o contrato de novo." };
  }
  const { data: gravados, error } = await supabase
    .from("contratos")
    .update({ status, atualizado_por: membroId })
    .eq("negocio_id", negocioId)
    .select("id, status");
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar o status.") };
  if (!gravados || gravados.length !== 1 || gravados[0].status !== status) {
    return { ok: false, mensagem: "Não foi possível salvar o status: sem permissão para este contrato ou contrato não encontrado." };
  }
  return { ok: true, mensagem: "Status atualizado." };
}
