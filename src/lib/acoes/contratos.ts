"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatarMoeda } from "@/lib/formatacao";
import { mensagemErro } from "@/lib/erros";
import {
  contratoProntoParaCliente,
  essenciaisFaltando,
  marcadoresPendentes,
  montarDadosContrato,
  preencherModeloContrato,
  validarModeloContrato,
  type FontesContrato,
} from "@/lib/contrato";
import { exigirPapel } from "@/lib/sessao";
import { CONFIRMAR_PAGAMENTO, EDITAR_MODELO_CONTRATO, NEGOCIOS, PROPOSTA_E_CONTRATO, pode } from "@/lib/permissoes";
import { criarClienteServidor } from "@/lib/supabase/server";
import { STATUS_CONTRATO, type ResultadoAcao } from "@/lib/tipos";

export async function salvarModeloContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...EDITAR_MODELO_CONTRATO);
  const conteudo = z.string().max(20000, "Modelo muito longo").safeParse(formData.get("conteudo"));
  if (!conteudo.success) return { ok: false, mensagem: "Modelo inválido." };
  // Marcador desconhecido apareceria cru no contrato do cliente: recusa ao salvar.
  const validacao = validarModeloContrato(conteudo.data);
  if (validacao.desconhecidos.length) {
    return { ok: false, mensagem: `Campos desconhecidos no modelo: ${validacao.desconhecidos.join(", ")}. Use só os campos da lista.` };
  }
  if (validacao.chavesSoltas) return { ok: false, mensagem: "Há chaves {{ ou }} sem par no modelo. Confira os campos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("modelos_contrato")
    .upsert({ empresa_id: atual.empresaId, conteudo: conteudo.data, atualizado_por: atual.membroId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o modelo.") };

  revalidatePath("/configuracoes/contrato");
  return { ok: true, mensagem: "Modelo salvo." };
}

/** Gera (ou regera, enquanto ainda for rascunho) o contrato do negócio a partir do modelo da empresa. */
export async function gerarContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return { ok: false, mensagem: "SDR não pode gerar contrato (spec RAION_SDR_REGRAS_PERMISSOES §41)." };
  const id = z.string().uuid().safeParse(formData.get("negocioId"));
  if (!id.success) return { ok: false, mensagem: "Negócio inválido." };

  const supabase = await criarClienteServidor();
  const [{ data: modelo }, { data: negocio }, { data: calculo }, { data: itensKit }, { data: empresa }, { data: existente }, { data: identidades }] =
    await Promise.all([
      supabase.from("modelos_contrato").select("conteudo").eq("empresa_id", atual.empresaId).maybeSingle(),
      supabase
        .from("negocios")
        .select(
          "titulo, numero, valor, unidade_consumidora, qualif_distribuidora, consumo_medio_kwh, responsavel_id, contatos(nome, documento, endereco, cidade, uf, email, telefone, telefone2)",
        )
        .eq("id", id.data)
        .maybeSingle(),
      supabase
        .from("calculos_solares")
        .select("kit_nome, kit_potencia_kwp, tipo_ligacao, consumo_medio_kwh, geracao_estimada_kwh_mes")
        .eq("negocio_id", id.data)
        .maybeSingle(),
      supabase.from("kit_componentes").select("descricao, quantidade, potencia_w").eq("negocio_id", id.data).order("ordem"),
      supabase.from("empresas").select("nome, cnpj").eq("id", atual.empresaId).maybeSingle(),
      supabase.from("contratos").select("id, status").eq("negocio_id", id.data).maybeSingle(),
      // Nome do vendedor responsável (só nome; nunca e-mail ou telefone).
      supabase.rpc("identidade_membros", { p_empresa_id: atual.empresaId }),
    ]);
  if (!modelo?.conteudo.trim()) return { ok: false, mensagem: "Cadastre o modelo de contrato em Configurações antes." };
  if (!negocio) return { ok: false, mensagem: "Negócio não encontrado." };
  if (existente && existente.status !== "rascunho") {
    return { ok: false, mensagem: "Este contrato já saiu do rascunho — o texto não muda mais automaticamente." };
  }
  // Modelo salvo antes da validação pode ter campo desconhecido: não gera.
  const validacao = validarModeloContrato(modelo.conteudo);
  if (validacao.desconhecidos.length || validacao.chavesSoltas) {
    return { ok: false, mensagem: "O modelo de contrato tem campos inválidos. Peça ao admin para corrigir em Configurações." };
  }

  const dados = montarDadosContrato({
    empresa,
    negocio,
    contato: negocio.contatos as unknown as FontesContrato["contato"],
    calculo,
    itensKit: itensKit ?? [],
    vendedorNome: (identidades ?? []).find((m) => m.membro_id === negocio.responsavel_id)?.nome ?? null,
    agora: new Date(),
    formatarMoeda: (v) => formatarMoeda(v),
  });
  // Contrato sem identificar as partes ou o preço não vai para o cliente.
  const faltando = essenciaisFaltando(modelo.conteudo, dados);
  if (faltando.length) return { ok: false, mensagem: `Para gerar o contrato, preencha: ${faltando.join(", ")}.` };

  const conteudoPreenchido = preencherModeloContrato(modelo.conteudo, dados);
  if (!contratoProntoParaCliente(conteudoPreenchido)) {
    return { ok: false, mensagem: `O contrato ficaria com campos sem resolver: ${marcadoresPendentes(conteudoPreenchido).join(", ")}.` };
  }

  const { error } = await supabase.from("contratos").upsert(
    {
      empresa_id: atual.empresaId,
      negocio_id: id.data,
      conteudo: conteudoPreenchido,
      criado_por: atual.membroId,
      atualizado_por: atual.membroId,
    },
    { onConflict: "negocio_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível gerar o contrato.") };

  revalidatePath(`/negocios/${id.data}`);
  return { ok: true, mensagem: "Contrato pronto." };
}

const esquemaConfirmarPagamento = z.object({
  negocioId: z.string().uuid(),
  contratoId: z.string().uuid(),
});

/**
 * Confirma o pagamento do contrato (pedido do Evandro, 2026-10-01): só gestor/admin, e
 * nunca quem é o próprio responsável pelo negócio — tudo validado no RPC `security
 * definer` (a RLS de `contratos` sozinha não bastaria, ver migration
 * 20261001250000_gamificacao_pagamento_confirmado.sql).
 */
export async function confirmarPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, CONFIRMAR_PAGAMENTO)) return { ok: false, mensagem: "Só gestor ou admin pode confirmar pagamento." };
  const dados = esquemaConfirmarPagamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_pagamento", { p_contrato_id: dados.data.contratoId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível confirmar o pagamento.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Pagamento confirmado." };
}

const esquemaEstornarPagamento = esquemaConfirmarPagamento.extend({
  motivo: z.string().trim().min(1, "Informe o motivo do estorno.").max(1000),
});

export async function estornarConfirmacaoPagamento(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, CONFIRMAR_PAGAMENTO)) return { ok: false, mensagem: "Só gestor ou admin pode estornar a confirmação." };
  const dados = esquemaEstornarPagamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("estornar_confirmacao_pagamento", {
    p_contrato_id: dados.data.contratoId,
    p_motivo: dados.data.motivo,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível estornar a confirmação.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Confirmação de pagamento estornada." };
}

export async function atualizarStatusContrato(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel(...NEGOCIOS);
  if (!pode(atual.papel, PROPOSTA_E_CONTRATO)) return { ok: false, mensagem: "SDR não pode alterar o status do contrato (spec RAION_SDR_REGRAS_PERMISSOES §41)." };
  const dados = z
    .object({ negocioId: z.string().uuid(), status: z.enum(STATUS_CONTRATO) })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  // Enviar para assinatura ou marcar assinado só com o texto completo (contrato antigo pode ter sobra).
  if (dados.data.status !== "rascunho") {
    const { data: contrato } = await supabase.from("contratos").select("conteudo").eq("negocio_id", dados.data.negocioId).maybeSingle();
    if (contrato && !contratoProntoParaCliente(contrato.conteudo)) {
      return { ok: false, mensagem: "O contrato tem campos sem resolver. Corrija o modelo e gere o contrato de novo." };
    }
  }
  const { error } = await supabase
    .from("contratos")
    .update({ status: dados.data.status, atualizado_por: atual.membroId })
    .eq("negocio_id", dados.data.negocioId);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível atualizar o status.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Status atualizado." };
}
