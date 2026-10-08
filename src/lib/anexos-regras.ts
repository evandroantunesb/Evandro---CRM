/**
 * Regras de anexos usadas no navegador e no servidor. Arquivo nunca passa por Server Action
 * (limite padrão de 1 MB do corpo): a ação só recebe os dados do arquivo (nome, tamanho,
 * tipo), reserva o registro em `anexos` e o navegador envia o conteúdo direto ao Storage.
 * Registro sem arquivo no Storage = envio que não chegou (aparece como pendente na ficha).
 */
import type { CategoriaAnexo } from "@/lib/tipos";

/** Mesmo limite do bucket `anexos` (20 MB). */
export const LIMITE_ANEXO = 20 * 1024 * 1024;

export type ArquivoMeta = { nome: string; tamanho: number; tipoMime: string };

/** Campos de arquivo do cadastro do negócio e a categoria de cada um. */
export const ANEXOS_CRIACAO = [
  { campo: "anexo_cnh_contato", categoria: "cnh" },
  { campo: "anexo_fatura_gerador", categoria: "fatura_gerador" },
  // Fotos e outros documentos: categoria geral (antes caíam como "fatura do beneficiário").
  { campo: "anexo_geral", categoria: "geral" },
] as const satisfies readonly { campo: string; categoria: CategoriaAnexo }[];

export type CampoAnexoCriacao = (typeof ANEXOS_CRIACAO)[number]["campo"];

export const metaArquivo = (f: File): ArquivoMeta => ({ nome: f.name || "arquivo", tamanho: f.size, tipoMime: f.type });

/** Motivo para recusar o arquivo antes de qualquer gravação, ou null se está ok. */
export function problemaArquivo(a: { nome: string; tamanho: number }): string | null {
  if (a.tamanho <= 0) return `"${a.nome}" está vazio.`;
  if (a.tamanho > LIMITE_ANEXO) return `"${a.nome}" passa de 20 MB.`;
  return null;
}

/**
 * Arquivos escolhidos num campo. Sem escolha, o navegador manda um arquivo vazio e sem nome —
 * esse é ignorado; um arquivo vazio escolhido pelo usuário (com nome) é mantido para ser recusado.
 */
export function arquivosEscolhidos(formData: FormData, campo: string): File[] {
  return formData.getAll(campo).filter((v): v is File => v instanceof File && !(v.size === 0 && v.name === ""));
}

/** Nome seguro para o caminho no Storage (o nome original fica no registro). */
export function nomeSeguro(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80);
  return `${crypto.randomUUID()}-${limpo || "arquivo"}`;
}

/**
 * Prepara o envio do cadastro: tira os arquivos do FormData (só os dados deles vão para a ação,
 * no campo `anexos`) e aponta o primeiro arquivo inválido. Os arquivos ficam para o envio direto.
 */
export function prepararEnvioCriacao(formData: FormData): {
  dados: FormData;
  arquivos: { campo: CampoAnexoCriacao; arquivo: File }[];
  problema: string | null;
} {
  const dados = new FormData();
  for (const [chave, valor] of formData.entries()) {
    if (!(valor instanceof File)) dados.append(chave, valor);
  }
  const arquivos = ANEXOS_CRIACAO.flatMap(({ campo }) => arquivosEscolhidos(formData, campo).map((arquivo) => ({ campo, arquivo })));
  const problema = arquivos.map((a) => problemaArquivo(metaArquivo(a.arquivo))).find(Boolean) ?? null;
  dados.set("anexos", JSON.stringify(arquivos.map((a) => ({ campo: a.campo, ...metaArquivo(a.arquivo) }))));
  return { dados, arquivos, problema };
}
