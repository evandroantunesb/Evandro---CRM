import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel, PerfilGamificacao, TipoVendedor } from "@/lib/tipos";

export const COOKIE_EMPRESA = "raion_empresa";
/** Preferência de visualização (Kanban/Lista) da tela de Negócios, por navegador. */
export const COOKIE_VISAO_NEGOCIOS = "raion_negocios_visao";

export type Vinculo = {
  membroId: string;
  empresaId: string;
  empresaNome: string;
  papel: Papel;
  tipoVendedor: TipoVendedor | null;
  /** Em qual ranking/pontuação a pessoa compete (sdr/closer/cs_farmer) — separado de `papel` (permissão). Null = fora do ranking comercial (típico de admin/gestor). */
  perfilGamificacao: PerfilGamificacao | null;
};

export type Sessao = {
  userId: string;
  email: string;
  nome: string;
  /** Caminho da foto no bucket 'avatares' (perfis.avatar_caminho); nulo = sem foto. A URL é assinada por quem exibe. */
  avatarCaminho: string | null;
  superAdmin: boolean;
  vinculos: Vinculo[];
  /** Empresa em uso. Nulo quando o usuário não participa de nenhuma (ex.: só super-admin). */
  atual: Vinculo | null;
};

/** Carrega o usuário logado e as empresas dele. Redireciona para o login se não houver sessão. */
export const obterSessao = cache(async (): Promise<Sessao> => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil }, { data: admin }, { data: membros }] = await Promise.all([
    supabase.from("perfis").select("nome, email, avatar_caminho").eq("id", user.id).maybeSingle(),
    supabase.from("plataforma_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("empresa_membros")
      .select("id, empresa_id, papel, tipo_vendedor, perfil_gamificacao, empresas!inner(nome, situacao)")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .eq("empresas.situacao", "ativa")
      .order("created_at"),
  ]);

  const vinculos: Vinculo[] = (membros ?? []).map((m) => ({
    membroId: m.id,
    empresaId: m.empresa_id,
    empresaNome: (m.empresas as unknown as { nome: string }).nome,
    papel: m.papel as Papel,
    tipoVendedor: m.tipo_vendedor as TipoVendedor | null,
    perfilGamificacao: m.perfil_gamificacao as PerfilGamificacao | null,
  }));

  const escolhida = (await cookies()).get(COOKIE_EMPRESA)?.value;
  const atual = vinculos.find((v) => v.empresaId === escolhida) ?? vinculos[0] ?? null;

  return {
    userId: user.id,
    email: user.email ?? perfil?.email ?? "",
    nome: perfil?.nome || user.email || "",
    avatarCaminho: perfil?.avatar_caminho ?? null,
    superAdmin: Boolean(admin),
    vinculos,
    atual,
  };
});

/**
 * Exige uma empresa em uso com um dos papéis informados (ao menos um: a lista vazia,
 * que aceitaria qualquer papel, não compila). Listas por recurso em `@/lib/permissoes`.
 */
export async function exigirPapel(...papeis: readonly [Papel, ...Papel[]]) {
  const sessao = await exigirMembro();
  if (!papeis.includes(sessao.atual.papel)) redirect("/inicio");
  return sessao;
}

/**
 * Exige só uma empresa em uso, com qualquer papel. Use apenas em recurso pessoal
 * (notificações, perfil, início) — recurso de negócio usa `exigirPapel`.
 */
export async function exigirMembro() {
  const sessao = await obterSessao();
  if (!sessao.atual) redirect(sessao.superAdmin ? "/super-admin" : "/sem-acesso");
  return { ...sessao, atual: sessao.atual };
}

export async function exigirSuperAdmin() {
  const sessao = await obterSessao();
  if (!sessao.superAdmin) redirect("/inicio");
  return sessao;
}
