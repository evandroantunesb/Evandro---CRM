import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function MinhaJornada() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();

  const [{ data: lancamentos }, { data: niveis }, { data: conquistas }, { data: desbloqueadas }] = await Promise.all([
    supabase.from("point_ledger").select("pontos").eq("membro_id", atual.membroId).eq("estornado", false),
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", atual.empresaId).order("xp_minimo"),
    supabase
      .from("conquistas")
      .select("id, nome, descricao, icone, criterio")
      .eq("empresa_id", atual.empresaId)
      .eq("ativa", true)
      .order("created_at"),
    supabase.from("conquistas_desbloqueadas").select("conquista_id").eq("membro_id", atual.membroId),
  ]);

  const totalXp = (lancamentos ?? []).reduce((soma, l) => soma + l.pontos, 0);

  let nivelAtual = { nivel: 1, nome: null as string | null, xpMinimo: 0 };
  let proximoNivel: { nivel: number; nome: string | null; xpMinimo: number } | null = null;
  for (const n of niveis ?? []) {
    if (n.xp_minimo <= totalXp) nivelAtual = { nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo };
    else {
      proximoNivel = { nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo };
      break;
    }
  }
  const progresso = proximoNivel
    ? Math.min(100, Math.round(((totalXp - nivelAtual.xpMinimo) / (proximoNivel.xpMinimo - nivelAtual.xpMinimo)) * 100))
    : 100;

  const idsDesbloqueadas = new Set((desbloqueadas ?? []).map((d) => d.conquista_id));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Minha jornada</h1>

      <Cartao titulo="Nível atual">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold text-zinc-900">
            {nivelAtual.nivel}
            {nivelAtual.nome && <span className="ml-2 text-base font-normal text-zinc-500">{nivelAtual.nome}</span>}
          </span>
          {proximoNivel && (
            <span className="text-sm text-zinc-600">
              faltam {(proximoNivel.xpMinimo - totalXp).toLocaleString("pt-BR")} XP para o nível {proximoNivel.nivel}
            </span>
          )}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-dourado" style={{ width: `${progresso}%` }} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">{totalXp.toLocaleString("pt-BR")} XP acumulado</p>
      </Cartao>

      <Cartao titulo={`Conquistas (${idsDesbloqueadas.size} de ${conquistas?.length ?? 0})`}>
        {!conquistas?.length && <p className="text-sm text-zinc-600">Nenhuma conquista configurada ainda.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(conquistas ?? []).map((c) => {
            const desbloqueada = idsDesbloqueadas.has(c.id);
            return (
              <div
                key={c.id}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center ${
                  desbloqueada ? "border-dourado/40 bg-dourado/5" : "border-zinc-200 bg-zinc-50 opacity-60"
                }`}
              >
                <span className="text-2xl">{desbloqueada ? c.icone : "🔒"}</span>
                <span className="text-xs font-medium text-zinc-900">{c.nome}</span>
                {!desbloqueada && (
                  <span className="text-[11px] text-zinc-500">
                    Acumule {(c.criterio as { metrica: string; valor: number }).valor.toLocaleString("pt-BR")} pontos
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Cartao>
    </div>
  );
}
