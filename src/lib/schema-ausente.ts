/*
 * Compatibilidade defensiva para quando o código chega antes da migration (a preview da Vercel usa o
 * banco de produção). Só reconhece "o objeto NOVO que pedimos não existe": o código do erro precisa
 * ser de objeto inexistente (Postgres 42P01/42883 ou PostgREST PGRST205/PGRST202) E a mensagem precisa
 * citar o objeto esperado. Qualquer outra falha (RLS, permissão, rede, consulta inválida) não é
 * reconhecida aqui e deve continuar estourando.
 */
type ErroBanco = { code?: string | null; message?: string | null } | null | undefined;

const citaObjeto = (erro: ErroBanco, objeto: string) => (erro?.message ?? "").includes(objeto);

export function tabelaAusente(erro: ErroBanco, tabela: string): boolean {
  return (erro?.code === "42P01" || erro?.code === "PGRST205") && citaObjeto(erro, tabela);
}

export function funcaoAusente(erro: ErroBanco, funcao: string): boolean {
  return (erro?.code === "42883" || erro?.code === "PGRST202") && citaObjeto(erro, funcao);
}

/** Deixa rastro nos logs do servidor: o fallback não pode esconder um schema faltando. */
export function avisarSchemaAusente(objeto: string, erro: ErroBanco) {
  console.warn(`[schema-ausente] ${objeto} indisponível (${erro?.code}): ${erro?.message}`);
}
