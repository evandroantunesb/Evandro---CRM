import { ETAPAS_CHECKLIST, andamentoChecklist, ehEtapaChecklist, type EtapaChecklist, type LinhaChecklist } from "@/lib/obras/checklist";

const ETAPAS_ORDEM: readonly string[] = ETAPAS_CHECKLIST;
import type { SupabaseServidor } from "@/lib/supabase/server";

/*
 * Obras do Solo (subprojeto 4b, 20261207100000_obra_solo.sql): leitura para a lista em cartões (quadro "SoloObras").
 * A situação vem só do checklist (ruling 2 confirmado pelo Evandro em 11/11/2026): entregue = as 10 etapas
 * resolvidas; cancelada e pausada continuam valendo.
 */

export type SituacaoObraSolo = "em_andamento" | "entregue" | "pausada" | "cancelada";

export type ObraSoloListaVM = {
  id: string;
  numero: number;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  potenciaKwp: number | null;
  situacao: SituacaoObraSolo;
  andamento: ReturnType<typeof andamentoChecklist>;
  linhas: LinhaChecklist[];
  /** Data prevista da etapa atual. */
  atualPrevistaPara: string | null;
  /** Data em que a entrega foi feita (obra entregue). */
  entregueEm: string | null;
};

type LinhaBanco = { obra_id: string; etapa: string; feita_em: string | null; nao_se_aplica_motivo: string | null; prevista_para: string | null };

export function linhaDoBanco(l: LinhaBanco): LinhaChecklist | null {
  if (!ehEtapaChecklist(l.etapa)) return null;
  return { etapa: l.etapa, feitaEm: l.feita_em, naoSeAplica: l.nao_se_aplica_motivo != null, previstaPara: l.prevista_para };
}

export function situacaoObraSolo(o: { cancelada_em: string | null; pausada_em: string | null }, concluida: boolean): SituacaoObraSolo {
  if (o.cancelada_em) return "cancelada";
  if (o.pausada_em) return "pausada";
  return concluida ? "entregue" : "em_andamento";
}

/** Obras da empresa Solo com o checklist (obra sem checklist fica de fora), da mais nova para a mais antiga. */
export async function carregarObrasSolo(supabase: SupabaseServidor, empresaId: string): Promise<ObraSoloListaVM[]> {
  const [obrasRes, checklistRes] = await Promise.all([
    supabase
      .from("obras")
      .select("id, numero, cliente_nome, cidade, uf, potencia_kwp, pausada_em, cancelada_em")
      .eq("empresa_id", empresaId)
      .order("numero", { ascending: false }),
    supabase.from("obra_checklist").select("obra_id, etapa, feita_em, nao_se_aplica_motivo, prevista_para").eq("empresa_id", empresaId),
  ]);
  if (obrasRes.error) throw obrasRes.error;
  if (checklistRes.error) throw checklistRes.error;

  const porObra = new Map<string, LinhaChecklist[]>();
  for (const l of (checklistRes.data ?? []) as LinhaBanco[]) {
    const linha = linhaDoBanco(l);
    if (linha) porObra.set(l.obra_id, [...(porObra.get(l.obra_id) ?? []), linha]);
  }

  return (obrasRes.data ?? []).flatMap((o): ObraSoloListaVM[] => {
    const linhas = porObra.get(o.id);
    if (!linhas?.length) return [];
    const andamento = andamentoChecklist(linhas);
    const atual = andamento.atual ? linhas.find((l) => l.etapa === andamento.atual) : undefined;
    return [
      {
        id: o.id,
        numero: o.numero,
        clienteNome: o.cliente_nome ?? "",
        cidade: o.cidade,
        uf: o.uf,
        potenciaKwp: o.potencia_kwp == null ? null : Number(o.potencia_kwp),
        situacao: situacaoObraSolo(o, andamento.concluida),
        andamento,
        linhas,
        atualPrevistaPara: atual?.previstaPara ?? null,
        entregueEm: linhas.find((l) => l.etapa === "entrega")?.feitaEm ?? null,
      },
    ];
  });
}

/** Números do topo da lista: em andamento (e o kWp delas), entregues no ano de `hoje` e a próxima data prevista. */
export function numerosSolo(
  obras: readonly ObraSoloListaVM[],
  hoje: string,
): {
  emAndamento: number;
  kwpEmAndamento: number;
  entreguesNoAno: number;
  proximaPrevista: { data: string; etapa: EtapaChecklist; clienteNome: string } | null;
} {
  const andamento = obras.filter((o) => o.situacao === "em_andamento");
  const ano = hoje.slice(0, 4);
  let proxima: { data: string; etapa: EtapaChecklist; clienteNome: string } | null = null;
  for (const o of andamento) {
    if (o.atualPrevistaPara && o.atualPrevistaPara >= hoje && o.andamento.atual && (!proxima || o.atualPrevistaPara < proxima.data)) {
      proxima = { data: o.atualPrevistaPara, etapa: o.andamento.atual, clienteNome: o.clienteNome };
    }
  }
  return {
    emAndamento: andamento.length,
    kwpEmAndamento: Math.round(andamento.reduce((soma, o) => soma + (o.potenciaKwp ?? 0), 0) * 100) / 100,
    entreguesNoAno: obras.filter((o) => o.situacao === "entregue" && o.entregueEm?.startsWith(ano)).length,
    proximaPrevista: proxima,
  };
}

export type FotoEtapaVM = { id: string; url: string | null };
export type EtapaSoloVM = LinhaChecklist & { motivo: string | null; anotacao: string | null; fotos: FotoEtapaVM[] };
export type ObraSoloVM = {
  id: string;
  numero: number;
  clienteNome: string;
  cidade: string | null;
  uf: string | null;
  potenciaKwp: number | null;
  unidadeConsumidora: string | null;
  valorVendido: number | null;
  telefoneCliente: string | null;
  linkCliente: string | null;
  criadaEm: string;
  situacao: SituacaoObraSolo;
  andamento: ReturnType<typeof andamentoChecklist>;
  etapas: EtapaSoloVM[];
};

const EXPIRA_FOTO_SEGUNDOS = 60 * 60;

/** Uma obra do Solo com o checklist completo, as fotos (URL assinada de 1 hora) e os dados internos do admin. */
export async function carregarObraSolo(supabase: SupabaseServidor, empresaId: string, obraId: string): Promise<ObraSoloVM | null> {
  const { data: o, error } = await supabase
    .from("obras")
    .select("id, numero, negocio_id, cliente_nome, cidade, uf, potencia_kwp, unidade_consumidora, link_cliente, created_at, pausada_em, cancelada_em")
    .eq("id", obraId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error) throw error;
  if (!o) return null;

  const [checklistRes, fotosRes, comercialRes, negocioRes] = await Promise.all([
    supabase.from("obra_checklist").select("obra_id, etapa, feita_em, nao_se_aplica_motivo, prevista_para, anotacao").eq("obra_id", obraId),
    supabase.from("obra_checklist_fotos").select("id, etapa, caminho").eq("obra_id", obraId).order("created_at"),
    supabase.from("obra_dados_comerciais").select("valor_vendido").eq("obra_id", obraId).maybeSingle(),
    o.negocio_id ? supabase.from("negocios").select("contatos(telefone)").eq("id", o.negocio_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (checklistRes.error) throw checklistRes.error;
  if (fotosRes.error) throw fotosRes.error;
  const checklist = (checklistRes.data ?? []) as (LinhaBanco & { anotacao: string | null })[];
  if (!checklist.length) return null;

  const fotos = fotosRes.data ?? [];
  const assinadas = fotos.length
    ? ((await supabase.storage.from("obra-fotos").createSignedUrls(fotos.map((f) => f.caminho), EXPIRA_FOTO_SEGUNDOS)).data ?? [])
    : [];
  const urlDe = new Map(assinadas.map((a) => [a.path, a.signedUrl]));

  const etapas = checklist
    .flatMap((l): EtapaSoloVM[] => {
      const linha = linhaDoBanco(l);
      if (!linha) return [];
      const daEtapa = fotos.filter((f) => f.etapa === l.etapa).map((f) => ({ id: f.id, url: urlDe.get(f.caminho) ?? null }));
      return [{ ...linha, motivo: l.nao_se_aplica_motivo, anotacao: l.anotacao, fotos: daEtapa }];
    })
    .sort((a, b) => ETAPAS_ORDEM.indexOf(a.etapa) - ETAPAS_ORDEM.indexOf(b.etapa));
  const andamento = andamentoChecklist(etapas);
  const contato = (negocioRes.data as { contatos: { telefone: string | null } | null } | null)?.contatos;

  return {
    id: o.id,
    numero: o.numero,
    clienteNome: o.cliente_nome ?? "",
    cidade: o.cidade,
    uf: o.uf,
    potenciaKwp: o.potencia_kwp == null ? null : Number(o.potencia_kwp),
    unidadeConsumidora: o.unidade_consumidora,
    valorVendido: comercialRes.data?.valor_vendido == null ? null : Number(comercialRes.data.valor_vendido),
    telefoneCliente: contato?.telefone ?? null,
    linkCliente: o.link_cliente,
    criadaEm: o.created_at,
    situacao: situacaoObraSolo(o, andamento.concluida),
    andamento,
    etapas,
  };
}
