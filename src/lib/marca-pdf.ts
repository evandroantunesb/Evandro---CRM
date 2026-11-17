import "server-only";
import { registrarErro } from "@/lib/log";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/** Marca da empresa no cabeçalho dos PDFs de contrato e procuração. */
export type MarcaPdf = { logoUrl: string | null; nome: string | null };

const EXPIRA_SEGUNDOS = 3600;
/** O react-pdf só desenha PNG e JPEG: um logo WebP fica de fora e sai só o nome. */
const LOGO_DESENHAVEL = /\.(png|jpe?g)$/i;

/**
 * Logo de fundo claro da identidade da proposta (o PDF é branco), assinado com a chave de serviço, e o nome de exibição
 * (sem ele, o nome da empresa). Quem chama já conferiu o acesso: o contrato pelo token, a procuração pela sessão ou
 * pela RPC da obra. Qualquer falha vira "sem logo"; nunca a marca Raion e nunca um erro no PDF.
 */
export async function lerMarcaPdf(empresaId: string, admin = criarClienteAdmin()): Promise<MarcaPdf> {
  const [{ data: identidade }, { data: empresa }] = await Promise.all([
    admin.from("proposta_identidades").select("logo_url, nome_exibicao").eq("empresa_id", empresaId).maybeSingle(),
    admin.from("empresas").select("nome").eq("id", empresaId).maybeSingle(),
  ]);
  const nome = identidade?.nome_exibicao?.trim() || empresa?.nome || null;
  const caminho = identidade?.logo_url ?? null;
  if (!caminho || !LOGO_DESENHAVEL.test(caminho)) return { logoUrl: null, nome };
  try {
    const { data, error } = await admin.storage.from("proposta-marca").createSignedUrl(caminho, EXPIRA_SEGUNDOS);
    if (error || !data?.signedUrl) {
      registrarErro("Não foi possível assinar o logo da empresa para o PDF; segue só com o nome.", error);
      return { logoUrl: null, nome };
    }
    return { logoUrl: data.signedUrl, nome };
  } catch (erro) {
    registrarErro("Não foi possível assinar o logo da empresa para o PDF; segue só com o nome.", erro);
    return { logoUrl: null, nome };
  }
}
