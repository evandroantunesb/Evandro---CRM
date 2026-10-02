"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EVENTOS_GAMIFICACAO, EVENTOS_TETO_OBRIGATORIO, MARCOS_CONQUISTA } from "@/lib/gamificacao";
import { mensagemErro } from "@/lib/erros";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { OPERADORES_CONDICAO, PERFIS_GAMIFICACAO, PERIODOS_LIMITE_REGRA, type ResultadoAcao } from "@/lib/tipos";

const CAMINHO_REGRAS = "/gamificacao/administracao/regras";
const CAMINHO_NIVEIS_CONQUISTAS = "/gamificacao/administracao/niveis-e-conquistas";
const CAMINHO_RECOMPENSAS = "/gamificacao/administracao/recompensas";
const TIPOS_EVENTO = EVENTOS_GAMIFICACAO.map((e) => e.tipo);

const esquema = z
  .object({
    nome: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
    eventoTipo: z.enum(TIPOS_EVENTO as [string, ...string[]], { message: "Escolha um evento." }),
    xp: z.coerce.number().int(),
    moedas: z.coerce.number().int(),
    perfilAplicavel: z.enum(PERFIS_GAMIFICACAO).optional().or(z.literal("").transform(() => undefined)),
    condicaoCampo: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
    condicaoOperador: z.enum(OPERADORES_CONDICAO).optional().or(z.literal("").transform(() => undefined)),
    condicaoValor: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
    limitePeriodo: z.enum(PERIODOS_LIMITE_REGRA).optional().or(z.literal("").transform(() => undefined)),
    limiteQuantidade: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((d) => !d.limitePeriodo === !d.limiteQuantidade, {
    message: "Defina o período e a quantidade do teto juntos, ou deixe os dois em branco.",
    path: ["limiteQuantidade"],
  })
  .refine((d) => !(EVENTOS_TETO_OBRIGATORIO as readonly string[]).includes(d.eventoTipo) || (!!d.limitePeriodo && !!d.limiteQuantidade), {
    message: "Esse evento é uma atividade repetível: defina período e quantidade do teto antes de salvar.",
    path: ["limiteQuantidade"],
  })
  .refine((d) => d.xp !== 0 || d.moedas !== 0, {
    message: "Informe XP, moedas, ou os dois — não podem ser zero ao mesmo tempo.",
    path: ["xp"],
  });

function montarCondicao(dados: z.infer<typeof esquema>) {
  if (!dados.condicaoCampo || !dados.condicaoOperador || !dados.condicaoValor) return null;
  return { campo: dados.condicaoCampo, operador: dados.condicaoOperador, valor: dados.condicaoValor };
}

export async function criarRegra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("gamification_rules").insert({
    empresa_id: atual.empresaId,
    nome: dados.data.nome,
    evento_tipo: dados.data.eventoTipo,
    xp: dados.data.xp,
    moedas: dados.data.moedas,
    perfil_aplicavel: dados.data.perfilAplicavel ?? null,
    condicao: montarCondicao(dados.data),
    limite_periodo: dados.data.limitePeriodo ?? null,
    limite_quantidade: dados.data.limiteQuantidade ?? null,
    unica_por_negocio: formData.get("unicaPorNegocio") === "on",
    criado_por: atual.membroId,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a regra.") };

  revalidatePath(CAMINHO_REGRAS);
  return { ok: true, mensagem: "Regra criada." };
}

export async function editarRegra(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!id.success || !dados.success) {
    return { ok: false, mensagem: dados.success ? "Dados inválidos." : dados.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("gamification_rules")
    .update({
      nome: dados.data.nome,
      evento_tipo: dados.data.eventoTipo,
      xp: dados.data.xp,
      moedas: dados.data.moedas,
      perfil_aplicavel: dados.data.perfilAplicavel ?? null,
      condicao: montarCondicao(dados.data),
      limite_periodo: dados.data.limitePeriodo ?? null,
      limite_quantidade: dados.data.limiteQuantidade ?? null,
      unica_por_negocio: formData.get("unicaPorNegocio") === "on",
      ativa: formData.get("ativa") === "on",
    })
    .eq("id", id.data);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath(CAMINHO_REGRAS);
  return { ok: true, mensagem: "Salvo." };
}

export async function apagarRegra(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("gamification_rules").delete().eq("id", id.data);
  revalidatePath(CAMINHO_REGRAS);
}

const esquemaNivel = z.object({
  nivel: z.coerce.number().int().positive(),
  nome: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
  xpMinimo: z.coerce.number().int().min(0),
});

export async function criarNivel(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaNivel.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("niveis_gamificacao").insert({
    empresa_id: atual.empresaId,
    nivel: dados.data.nivel,
    nome: dados.data.nome ?? null,
    xp_minimo: dados.data.xpMinimo,
  });
  if (error) {
    return {
      ok: false,
      mensagem:
        error.code === "23505" ? "Já existe um nível com esse número ou esse XP mínimo." : mensagemErro(error, "Não foi possível criar o nível."),
    };
  }

  revalidatePath(CAMINHO_NIVEIS_CONQUISTAS);
  return { ok: true, mensagem: "Nível criado." };
}

export async function editarNivel(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaNivel.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("niveis_gamificacao")
    .update({ nome: dados.data.nome ?? null, xp_minimo: dados.data.xpMinimo, ativa: formData.get("ativa") === "on" })
    .eq("empresa_id", atual.empresaId)
    .eq("nivel", dados.data.nivel);
  if (error) {
    return {
      ok: false,
      mensagem: error.code === "23505" ? "Já existe um nível com esse XP mínimo." : mensagemErro(error, "Não foi possível salvar o nível."),
    };
  }

  revalidatePath(CAMINHO_NIVEIS_CONQUISTAS);
  return { ok: true, mensagem: "Nível salvo." };
}

export async function apagarNivel(formData: FormData) {
  const { atual } = await exigirPapel("admin");
  const nivel = z.coerce.number().int().safeParse(formData.get("nivel"));
  if (!nivel.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("niveis_gamificacao").delete().eq("empresa_id", atual.empresaId).eq("nivel", nivel.data);
  revalidatePath(CAMINHO_NIVEIS_CONQUISTAS);
}

const esquemaConquista = z
  .object({
    nome: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
    descricao: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
    icone: z.string().trim().min(1).max(8).optional().or(z.literal("").transform(() => undefined)),
    metrica: z.enum(["xp_acumulado", "marco_contagem"]).default("xp_acumulado"),
    marco: z.enum(MARCOS_CONQUISTA).optional().or(z.literal("").transform(() => undefined)),
    valor: z.coerce.number().int().positive("Informe o valor necessário."),
    xpBonus: z.coerce.number().int().min(0).optional().or(z.literal("").transform(() => undefined)),
    perfilAplicavel: z.enum(PERFIS_GAMIFICACAO).optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((d) => d.metrica !== "marco_contagem" || !!d.marco, {
    message: "Escolha o marco dessa conquista.",
    path: ["marco"],
  });

function montarCriterioConquista(dados: z.infer<typeof esquemaConquista>) {
  return dados.metrica === "marco_contagem"
    ? { metrica: "marco_contagem" as const, marco: dados.marco, valor: dados.valor }
    : { metrica: "xp_acumulado" as const, valor: dados.valor };
}

export async function criarConquista(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaConquista.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("conquistas").insert({
    empresa_id: atual.empresaId,
    nome: dados.data.nome,
    descricao: dados.data.descricao ?? "",
    icone: dados.data.icone ?? "🏆",
    criterio: montarCriterioConquista(dados.data),
    xp_bonus: dados.data.xpBonus ?? 0,
    perfil_aplicavel: dados.data.perfilAplicavel ?? null,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a conquista.") };

  revalidatePath(CAMINHO_NIVEIS_CONQUISTAS);
  return { ok: true, mensagem: "Conquista criada." };
}

export async function editarConquista(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const dados = esquemaConquista.safeParse(Object.fromEntries(formData));
  if (!id.success || !dados.success) {
    return { ok: false, mensagem: dados.success ? "Dados inválidos." : dados.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("conquistas")
    .update({
      nome: dados.data.nome,
      descricao: dados.data.descricao ?? "",
      icone: dados.data.icone ?? "🏆",
      criterio: montarCriterioConquista(dados.data),
      xp_bonus: dados.data.xpBonus ?? 0,
      perfil_aplicavel: dados.data.perfilAplicavel ?? null,
      ativa: formData.get("ativa") === "on",
    })
    .eq("id", id.data);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath(CAMINHO_NIVEIS_CONQUISTAS);
  return { ok: true, mensagem: "Salvo." };
}

export async function apagarConquista(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("conquistas").delete().eq("id", id.data);
  revalidatePath(CAMINHO_NIVEIS_CONQUISTAS);
}

const esquemaRecompensa = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo"),
  descricao: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  custoMoedas: z.coerce.number().int().positive("Informe o custo em moedas."),
  estoque: z.coerce.number().int().min(0).optional().or(z.literal("").transform(() => undefined)),
  limitePorMembro: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  validadeAte: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
});

export async function criarRecompensa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaRecompensa.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("recompensas").insert({
    empresa_id: atual.empresaId,
    nome: dados.data.nome,
    descricao: dados.data.descricao ?? "",
    custo_moedas: dados.data.custoMoedas,
    estoque: dados.data.estoque ?? null,
    limite_por_membro: dados.data.limitePorMembro ?? null,
    validade_ate: dados.data.validadeAte ?? null,
    criado_por: atual.membroId,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível criar a recompensa.") };

  revalidatePath(CAMINHO_RECOMPENSAS);
  revalidatePath("/gamificacao/loja");
  return { ok: true, mensagem: "Recompensa criada." };
}

export async function editarRecompensa(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const dados = esquemaRecompensa.safeParse(Object.fromEntries(formData));
  if (!id.success || !dados.success) {
    return { ok: false, mensagem: dados.success ? "Dados inválidos." : dados.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("recompensas")
    .update({
      nome: dados.data.nome,
      descricao: dados.data.descricao ?? "",
      custo_moedas: dados.data.custoMoedas,
      estoque: dados.data.estoque ?? null,
      limite_por_membro: dados.data.limitePorMembro ?? null,
      validade_ate: dados.data.validadeAte ?? null,
      ativa: formData.get("ativa") === "on",
    })
    .eq("id", id.data);
  if (error) return { ok: false, mensagem: mensagemErro(error, "Não foi possível salvar.") };

  revalidatePath(CAMINHO_RECOMPENSAS);
  revalidatePath("/gamificacao/loja");
  return { ok: true, mensagem: "Salvo." };
}

export async function apagarRecompensa(formData: FormData) {
  await exigirPapel("admin");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const supabase = await criarClienteServidor();
  await supabase.from("recompensas").delete().eq("id", id.data);
  revalidatePath(CAMINHO_RECOMPENSAS);
  revalidatePath("/gamificacao/loja");
}
