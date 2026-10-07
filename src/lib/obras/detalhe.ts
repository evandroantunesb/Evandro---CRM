import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { ROTULO_TIPO_LIGACAO } from "@/lib/tipos";
import { alertasObra, estadoSetor, MARCOS_OBRA, situacaoObra } from "./derivados";
import { montarHistorico, type ItemHistoricoVM } from "./historico";
import { fonteDadosObras } from "./permissoes-ui";
import {
  ROTULO_FUNCAO_PARTICIPANTE,
  ROTULO_MARCO_OBRA,
  ROTULO_STATUS_MARCO_OBRA,
  SETORES_OBRA,
  rotuloAguardando,
  rotuloStatus,
  type AlertaObra,
  type EstadoSetor,
  type SetorObra,
  type SituacaoObra,
} from "./rotulos";
import { extrairDadosTecnicos, type DadosTecnicosVM } from "./tecnico";

/**
 * Leitura do detalhe de uma obra (somente leitura). Devolve um view model EXPLÍCITO, montado
 * campo a campo no servidor: nada do snapshot bruto, do bloco `cliente`, e-mail, ids de membro
 * nem motivos do histórico chega à tela. Quem decide o que cada papel enxerga é a RLS; aqui só
 * se escolhe o caminho de leitura. `null` significa 404 (inexistente, de outra empresa ou sem acesso).
 */

export type ParticipanteObraVM = { nome: string; funcaoRotulo: string; principal: boolean };

export type SetorDetalheVM = {
  setor: SetorObra;
  /** Código do status no banco (null só se o setor ainda não tiver fluxo gravado). */
  status: string | null;
  statusRotulo: string;
  /** Desde quando o setor está nesse status (ISO). */
  statusDesde: string | null;
  estado: EstadoSetor;
  /** Motivo da parada, só se o setor estiver parado. */
  paradoMotivo: string | null;
  /** "Aguardando cliente", "Aguardando fornecedor"… ou null. */
  aguardando: string | null;
  /** Participantes ativos do setor (responsável principal primeiro). */
  participantes: ParticipanteObraVM[];
};

export type MarcoDetalheVM = {
  marco: (typeof MARCOS_OBRA)[number];
  rotulo: string;
  status: string | null;
  statusRotulo: string;
  /** Só quando o marco está como "não se aplica". */
  motivo: string | null;
};

export type ResumoObraVM = {
  id: string;
  numero: number;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  potenciaKwp: number | null;
  tipoLigacao: string | null;
  unidadeConsumidora: string | null;
  situacao: SituacaoObra;
  alertas: AlertaObra[];
  /** Só se a obra estiver pausada. */
  pausaMotivo: string | null;
  /** Só se a obra estiver cancelada. */
  cancelamentoMotivo: string | null;
  criadaEm: string;
  /** Só no caminho comercial (o papel `operacao` não acessa o negócio). */
  negocioId: string | null;
};

/** Contato do cliente: só os campos que a RPC devolveu não nulos (papel `operacao`, participante do setor certo). */
export type ContatoClienteVM = {
  endereco: string | null;
  telefone: string | null;
  telefone2: string | null;
  documento: string | null;
};

export type ObraDetalheVM = {
  resumo: ResumoObraVM;
  contatoCliente: ContatoClienteVM | null;
  /** Sempre os 3 setores, na ordem compras, engenharia, operacional. */
  setores: SetorDetalheVM[];
  /**
   * Vendedor e SDR ativos da obra (setor comercial), só nome e função. Nos DOIS caminhos:
   * `operacao` também os vê (a RLS da #148 libera os participantes da obra a quem tem acesso
   * a ela), para saber com quem falar no Comercial. Sem contato, valor ou ids.
   */
  participantesComerciais: ParticipanteObraVM[];
  /** Sempre os 2 marcos fixos. */
  marcos: MarcoDetalheVM[];
  tecnico: DadosTecnicosVM;
  /** Só quem a RLS libera (admin, vendedor da venda, gestor da equipe). */
  valorVendido: number | null;
  historico: ItemHistoricoVM[];
};

/** Teto de eventos do histórico por carga. */
export const LIMITE_HISTORICO = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Colunas lidas de `obras` no caminho comercial (explícitas: nunca `*`). */
const COLUNAS_OBRA =
  "id, numero, negocio_id, cliente_nome, cidade, uf, potencia_kwp, tipo_ligacao, unidade_consumidora, snapshot, pausada_em, pausa_motivo, cancelada_em, cancelamento_motivo, alerta_pagamento_estornado_em, venda_alterada_em, created_at";

/** Forma comum às duas fontes (tabela `obras` e RPC `obras_operacao`). */
type ObraBase = {
  id: string;
  numero: number;
  negocioId: string | null;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  potenciaKwp: number | null;
  tipoLigacao: string | null;
  unidadeConsumidora: string | null;
  snapshot: unknown;
  pausadaEm: string | null;
  pausaMotivo: string | null;
  canceladaEm: string | null;
  cancelamentoMotivo: string | null;
  alertaEstornoEm: string | null;
  vendaAlteradaEm: string | null;
  criadaEm: string;
  contato: ContatoClienteVM | null;
};

const ehSetor = (setor: string): setor is SetorObra => (SETORES_OBRA as readonly string[]).includes(setor);
const numeroOuNull = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const textoOuNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const rotuloLigacao = (v: unknown): string | null =>
  typeof v === "string" && Object.hasOwn(ROTULO_TIPO_LIGACAO, v) ? ROTULO_TIPO_LIGACAO[v as keyof typeof ROTULO_TIPO_LIGACAO] : null;

/** Papel `operacao`: só pela RPC `obras_operacao` (0 ou 1 linha). Linha de outra empresa não vale. */
async function lerObraOperacao(supabase: SupabaseServidor, empresaId: string, obraId: string): Promise<ObraBase | null> {
  const { data, error } = await supabase.rpc("obras_operacao", { p_obra_id: obraId });
  if (error) throw error;
  const o = (data ?? []).find((l) => l.obra_id === obraId && l.empresa_id === empresaId);
  if (!o) return null;
  // Exibe exatamente o que veio não nulo (o banco só preenche para o participante do setor certo).
  const contato: ContatoClienteVM = {
    endereco: textoOuNull(o.cliente_endereco),
    telefone: textoOuNull(o.cliente_telefone),
    telefone2: textoOuNull(o.cliente_telefone2),
    documento: textoOuNull(o.cliente_documento),
  };
  return {
    id: o.obra_id,
    numero: o.numero,
    negocioId: null,
    clienteNome: o.cliente_nome,
    cidade: o.cidade ?? null,
    uf: o.uf ?? null,
    potenciaKwp: numeroOuNull(o.potencia_kwp),
    tipoLigacao: rotuloLigacao(o.tipo_ligacao),
    unidadeConsumidora: o.unidade_consumidora ?? null,
    snapshot: o.snapshot,
    pausadaEm: o.pausada_em ?? null,
    pausaMotivo: o.pausa_motivo ?? null,
    canceladaEm: o.cancelada_em ?? null,
    cancelamentoMotivo: o.cancelamento_motivo ?? null,
    alertaEstornoEm: o.alerta_pagamento_estornado_em ?? null,
    vendaAlteradaEm: o.venda_alterada_em ?? null,
    criadaEm: o.created_at,
    contato: Object.values(contato).some((v) => v !== null) ? contato : null,
  };
}

/** Papéis comerciais: leitura direta de `obras`, sob RLS, só colunas explícitas. */
async function lerObraComercial(supabase: SupabaseServidor, empresaId: string, obraId: string): Promise<ObraBase | null> {
  const { data: o, error } = await supabase.from("obras").select(COLUNAS_OBRA).eq("id", obraId).eq("empresa_id", empresaId).maybeSingle();
  if (error) throw error;
  if (!o) return null;
  return {
    id: o.id,
    numero: o.numero,
    negocioId: o.negocio_id,
    clienteNome: o.cliente_nome,
    cidade: o.cidade,
    uf: o.uf,
    potenciaKwp: numeroOuNull(o.potencia_kwp),
    tipoLigacao: rotuloLigacao(o.tipo_ligacao),
    unidadeConsumidora: o.unidade_consumidora,
    snapshot: o.snapshot,
    pausadaEm: o.pausada_em,
    pausaMotivo: o.pausa_motivo,
    canceladaEm: o.cancelada_em,
    cancelamentoMotivo: o.cancelamento_motivo,
    alertaEstornoEm: o.alerta_pagamento_estornado_em,
    vendaAlteradaEm: o.venda_alterada_em,
    criadaEm: o.created_at,
    contato: null,
  };
}

/**
 * Carrega o detalhe da obra. O cliente vem por parâmetro (testável sem banco).
 * `obraId` que não é UUID ou papel sem acesso: `null` sem consultar nada.
 * As tabelas filhas só são lidas depois de confirmado o acesso à obra.
 */
export async function carregarDetalheObra(
  supabase: SupabaseServidor,
  { empresaId, papel, obraId }: { empresaId: string; papel: string | null | undefined; obraId: string },
): Promise<ObraDetalheVM | null> {
  if (!UUID.test(obraId)) return null;
  const fonte = fonteDadosObras(papel);
  if (!fonte) return null;

  const obra = fonte === "rpc_operacao" ? await lerObraOperacao(supabase, empresaId, obraId) : await lerObraComercial(supabase, empresaId, obraId);
  if (!obra) return null;

  // As tabelas filhas são lidas direto também pelo `operacao` (RLS `pode_ver_obra_operacao`).
  const [fluxosRes, marcosRes, participantesRes, historicoRes, identidadesRes, valorRes] = await Promise.all([
    supabase.from("obra_fluxos").select("setor, status, status_desde, parado, parado_motivo, aguardando").eq("obra_id", obraId).eq("empresa_id", empresaId),
    supabase.from("obra_marcos").select("marco, status, motivo").eq("obra_id", obraId).eq("empresa_id", empresaId),
    supabase.from("obra_participantes").select("setor, membro_id, funcao, principal").eq("obra_id", obraId).eq("empresa_id", empresaId).is("fim", null),
    supabase
      .from("obra_historico")
      .select("setor, tipo, dados, autor_membro_id, created_at")
      .eq("obra_id", obraId)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(LIMITE_HISTORICO),
    supabase.rpc("identidade_membros", { p_empresa_id: empresaId }),
    // Valor vendido: só no caminho comercial; a RLS decide quem lê (sem linha → null). `operacao` nunca consulta.
    fonte === "tabelas_comerciais"
      ? supabase.from("obra_dados_comerciais").select("valor_vendido").eq("obra_id", obraId).eq("empresa_id", empresaId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [fluxosRes, marcosRes, participantesRes, historicoRes, identidadesRes, valorRes]) if (r.error) throw r.error;

  const fluxos = fluxosRes.data ?? [];
  const marcosLidos = marcosRes.data ?? [];
  const participantes = participantesRes.data ?? [];

  const nomes = new Map<string, string>();
  for (const m of identidadesRes.data ?? []) nomes.set(m.membro_id, m.nome);

  const participanteVM = (p: { membro_id: string; funcao: string; principal: boolean }): ParticipanteObraVM => ({
    nome: nomes.get(p.membro_id) || "Usuário não identificado",
    funcaoRotulo: Object.hasOwn(ROTULO_FUNCAO_PARTICIPANTE, p.funcao) ? ROTULO_FUNCAO_PARTICIPANTE[p.funcao] : "Participante",
    principal: p.principal === true,
  });

  const setores = SETORES_OBRA.map((setor): SetorDetalheVM => {
    const fluxo = fluxos.find((f) => f.setor === setor);
    const status = fluxo?.status ?? null;
    const estado = estadoSetor({ setor, status, parado: fluxo?.parado ?? false, aguardando: fluxo?.aguardando ?? null });
    return {
      setor,
      status,
      statusRotulo: status ? rotuloStatus(setor, status) : "Sem informação",
      statusDesde: fluxo?.status_desde ?? null,
      estado,
      paradoMotivo: fluxo?.parado ? textoOuNull(fluxo.parado_motivo) : null,
      aguardando: fluxo?.aguardando ? rotuloAguardando(fluxo.aguardando) : null,
      participantes: participantes
        .filter((p) => p.setor === setor)
        .map(participanteVM)
        .sort((a, b) => Number(b.principal) - Number(a.principal)),
    };
  });

  const participantesComerciais = participantes
    .filter((p) => p.setor === "comercial" && (p.funcao === "vendedor" || p.funcao === "sdr"))
    .map(participanteVM);

  const marcos = MARCOS_OBRA.map((marco): MarcoDetalheVM => {
    const m = marcosLidos.find((x) => x.marco === marco);
    const status = m?.status ?? null;
    return {
      marco,
      rotulo: ROTULO_MARCO_OBRA[marco],
      status,
      statusRotulo: status && Object.hasOwn(ROTULO_STATUS_MARCO_OBRA, status) ? ROTULO_STATUS_MARCO_OBRA[status] : "Sem informação",
      motivo: status === "nao_se_aplica" ? textoOuNull(m?.motivo) : null,
    };
  });

  const resumo: ResumoObraVM = {
    id: obra.id,
    numero: obra.numero,
    clienteNome: obra.clienteNome,
    cidade: obra.cidade,
    uf: obra.uf,
    potenciaKwp: obra.potenciaKwp,
    tipoLigacao: obra.tipoLigacao,
    unidadeConsumidora: obra.unidadeConsumidora,
    situacao: situacaoObra({
      canceladaEm: obra.canceladaEm,
      pausadaEm: obra.pausadaEm,
      fluxos: fluxos.filter((f): f is typeof f & { setor: SetorObra } => ehSetor(f.setor)),
      marcos: marcosLidos,
    }),
    alertas: alertasObra({
      alertaPagamentoEstornadoEm: obra.alertaEstornoEm,
      vendaAlteradaEm: obra.vendaAlteradaEm,
      estadosSetores: setores.map((s) => s.estado),
    }),
    pausaMotivo: obra.pausadaEm && !obra.canceladaEm ? textoOuNull(obra.pausaMotivo) : null,
    cancelamentoMotivo: obra.canceladaEm ? textoOuNull(obra.cancelamentoMotivo) : null,
    criadaEm: obra.criadaEm,
    negocioId: obra.negocioId,
  };

  return {
    resumo,
    contatoCliente: obra.contato,
    setores,
    participantesComerciais,
    marcos,
    tecnico: extrairDadosTecnicos(obra.snapshot),
    valorVendido: numeroOuNull(valorRes.data?.valor_vendido),
    historico: montarHistorico(historicoRes.data ?? [], nomes),
  };
}
