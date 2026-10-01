/**
 * Resolução de distribuidora por município (Etapa 1 do wizard "Adicionar
 * negócio" — pedido do Evandro em 2026-09-30, arquitetura da Fase 2 fechada
 * em 2026-10-01). Fluxo desejado: cidade/UF do negócio → município (código
 * IBGE) → distribuidora(s) que atendem esse município → tarifa homologada
 * (via `buscarTarifaHomologada`/`buscarTarifaPorSigla`, em
 * `src/lib/aneel.ts`/`src/lib/acoes/aneel.ts`). Município e distribuidora
 * vêm de `municipios_ibge`/`municipios_distribuidoras` (consultadas pelas
 * actions em `src/lib/acoes/distribuidoras.ts`) — as funções deste arquivo só
 * decidem o que fazer com as linhas já carregadas do banco, sem tocar em
 * banco, pra ficar testável sem Supabase.
 *
 * Não é 1:1: um município pode ser atendido por mais de uma distribuidora
 * (área de fronteira entre concessões) — por isso a resolução nunca escolhe
 * sozinha entre candidatas diferentes, só quando sobra exatamente uma.
 *
 * Nunca hardcode aqui o nome/sigla de uma distribuidora real (Copel, Enel,
 * Cemig etc.) — isso é dado carregado via `importarMunicipiosDistribuidoras`,
 * nunca constante de código. Fixtures com nomes reais só em arquivos de
 * teste, claramente identificadas como dados de teste.
 */

export type DistribuidoraCandidata = {
  codigoIbge: string;
  /** SigAgente da ANEEL (ex.: "CPFL-PAULISTA") — mesmo valor usado em `buscarTarifaHomologada`. */
  siglaDistribuidora: string;
  /** NumCNPJ da ANEEL; `null` quando a carga não trouxe o CNPJ pra essa linha. */
  cnpjDistribuidora: string | null;
};

export type ResolucaoDistribuidora =
  | { tipo: "unica"; distribuidora: DistribuidoraCandidata }
  | { tipo: "ambigua"; distribuidoras: DistribuidoraCandidata[] }
  | { tipo: "nao_encontrada" };

/** Maiúsculas, sem acento, sem espaço nas pontas — pra comparar nome de cidade digitado à mão com o cadastro do IBGE. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Município sem nenhuma distribuidora cadastrada: não encontrada (cai pra
 * seleção manual). Uma só: preenche automático. Mais de uma (município na
 * fronteira entre áreas de concessão): pede seleção ao vendedor — nunca
 * escolhe sozinho entre concessionárias diferentes.
 */
export function resolverDistribuidora(candidatas: DistribuidoraCandidata[]): ResolucaoDistribuidora {
  if (candidatas.length === 0) return { tipo: "nao_encontrada" };
  if (candidatas.length === 1) return { tipo: "unica", distribuidora: candidatas[0] };
  return { tipo: "ambigua", distribuidoras: candidatas };
}

export type EscolhaManualDistribuidora = {
  siglaDistribuidora: string;
  cnpjDistribuidora?: string | null;
};

/** Campos prontos pra gravar em `dimensionamentos_solares` (sigla_distribuidora/nome_distribuidora/origem_distribuidora). */
export type CamposDistribuidoraDimensionamento = {
  siglaDistribuidora: string | null;
  nomeDistribuidora: string | null;
  origemDistribuidora: "municipio" | "manual" | null;
};

/**
 * Converte o resultado de `resolverDistribuidora` (mais, quando "ambígua" ou
 * "não encontrada", a escolha manual do vendedor) no formato pronto pra
 * gravar no dimensionamento do negócio. Não grava nada sozinha — é só a
 * lógica de decisão, pra `salvarDimensionamento`
 * (src/lib/acoes/dimensionamento.ts, integração ainda pendente pra Fase
 * 4/5) chamar antes de persistir. Nunca escreve em
 * `municipios_distribuidoras`: aquela tabela é dado global compartilhado
 * entre empresas, só admin da plataforma escreve nela (ver RLS da
 * migration); a escolha manual é decisão do negócio, guardada só no
 * dimensionamento.
 *
 * Sem um mapeamento confiável sigla → nome comercial vindo da ANEEL nesta
 * fase (a base de continuidade só traz `DscConjUndConsumidoras`, que
 * descreve o conjunto de unidades consumidoras, não o agente), usa a
 * própria sigla como `nomeDistribuidora` até existir esse mapeamento.
 */
export function registrarEscolhaDistribuidora(
  resolucao: ResolucaoDistribuidora,
  escolhaManual?: EscolhaManualDistribuidora,
): CamposDistribuidoraDimensionamento {
  const siglaManual = escolhaManual?.siglaDistribuidora?.trim();
  if (siglaManual) {
    return { siglaDistribuidora: siglaManual, nomeDistribuidora: siglaManual, origemDistribuidora: "manual" };
  }
  if (resolucao.tipo === "unica") {
    const { siglaDistribuidora } = resolucao.distribuidora;
    return { siglaDistribuidora, nomeDistribuidora: siglaDistribuidora, origemDistribuidora: "municipio" };
  }
  return { siglaDistribuidora: null, nomeDistribuidora: null, origemDistribuidora: null };
}

/** Uma linha já normalizada da importação em lote (ver `importarMunicipiosDistribuidoras`). */
export type LinhaImportacaoMunicipioDistribuidora = {
  codigoIbge: string;
  municipio: string;
  uf: string;
  distribuidoraSigla: string;
  distribuidoraCnpj: string | null;
  fonte: string;
  /** Formato "AAAA-MM-DD"; `null` quando a carga não informou. */
  dataReferencia: string | null;
};

/**
 * Valida e normaliza uma linha de CSV no formato final combinado com o
 * Evandro (`codigo_ibge, municipio, uf, distribuidora_sigla,
 * distribuidora_cnpj, fonte, data_referencia`) — resultado do join das duas
 * bases da ANEEL (IndQual Município + Indicadores Coletivos de
 * Continuidade) por `IdeConjUndConsumidoras`, feito por quem prepara o CSV
 * antes de chamar `importarMunicipiosDistribuidoras` (não é responsabilidade
 * desta função nem da action).
 */
export function linhaCsvParaMunicipioDistribuidora(
  linha: Record<string, string>,
): { ok: true; valores: LinhaImportacaoMunicipioDistribuidora } | { ok: false; erro: string } {
  const codigoIbge = (linha.codigo_ibge ?? "").trim();
  if (!/^\d{7}$/.test(codigoIbge)) return { ok: false, erro: "codigo_ibge deve ter 7 dígitos" };

  const municipio = (linha.municipio ?? "").trim();
  if (!municipio) return { ok: false, erro: "municipio é obrigatório" };

  const uf = (linha.uf ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: "uf deve ter 2 letras" };

  const distribuidoraSigla = (linha.distribuidora_sigla ?? "").trim();
  if (!distribuidoraSigla) return { ok: false, erro: "distribuidora_sigla é obrigatório" };

  const distribuidoraCnpj = (linha.distribuidora_cnpj ?? "").trim() || null;
  const fonte = (linha.fonte ?? "").trim() || "aneel";

  const dataReferencia = (linha.data_referencia ?? "").trim();
  if (dataReferencia && Number.isNaN(Date.parse(dataReferencia))) {
    return { ok: false, erro: "data_referencia inválida" };
  }

  return {
    ok: true,
    valores: {
      codigoIbge,
      municipio,
      uf,
      distribuidoraSigla,
      distribuidoraCnpj,
      fonte,
      dataReferencia: dataReferencia || null,
    },
  };
}
