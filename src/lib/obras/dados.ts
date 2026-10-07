import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { alertasObra, estadoSetor, situacaoObra } from "./derivados";
import { fonteDadosObras } from "./permissoes-ui";
import {
  SETORES_OBRA,
  rotuloAguardando,
  rotuloStatus,
  type AlertaObra,
  type EstadoSetor,
  type SetorObra,
  type SituacaoObra,
} from "./rotulos";

/**
 * Leitura da lista de Obras (somente leitura). Devolve view models EXPLÍCITOS e SANITIZADOS,
 * montados campo a campo: nada de snapshot, telefone, documento, endereço, e-mail, valor,
 * motivos (parada, pausa, cancelamento) nem ids de membro chega à tela. Quem decide o que cada
 * papel enxerga é a RLS; aqui só se escolhe o caminho de leitura e se descarta o que a lista não usa.
 */

export type SetorObraVM = {
  setor: SetorObra;
  /** Código do status no banco (null só se o setor ainda não tiver fluxo gravado). */
  status: string | null;
  statusRotulo: string;
  estado: EstadoSetor;
  /** "Aguardando cliente", "Aguardando fornecedor"… ou null. */
  aguardando: string | null;
  /** Nome do responsável principal ativo do setor; null se não houver. */
  principalNome: string | null;
};

export type ObraListaVM = {
  id: string;
  numero: number;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  potenciaKwp: number | null;
  situacao: SituacaoObra;
  alertas: AlertaObra[];
  /** Sempre os 3 setores, na ordem compras, engenharia, operacional. */
  setores: SetorObraVM[];
  criadaEm: string;
};

/** Contagens factuais da lista inteira (antes dos filtros). Sem percentuais. */
export type KpisObras = {
  total: number;
  emAndamento: number;
  concluidas: number;
  pausadas: number;
  canceladas: number;
  comEstorno: number;
  comVendaAlterada: number;
  comSetorParado: number;
  comSetorAguardando: number;
};

export const KPIS_OBRAS_ZERADOS: KpisObras = {
  total: 0,
  emAndamento: 0,
  concluidas: 0,
  pausadas: 0,
  canceladas: 0,
  comEstorno: 0,
  comVendaAlterada: 0,
  comSetorParado: 0,
  comSetorAguardando: 0,
};

/** Teto de obras por carga: a lista não pagina; o teto evita estourar o limite de linhas do PostgREST nas filhas. */
export const LIMITE_OBRAS = 500;

/** Ids por consulta nas tabelas filhas: mantém a URL curta e cada resposta abaixo de 1000 linhas. */
const TAMANHO_LOTE = 100;

/** Colunas lidas de `obras` no caminho comercial (explícitas: nunca `*`, nunca `snapshot`). */
const COLUNAS_OBRAS = "id, numero, cliente_nome, cidade, uf, potencia_kwp, pausada_em, cancelada_em, alerta_pagamento_estornado_em, venda_alterada_em, created_at";

type LinhaObra = {
  id: string;
  numero: number;
  cliente_nome: string;
  cidade: string | null;
  uf: string | null;
  potencia_kwp: number | null;
  pausada_em: string | null;
  cancelada_em: string | null;
  alerta_pagamento_estornado_em: string | null;
  venda_alterada_em: string | null;
  created_at: string;
};

type LinhaFluxo = { obra_id: string; setor: string; status: string; parado: boolean; aguardando: string | null };
type LinhaMarco = { obra_id: string; status: string };
type LinhaParticipante = { obra_id: string; setor: string; membro_id: string };

const ehSetor = (setor: string): setor is SetorObra => (SETORES_OBRA as readonly string[]).includes(setor);

function porObra<T extends { obra_id: string }>(linhas: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) {
    const lista = mapa.get(l.obra_id);
    if (lista) lista.push(l);
    else mapa.set(l.obra_id, [l]);
  }
  return mapa;
}

function lotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const resultado: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) resultado.push(itens.slice(i, i + tamanho));
  return resultado;
}

/** Linhas de `obras` do caminho comercial: leitura direta, sob RLS, só colunas explícitas. */
async function lerObrasComercial(supabase: SupabaseServidor, empresaId: string): Promise<LinhaObra[]> {
  const { data, error } = await supabase
    .from("obras")
    .select(COLUNAS_OBRAS)
    .eq("empresa_id", empresaId)
    .order("numero", { ascending: false })
    .limit(LIMITE_OBRAS);
  if (error) throw error;
  return (data ?? []) as LinhaObra[];
}

/**
 * Linhas do papel `operacao`: só pela RPC `obras_operacao` (ele não lê a tabela `obras`).
 * A RPC devolve as obras de TODAS as empresas em que a pessoa é `operacao`: filtra a atual.
 * Copia só os campos da lista; o resto da linha (snapshot, telefones, endereço, motivos) é descartado.
 */
async function lerObrasOperacao(supabase: SupabaseServidor, empresaId: string): Promise<LinhaObra[]> {
  const { data, error } = await supabase.rpc("obras_operacao");
  if (error) throw error;
  return (data ?? [])
    .filter((o) => o.empresa_id === empresaId)
    .map((o) => ({
      id: o.obra_id,
      numero: o.numero,
      cliente_nome: o.cliente_nome,
      cidade: o.cidade ?? null,
      uf: o.uf ?? null,
      potencia_kwp: o.potencia_kwp ?? null,
      pausada_em: o.pausada_em ?? null,
      cancelada_em: o.cancelada_em ?? null,
      alerta_pagamento_estornado_em: o.alerta_pagamento_estornado_em ?? null,
      venda_alterada_em: o.venda_alterada_em ?? null,
      created_at: o.created_at,
    }))
    .sort((a, b) => b.numero - a.numero)
    .slice(0, LIMITE_OBRAS);
}

export function calcularKpisObras(obras: readonly ObraListaVM[]): KpisObras {
  const conta = (teste: (o: ObraListaVM) => boolean) => obras.filter(teste).length;
  return {
    total: obras.length,
    emAndamento: conta((o) => o.situacao === "em_andamento"),
    concluidas: conta((o) => o.situacao === "concluida"),
    pausadas: conta((o) => o.situacao === "pausada"),
    canceladas: conta((o) => o.situacao === "cancelada"),
    comEstorno: conta((o) => o.alertas.includes("estorno")),
    comVendaAlterada: conta((o) => o.alertas.includes("venda_alterada")),
    comSetorParado: conta((o) => o.alertas.includes("parado")),
    comSetorAguardando: conta((o) => o.alertas.includes("aguardando")),
  };
}

/**
 * Carrega a lista de Obras da empresa atual. O cliente vem por parâmetro (testável sem banco).
 * Papel sem acesso não consulta nada. Sem obras, as tabelas filhas não são consultadas.
 */
export async function carregarObras(
  supabase: SupabaseServidor,
  { empresaId, papel }: { empresaId: string; papel: string | null | undefined },
): Promise<{ obras: ObraListaVM[]; kpis: KpisObras }> {
  const fonte = fonteDadosObras(papel);
  if (!fonte) return { obras: [], kpis: KPIS_OBRAS_ZERADOS };

  const linhas = fonte === "rpc_operacao" ? await lerObrasOperacao(supabase, empresaId) : await lerObrasComercial(supabase, empresaId);
  if (linhas.length === 0) return { obras: [], kpis: KPIS_OBRAS_ZERADOS };

  const lotesDeIds = lotes(
    linhas.map((l) => l.id),
    TAMANHO_LOTE,
  );
  // As tabelas filhas são lidas direto também pelo `operacao` (RLS `pode_ver_obra_operacao`).
  const [fluxosRes, marcosRes, participantesRes] = await Promise.all([
    Promise.all(
      lotesDeIds.map((ids) =>
        supabase.from("obra_fluxos").select("obra_id, setor, status, parado, aguardando").eq("empresa_id", empresaId).in("obra_id", ids),
      ),
    ),
    Promise.all(lotesDeIds.map((ids) => supabase.from("obra_marcos").select("obra_id, status").eq("empresa_id", empresaId).in("obra_id", ids))),
    Promise.all(
      lotesDeIds.map((ids) =>
        supabase
          .from("obra_participantes")
          .select("obra_id, setor, membro_id")
          .eq("empresa_id", empresaId)
          .in("obra_id", ids)
          .eq("principal", true)
          .is("fim", null),
      ),
    ),
  ]);
  for (const r of [...fluxosRes, ...marcosRes, ...participantesRes]) if (r.error) throw r.error;

  const fluxos = porObra(fluxosRes.flatMap((r) => (r.data ?? []) as LinhaFluxo[]));
  const marcos = porObra(marcosRes.flatMap((r) => (r.data ?? []) as LinhaMarco[]));
  const participantes = porObra(participantesRes.flatMap((r) => (r.data ?? []) as LinhaParticipante[]));

  // Nome de quem é responsável principal (funciona para qualquer papel; não lê `perfis`).
  const nomes = new Map<string, string>();
  if (participantes.size > 0) {
    const { data, error } = await supabase.rpc("identidade_membros", { p_empresa_id: empresaId });
    if (error) throw error;
    for (const m of data ?? []) nomes.set(m.membro_id, m.nome);
  }

  const obras = linhas.map((l): ObraListaVM => {
    const fluxosDaObra = fluxos.get(l.id) ?? [];
    const principais = participantes.get(l.id) ?? [];
    const setores = SETORES_OBRA.map((setor): SetorObraVM => {
      const fluxo = fluxosDaObra.find((f) => f.setor === setor);
      const principal = principais.find((p) => p.setor === setor);
      const status = fluxo?.status ?? null;
      return {
        setor,
        status,
        statusRotulo: status ? rotuloStatus(setor, status) : "Sem informação",
        estado: estadoSetor({ setor, status, parado: fluxo?.parado ?? false, aguardando: fluxo?.aguardando ?? null }),
        aguardando: fluxo?.aguardando ? rotuloAguardando(fluxo.aguardando) : null,
        principalNome: (principal && nomes.get(principal.membro_id)) || null,
      };
    });
    return {
      id: l.id,
      numero: l.numero,
      clienteNome: l.cliente_nome,
      cidade: l.cidade,
      uf: l.uf,
      potenciaKwp: l.potencia_kwp == null ? null : Number(l.potencia_kwp),
      situacao: situacaoObra({
        canceladaEm: l.cancelada_em,
        pausadaEm: l.pausada_em,
        fluxos: fluxosDaObra.filter((f): f is LinhaFluxo & { setor: SetorObra } => ehSetor(f.setor)),
        marcos: marcos.get(l.id) ?? [],
      }),
      alertas: alertasObra({
        alertaPagamentoEstornadoEm: l.alerta_pagamento_estornado_em,
        vendaAlteradaEm: l.venda_alterada_em,
        estadosSetores: setores.map((s) => s.estado),
      }),
      setores,
      criadaEm: l.created_at,
    };
  });

  return { obras, kpis: calcularKpisObras(obras) };
}
