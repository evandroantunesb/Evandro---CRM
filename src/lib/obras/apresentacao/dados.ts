import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { ddmm, montarCronograma, SETOR_ETAPA } from "../cronograma";
import { montarCustos, resultadoObra } from "../custos";
import { carregarDetalheObra } from "../detalhe";
import { setorConcluido } from "../derivados";
import { COLUNAS_JUSTIFICATIVA, dicasPorEtapa, justificativasPorEtapa } from "../justificativas";
import { ROTULO_ALERTA_OBRA, ROTULO_SETOR } from "../rotulos";
import type { ApresentacaoObraVM, FinanceiroVM, PendenciaVM } from "./tipos";

/** Hoje no fuso de Brasília (AAAA-MM-DD). */
export const hojeBrasilia = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

/**
 * Apresentação de uma obra (somente leitura). Lê pelo mesmo caminho do detalhe (RLS, empresa
 * atual, `obras_operacao` para o papel operacao) e devolve um VM próprio, montado campo a campo.
 *
 * Dinheiro: os custos entram no VM de quem a RLS deixa ler o orçamento DESTA obra (admin, gestor
 * que vê a obra, quem atua no Operacional dela); venda, lucro e margem só para quem lê o valor
 * vendido (`obra_dados_comerciais`: admin, gestor e o vendedor da venda). Para os
 * demais o bloco é `sem_permissao` e nenhum valor sai do servidor.
 *
 * Cronograma, entrega contratada e progresso: sempre do banco (`cronograma_obra` e `prazos_obras`,
 * que devolvem zero linhas a quem não vê a obra). O progresso nunca é derivado do status dos setores.
 */
export async function carregarApresentacaoObra(
  supabase: SupabaseServidor,
  entrada: { empresaId: string; papel: string | null | undefined; obraId: string; hojeIso?: string },
): Promise<ApresentacaoObraVM | null> {
  const obra = await carregarDetalheObra(supabase, { empresaId: entrada.empresaId, papel: entrada.papel, obraId: entrada.obraId, comGestao: false });
  if (!obra) return null;
  const { resumo } = obra;
  const hoje = entrada.hojeIso ?? hojeBrasilia();

  const setores = obra.setores.map((s) => ({
    setor: s.setor,
    statusRotulo: s.statusRotulo,
    concluido: setorConcluido(s.setor, s.status),
    parado: s.estado === "parado",
    aguardando: s.estado === "aguardando" || s.estado === "parado" ? s.aguardando : null,
    responsavel: s.participantes.find((p) => p.principal)?.nome ?? null,
  }));

  const pendencias: PendenciaVM[] = [
    ...setores.filter((s) => s.parado).map((s) => ({ tipo: "parado" as const, texto: `${ROTULO_SETOR[s.setor]} parado` })),
    ...setores.filter((s) => !s.concluido && s.aguardando).map((s) => ({ tipo: "aguardando" as const, texto: `${ROTULO_SETOR[s.setor]}: ${s.aguardando}` })),
    ...resumo.alertas.filter((a) => a === "estorno" || a === "venda_alterada").map((a) => ({ tipo: "alerta" as const, texto: ROTULO_ALERTA_OBRA[a] })),
  ];

  const proximasEntregas = [
    ...setores.filter((s) => !s.concluido).map((s) => `${ROTULO_SETOR[s.setor]}: ${s.statusRotulo}`),
    ...obra.marcos.filter((m) => m.status !== "concluido" && m.status !== "nao_se_aplica").map((m) => `${m.rotulo} (pendente)`),
  ];

  const [cronogramaRes, prazosRes, justificativasRes, identidadesRes] = await Promise.all([
    supabase.rpc("cronograma_obra", { p_obra_id: entrada.obraId }),
    supabase.rpc("prazos_obras", { p_obra_ids: [entrada.obraId] }),
    supabase.from("obra_justificativas_atraso").select(COLUNAS_JUSTIFICATIVA).eq("obra_id", entrada.obraId),
    supabase.rpc("identidade_membros", { p_empresa_id: entrada.empresaId }),
  ]);
  for (const r of [cronogramaRes, prazosRes, justificativasRes, identidadesRes]) if (r.error) throw r.error;
  const linhas = cronogramaRes.data;
  const nomes = new Map((identidadesRes.data ?? []).map((m) => [m.membro_id, m.nome]));
  const justificativas = dicasPorEtapa(justificativasPorEtapa(justificativasRes.data ?? [], nomes));
  const entregaContratada = linhas?.[0]?.entrega_contratada ?? null;
  const responsavel = new Map(setores.map((s) => [s.setor, s.responsavel]));
  const cronograma = entregaContratada
    ? montarCronograma(linhas ?? [], {
        hoje,
        entregaContratada,
        subtitulo: (etapa) => {
          const setor = SETOR_ETAPA[etapa];
          if (etapa === "conexao") return `${ROTULO_SETOR[setor]} · contratada ${ddmm(entregaContratada)}`;
          const nome = responsavel.get(setor);
          return nome ? `${ROTULO_SETOR[setor]} · ${nome}` : ROTULO_SETOR[setor];
        },
        justificativas,
      })
    : null;

  // A RLS devolve orçamento e lançamentos só a quem vê os custos da obra.
  const [orcamento, lancamentos, deducoes] = await Promise.all([
    supabase.from("obra_orcamento").select("categoria, planejado").eq("obra_id", entrada.obraId),
    supabase.from("obra_custos").select("categoria, valor").eq("obra_id", entrada.obraId),
    supabase.from("obra_deducoes").select("impostos_percentual, comissoes_percentual").eq("empresa_id", entrada.empresaId).maybeSingle(),
  ]);
  for (const r of [orcamento, lancamentos, deducoes]) if (r.error) throw r.error;
  let financeiro: FinanceiroVM = { estado: "sem_permissao" };
  if ((orcamento.data ?? []).length > 0) {
    const custos = montarCustos({
      orcamento: orcamento.data ?? [],
      lancamentos: lancamentos.data ?? [],
      etapasConcluidas: new Set((linhas ?? []).filter((l) => l.situacao === "concluida").map((l) => l.etapa)),
    });
    const deducoesPct = Number(deducoes.data?.impostos_percentual ?? 0) + Number(deducoes.data?.comissoes_percentual ?? 0);
    // Só o caminho comercial consulta o valor vendido, e a RLS devolve a linha apenas a quem pode ver.
    financeiro = { estado: "disponivel", custos, resultado: obra.valorVendido !== null ? resultadoObra(obra.valorVendido, custos, deducoesPct) : null };
  }

  return {
    id: resumo.id,
    numero: resumo.numero,
    clienteNome: resumo.clienteNome,
    local: [resumo.cidade, resumo.uf].filter(Boolean).join("/") || null,
    potenciaKwp: resumo.potenciaKwp,
    situacao: resumo.situacao,
    alertas: resumo.alertas,
    setores,
    pendencias,
    proximasEntregas,
    entregaContratada,
    entregaPrevista: cronograma?.entregaPrevista ?? null,
    progresso: prazosRes.data?.[0]?.progresso ?? null,
    cronograma,
    financeiro,
  };
}
