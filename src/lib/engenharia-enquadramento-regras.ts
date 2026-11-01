/**
 * Enquadramento da obra (spec v1.3, seção 24.1) e condições dos itens do checklist (P6c). As opções são as mesmas de
 * `opcoes_enquadramento_engenharia()` no banco, que recusa qualquer outra. Nenhuma regra da distribuidora vem pronta:
 * o admin diz, em cada item do modelo, para quais respostas ele vale.
 */

export const PERGUNTAS_ENQUADRAMENTO = [
  {
    chave: "tipo_solicitacao",
    rotulo: "Tipo de solicitação",
    opcoes: [
      { valor: "nova_conexao", rotulo: "Nova conexão" },
      { valor: "ampliacao", rotulo: "Ampliação" },
      { valor: "regularizacao", rotulo: "Regularização" },
      { valor: "outro", rotulo: "Outra" },
    ],
  },
  {
    chave: "categoria",
    rotulo: "Categoria",
    opcoes: [
      { valor: "micro", rotulo: "Microgeração" },
      { valor: "mini", rotulo: "Minigeração" },
      { valor: "indefinida", rotulo: "Indefinida" },
    ],
  },
  {
    chave: "faixa_formulario",
    rotulo: "Faixa do formulário",
    opcoes: [
      { valor: "ate_10kw", rotulo: "Até 10 kW" },
      { valor: "de_10_a_75kw", rotulo: "Acima de 10 até 75 kW" },
      { valor: "mini", rotulo: "Minigeração" },
    ],
  },
  {
    chave: "tipo_instalacao",
    rotulo: "Tipo de instalação",
    opcoes: [
      { valor: "telhado", rotulo: "Telhado" },
      { valor: "solo", rotulo: "Solo" },
      { valor: "outra", rotulo: "Outra" },
    ],
  },
  {
    chave: "modalidade_scee",
    rotulo: "Modalidade SCEE",
    opcoes: [
      { valor: "local", rotulo: "Local" },
      { valor: "remoto", rotulo: "Remoto" },
      { valor: "multiplas_ucs", rotulo: "Múltiplas UCs" },
      { valor: "compartilhada", rotulo: "Compartilhada" },
      { valor: "outra", rotulo: "Outra" },
    ],
  },
  {
    chave: "titularidade",
    rotulo: "Titularidade",
    opcoes: [
      { valor: "pf", rotulo: "Pessoa física" },
      { valor: "pj", rotulo: "Pessoa jurídica" },
      { valor: "terceiro_procuracao", rotulo: "Terceiro com procuração" },
    ],
  },
  {
    chave: "obra_rede",
    rotulo: "Obra de rede",
    opcoes: [
      { valor: "sim", rotulo: "Sim" },
      { valor: "nao", rotulo: "Não" },
      { valor: "desconhecido", rotulo: "Desconhecido" },
    ],
  },
  {
    chave: "inversor_verificado",
    rotulo: "Inversor verificado",
    opcoes: [
      { valor: "sim", rotulo: "Sim" },
      { valor: "nao", rotulo: "Não" },
      { valor: "verificar", rotulo: "Verificar" },
    ],
  },
  {
    chave: "situacao_ambiental",
    rotulo: "Situação ambiental",
    opcoes: [
      { valor: "nao_aplicavel", rotulo: "Não aplicável (com justificativa)" },
      { valor: "dispensa", rotulo: "Dispensa" },
      { valor: "licenca", rotulo: "Licença" },
      { valor: "verificar", rotulo: "Verificar" },
    ],
  },
] as const;

export type ChavePergunta = (typeof PERGUNTAS_ENQUADRAMENTO)[number]["chave"];
export const CHAVES_PERGUNTA = PERGUNTAS_ENQUADRAMENTO.map((p) => p.chave) as ChavePergunta[];
const PERGUNTA = new Map<string, (typeof PERGUNTAS_ENQUADRAMENTO)[number]>(PERGUNTAS_ENQUADRAMENTO.map((p) => [p.chave, p]));

export const ehChavePergunta = (s: string): s is ChavePergunta => PERGUNTA.has(s);
export const respostaValida = (chave: ChavePergunta, valor: string) => PERGUNTA.get(chave)!.opcoes.some((o) => o.valor === valor);
export const rotuloPergunta = (chave: string) => PERGUNTA.get(chave)?.rotulo ?? chave;
export const rotuloResposta = (chave: string, valor: string) => PERGUNTA.get(chave)?.opcoes.find((o) => o.valor === valor)?.rotulo ?? valor;

export type RespostasEnquadramento = Partial<Record<ChavePergunta, string>>;

export type EnquadramentoVM = {
  respostas: RespostasEnquadramento;
  justificativaAmbiental: string | null;
  potenciaModulosKwp: number | null;
  potenciaInversoresKw: number | null;
  atualizadoEm: string;
  atualizadoPor: string | null;
};

/** Todas as perguntas de opção respondidas ("Desconhecido" e "Verificar" contam): libera o passo 2. */
export const enquadramentoCompleto = (e: Pick<EnquadramentoVM, "respostas"> | null) => e != null && CHAVES_PERGUNTA.every((c) => !!e.respostas[c]);

/** Perguntas ainda sem resposta, na ordem da ficha. */
export const perguntasSemResposta = (e: Pick<EnquadramentoVM, "respostas"> | null) =>
  PERGUNTAS_ENQUADRAMENTO.filter((p) => !e?.respostas[p.chave]).map((p) => p.rotulo);

/** Condições de um item do modelo: pergunta → respostas para as quais o item vale. Vazio = vale sempre. */
export type CondicoesItem = Partial<Record<ChavePergunta, string[]>>;

/** Lê o jsonb do banco, descartando o que não for pergunta ou resposta conhecida. */
export function lerCondicoes(json: unknown): CondicoesItem {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const condicoes: CondicoesItem = {};
  for (const [chave, valores] of Object.entries(json)) {
    if (!ehChavePergunta(chave) || !Array.isArray(valores)) continue;
    const aceitas = valores.filter((v): v is string => typeof v === "string" && respostaValida(chave, v));
    if (aceitas.length) condicoes[chave] = aceitas;
  }
  return condicoes;
}

/** Mesma regra de `item_vale_no_enquadramento`: pergunta sem resposta não exclui; sem ficha, vale. */
export function itemVale(condicoes: CondicoesItem, respostas: RespostasEnquadramento | null): boolean {
  if (!respostas) return true;
  return Object.entries(condicoes).every(([chave, aceitas]) => {
    const r = respostas[chave as ChavePergunta];
    return !r || aceitas!.includes(r);
  });
}

/** "Titularidade: Terceiro com procuração · Tipo de instalação: Solo"; vazio = "Vale sempre". */
export function textoCondicoes(condicoes: CondicoesItem): string {
  const partes = PERGUNTAS_ENQUADRAMENTO.filter((p) => condicoes[p.chave]?.length).map(
    (p) => `${p.rotulo}: ${condicoes[p.chave]!.map((v) => rotuloResposta(p.chave, v)).join(" ou ")}`,
  );
  return partes.length ? partes.join(" · ") : "Vale sempre";
}
