"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarUsuarioDireto } from "@/lib/convites";
import { mensagemErro } from "@/lib/erros";
import { SETORES_OBRA, type SetorObra } from "@/lib/obras/rotulos";
import { ATUACOES, CAPACIDADES, PERFIS_USUARIO, ehPerfilSetor, papelDoPerfil, setoresParaSalvar } from "@/lib/perfis-usuario";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PERFIS_GAMIFICACAO, STATUS_MEMBRO, TIPOS_VENDEDOR, type ResultadoAcao } from "@/lib/tipos";

const vazioComoAusente = <T extends z.ZodType>(esquema: T) => esquema.optional().or(z.literal("").transform(() => undefined));

/**
 * Perfil único (desenho aprovado em 05/11/2026). Para a Operação, `capacidade` é a do setor do perfil e `outro_<setor>`
 * diz se a pessoa também atua nos demais. Vendedor: tipo, ranking e "Recebe leads"; SDR: ranking e "Recebe leads";
 * Gestor e Admin: só o ranking (opcional).
 */
const esquemaPerfil = z.object({
  perfil: z.enum(PERFIS_USUARIO, "Escolha o perfil"),
  capacidade: vazioComoAusente(z.enum(CAPACIDADES)),
  tipo_vendedor: vazioComoAusente(z.enum(TIPOS_VENDEDOR)),
  perfil_gamificacao: vazioComoAusente(z.enum(PERFIS_GAMIFICACAO)),
  recebe_leads: z.enum(["on"]).optional(),
  ...Object.fromEntries(SETORES_OBRA.map((s) => [`outro_${s}`, vazioComoAusente(z.enum(ATUACOES))])),
});
type DadosPerfil = z.infer<typeof esquemaPerfil> & Partial<Record<`outro_${SetorObra}`, (typeof ATUACOES)[number]>>;

/** Colunas de `empresa_membros` que o perfil define. "Recebe leads" de Gestor e Admin não é tocado (o rodízio só usa Vendedor e SDR). */
function colunasDoPerfil(d: DadosPerfil) {
  const papel = papelDoPerfil(d.perfil);
  const ranking = d.perfil_gamificacao ?? null;
  const leads = d.recebe_leads === "on";
  switch (papel) {
    case "operacao":
      return { papel, tipo_vendedor: null, perfil_gamificacao: null, recebe_leads: false };
    case "vendedor":
      return { papel, tipo_vendedor: d.tipo_vendedor ?? "interno", perfil_gamificacao: ranking, recebe_leads: leads };
    case "sdr":
      return { papel, tipo_vendedor: null, perfil_gamificacao: ranking, recebe_leads: leads };
    case "gestor":
    case "admin":
      return { papel, tipo_vendedor: null, perfil_gamificacao: ranking };
  }
}

/** Setores a gravar (só Operação): o do perfil como principal e os outros marcados. Null se faltar a capacidade. */
function setoresDoPerfil(d: DadosPerfil) {
  if (!ehPerfilSetor(d.perfil)) return [];
  if (!d.capacidade) return null;
  const outros = Object.fromEntries(SETORES_OBRA.map((s) => [s, d[`outro_${s}`]]));
  return setoresParaSalvar(d.perfil, d.capacidade, outros);
}

const esquemaConvite = esquemaPerfil.extend({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().email("E-mail inválido"),
  senha: vazioComoAusente(z.string().trim().min(8, "A senha precisa ter pelo menos 8 caracteres")),
});

function gerarSenhaTemporaria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let senha = "";
  for (let i = 0; i < 10; i++) senha += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return senha;
}

/** Cadastra a pessoa direto, com senha própria (sem convite por e-mail), já com o perfil e os setores. */
export async function convidarMembro(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaConvite.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const d = dados.data as DadosPerfil & typeof dados.data;
  const setores = setoresDoPerfil(d);
  if (!setores) return { ok: false, mensagem: "Escolha se a pessoa executa ou coordena no setor." };

  const senha = d.senha ?? gerarSenhaTemporaria();
  let userId: string;
  let novo: boolean;
  try {
    ({ userId, novo } = await criarUsuarioDireto(d.email, d.nome, senha));
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }

  // O vínculo é gravado com a sessão do admin: o RLS confere a permissão de novo.
  const supabase = await criarClienteServidor();
  const colunas = colunasDoPerfil(d);
  const { data: membro, error } = await supabase
    .from("empresa_membros")
    .insert({ empresa_id: atual.empresaId, user_id: userId, ...colunas })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, mensagem: "Essa pessoa já faz parte da empresa." };
    return { ok: false, mensagem: "Não foi possível adicionar o usuário." };
  }

  const mensagemCriacao = novo
    ? `Usuário criado. Senha temporária: ${senha} — repasse pra pessoa (ela pode trocar em Meu perfil).`
    : `${d.email} já tinha conta e foi adicionado à empresa.`;
  if (colunas.papel === "operacao") {
    const { error: erroSetores } = await supabase.rpc("definir_setores_membro", { p_membro_id: membro.id, p_setores: setores });
    if (erroSetores) {
      revalidatePath("/configuracoes/usuarios");
      return { ok: false, mensagem: `${mensagemCriacao} Os setores não foram salvos: ${mensagemErro(erroSetores, "tente novamente")}. Abra a pessoa na lista e salve de novo.` };
    }
  }
  revalidatePath("/configuracoes/usuarios");
  return { ok: true, mensagem: mensagemCriacao };
}

const esquemaAtualizacao = esquemaPerfil.extend({
  membroId: z.string().uuid(),
  status: z.enum(STATUS_MEMBRO),
});

/** Salva perfil, setores e status. Desligar quem tem carteira passa por `desligarComTransferencia`. */
export async function atualizarMembro(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaAtualizacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };
  const d = dados.data as DadosPerfil & typeof dados.data;
  const setores = setoresDoPerfil(d);
  if (!setores) return { ok: false, mensagem: "Escolha se a pessoa executa ou coordena no setor." };

  const supabase = await criarClienteServidor();

  // Desligar com negócios em aberto passa pela transferência de carteira (desligarComTransferencia); aqui é só uma
  // trava. Arquivados ficam fora: são somente leitura e, ao desarquivar, o banco exige um responsável ativo.
  if (d.status === "desligado") {
    const { count } = await supabase
      .from("negocios")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", atual.empresaId)
      .eq("responsavel_id", d.membroId)
      .eq("status", "aberto")
      .is("arquivado_em", null);
    if (count && count > 0) {
      return { ok: false, mensagem: "Essa pessoa tem negócios em aberto: use Desligar, que transfere a carteira." };
    }
  }

  const colunas = colunasDoPerfil(d);
  const { data: atualizado, error } = await supabase
    .from("empresa_membros")
    .update({ ...colunas, status: d.status })
    .eq("id", d.membroId)
    .eq("empresa_id", atual.empresaId)
    .select("id");
  if (error) {
    if (error.message.includes("admin ativo")) return { ok: false, mensagem: "A empresa precisa ter pelo menos um admin ativo." };
    return { ok: false, mensagem: "Não foi possível salvar." };
  }
  // Pessoa de outra empresa (o admin pode ser admin de mais de uma): nada é gravado, nem os setores.
  if (!atualizado?.length) return { ok: false, mensagem: "Não foi possível acessar esta pessoa na empresa atual." };

  // Inativo perde os setores no banco (obra_ao_alterar_membro); ao reativar, o admin salva de novo.
  if (colunas.papel === "operacao" && d.status === "ativo") {
    const { error: erroSetores } = await supabase.rpc("definir_setores_membro", { p_membro_id: d.membroId, p_setores: setores });
    if (erroSetores) {
      revalidatePath("/configuracoes/usuarios");
      return { ok: false, mensagem: `Perfil salvo, mas os setores não: ${mensagemErro(erroSetores, "tente novamente")}` };
    }
  }
  revalidatePath("/configuracoes/usuarios");
  revalidatePath("/obras");
  return { ok: true, mensagem: "Salvo." };
}

export type CarteiraAberta = {
  negocios: { id: string; numero: number; contatoNome: string }[];
  vendedores: { id: string; nome: string }[];
};

/** Carrega os negócios em aberto de um vendedor e os outros vendedores ativos que podem recebê-los. */
export async function carregarCarteiraAberta(membroId: string): Promise<CarteiraAberta> {
  const { atual } = await exigirPapel("admin");
  const id = z.string().uuid().safeParse(membroId);
  if (!id.success) return { negocios: [], vendedores: [] };

  const supabase = await criarClienteServidor();
  const [{ data: negocios }, { data: vendedores }] = await Promise.all([
    supabase
      .from("negocios")
      .select("id, numero, contatos(nome)")
      .eq("empresa_id", atual.empresaId)
      .eq("responsavel_id", id.data)
      .eq("status", "aberto")
      .is("arquivado_em", null)
      .order("numero"),
    supabase
      .from("empresa_membros")
      .select("id, perfis(nome)")
      .eq("empresa_id", atual.empresaId)
      .eq("status", "ativo")
      .eq("papel", "vendedor")
      .neq("id", id.data),
  ]);

  return {
    negocios: (negocios ?? []).map((n) => ({
      id: n.id,
      numero: n.numero,
      contatoNome: (n.contatos as unknown as { nome: string } | null)?.nome ?? "(sem nome)",
    })),
    vendedores: (vendedores ?? []).map((v) => ({
      id: v.id,
      nome: (v.perfis as unknown as { nome: string } | null)?.nome ?? "(sem nome)",
    })),
  };
}

const esquemaDesligamento = z.object({
  membroId: z.string().uuid(),
  modo: z.enum(["aleatorio", "manual"]),
});

/**
 * Desliga o vendedor e, se ele tiver negócios em aberto, redistribui a
 * carteira antes: sorteando entre os vendedores marcados (modo aleatório)
 * ou conforme a escolha do gestor pra cada negócio (modo manual).
 */
export async function desligarComTransferencia(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaDesligamento.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();

  const { data: negocios } = await supabase
    .from("negocios")
    .select("id")
    .eq("empresa_id", atual.empresaId)
    .eq("responsavel_id", dados.data.membroId)
    .eq("status", "aberto")
      .is("arquivado_em", null);
  const negocioIds = (negocios ?? []).map((n) => n.id);

  if (negocioIds.length > 0) {
    const { data: vendedoresAtivos } = await supabase
      .from("empresa_membros")
      .select("id")
      .eq("empresa_id", atual.empresaId)
      .eq("status", "ativo")
      .eq("papel", "vendedor")
      .neq("id", dados.data.membroId);
    const idsValidos = new Set((vendedoresAtivos ?? []).map((v) => v.id));

    const atribuicoes = new Map<string, string>();
    if (dados.data.modo === "aleatorio") {
      const destinos = formData
        .getAll("destinos")
        .map(String)
        .filter((v) => idsValidos.has(v));
      if (destinos.length === 0) return { ok: false, mensagem: "Selecione ao menos um vendedor ativo para receber a carteira." };
      for (const negocioId of negocioIds) {
        atribuicoes.set(negocioId, destinos[Math.floor(Math.random() * destinos.length)]);
      }
    } else {
      for (const negocioId of negocioIds) {
        const destino = String(formData.get(`destino_${negocioId}`) ?? "");
        if (!idsValidos.has(destino)) return { ok: false, mensagem: "Escolha um vendedor ativo para cada negócio da carteira." };
        atribuicoes.set(negocioId, destino);
      }
    }

    for (const [negocioId, destinoId] of atribuicoes) {
      const { error } = await supabase.from("negocios").update({ responsavel_id: destinoId }).eq("id", negocioId);
      if (error) return { ok: false, mensagem: "Não foi possível redistribuir a carteira." };
    }
  }

  const { error: erroStatus } = await supabase
    .from("empresa_membros")
    .update({ status: "desligado" })
    .eq("id", dados.data.membroId)
    .eq("empresa_id", atual.empresaId);
  if (erroStatus) {
    if (erroStatus.message.includes("admin ativo")) return { ok: false, mensagem: "A empresa precisa ter pelo menos um admin ativo." };
    return { ok: false, mensagem: "A carteira foi redistribuída, mas não foi possível desligar o vendedor." };
  }

  revalidatePath("/configuracoes/usuarios");
  revalidatePath("/negocios");
  return {
    ok: true,
    mensagem: negocioIds.length > 0 ? `Vendedor desligado. ${negocioIds.length} negócio(s) redistribuído(s).` : "Vendedor desligado.",
  };
}
