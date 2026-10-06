"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { montarLinhaCalculo } from "@/lib/acoes/calculadora";
import { enviarAnexoNoServidor } from "@/lib/acoes/anexos";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/erros";
import { componentesJsonSchema, nomeKitPersonalizado, potenciaKitPersonalizadoKwp } from "@/lib/calculadora";
import { calcularStatusQualificacao } from "@/lib/qualificacao";
import { PRAZOS_INSTALACAO_QUALIF, TIPOS_CLIENTE_QUALIF, TIPOS_LIGACAO, type ResultadoAcao } from "@/lib/tipos";

const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

// Valor é obrigatório nos formulários de negócio (criar e editar); captura
// pública e rodízio continuam criando negócios sem valor.
const valorObrigatorio = z
  .string({ error: "Informe o valor do negócio." })
  .trim()
  .min(1, "Informe o valor do negócio.")
  .transform((v) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
  .pipe(z.number({ error: "Valor inválido" }).positive("Informe um valor maior que zero."));

const numeroBrOpcional = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return null;
    return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  })
  .pipe(z.number().positive().nullable());

/** Selects "sim"/"nao"/"" (não informado) viram boolean | null. */
const boolOpcional = z
  .enum(["sim", "nao", ""])
  .optional()
  .transform((v) => (v === "sim" ? true : v === "nao" ? false : null));

const esquemaNovo = z.object({
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  funil_id: z.string().uuid(),
  etapa_id: uuidOpcional,
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorObrigatorio,
  descricao: z.string().trim().optional(),
  // Dados de instalação: ficam no negócio, não no contato (que é só dado
  // pessoal/residência do cliente).
  unidade_consumidora: z.string().trim().max(60).optional(),
  padrao_cliente: z.string().trim().max(60).optional(),
  tipo_telhado: z.string().trim().max(60).optional(),
  estrutura_telhado: z.string().trim().max(120).optional(),
  contato_id: uuidOpcional,
  contato_tipo: z.enum(["pf", "pj"]).default("pf"),
  contato_nome: z.string().trim().optional(),
  contato_telefone: z.string().trim().optional(),
  contato_email: z.union([z.literal(""), z.string().trim().email("E-mail do contato inválido")]).optional(),
  contato_endereco: z.string().trim().max(300, "Endereço muito longo").optional(),
  // Calculadora solar: roda no backend a partir do kit personalizado (não é
  // um passo separado) — quando os dados estão completos, o cálculo já
  // fica pronto junto com o negócio (fluxo de "nova proposta").
  tipo_ligacao: z.enum(TIPOS_LIGACAO).optional(),
  consumo_medio_kwh: numeroBrOpcional,
  valor_fatura_medio: numeroBrOpcional,
  tarifa_kwh: numeroBrOpcional,
  componentes: componentesJsonSchema,
});

export async function criarNegocio(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaNovo.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  let contatoId = d.contato_id;
  if (!contatoId) {
    if (!d.contato_nome || d.contato_nome.length < 2) return { ok: false, mensagem: "Informe o nome do contato." };
    if (!d.contato_telefone) return { ok: false, mensagem: "Informe o telefone do contato." };
    const { data: contato, error } = await supabase
      .from("contatos")
      .insert({
        empresa_id: atual.empresaId,
        tipo: d.contato_tipo,
        nome: d.contato_nome,
        telefone: d.contato_telefone || null,
        email: d.contato_email || null,
        endereco: d.contato_endereco || null,
      })
      .select("id")
      .single();
    if (error || !contato) return { ok: false, mensagem: "Não foi possível salvar o contato." };
    contatoId = contato.id;
  }

  // Etapa pré-selecionada (ex.: "Adicionar negócio" numa coluna do Kanban), se pertencer ao funil e estiver ativa;
  // senão cai na etapa inicial do funil, como sempre foi.
  let etapaId = d.etapa_id;
  if (etapaId) {
    const { data: etapa } = await supabase.from("etapas").select("id").eq("id", etapaId).eq("funil_id", d.funil_id).eq("ativa", true).maybeSingle();
    etapaId = etapa?.id ?? null;
  }
  if (!etapaId) {
    const { data: etapaInicial } = await supabase
      .from("etapas")
      .select("id")
      .eq("funil_id", d.funil_id)
      .eq("ativa", true)
      .order("inicial", { ascending: false })
      .order("ordem")
      .limit(1)
      .single();
    if (!etapaInicial) return { ok: false, mensagem: "O funil não tem etapas ativas." };
    etapaId = etapaInicial.id;
  }

  const { data: negocio, error } = await supabase
    .from("negocios")
    .insert({
      empresa_id: atual.empresaId,
      titulo: d.titulo,
      funil_id: d.funil_id,
      etapa_id: etapaId,
      origem_id: d.origem_id,
      // Vendedor sempre fica como responsável; admin e gestor podem escolher.
      responsavel_id: atual.papel === "vendedor" ? null : d.responsavel_id,
      valor: d.valor,
      descricao: d.descricao || null,
      contato_id: contatoId,
      unidade_consumidora: d.unidade_consumidora || null,
      padrao_cliente: d.padrao_cliente || null,
      tipo_telhado: d.tipo_telhado || null,
      estrutura_telhado: d.estrutura_telhado || null,
      consumo_medio_kwh: d.consumo_medio_kwh,
      valor_conta_energia: d.valor_fatura_medio,
    })
    .select("id")
    .single();
  if (error || !negocio) {
    return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar o negócio. Confira o responsável escolhido.") };
  }

  // Kit personalizado montado junto com o negócio: já deixa o cálculo
  // pronto, sem o vendedor precisar abrir a calculadora à parte (fluxo de
  // "nova proposta"). O cálculo roda no backend — não é um passo visível.
  if (d.tipo_ligacao && d.tarifa_kwh != null && d.componentes.length) {
    const montado = await montarLinhaCalculo(supabase, atual.empresaId, {
      kitNome: nomeKitPersonalizado(d.componentes),
      potenciaKwp: potenciaKitPersonalizadoKwp(d.componentes),
      precoKit: d.valor ?? 0,
      tipoLigacao: d.tipo_ligacao,
      consumoMedioKwh: d.consumo_medio_kwh,
      valorFaturaMedio: d.valor_fatura_medio,
      tarifaKwh: d.tarifa_kwh,
    });
    if (montado.ok) {
      await supabase.from("calculos_solares").insert({
        ...montado.linha,
        negocio_id: negocio.id,
        atualizado_por: atual.membroId,
        criado_por: atual.membroId,
      });
      await supabase.from("kit_componentes").insert(
        d.componentes.map((c, i) => ({
          empresa_id: atual.empresaId,
          negocio_id: negocio.id,
          tipo: c.tipo,
          descricao: c.descricao,
          potencia_w: c.potenciaW,
          quantidade: c.quantidade,
          ordem: i,
        })),
      );
    }
    // Um kit mal preenchido não deve impedir a criação do negócio — o
    // vendedor ainda pode calcular depois, direto na página do negócio.
  }

  // Anexos escolhidos ainda na criação (CNH, faturas): só dá para subir
  // depois que o negócio existe (a pasta no Storage é por negócio).
  const anexos: { campo: string; categoria: "cnh" | "fatura_gerador" | "fatura_beneficiario" }[] = [
    { campo: "anexo_cnh_negocio", categoria: "cnh" },
    { campo: "anexo_cnh_contato", categoria: "cnh" },
    { campo: "anexo_fatura_gerador", categoria: "fatura_gerador" },
  ];
  await Promise.all([
    ...anexos.flatMap(({ campo, categoria }) =>
      formData
        .getAll(campo)
        .filter((v): v is File => v instanceof File && v.size > 0)
        .map((arquivo) => enviarAnexoNoServidor(supabase, { empresaId: atual.empresaId, negocioId: negocio.id, arquivo, categoria })),
    ),
    ...formData
      .getAll("anexo_fatura_beneficiario")
      .filter((v): v is File => v instanceof File && v.size > 0)
      .map((arquivo) =>
        enviarAnexoNoServidor(supabase, {
          empresaId: atual.empresaId,
          negocioId: negocio.id,
          arquivo,
          categoria: "fatura_beneficiario",
        }),
      ),
  ]);

  revalidatePath("/negocios");
  redirect(`/negocios/${negocio.id}`);
}

/**
 * Move o negócio de etapa e registra o comentário obrigatório sobre a mudança como uma nota.
 * Quando a etapa de destino fecha o negócio como perdido (`etapas.fecha_como`), o popup também exige um
 * motivo, passado aqui em `motivoPerdaId` — o status e o motivo são gravados junto com a etapa, na mesma
 * chamada (ganho automático não precisa de motivo, o gatilho do banco cuida sozinho).
 */
export async function moverEtapa(negocioId: string, etapaId: string, comentario: string, motivoPerdaId?: string): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const ids = z
    .object({
      negocioId: z.string().uuid(),
      etapaId: z.string().uuid(),
      comentario: z.string().trim().min(1, "Escreva um comentário sobre a mudança.").max(5000, "Comentário muito longo."),
      motivoPerdaId: z.string().uuid().optional(),
    })
    .safeParse({ negocioId, etapaId, comentario, motivoPerdaId: motivoPerdaId || undefined });
  if (!ids.success) return { ok: false, mensagem: ids.error.issues[0].message };

  const supabase = await criarClienteServidor();

  if (atual.papel === "sdr") {
    // SDR não pode fechar o negócio (spec §39) — nem movendo pra uma etapa que fecha sozinha (ganho/perdido).
    const { data: etapaDestino } = await supabase.from("etapas").select("fecha_como").eq("id", ids.data.etapaId).maybeSingle();
    if (etapaDestino?.fecha_como) {
      return { ok: false, mensagem: "SDR não pode mover o negócio para uma etapa que fecha automaticamente." };
    }
  }

  const { data, error } = await supabase
    .from("negocios")
    .update(
      ids.data.motivoPerdaId
        ? { etapa_id: ids.data.etapaId, status: "perdido", motivo_perda_id: ids.data.motivoPerdaId, motivo_perda_detalhe: ids.data.comentario }
        : { etapa_id: ids.data.etapaId },
    )
    .eq("id", ids.data.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível mover o negócio.") };

  await supabase
    .from("notas")
    .insert({ empresa_id: atual.empresaId, negocio_id: ids.data.negocioId, texto: ids.data.comentario });

  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
  return { ok: true, mensagem: ids.data.motivoPerdaId ? "Negócio marcado como perdido." : "Negócio movido." };
}

const esquemaEdicao = z.object({
  negocioId: z.string().uuid(),
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  etapa_id: z.string().uuid(),
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorObrigatorio,
  descricao: z.string().trim().optional(),
  unidade_consumidora: z.string().trim().max(60).optional(),
  padrao_cliente: z.string().trim().max(60).optional(),
  tipo_telhado: z.string().trim().max(60).optional(),
  consumo_medio_kwh: numeroBrOpcional,
  valor_conta_energia: numeroBrOpcional,
});

export async function editarNegocio(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaEdicao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("negocios")
    .update({
      titulo: d.titulo,
      etapa_id: d.etapa_id,
      origem_id: d.origem_id,
      descricao: d.descricao || null,
      unidade_consumidora: d.unidade_consumidora || null,
      padrao_cliente: d.padrao_cliente || null,
      tipo_telhado: d.tipo_telhado || null,
      consumo_medio_kwh: d.consumo_medio_kwh,
      valor_conta_energia: d.valor_conta_energia,
      // SDR não pode alterar o valor financeiro do negócio (spec RAION_SDR_REGRAS_PERMISSOES §39) — só na criação.
      ...(atual.papel !== "sdr" ? { valor: d.valor } : {}),
      ...(atual.papel !== "vendedor" && d.responsavel_id ? { responsavel_id: d.responsavel_id } : {}),
    })
    .eq("id", d.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  const arquivoFatura = formData.get("anexo_fatura_energia");
  if (arquivoFatura instanceof File && arquivoFatura.size > 0) {
    await enviarAnexoNoServidor(supabase, {
      empresaId: atual.empresaId,
      negocioId: d.negocioId,
      arquivo: arquivoFatura,
      categoria: "fatura_gerador",
    });
  }

  revalidatePath("/negocios");
  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Salvo." };
}

const esquemaFechamento = z.discriminatedUnion("status", [
  z.object({ negocioId: z.string().uuid(), status: z.literal("ganho") }),
  z.object({
    negocioId: z.string().uuid(),
    status: z.literal("perdido"),
    motivo_perda_id: z.string().uuid("Escolha o motivo da perda."),
    motivo_perda_detalhe: z.string().trim().max(1000).optional(),
  }),
  z.object({ negocioId: z.string().uuid(), status: z.literal("aberto") }),
]);

/** Marca como ganho, perdido (com motivo) ou reabre. SDR não fecha negócio (spec §39) — usa "Enviar para vendas". */
export async function alterarStatus(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  if (atual.papel === "sdr") return { ok: false, mensagem: "SDR não pode marcar o negócio como ganho ou perdido." };
  const dados = esquemaFechamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("negocios")
    .update(
      d.status === "perdido"
        ? { status: d.status, motivo_perda_id: d.motivo_perda_id, motivo_perda_detalhe: d.motivo_perda_detalhe || null }
        : { status: d.status },
    )
    .eq("id", d.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível alterar o status.") };

  revalidatePath("/negocios");
  revalidatePath(`/negocios/${d.negocioId}`);
  const mensagens = { ganho: "Negócio ganho!", perdido: "Negócio marcado como perdido.", aberto: "Negócio reaberto." };
  return { ok: true, mensagem: mensagens[d.status] };
}

/** Marca ou desmarca uma etiqueta no negócio. */
export async function alternarEtiqueta(formData: FormData) {
  const { atual } = await exigirPapel();
  const ids = z
    .object({ negocioId: z.string().uuid(), etiquetaId: z.string().uuid(), marcar: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!ids.success) return;
  const { negocioId, etiquetaId, marcar } = ids.data;

  const supabase = await criarClienteServidor();
  if (marcar === "true") {
    await supabase.from("negocio_etiquetas").insert({ negocio_id: negocioId, etiqueta_id: etiquetaId, empresa_id: atual.empresaId });
  } else {
    await supabase.from("negocio_etiquetas").delete().eq("negocio_id", negocioId).eq("etiqueta_id", etiquetaId);
  }
  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
}

export type Duplicado = { contatoId: string; nome: string; visivel: boolean; responsavel: string | null };

/** Confere se já existe contato com esse telefone ou e-mail na empresa. */
export async function verificarDuplicado(telefone: string, email: string): Promise<Duplicado[]> {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("buscar_contato_duplicado", {
    p_empresa_id: atual.empresaId,
    p_telefone: telefone,
    p_email: email,
  });
  return (data ?? []).map((d) => ({
    contatoId: d.contato_id,
    // Não expõe o nome de quem o usuário não pode ver.
    nome: d.visivel ? d.nome : "",
    visivel: d.visivel,
    responsavel: d.responsavel_nome,
  }));
}

/** Busca contatos visíveis para o seletor de "contato existente". */
export async function buscarContatos(termo: string) {
  const { atual } = await exigirPapel();
  const t = termo.trim();
  if (t.length < 2) return [];
  const supabase = await criarClienteServidor();
  const digitos = t.replace(/\D/g, "");
  const filtro = [`nome.ilike.%${t.replace(/[%,()]/g, "")}%`, `email.ilike.%${t.replace(/[%,()]/g, "")}%`];
  if (digitos.length >= 4) filtro.push(`telefone_digitos.like.%${digitos}%`);
  const { data } = await supabase
    .from("contatos")
    .select("id, nome, telefone, email")
    .eq("empresa_id", atual.empresaId)
    .or(filtro.join(","))
    .order("nome")
    .limit(8);
  return data ?? [];
}

const esquemaQualificacao = z.object({
  negocioId: z.string().uuid(),
  qualif_tipo_cliente: z.enum([...TIPOS_CLIENTE_QUALIF, ""]).optional(),
  qualif_possui_conta_energia: boolOpcional,
  qualif_distribuidora: z.string().trim().max(80).optional(),
  qualif_imovel_proprio: boolOpcional,
  qualif_objetivo: z.string().trim().max(200).optional(),
  qualif_prazo_instalacao: z.enum([...PRAZOS_INSTALACAO_QUALIF, ""]).optional(),
  qualif_busca_financiamento: boolOpcional,
  qualif_orcamento_outra_empresa: boolOpcional,
  qualif_e_decisor: boolOpcional,
  qualif_outro_decisor: boolOpcional,
  qualif_participantes_decisao: z.string().trim().max(200).optional(),
  qualif_observacoes: z.string().trim().max(2000).optional(),
});

/** Salva o bloco "Qualificação SDR" do negócio (spec RAION_SDR_REGRAS_PERMISSOES, fase 4). */
export async function atualizarQualificacao(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
  const dados = esquemaQualificacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("negocios")
    .update({
      qualif_tipo_cliente: d.qualif_tipo_cliente || null,
      qualif_possui_conta_energia: d.qualif_possui_conta_energia,
      qualif_distribuidora: d.qualif_distribuidora || null,
      qualif_imovel_proprio: d.qualif_imovel_proprio,
      qualif_objetivo: d.qualif_objetivo || null,
      qualif_prazo_instalacao: d.qualif_prazo_instalacao || null,
      qualif_busca_financiamento: d.qualif_busca_financiamento,
      qualif_orcamento_outra_empresa: d.qualif_orcamento_outra_empresa,
      qualif_e_decisor: d.qualif_e_decisor,
      qualif_outro_decisor: d.qualif_outro_decisor,
      qualif_participantes_decisao: d.qualif_participantes_decisao || null,
      qualif_observacoes: d.qualif_observacoes || null,
    })
    .eq("id", d.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Salvo." };
}

const esquemaHandoff = z.object({
  negocioId: z.string().uuid(),
  paraMembroId: z.string().uuid("Escolha o vendedor."),
  observacoes: z.string().trim().max(1000).optional(),
});

/**
 * "Enviar para vendas" (spec RAION_SDR_REGRAS_PERMISSOES, fase 5, §20-22): exige negócio
 * qualificado e registra o handoff como "pendente" (snapshot da qualificação, não só a
 * troca de responsável). `responsavel_id` só passa pro closer quando ele aceita (ver
 * `aceitarHandoff`) — fluxo aprovado pelo Evandro em 2026-10-01, substitui a transferência
 * imediata que existia antes. Notificação ao vendedor e transferência de tarefas ficam
 * pra fase futura (§9/§45 da spec).
 */
export async function enviarParaVendas(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaHandoff.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data: negocio, error: erroBusca } = await supabase
    .from("negocios")
    .select(
      "id, empresa_id, contato_id, responsavel_id, qualif_tipo_cliente, qualif_possui_conta_energia, qualif_distribuidora, qualif_imovel_proprio, qualif_objetivo, qualif_prazo_instalacao, qualif_busca_financiamento, qualif_orcamento_outra_empresa, qualif_e_decisor, qualif_outro_decisor, qualif_participantes_decisao, contatos(telefone)",
    )
    .eq("id", d.negocioId)
    .maybeSingle();
  if (erroBusca || !negocio) return { ok: false, mensagem: "Negócio não encontrado." };

  const contato = negocio.contatos as unknown as { telefone: string | null } | null;
  const status = calcularStatusQualificacao(!!contato?.telefone, negocio.qualif_objetivo, negocio.qualif_e_decisor);
  if (status.rotulo !== "Qualificado") {
    return { ok: false, mensagem: `Qualifique o negócio antes de enviar para vendas (${status.atendidos} de ${status.total} critérios atendidos).` };
  }

  const { data: pendenteExistente } = await supabase
    .from("handoffs")
    .select("id")
    .eq("negocio_id", d.negocioId)
    .eq("status", "pendente")
    .maybeSingle();
  if (pendenteExistente) return { ok: false, mensagem: "Já existe uma oportunidade pendente de aceite pra esse negócio." };

  const { error: erroHandoff } = await supabase.from("handoffs").insert({
    empresa_id: negocio.empresa_id,
    negocio_id: negocio.id,
    contato_id: negocio.contato_id,
    de_membro_id: negocio.responsavel_id ?? atual.membroId,
    para_membro_id: d.paraMembroId,
    status: "pendente",
    status_qualificacao: status.rotulo,
    qualificacao_snapshot: {
      tipo_cliente: negocio.qualif_tipo_cliente,
      possui_conta_energia: negocio.qualif_possui_conta_energia,
      distribuidora: negocio.qualif_distribuidora,
      imovel_proprio: negocio.qualif_imovel_proprio,
      objetivo: negocio.qualif_objetivo,
      prazo_instalacao: negocio.qualif_prazo_instalacao,
      busca_financiamento: negocio.qualif_busca_financiamento,
      orcamento_outra_empresa: negocio.qualif_orcamento_outra_empresa,
      e_decisor: negocio.qualif_e_decisor,
      outro_decisor: negocio.qualif_outro_decisor,
      participantes_decisao: negocio.qualif_participantes_decisao,
    },
    observacoes: d.observacoes || null,
  });
  if (erroHandoff) return { ok: false, mensagem: mensagemErro(erroHandoff, "Não foi possível registrar o handoff.") };

  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Enviado para vendas — aguardando aceite." };
}

const esquemaRespostaHandoff = z.object({
  handoffId: z.string().uuid(),
  negocioId: z.string().uuid(),
});

/** Closer aceita a oportunidade: `responsavel_id` passa pra ele (ver migration 20261001170000). */
export async function aceitarHandoff(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
  const dados = esquemaRespostaHandoff.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("aceitar_handoff", { p_handoff_id: dados.data.handoffId });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível aceitar.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Oportunidade aceita." };
}

const esquemaDevolucaoHandoff = esquemaRespostaHandoff.extend({
  motivo: z.string().trim().min(1, "Escreva o motivo da devolução.").max(1000),
});

/** Closer devolve a oportunidade pro SDR; o negócio nunca reabre, um novo envio cria handoff novo. */
export async function devolverHandoff(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
  const dados = esquemaDevolucaoHandoff.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("devolver_handoff", { p_handoff_id: dados.data.handoffId, p_motivo: dados.data.motivo });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível devolver.") };

  revalidatePath(`/negocios/${dados.data.negocioId}`);
  return { ok: true, mensagem: "Oportunidade devolvida." };
}

const esquemaFeedbackHandoff = z.object({
  handoffId: z.string().uuid(),
  negocioId: z.string().uuid(),
  feedback: z.string().trim().min(1, "Escreva o feedback.").max(2000),
});

/**
 * Feedback do vendedor sobre o lead recebido via handoff (pedido do Evandro 2026-09-30):
 * visível só a admin/gestor e ao próprio autor — nunca ao SDR que fez o handoff (RLS em
 * handoffs_feedback garante isso, não só a tela). Serve de métrica pra avaliar o SDR.
 */
export async function registrarFeedbackHandoff(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel();
  const dados = esquemaFeedbackHandoff.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("handoffs_feedback").upsert(
    {
      empresa_id: atual.empresaId,
      handoff_id: d.handoffId,
      autor_id: atual.membroId,
      feedback: d.feedback,
    },
    { onConflict: "handoff_id" },
  );
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar o feedback.") };

  revalidatePath(`/negocios/${d.negocioId}`);
  return { ok: true, mensagem: "Feedback salvo." };
}
