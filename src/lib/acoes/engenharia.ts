"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CHAVES_PERGUNTA, respostaValida } from "@/lib/engenharia-enquadramento-regras";
import { ACOES_PASSO, ehPassoComRegistro } from "@/lib/engenharia-passos-regras";
import { CANAIS_PROTOCOLO, CATEGORIAS_EXIGENCIA, TIPOS_RESPOSTA, TIPOS_SOLICITACAO } from "@/lib/engenharia-protocolos-regras";
import { TIPOS_REGISTRO_VISTORIA } from "@/lib/engenharia-vistoria-regras";
import { mensagemErro } from "@/lib/erros";
import { ENGENHARIA } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ResultadoAcao } from "@/lib/tipos";

/**
 * Ações do checklist da Engenharia. Cada uma chama a RPC, que confere de novo quem pode (admin, coordenador da
 * Engenharia ou participante ativo dela), trava a obra e grava o histórico com o autor real.
 */

function revalidar(obraId: string) {
  revalidatePath("/engenharia");
  revalidatePath(`/engenharia/${obraId}`);
  revalidatePath(`/obras/${obraId}`);
}

const comObra = z.object({ obraId: z.string().uuid() });

/** Copia para a obra os itens ativos do modelo que ela ainda não tem. */
export async function aplicarChecklistEngenharia(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = comObra.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: "Obra inválida." };
  const supabase = await criarClienteServidor();
  const { data: novos, error } = await supabase.rpc("aplicar_checklist_engenharia", { p_obra_id: d.data.obraId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível aplicar o checklist.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: novos ? `${novos} ${novos === 1 ? "item entrou" : "itens entraram"} no checklist.` : "O checklist já está atualizado." };
}

/**
 * Registra um arquivo que o navegador já enviou à pasta da obra, como nova versão do item. A RPC confere a pasta, o
 * objeto (enviado por quem chama) e a autorização; tamanho e tipo vêm do Storage.
 */
export async function registrarDocumentoEngenharia(dados: { obraId: string; itemId: string; caminho: string; nome: string }): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = comObra
    .extend({ itemId: z.string().uuid(), caminho: z.string().min(1).max(400), nome: z.string().trim().min(1).max(200) })
    .safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_documento_engenharia", { p_item_id: d.data.itemId, p_caminho: d.data.caminho, p_nome: d.data.nome });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o arquivo.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Arquivo anexado." };
}

const esquemaAlterar = comObra.extend({
  itemId: z.string().uuid(),
  status: z.enum(["pendente", "valido", "invalido", "dispensado"]),
  motivo: z.string().trim().max(500, "Motivo muito longo (máximo 500 caracteres).").optional(),
});

/** Válido, inválido (motivo), não se aplica (motivo) ou de volta a pendente. */
export async function alterarItemEngenharia(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = esquemaAlterar.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("alterar_item_engenharia", {
    p_item_id: d.data.itemId,
    p_status: d.data.status,
    ...(d.data.motivo ? { p_motivo: d.data.motivo } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível alterar o item.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Item atualizado." };
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const vazioComoNada = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const esquemaProtocolo = comObra.extend({
  distribuidora: z.string().trim().min(2, "Informe a distribuidora.").max(60),
  canal: z.enum(CANAIS_PROTOCOLO, { error: "Escolha o canal." }),
  numero: z.string().trim().min(1, "Informe o número do protocolo.").max(60, "Número muito longo."),
  tipoSolicitacao: z.enum(TIPOS_SOLICITACAO, { error: "Escolha o tipo de solicitação." }),
  protocoladoEm: data,
  observacao: z.preprocess(vazioComoNada, z.string().trim().max(1000, "Observação muito longa.").optional()),
});

/** Resultado do registro: o evento criado, para o navegador anexar o comprovante. */
export type ResultadoEventoProtocolo = { ok: boolean; mensagem: string; eventoId?: string } | null;

/**
 * Registra o protocolo feito no portal da distribuidora. A RPC exige o checklist resolvido, guarda o pacote enviado e
 * leva a Engenharia para "Enviado à concessionária".
 */
export async function registrarProtocoloEngenharia(_: ResultadoEventoProtocolo, formData: FormData): Promise<ResultadoEventoProtocolo> {
  await exigirPapel(...ENGENHARIA);
  const d = esquemaProtocolo.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { data: protocoloId, error } = await supabase.rpc("registrar_protocolo_engenharia", {
    p_obra_id: d.data.obraId,
    p_distribuidora: d.data.distribuidora,
    p_canal: d.data.canal,
    p_numero: d.data.numero,
    p_tipo_solicitacao: d.data.tipoSolicitacao,
    p_protocolado_em: d.data.protocoladoEm,
    ...(d.data.observacao ? { p_observacao: d.data.observacao } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o protocolo.") };
  const { data: evento } = await supabase
    .from("obra_engenharia_protocolo_eventos")
    .select("id")
    .eq("protocolo_id", protocoloId as string)
    .eq("tipo", "registrado")
    .maybeSingle();
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Protocolo registrado. A Engenharia passou para Enviado à concessionária.", eventoId: evento?.id };
}

const esquemaEvento = comObra.extend({
  protocoloId: z.string().uuid(),
  tipo: z.enum(TIPOS_RESPOSTA, { error: "Escolha o que aconteceu." }),
  ocorridoEm: data,
  descricao: z.preprocess(vazioComoNada, z.string().trim().max(4000, "Texto muito longo.").optional()),
  categoria: z.preprocess(vazioComoNada, z.enum(CATEGORIAS_EXIGENCIA).optional()),
  prazoInterno: z.preprocess(vazioComoNada, data.optional()),
});

/** Registra a resposta da distribuidora ou o reenvio. A RPC confere a transição, a data e os campos obrigatórios. */
export async function registrarEventoProtocoloEngenharia(_: ResultadoEventoProtocolo, formData: FormData): Promise<ResultadoEventoProtocolo> {
  await exigirPapel(...ENGENHARIA);
  const d = esquemaEvento.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { data: eventoId, error } = await supabase.rpc("registrar_evento_protocolo_engenharia", {
    p_protocolo_id: d.data.protocoloId,
    p_tipo: d.data.tipo,
    p_ocorrido_em: d.data.ocorridoEm,
    ...(d.data.descricao ? { p_descricao: d.data.descricao } : {}),
    ...(d.data.categoria ? { p_categoria: d.data.categoria } : {}),
    ...(d.data.prazoInterno ? { p_prazo_interno: d.data.prazoInterno } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Registrado.", eventoId: eventoId as string };
}

/** Anexa ao evento um arquivo que o navegador já enviou à pasta da obra (comprovante, ofício, orçamento). */
export async function registrarArquivoProtocoloEngenharia(dados: { obraId: string; eventoId: string; caminho: string; nome: string }): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = comObra
    .extend({ eventoId: z.string().uuid(), caminho: z.string().min(1).max(400), nome: z.string().trim().min(1).max(200) })
    .safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_arquivo_protocolo_engenharia", { p_evento_id: d.data.eventoId, p_caminho: d.data.caminho, p_nome: d.data.nome });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o arquivo.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Arquivo anexado." };
}

const esquemaPedidoVistoria = comObra.extend({
  solicitadaEm: data,
  numero: z.preprocess(vazioComoNada, z.string().trim().max(60, "Número muito longo.").optional()),
  observacao: z.preprocess(vazioComoNada, z.string().trim().max(1000, "Observação muito longa.").optional()),
});

/**
 * Registra o pedido de vistoria feito à distribuidora. A RPC exige protocolo aprovado e instalação concluída (G5) e
 * leva a Engenharia para "Aguardando vistoria".
 */
export async function solicitarVistoriaEngenharia(_: ResultadoEventoProtocolo, formData: FormData): Promise<ResultadoEventoProtocolo> {
  await exigirPapel(...ENGENHARIA);
  const d = esquemaPedidoVistoria.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { data: vistoriaId, error } = await supabase.rpc("solicitar_vistoria_engenharia", {
    p_obra_id: d.data.obraId,
    p_solicitada_em: d.data.solicitadaEm,
    ...(d.data.numero ? { p_numero: d.data.numero } : {}),
    ...(d.data.observacao ? { p_observacao: d.data.observacao } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o pedido de vistoria.") };
  const { data: evento } = await supabase
    .from("obra_engenharia_vistoria_eventos")
    .select("id")
    .eq("vistoria_id", vistoriaId as string)
    .eq("tipo", "solicitada")
    .maybeSingle();
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Pedido de vistoria registrado. A Engenharia passou para Aguardando vistoria.", eventoId: evento?.id };
}

const esquemaEventoVistoria = comObra.extend({
  vistoriaId: z.string().uuid(),
  tipo: z.enum(TIPOS_REGISTRO_VISTORIA, { error: "Escolha o que aconteceu." }),
  data,
  descricao: z.preprocess(vazioComoNada, z.string().trim().max(4000, "Texto muito longo.").optional()),
});

/** Agendamento, resultado da vistoria, medidor adequado ou conexão confirmada. A RPC confere a ordem e as datas. */
export async function registrarEventoVistoriaEngenharia(_: ResultadoEventoProtocolo, formData: FormData): Promise<ResultadoEventoProtocolo> {
  await exigirPapel(...ENGENHARIA);
  const d = esquemaEventoVistoria.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { data: eventoId, error } = await supabase.rpc("registrar_evento_vistoria_engenharia", {
    p_vistoria_id: d.data.vistoriaId,
    p_tipo: d.data.tipo,
    p_data: d.data.data,
    ...(d.data.descricao ? { p_descricao: d.data.descricao } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Registrado.", eventoId: eventoId as string };
}

/** Anexa ao evento da vistoria um arquivo que o navegador já enviou à pasta da obra (relatório, foto, comprovante). */
export async function registrarArquivoVistoriaEngenharia(dados: { obraId: string; eventoId: string; caminho: string; nome: string }): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = comObra
    .extend({ eventoId: z.string().uuid(), caminho: z.string().min(1).max(400), nome: z.string().trim().min(1).max(200) })
    .safeParse(dados);
  if (!d.success) return { ok: false, mensagem: "Dados do arquivo inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_arquivo_vistoria_engenharia", { p_evento_id: d.data.eventoId, p_caminho: d.data.caminho, p_nome: d.data.nome });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o arquivo.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Arquivo anexado." };
}

const potencia = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim().replace(",", ".")) : v),
  z.coerce.number({ error: "Potência inválida." }).positive("Potência inválida.").max(9_999_999, "Potência inválida.").optional(),
);

/** Grava a ficha de enquadramento (todas as respostas; vazia = sem resposta). A RPC valida de novo e reconcilia o checklist. */
export async function salvarEnquadramentoEngenharia(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const obra = comObra.safeParse({ obraId: formData.get("obraId") });
  if (!obra.success) return { ok: false, mensagem: "Obra inválida." };
  const respostas: Record<string, string | number | null> = {};
  for (const chave of CHAVES_PERGUNTA) {
    const v = String(formData.get(chave) ?? "").trim();
    if (v && !respostaValida(chave, v)) return { ok: false, mensagem: "Resposta inválida." };
    respostas[chave] = v || null;
  }
  const modulos = potencia.safeParse(formData.get("potenciaModulosKwp") ?? "");
  const inversores = potencia.safeParse(formData.get("potenciaInversoresKw") ?? "");
  if (!modulos.success || !inversores.success) return { ok: false, mensagem: "Potência inválida." };
  respostas.potencia_modulos_kwp = modulos.data ?? null;
  respostas.potencia_inversores_kw = inversores.data ?? null;
  const justificativa = String(formData.get("justificativaAmbiental") ?? "").trim();
  respostas.justificativa_ambiental = respostas.situacao_ambiental === "nao_aplicavel" ? justificativa || null : null;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_enquadramento_engenharia", { p_obra_id: obra.data.obraId, p_respostas: respostas });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o enquadramento.") };
  revalidar(obra.data.obraId);
  return { ok: true, mensagem: "Enquadramento salvo." };
}

const esquemaPasso = comObra.extend({
  passo: z.coerce.number().refine(ehPassoComRegistro, "Passo inválido."),
  acao: z.enum(ACOES_PASSO, { error: "Ação inválida." }),
  observacao: z.preprocess(vazioComoNada, z.string().trim().min(3, "Mínimo 3 caracteres.").max(500, "Máximo 500 caracteres.").optional()),
});

/** Confirma, reabre ou marca "não se aplica" um passo da Engenharia (2, 3, 5 ou 7); a RPC confere as travas. */
export async function registrarPassoEngenharia(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel(...ENGENHARIA);
  const d = esquemaPasso.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_passo_engenharia", {
    p_obra_id: d.data.obraId,
    p_passo: d.data.passo,
    p_acao: d.data.acao,
    ...(d.data.observacao ? { p_observacao: d.data.observacao } : {}),
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível registrar o passo.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: d.data.acao === "reaberto" ? "Passo reaberto." : "Passo registrado." };
}

const esquemaExcecao = comObra.extend({ motivo: z.string().trim().min(10, "Explique o motivo (mínimo 10 caracteres).").max(500, "Motivo muito longo.") });

/** Exceção ao G6: o admin conclui a Engenharia sem a conexão confirmada, com motivo (guardado no histórico, sem exibição). */
export async function concluirEngenhariaSemConexao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const d = esquemaExcecao.safeParse(Object.fromEntries(formData));
  if (!d.success) return { ok: false, mensagem: d.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("concluir_engenharia_sem_conexao", { p_obra_id: d.data.obraId, p_motivo: d.data.motivo });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível concluir a Engenharia.") };
  revalidar(d.data.obraId);
  return { ok: true, mensagem: "Engenharia concluída sem a conexão confirmada." };
}
