import "server-only";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { carregarDetalheObra } from "../detalhe";
import { setorConcluido } from "../derivados";
import { ROTULO_ALERTA_OBRA, ROTULO_SETOR } from "../rotulos";
import { inconsistenciasFinanceiro } from "./calculos";
import { planejamentoDemonstracao } from "./demo";
import type { ApresentacaoObraVM, FinanceiroVM, PendenciaVM, PlanejamentoObra } from "./tipos";

/** Hoje no fuso de Brasília (AAAA-MM-DD). */
export const hojeBrasilia = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

/**
 * Apresentação de uma obra (somente leitura). Lê pelo mesmo caminho do detalhe (RLS, empresa
 * atual, `obras_operacao` para o papel operacao) e devolve um VM próprio, montado campo a campo.
 *
 * Dinheiro: só entra no VM de quem a RLS deixa ler o valor vendido DESTA obra
 * (`obra_dados_comerciais`: admin, vendedor da venda, gestor da equipe dele). Para os demais
 * (operacao, SDR, gestor de outra equipe) o bloco é `sem_permissao` e nenhum valor sai do servidor.
 *
 * Planejamento (prazo, avanço físico, cronograma, custos, margem): o banco ainda não tem. Sem
 * a demonstração local, tudo fica null/vazio. Avanço nunca é derivado do status dos setores.
 */
export async function carregarApresentacaoObra(
  supabase: SupabaseServidor,
  entrada: { empresaId: string; papel: string | null | undefined; obraId: string; hojeIso?: string; env?: Record<string, string | undefined> },
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

  const plano: PlanejamentoObra | null = planejamentoDemonstracao(resumo.clienteNome, hoje, entrada.env);
  // Só o caminho comercial consulta o valor vendido, e a RLS devolve a linha apenas a quem pode ver.
  const podeVerDinheiro = obra.valorVendido !== null;

  let financeiro: FinanceiroVM;
  if (!podeVerDinheiro) financeiro = { estado: "sem_permissao" };
  else if (plano?.financeiro && inconsistenciasFinanceiro(plano.financeiro, plano.custos).length === 0) {
    financeiro = { estado: "disponivel", valorVendido: obra.valorVendido, custos: plano.custos, resultado: plano.financeiro };
  } else financeiro = { estado: "sem_dados", valorVendido: obra.valorVendido };

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
    prazo: plano?.prazo ?? null,
    avancoFisico: plano?.avancoFisico ?? null,
    cronograma: plano && plano.cronograma.length > 0 ? plano.cronograma : null,
    financeiro,
    demonstracao: plano !== null,
  };
}
