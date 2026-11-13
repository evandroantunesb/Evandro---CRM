/*
 * Telas por empresa (Onboarding, subprojeto 1; 20261203100000_telas_empresa.sql; desenho em
 * docs/superpowers/specs/2026-11-10-telas-por-empresa-design.md). A empresa só TIRA telas: o papel continua decidindo
 * o resto (`pode(papel, …)`). Regra pura, sem banco: o servidor lê os dados em `telas-empresa-servidor.ts`.
 *
 *  - PRO: todas as telas opcionais, menos as que o admin desligou; o Eletroposto só com a liberação do super-admin.
 *  - Solo: nenhuma tela opcional e nenhuma área só do PRO (operação e equipe). Fica Início, Tarefas, Negócios,
 *    Contatos, Propostas e contratos e Configurações, e Obras na versão checklist (subprojeto 4b).
 *  - Setores da obra (subprojeto 4a, 20261206100000_setores_da_obra.sql): o PRO desliga Engenharia e/ou Administrativo.
 *    A tela Engenharia segue a chave do setor (área `"engenharia"`), não é mais tela opcional.
 */

export const TELAS_OPCIONAIS = ["painel", "leads", "forecast", "obras", "gamificacao", "eletroposto", "captura"] as const;
export type TelaOpcional = (typeof TELAS_OPCIONAIS)[number];

/** Textos do quadro aprovado "Onboarding PRO · passos 4 e 5". */
export const INFO_TELA: Record<TelaOpcional, { rotulo: string; descricao: string }> = {
  painel: { rotulo: "Painel", descricao: "Visão de gestão para admin e gestor" },
  leads: { rotulo: "Leads a distribuir", descricao: "Rodízio de leads entre vendedores e SDR" },
  forecast: { rotulo: "Forecast", descricao: "Negócios com chance real de fechar" },
  obras: { rotulo: "Obras", descricao: "Acompanhamento das obras e semáforo" },
  gamificacao: { rotulo: "Gamificação", descricao: "Ranking, metas, loja e comissões" },
  eletroposto: { rotulo: "Eletroposto", descricao: "Negócios e propostas de eletroposto" },
  captura: { rotulo: "Captura de leads", descricao: "Formulário público para o site" },
};

/** Setores que a empresa PRO pode não ter (Compras e Operacional nunca desligam). */
export const SETORES_DESLIGAVEIS = ["engenharia", "administrativo"] as const;
export type SetorDesligavel = (typeof SETORES_DESLIGAVEIS)[number];

/** Textos do quadro aprovado "OnboardingProTelas". */
export const INFO_SETOR: Record<SetorDesligavel, { rotulo: string; descricao: string }> = {
  engenharia: { rotulo: "Engenharia", descricao: "Projeto, ART, protocolo, vistoria e conexão" },
  administrativo: { rotulo: "Administrativo", descricao: "Paga fornecedores e cuida da NF do cliente" },
};

/**
 * Uma tela opcional; `"pro"`: as áreas que só existem no plano PRO (operação, equipe); `"engenharia"`: as telas do
 * setor Engenharia (só no PRO e com o setor ligado).
 */
export type Area = TelaOpcional | "pro" | "engenharia";

export type TelasEmpresa = {
  solo: boolean;
  ligadas: ReadonlySet<TelaOpcional>;
  setoresDesligados: ReadonlySet<SetorDesligavel>;
  /** A leitura falhou e estes são os valores padrão: a configuração não pode ser salva por cima. */
  leituraFalhou?: boolean;
};

const ehTelaOpcional = (v: unknown): v is TelaOpcional => (TELAS_OPCIONAIS as readonly unknown[]).includes(v);
const ehSetorDesligavel = (v: unknown): v is SetorDesligavel => (SETORES_DESLIGAVEIS as readonly unknown[]).includes(v);

export function telasDaEmpresa({
  produto,
  desligadas,
  setoresDesligados,
  eletropostoLiberado,
}: {
  produto: "solo" | "pro";
  desligadas: readonly string[];
  setoresDesligados: readonly string[];
  eletropostoLiberado: boolean;
}): TelasEmpresa {
  if (produto === "solo") return { solo: true, ligadas: new Set(), setoresDesligados: new Set() };
  const fora = new Set(desligadas.filter(ehTelaOpcional));
  return {
    solo: false,
    ligadas: new Set(TELAS_OPCIONAIS.filter((t) => !fora.has(t) && (t !== "eletroposto" || eletropostoLiberado))),
    setoresDesligados: new Set(setoresDesligados.filter(ehSetorDesligavel)),
  };
}

export function areaLigada(t: TelasEmpresa, area: Area): boolean {
  if (area === "pro") return !t.solo;
  // Solo: Obras sempre ligada, na versão checklist (obra do Solo, 20261207100000_obra_solo.sql).
  if (area === "obras" && t.solo) return true;
  if (area === "engenharia") return !t.solo && !t.setoresDesligados.has("engenharia");
  return t.ligadas.has(area);
}

/** Quando a leitura falha: como sempre foi (PRO, tudo ligado), e o Eletroposto não liga sem a liberação. */
export const TELAS_PADRAO: TelasEmpresa = telasDaEmpresa({ produto: "pro", desligadas: [], setoresDesligados: [], eletropostoLiberado: false });

/**
 * Combinação que o admin pode escolher, mas deve saber o efeito (decisão do Evandro de 10/11/2026): a Captura ligada
 * sem Leads a distribuir deixa os leads do formulário na fila de distribuição, sem tela para aprovar.
 */
export function avisoTelas(ligadas: readonly TelaOpcional[]): string | null {
  return ligadas.includes("captura") && !ligadas.includes("leads")
    ? "Com a Captura de leads ligada e Leads a distribuir desligada, os leads que chegam pelo formulário ficam na fila sem ninguém para aprovar."
    : null;
}

/** Lista de telas desligadas enviada pela tela de Configurações (JSON). Nulo = inválida. */
/**
 * Telas desligadas a gravar. Sem a liberação do super-admin o Eletroposto não aparece no formulário: fica como está
 * gravado, para o desligamento do admin não se perder quando a liberação voltar.
 */
export function desligadasParaGravar(pedidas: readonly TelaOpcional[], gravadas: readonly string[], eletropostoLiberado: boolean): TelaOpcional[] {
  if (eletropostoLiberado) return [...pedidas];
  const semEletroposto = pedidas.filter((t) => t !== "eletroposto");
  return gravadas.includes("eletroposto") ? [...semEletroposto, "eletroposto"] : semEletroposto;
}

export function lerDesligadas(texto: string): TelaOpcional[] | null {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!Array.isArray(valor) || !valor.every(ehTelaOpcional)) return null;
  return [...new Set(valor)];
}

/** Lista de setores desligados enviada pela tela de Configurações (JSON). Nulo = inválida. */
export function lerSetoresDesligados(texto: string): SetorDesligavel[] | null {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!Array.isArray(valor) || !valor.every(ehSetorDesligavel)) return null;
  return [...new Set(valor)];
}
