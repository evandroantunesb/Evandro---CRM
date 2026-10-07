import type { Papel } from "@/lib/tipos";

/**
 * Quem pode usar cada recurso do app, sempre como lista positiva de papéis.
 *
 * Regra: nenhum acesso é concedido por exclusão ("todo mundo menos o SDR"). Assim, um
 * papel novo não herda nada até ser incluído de propósito na lista do recurso.
 * A RLS do banco continua sendo a barreira principal; estas listas definem o que cada
 * papel vê e consegue acionar no app.
 */
export type ListaPapeis = readonly [Papel, ...Papel[]];

// --- Comercial ---------------------------------------------------------------

/** Telas e ações de negócio (Kanban, ficha, criar, mover, editar, etiquetas, qualificação, handoff). */
export const NEGOCIOS = ["admin", "gestor", "vendedor", "sdr"] as const satisfies ListaPapeis;

/** Ficha de um contato (o SDR vê os contatos dos próprios negócios). */
export const FICHA_CONTATO = ["admin", "gestor", "vendedor", "sdr"] as const satisfies ListaPapeis;

/** Carteira geral de contatos (/contatos). SDR fora (spec RAION_SDR_REGRAS_PERMISSOES). */
export const CARTEIRA_CONTATOS = ["admin", "gestor", "vendedor"] as const satisfies ListaPapeis;

/** Marcar negócio como ganho/perdido. SDR fora (spec §39). */
export const FECHAR_NEGOCIO = ["admin", "gestor", "vendedor"] as const satisfies ListaPapeis;

/** Alterar o valor de um negócio já criado. SDR fora (spec §39). */
export const EDITAR_VALOR_NEGOCIO = ["admin", "gestor", "vendedor"] as const satisfies ListaPapeis;

/** Escolher ou trocar o responsável de um negócio. Poder de gestão. */
export const ESCOLHER_RESPONSAVEL_NEGOCIO = ["admin", "gestor"] as const satisfies ListaPapeis;

/** Filtrar a lista de negócios por responsável. Poder de gestão. */
export const FILTRAR_NEGOCIOS_POR_RESPONSAVEL = ["admin", "gestor"] as const satisfies ListaPapeis;

/** Gerar e alterar proposta e contrato. SDR fora (spec §40/§41). */
export const PROPOSTA_E_CONTRATO = ["admin", "gestor", "vendedor"] as const satisfies ListaPapeis;

/** Confirmar ou estornar pagamento (a RPC no banco exige o mesmo). */
export const CONFIRMAR_PAGAMENTO = ["admin", "gestor"] as const satisfies ListaPapeis;

/** Calculadora solar, kit personalizado e catálogo de componentes. */
export const CALCULADORA = ["admin", "gestor", "vendedor", "sdr"] as const satisfies ListaPapeis;

/** Anexos e notas de negócio. */
export const ANEXOS_E_NOTAS = ["admin", "gestor", "vendedor", "sdr"] as const satisfies ListaPapeis;

// --- Tarefas e agenda --------------------------------------------------------

/** Tarefas (tela e ações). */
export const TAREFAS = ["admin", "gestor", "vendedor", "sdr"] as const satisfies ListaPapeis;

/** Ver tarefas de outros usuários. Poder de gestão. */
export const VER_TAREFAS_DE_OUTROS = ["admin", "gestor"] as const satisfies ListaPapeis;

/**
 * Criar tarefa para outra pessoa. Poder de gestão: os demais criam só para si
 * (o SDR encaminha leads pelo handoff, não por tarefa).
 */
export const ATRIBUIR_TAREFA_A_OUTROS = ["admin", "gestor"] as const satisfies ListaPapeis;

/** Integração com o Google Agenda. */
export const GOOGLE_AGENDA = ["admin", "gestor", "vendedor", "sdr"] as const satisfies ListaPapeis;

// --- Gestão ------------------------------------------------------------------

/** Gestão comercial: Painel, Leads a distribuir e as pendências de gestão do sininho. */
export const GESTAO_COMERCIAL = ["admin", "gestor"] as const satisfies ListaPapeis;

// --- Gamificação -------------------------------------------------------------

/** Telas da Gamificação (visão geral, ranking, metas, jornada, loja, extrato, comissões). */
export const GAMIFICACAO = ["admin", "gestor", "vendedor", "sdr"] as const satisfies ListaPapeis;

/** Quem compete e resgata: menu Recompensas e aba Comissões. */
export const PARTICIPANTES_GAMIFICACAO = ["vendedor", "sdr"] as const satisfies ListaPapeis;

/** Alcance de uma contagem: empresa toda, só a própria carteira, ou nenhum (papel sem acesso). */
export type EscopoContagem = "empresa" | "propria" | null;

/**
 * Escopo das pendências do sininho. GESTAO_COMERCIAL usa a empresa toda; quem só tem acesso
 * comercial conta a própria carteira; papel sem NEGOCIOS/TAREFAS não conta nada (nunca cai no
 * escopo amplo por exclusão).
 */
export function escopoPendencias(papel: Papel | string | null | undefined): {
  negocios: EscopoContagem;
  tarefas: EscopoContagem;
  leadsADistribuir: boolean;
} {
  const empresa = pode(papel, GESTAO_COMERCIAL);
  const escopo = (lista: ListaPapeis): EscopoContagem => (!pode(papel, lista) ? null : empresa ? "empresa" : "propria");
  return { negocios: escopo(NEGOCIOS), tarefas: escopo(TAREFAS), leadsADistribuir: empresa };
}

/** `papel` está na lista? Papel ausente (sem empresa) nunca pode. */
export function pode(papel: Papel | string | null | undefined, lista: ListaPapeis): boolean {
  return papel != null && (lista as readonly string[]).includes(papel);
}
