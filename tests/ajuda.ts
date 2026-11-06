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
