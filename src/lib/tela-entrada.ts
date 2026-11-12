/**
 * Tela de entrada (Entrar, Recuperar senha, Crie sua senha, Sem empresa vinculada) personalizada por
 * empresa. Regras puras: textos padrão, limites, escolha da empresa lembrada no aparelho e caminho da
 * imagem no bucket público `tela-entrada`.
 */

export const BUCKET_TELA_ENTRADA = "tela-entrada";

export const LIMITE_FRASE_ENTRADA = 60;
export const LIMITE_TEXTO_ENTRADA = 140;

/** Arquivo escolhido pelo admin: até 5 MB e pelo menos 1600 px de largura. */
export const LIMITE_BYTES_IMAGEM_ENTRADA = 5 * 1024 * 1024;
export const LARGURA_MINIMA_IMAGEM_ENTRADA = 1600;
/** O navegador reduz a foto até caber nisso antes de enviar (o login abre rápido no celular). */
export const SAIDA_IMAGEM_ENTRADA = { largura: 2400, altura: 2400 } as const;
export const DICA_IMAGEM_ENTRADA = "JPG, PNG ou WebP até 5 MB, com pelo menos 1600 px de largura";

export const IMAGEM_PADRAO_ENTRADA = "/marca/paisagem.jpg";
export const FRASE_PADRAO_ENTRADA = "Relacionamentos de hoje. Resultados de amanhã.";
export const TEXTO_PADRAO_ENTRADA = "Um CRM criado para negócios que constroem o agora e um futuro mais brilhante.";

export type TelaEntrada = {
  /** URL da imagem de fundo (a da empresa ou a paisagem do Raion). */
  imagem: string;
  /** A imagem é da empresa (endereço do Storage), não a do Raion. */
  imagemPersonalizada: boolean;
  frase: string;
  texto: string;
};

export const TELA_ENTRADA_PADRAO: TelaEntrada = {
  imagem: IMAGEM_PADRAO_ENTRADA,
  imagemPersonalizada: false,
  frase: FRASE_PADRAO_ENTRADA,
  texto: TEXTO_PADRAO_ENTRADA,
};

/**
 * Empresa cuja tela de entrada o aparelho vai lembrar depois do login: a que já estava escolhida (se a
 * pessoa ainda participa dela) ou a primeira, a mesma regra que define a empresa em uso no app.
 */
export function escolherEmpresaLembrada(escolhida: string | null | undefined, empresas: readonly string[]): string | null {
  if (escolhida && empresas.includes(escolhida)) return escolhida;
  return empresas[0] ?? null;
}

/** O cookie é escrito pelo app, mas chega do navegador: só um uuid é aceito antes de consultar o banco. */
export function empresaIdValido(valor: string | null | undefined): valor is string {
  return !!valor && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}

/** Texto digitado pelo admin: sem espaços nas pontas; vazio volta ao padrão (null). */
export function normalizarTextoEntrada(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.replace(/\s+/g, " ").trim();
  return limpo ? limpo : null;
}

/** Caminho no bucket: `<empresa_id>/<uuid>.<ext>`. */
export function montarCaminhoImagemEntrada(empresaId: string, extensao: string, arquivoId: string): string {
  return `${empresaId}/${arquivoId}.${extensao}`;
}

/** O caminho é um arquivo direto na pasta da empresa (sem subpasta, sem "..", com extensão de imagem). */
export function caminhoImagemEntradaValido(empresaId: string, caminho: string): boolean {
  const prefixo = `${empresaId}/`;
  if (!caminho.startsWith(prefixo)) return false;
  return /^[0-9a-f-]{36}\.(webp|jpg|png)$/i.test(caminho.slice(prefixo.length));
}

/** Monta a tela a partir da linha da empresa: cada campo vazio fica no padrão do Raion. */
export function montarTelaEntrada(
  linha: { frase: string | null; texto: string | null; imagem_caminho: string | null } | null | undefined,
  urlPublica: (caminho: string) => string,
): TelaEntrada {
  if (!linha) return TELA_ENTRADA_PADRAO;
  return {
    imagem: linha.imagem_caminho ? urlPublica(linha.imagem_caminho) : IMAGEM_PADRAO_ENTRADA,
    imagemPersonalizada: !!linha.imagem_caminho,
    frase: linha.frase ?? FRASE_PADRAO_ENTRADA,
    texto: linha.texto ?? TEXTO_PADRAO_ENTRADA,
  };
}

/**
 * Foto da faixa do topo de cada tela (assistente, passo 3): a mesma da tela de entrada (padrão) ou a própria. Nulo = a
 * paisagem do Raion.
 */
export function urlFaixa(
  linha: { imagem_caminho: string | null; faixa_caminho: string | null; faixa_usa_entrada: boolean } | null | undefined,
  urlPublica: (caminho: string) => string,
): string | null {
  if (!linha) return null;
  const caminho = linha.faixa_usa_entrada ? linha.imagem_caminho : linha.faixa_caminho;
  return caminho ? urlPublica(caminho) : null;
}

/** A tela de entrada tem algo próprio (foto, frase ou texto do login)? A faixa não conta: tem cartão próprio. */
export const personalizacaoEntrada = (linha: { frase: string | null; texto: string | null; imagem_caminho: string | null } | null | undefined): boolean =>
  !!(linha && (linha.frase || linha.texto || linha.imagem_caminho));
