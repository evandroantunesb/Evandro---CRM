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
import { TIPOS_LIGACAO, type ResultadoAcao } from "@/lib/tipos";

const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

const valorOpcional = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return null;
    // Aceita "18.500,00", "18500,5" e "18500.50".
    const limpo = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    return Number(limpo);
  })
  .pipe(z.number().nonnegative("Valor inválido").nullable());

const numeroBrOpcional = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return null;
    return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  })
  .pipe(z.number().positive().nullable());

const esquemaNovo = z.object({
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  funil_id: z.string().uuid(),
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorOpcional,
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
    if (!d.contato_telefone && !d.contato_email) {
      return { ok: false, mensagem: "Informe o telefone ou o e-mail do contato." };
    }
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

  const { data: negocio, error } = await supabase
    .from("negocios")
    .insert({
      empresa_id: atual.empresaId,
      titulo: d.titulo,
      funil_id: d.funil_id,
      etapa_id: etapaInicial.id,
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

export async function moverEtapa(negocioId: string, etapaId: string): Promise<ResultadoAcao> {
  await exigirPapel();
  const ids = z.object({ negocioId: z.string().uuid(), etapaId: z.string().uuid() }).safeParse({ negocioId, etapaId });
  if (!ids.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("negocios")
    .update({ etapa_id: etapaId })
    .eq("id", negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível mover o negócio.") };

  revalidatePath("/negocios");
  revalidatePath(`/negocios/${negocioId}`);
  return { ok: true, mensagem: "Negócio movido." };
}

const esquemaEdicao = z.object({
  negocioId: z.string().uuid(),
  titulo: z.string().trim().min(2, "Informe o nome do negócio"),
  etapa_id: z.string().uuid(),
  origem_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  valor: valorOpcional,
  descricao: z.string().trim().optional(),
  unidade_consumidora: z.string().trim().max(60).optional(),
  padrao_cliente: z.string().trim().max(60).optional(),
  tipo_telhado: z.string().trim().max(60).optional(),
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
      valor: d.valor,
      descricao: d.descricao || null,
      unidade_consumidora: d.unidade_consumidora || null,
      padrao_cliente: d.padrao_cliente || null,
      tipo_telhado: d.tipo_telhado || null,
      ...(atual.papel !== "vendedor" && d.responsavel_id ? { responsavel_id: d.responsavel_id } : {}),
    })
    .eq("id", d.negocioId)
    .select("id");
  if (error || !data?.length) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

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

/** Marca como ganho, perdido (com motivo) ou reabre. */
export async function alterarStatus(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel();
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
