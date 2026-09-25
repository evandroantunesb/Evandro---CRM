/** Erros do banco marcados com hint "mensagem_usuario" já vêm prontos para mostrar na tela. */
export function mensagemErro(erro: { message: string; hint?: string | null } | null | undefined, padrao: string) {
  if (erro?.hint === "mensagem_usuario") return erro.message;
  return padrao;
}
