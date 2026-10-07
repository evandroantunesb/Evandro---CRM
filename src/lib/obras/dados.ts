import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { Papel } from "@/lib/tipos";
import { SETORES_OPERACIONAIS, STATUS_INICIAL, type SetorOperacional } from "./rotulos";

export type PrincipalVM = { membroId: string; nome: string | null; avatarCaminho: string | null };

export type SetorResumoVM = {
  status: string;
  statusDesde: string | null;
  parado: boolean;
  paradoMotivo: string | null;
  aguardando: string | null;
  aguardandoDesde: string | null;
  concluidoEm: string | null;
  principal: PrincipalVM | null;
};

/**
 * Resumo de uma obra para a lista. Campos explícitos e sanitizados: é o que vai para
 * componentes de cliente. Nunca inclui snapshot, documento, telefone, e-mail, endereço,
 * ids de negócio/contrato nem valor.
 */
export type ObraResumoVM = {
  id: string;
  numero: number;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  potenciaKwp: number | null;
  tipoLigacao: string | null;
  pausada: boolean;
  cancelada: boolean;
  alertaEstorno: boolean;
  vendaAlterada: boolean;
  criadaEm: string;
  setores: Record<SetorOperacional, SetorResumoVM>;
};

type SessaoObras = { papel: Papel; empresaId: string; membroId: string };

type LinhaObra = {
  id: string;
  numero: number;
  cliente_nome: string;
  cidade: string | null;
  uf: string | null;
  potencia_kwp: number | null;
  tipo_ligacao: string | null;
  pausada_em: string | null;
  cancelada_em: string | null;
  alerta_pagamento_estornado_em: string | null;
  venda_alterada_em: string | null;
  created_at: string;
};

const COLUNAS_OBRA =
  "id, numero, cliente_nome, cidade, uf, potencia_kwp, tipo_ligacao, pausada_em, cancelada_em, alerta_pagamento_estornado_em, venda_alterada_em, created_at";

const COLUNAS_FLUXO =
  "obra_id, setor, status, status_desde, parado, parado_motivo, aguardando, aguardando_desde, concluido_em";

async function lerObras(supabase: SupabaseServidor, sessao: SessaoObras): Promise<LinhaObra[]> {
  if (sessao.papel === "operacao") {
    // `operacao` nunca lê a tabela `obras`: só a RPC (que já limita às obras visíveis a ela).
    const { data, error } = await supabase.rpc("obras_operacao");
    if (error) throw new Error(`Falha ao carregar obras: ${error.message}`);
    return (data ?? [])
      .map((o) => ({
        id: o.obra_id,
        numero: o.numero,
        cliente_nome: o.cliente_nome,
        cidade: o.cidade,
        uf: o.uf,
        potencia_kwp: o.potencia_kwp,
        tipo_ligacao: o.tipo_ligacao,
        pausada_em: o.pausada_em,
        cancelada_em: o.cancelada_em,
        alerta_pagamento_estornado_em: o.alerta_pagamento_estornado_em,
        venda_alterada_em: o.venda_alterada_em,
        created_at: o.created_at,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await supabase
    .from("obras")
    .select(COLUNAS_OBRA)
    .eq("empresa_id", sessao.empresaId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar obras: ${error.message}`);
  return (data ?? []) as LinhaObra[];
}

export async function carregarObras(
  supabase: SupabaseServidor,
  sessao: SessaoObras,
): Promise<ObraResumoVM[]> {
  const obras = await lerObras(supabase, sessao);
  if (obras.length === 0) return [];
  const ids = obras.map((o) => o.id);

  const [fluxos, principais, identidades] = await Promise.all([
    supabase.from("obra_fluxos").select(COLUNAS_FLUXO).in("obra_id", ids),
    supabase
      .from("obra_participantes")
      .select("obra_id, membro_id, setor")
      .in("obra_id", ids)
      .eq("principal", true)
      .is("fim", null),
    supabase.rpc("identidade_membros", { p_empresa_id: sessao.empresaId }),
  ]);
  for (const r of [fluxos, principais, identidades]) {
    if (r.error) throw new Error(`Falha ao carregar obras: ${r.error.message}`);
  }

  const fluxoDe = new Map<string, NonNullable<typeof fluxos.data>[number]>();
  for (const f of fluxos.data ?? []) fluxoDe.set(`${f.obra_id}:${f.setor}`, f);

  // Membro inativo não aparece em identidade_membros: nome nulo ("Ex-colaborador" na tela).
  const identidade = new Map((identidades.data ?? []).map((m) => [m.membro_id, m]));
  const principalDe = new Map<string, PrincipalVM>();
  for (const p of principais.data ?? []) {
    const id = identidade.get(p.membro_id);
    principalDe.set(`${p.obra_id}:${p.setor}`, {
      membroId: p.membro_id,
      nome: id?.nome ?? null,
      avatarCaminho: id?.avatar_caminho ?? null,
    });
  }

  return obras.map((o) => {
    const setores = {} as Record<SetorOperacional, SetorResumoVM>;
    for (const s of SETORES_OPERACIONAIS) {
      const f = fluxoDe.get(`${o.id}:${s}`);
      setores[s] = {
        status: f?.status ?? STATUS_INICIAL[s],
        statusDesde: f?.status_desde ?? null,
        parado: f?.parado ?? false,
        paradoMotivo: f?.parado_motivo ?? null,
        aguardando: f?.aguardando ?? null,
        aguardandoDesde: f?.aguardando_desde ?? null,
        concluidoEm: f?.concluido_em ?? null,
        principal: principalDe.get(`${o.id}:${s}`) ?? null,
      };
    }
    return {
      id: o.id,
      numero: o.numero,
      clienteNome: o.cliente_nome,
      cidade: o.cidade,
      uf: o.uf,
      potenciaKwp: o.potencia_kwp == null ? null : Number(o.potencia_kwp),
      tipoLigacao: o.tipo_ligacao,
      pausada: o.pausada_em != null,
      cancelada: o.cancelada_em != null,
      alertaEstorno: o.alerta_pagamento_estornado_em != null,
      vendaAlterada: o.venda_alterada_em != null,
      criadaEm: o.created_at,
      setores,
    };
  });
}
