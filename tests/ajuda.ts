import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SENHA = "senha-de-teste-123";

/** Cliente sem RLS, só para preparar o cenário e conferir o resultado. */
export const servico = createClient<Database>(URL, SERVICE, { auth: { persistSession: false } });

export const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
/** Dados do cliente que o contrato exige (20261029190000_dados_cliente_contrato.sql): CPF válido, pessoa física. */
export const CLIENTE_CONTRATO = {
  documento: "529.982.247-25",
  rg: "12.345.678-9",
  data_nascimento: "1980-05-10",
  email: "cliente.contrato@exemplo.test",
  telefone: "(45) 90000-0000",
  cep: "85810000",
  logradouro: "Rua Fictícia",
  numero: "100",
  bairro: "Centro",
  cidade: "Cascavel",
  uf: "PR",
};

/**
 * Documentos do cliente que o contrato exige no negócio (20261127100000_compras_pdf_documentos.sql): documento com foto,
 * comprovante de residência e cartão CNPJ (este só conta para cliente empresa). Só os registros: a trava lê `anexos`.
 */
export async function anexarDocumentosContrato(negocioId: string) {
  const { data: negocio, error: erroNegocio } = await servico.from("negocios").select("empresa_id").eq("id", negocioId).single();
  if (erroNegocio) throw erroNegocio;
  const empresaId = negocio.empresa_id;
  const { error } = await servico.from("anexos").insert(
    (["cnh", "fatura_gerador", "cartao_cnpj"] as const).map((categoria) => ({
      empresa_id: empresaId,
      negocio_id: negocioId,
      categoria,
      caminho: `${empresaId}/${negocioId}/${crypto.randomUUID()}-${categoria}.pdf`,
      nome: `${categoria}.pdf`,
      tamanho: 10,
      tipo_mime: "application/pdf",
    })),
  );
  if (error) throw error;
}

export async function criarUsuario(nome: string) {
  const email = `${nome}-${sufixo}@teste.raion`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  const cliente = createClient<Database>(URL, ANON, { auth: { persistSession: false } });
  const { error: erroLogin } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (erroLogin) throw erroLogin;
  return { id: data.user.id, email, cliente };
}

export type Usuario = Awaited<ReturnType<typeof criarUsuario>>;

type ClienteBanco = ReturnType<typeof createClient<Database>>;
type ContratoGerado = Database["public"]["Tables"]["contratos"]["Row"];

/**
 * Cria (ou regera, em rascunho) o contrato como o app faz desde 20261215100000_contrato_texto_trava.sql: o texto vai
 * para `contratos_geracoes` pela service role e quem está logado chama `gerar_contrato_com_condicao`. Usuário do app
 * não grava `contratos` direto. Devolve a linha gravada ou o erro, sem lançar, para os testes de recusa.
 */
export async function gerarContratoTeste(
  cliente: ClienteBanco,
  campos: { empresa_id: string; negocio_id: string; conteudo: string; condicao_pagamento?: Record<string, unknown> | null },
): Promise<{ data: ContratoGerado | null; error: { message: string; code?: string } | null }> {
  const { data: sessao } = await cliente.auth.getUser();
  if (!sessao.user) return { data: null, error: { message: "Sem sessão." } };
  const { data: membro } = await servico
    .from("empresa_membros")
    .select("id")
    .eq("empresa_id", campos.empresa_id)
    .eq("user_id", sessao.user.id)
    .maybeSingle();
  if (!membro) return { data: null, error: { message: "Usuário não é membro da empresa.", code: "42501" } };

  const { data: geracao, error: erroGeracao } = await servico
    .from("contratos_geracoes")
    .insert({
      empresa_id: campos.empresa_id,
      negocio_id: campos.negocio_id,
      membro_id: membro.id,
      conteudo: campos.conteudo,
      condicao: (campos.condicao_pagamento ?? null) as Database["public"]["Tables"]["contratos_geracoes"]["Insert"]["condicao"],
    })
    .select("id")
    .single();
  if (erroGeracao) return { data: null, error: erroGeracao };

  const { error } = await cliente.rpc("gerar_contrato_com_condicao", { p_negocio_id: campos.negocio_id, p_geracao_id: geracao.id });
  if (error) {
    await servico.from("contratos_geracoes").delete().eq("id", geracao.id);
    return { data: null, error };
  }
  const { data, error: erroLeitura } = await servico.from("contratos").select("*").eq("negocio_id", campos.negocio_id).single();
  return { data, error: erroLeitura };
}
