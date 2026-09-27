import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { ModeloCobranca, TipoPlano } from "@/lib/tipos";

export type PlanoEmpresa = {
  tipo: TipoPlano;
  modelo_cobranca: ModeloCobranca | null;
  valor_fixo: number | null;
  valor_por_usuario: number | null;
  dia_vencimento: number | null;
  limite_usuarios: number | null;
};

/** Primeiro dia do mês atual, no formato usado pela coluna `referencia` (date). */
export function referenciaMesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
}

export function rotuloMesReferencia(referencia: string): string {
  const [ano, mes] = referencia.split("-").map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Calcula os valores do mês a partir do plano vigente e dos usuários ativos — mesma
 * conta usada tanto na prévia da tela quanto no fechamento gravado. */
export function calcularValoresPlano(plano: PlanoEmpresa | null, usuariosAtivos: number) {
  if (!plano || plano.tipo === "gratuito" || !plano.modelo_cobranca) {
    return { valorFixo: 0, valorPorUsuario: 0, valorTotal: 0 };
  }
  const valorFixo = plano.modelo_cobranca === "por_usuario" ? 0 : (plano.valor_fixo ?? 0);
  const valorPorUsuarioUnit = plano.modelo_cobranca === "fixo" ? 0 : (plano.valor_por_usuario ?? 0);
  const valorPorUsuario = valorPorUsuarioUnit * usuariosAtivos;
  return { valorFixo, valorPorUsuario, valorTotal: valorFixo + valorPorUsuario };
}

export type LinhaRelatorioCobranca = {
  empresaId: string;
  empresaNome: string;
  adminResponsavel: string | null;
  plano: PlanoEmpresa | null;
  usuariosAtivos: number;
  valorFixo: number;
  valorPorUsuario: number;
  valorTotal: number;
  fechamentoId: string | null;
  pago: boolean;
  pagoEm: string | null;
};

export async function carregarRelatorioCobranca(referencia: string): Promise<LinhaRelatorioCobranca[]> {
  const supabase = await criarClienteServidor();
  const [{ data: empresas }, { data: planos }, { data: membros }, { data: fechamentos }] = await Promise.all([
    supabase.from("empresas").select("id, nome").order("nome"),
    supabase.from("planos_empresa").select("*"),
    supabase.from("empresa_membros").select("empresa_id, papel, ativo, created_at, perfis(nome)").eq("ativo", true),
    supabase.from("fechamentos_mensais").select("*").eq("referencia", referencia),
  ]);

  const planoPorEmpresa = new Map((planos ?? []).map((p) => [p.empresa_id, p as PlanoEmpresa]));
  const fechamentoPorEmpresa = new Map((fechamentos ?? []).map((f) => [f.empresa_id, f]));

  const membrosPorEmpresa = new Map<string, { ativos: number; admin: string | null }>();
  for (const m of membros ?? []) {
    const atual = membrosPorEmpresa.get(m.empresa_id) ?? { ativos: 0, admin: null };
    atual.ativos += 1;
    if (m.papel === "admin" && !atual.admin) {
      const perfil = m.perfis as unknown as { nome: string } | null;
      atual.admin = perfil?.nome || null;
    }
    membrosPorEmpresa.set(m.empresa_id, atual);
  }

  return (empresas ?? []).map((e) => {
    const plano = planoPorEmpresa.get(e.id) ?? null;
    const info = membrosPorEmpresa.get(e.id) ?? { ativos: 0, admin: null };
    const fechamento = fechamentoPorEmpresa.get(e.id) ?? null;
    const valores = fechamento
      ? { valorFixo: fechamento.valor_fixo, valorPorUsuario: fechamento.valor_por_usuario, valorTotal: fechamento.valor_total }
      : calcularValoresPlano(plano, info.ativos);
    return {
      empresaId: e.id,
      empresaNome: e.nome,
      adminResponsavel: info.admin,
      plano,
      usuariosAtivos: fechamento?.usuarios_ativos ?? info.ativos,
      ...valores,
      fechamentoId: fechamento?.id ?? null,
      pago: fechamento?.pago ?? false,
      pagoEm: fechamento?.pago_em ?? null,
    };
  });
}
