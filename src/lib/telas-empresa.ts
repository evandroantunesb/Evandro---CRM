/*
 * Telas por empresa (Onboarding, subprojeto 1; 20261203100000_telas_empresa.sql; desenho em
 * docs/superpowers/specs/2026-11-10-telas-por-empresa-design.md). A empresa só TIRA telas: o papel continua decidindo
 * o resto (`pode(papel, …)`). Regra pura, sem banco: o servidor lê os dados em `telas-empresa-servidor.ts`.
 *
 *  - PRO: todas as telas opcionais, menos as que o admin desligou; o Eletroposto só com a liberação do super-admin.
 *  - Solo: nenhuma tela opcional e nenhuma área só do PRO (operação e equipe). Fica Início, Tarefas, Negócios,
 *    Contatos, Propostas e contratos e Configurações.
 */

export const TELAS_OPCIONAIS = ["painel", "leads", "forecast", "obras", "engenharia", "gamificacao", "eletroposto", "captura"] as const;
export type TelaOpcional = (typeof TELAS_OPCIONAIS)[number];

/** Textos do quadro aprovado "Onboarding PRO · passos 4 e 5". */
export const INFO_TELA: Record<TelaOpcional, { rotulo: string; descricao: string }> = {
  painel: { rotulo: "Painel", descricao: "Visão de gestão para admin e gestor" },
  leads: { rotulo: "Leads a distribuir", descricao: "Rodízio de leads entre vendedores e SDR" },
  forecast: { rotulo: "Forecast", descricao: "Negócios com chance real de fechar" },
  obras: { rotulo: "Obras", descricao: "Acompanhamento das obras e semáforo" },
  engenharia: { rotulo: "Engenharia", descricao: "Projeto, protocolo e vistoria" },
  gamificacao: { rotulo: "Gamificação", descricao: "Ranking, metas, loja e comissões" },
  eletroposto: { rotulo: "Eletroposto", descricao: "Negócios e propostas de eletroposto" },
  captura: { rotulo: "Captura de leads", descricao: "Formulário público para o site" },
};

/** Uma tela opcional, ou `"pro"`: as áreas que só existem no plano PRO (operação, equipe). */
export type Area = TelaOpcional | "pro";

export type TelasEmpresa = { solo: boolean; ligadas: ReadonlySet<TelaOpcional> };

const ehTelaOpcional = (v: unknown): v is TelaOpcional => (TELAS_OPCIONAIS as readonly unknown[]).includes(v);

export function telasDaEmpresa({
  produto,
  desligadas,
  eletropostoLiberado,
}: {
  produto: "solo" | "pro";
  desligadas: readonly string[];
  eletropostoLiberado: boolean;
}): TelasEmpresa {
  if (produto === "solo") return { solo: true, ligadas: new Set() };
  const fora = new Set(desligadas.filter(ehTelaOpcional));
  return {
    solo: false,
    ligadas: new Set(TELAS_OPCIONAIS.filter((t) => !fora.has(t) && (t !== "eletroposto" || eletropostoLiberado))),
  };
}

export const areaLigada = (t: TelasEmpresa, area: Area): boolean => (area === "pro" ? !t.solo : t.ligadas.has(area));

/** Quando a leitura falha: como sempre foi (PRO, tudo ligado), e o Eletroposto não liga sem a liberação. */
export const TELAS_PADRAO: TelasEmpresa = telasDaEmpresa({ produto: "pro", desligadas: [], eletropostoLiberado: false });

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
