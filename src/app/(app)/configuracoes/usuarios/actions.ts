"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarUsuarioDireto } from "@/lib/convites";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, TIPOS_VENDEDOR, STATUS_MEMBRO, type ResultadoAcao } from "@/lib/tipos";

const esquemaConvite = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().email("E-mail inválido"),
  papel: z.enum(PAPEIS),
  tipo_vendedor: z.enum(TIPOS_VENDEDOR),
  senha: z
    .string()
    .trim()
    .min(8, "A senha precisa ter pelo menos 8 caracteres")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

function gerarSenhaTemporaria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let senha = "";
  for (let i = 0; i < 10; i++) senha += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return senha;
}

/** Cadastra vendedor/representante direto, com senha própria — sem depender de convite por e-mail. */
export async function convidarMembro(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaConvite.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };

  const senha = dados.data.senha ?? gerarSenhaTemporaria();
  let userId: string;
  let novo: boolean;
  try {
    ({ userId, novo } = await criarUsuarioDireto(dados.data.email, dados.data.nome, senha));
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }

  // O vínculo é gravado com a sessão do admin: o RLS confere a permissão de novo.
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("empresa_membros").insert({
    empresa_id: atual.empresaId,
    user_id: userId,
    papel: dados.data.papel,
    tipo_vendedor: dados.data.papel === "vendedor" ? dados.data.tipo_vendedor : null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, mensagem: "Essa pessoa já faz parte da empresa." };
    return { ok: false, mensagem: "Não foi possível adicionar o usuário." };
  }

  revalidatePath("/configuracoes/usuarios");
  return {
    ok: true,
    mensagem: novo
      ? `Usuário criado. Senha temporária: ${senha} — repasse pra pessoa (ela pode trocar em Meu perfil).`
      : `${dados.data.email} já tinha conta e foi adicionado à empresa.`,
  };
}

const esquemaAtualizacao = z.object({
  membroId: z.string().uuid(),
  papel: z.enum(PAPEIS),
  tipo_vendedor: z.enum(TIPOS_VENDEDOR),
  recebe_leads: z.enum(["on"]).optional(),
  status: z.enum(STATUS_MEMBRO),
});

export async function atualizarMembro(_: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const { atual } = await exigirPapel("admin");
  const dados = esquemaAtualizacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { ok: false, mensagem: "Dados inválidos." };

  const supabase = await criarClienteServidor();

  // Desligar com negócios em aberto passa pela transferência de carteira
  // (desligarComTransferencia) — aqui é só uma trava de segurança.
  if (dados.data.status === "desligado") {
    const { count } = await supabase
      .from("negocios")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", atual.empresaId)
      .eq("responsavel_id", dados.data.membroId)
      .eq("status", "aberto");
    if (count && count > 0) {
      return { ok: false, mensagem: "Esse vendedor tem negócios em aberto — use a opção de desligar com transferência de carteira." };
    }
  }

  const { error } = await supabase
    .from("empresa_membros")
    .update({
      papel: dados.data.papel,
      tipo_vendedor: dados.data.papel === "vendedor" ? dados.data.tipo_vendedor : null,
      recebe_leads: dados.data.recebe_leads === "on",
      status: dados.data.status,
    })
    .eq("id", dados.data.membroId)
    .eq("empresa_id", atual.empresaId);

  if (error) {
    if (error.message.includes("admin ativo")) {
      return { ok: false, mensagem: "A empresa precisa ter pelo menos um admin ativo." };
    }
    return { ok: false, mensagem: "Não foi possível salvar." };
  }
  revalidatePath("/configuracoes/usuarios");
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
    .eq("status", "aberto");
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
