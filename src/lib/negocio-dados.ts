/**
 * Regras puras da gravação do negócio (usadas no servidor e na tela): endereço do contato,
 * complemento de contato já existente e avisos de gravação parcial.
 */

/** Endereço em uma linha (rua, número, complemento, bairro, CEP). Cidade e UF ficam em campos próprios. */
export function montarEndereco(p: { rua?: string; numero?: string; complemento?: string; bairro?: string; cep?: string }): string {
  const rua = p.rua?.trim() ?? "";
  const numero = p.numero?.trim() ?? "";
  return [rua && numero ? `${rua}, ${numero}` : rua, p.complemento?.trim(), p.bairro?.trim(), p.cep?.trim() ? `CEP ${p.cep.trim()}` : ""]
    .filter(Boolean)
    .join(", ");
}

export type LocalContato = { endereco: string | null; cidade: string | null; uf: string | null };

const normalizar = (v: string) => v.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

/**
 * Contato já cadastrado: só preenche o que está vazio. Valor diferente do que já existe
 * nunca é sobrescrito em silêncio — fica de fora e `divergentes` avisa quais campos foram mantidos.
 */
export function completarContato(
  salvo: LocalContato,
  digitado: LocalContato,
): { alteracoes: Partial<LocalContato>; divergentes: (keyof LocalContato)[] } {
  const alteracoes: Partial<LocalContato> = {};
  const divergentes: (keyof LocalContato)[] = [];
  for (const campo of ["endereco", "cidade", "uf"] as const) {
    const novo = digitado[campo]?.trim();
    if (!novo) continue;
    const atual = salvo[campo]?.trim();
    if (!atual) alteracoes[campo] = novo;
    else if (normalizar(atual) !== normalizar(novo)) divergentes.push(campo);
  }
  return { alteracoes, divergentes };
}

/** Avisos de gravação parcial ao criar o negócio (vão na URL só como códigos fixos, nunca com dado do usuário). */
export const AVISOS_CRIACAO = {
  contato: "O endereço, a cidade ou a UF não foram gravados no contato. Confira e complete na ficha do contato.",
  contato_mantido:
    "O contato já tinha endereço, cidade ou UF diferentes do que foi digitado; os dados existentes foram mantidos. Para trocar, edite a ficha do contato.",
  kit: "Os itens do kit não foram salvos. Monte o kit de novo no cartão Kit personalizado.",
  calculo: "Os itens do kit foram salvos, mas o cálculo não. Abra o cartão Kit personalizado e salve de novo.",
  anexos: "Algum arquivo não foi anexado. Confira em Arquivos e envie de novo.",
} as const;

export type AvisoCriacao = keyof typeof AVISOS_CRIACAO;

/** Lê os códigos de aviso da URL, descartando qualquer coisa desconhecida. */
export function avisosDaUrl(valor: string | string[] | undefined): AvisoCriacao[] {
  const texto = Array.isArray(valor) ? valor.join(",") : (valor ?? "");
  return [...new Set(texto.split(","))].filter((c): c is AvisoCriacao => Object.hasOwn(AVISOS_CRIACAO, c));
}
