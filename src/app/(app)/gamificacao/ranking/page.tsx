import Link from "next/link";
import { Cartao } from "@/components/ui";
import { calcularNivel } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PERFIL_GAMIFICACAO, type PerfilGamificacao } from "@/lib/tipos";

const PERIODOS = [
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
  { chave: "geral", rotulo: "Geral" },
] as const;
type Periodo = (typeof PERIODOS)[number]["chave"];

// Ranking é sempre separado por perfil (decisão do Evandro, 2026-10-01): sem
// mistura por padrão. cs_farmer ainda não tem gente nesse perfil — fica de
// fora das abas até existir uso real.
const PERFIS_RANKING = ["sdr", "closer"] as const satisfies readonly PerfilGamificacao[];

function calcularDesde(periodo: Periodo): string | null {
  const agora = new Date();
  if (periodo === "semana") {
    const desde = new Date(agora);
    desde.setDate(desde.getDate() - 7);
    return desde.toISOString();
  }
  if (periodo === "mes") {
    return new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  }
  return null;
}

const MEDALHAS = ["🥇", "🥈", "🥉"];

export default async function Ranking({ searchParams }: { searchParams: Promise<{ periodo?: string; perfil?: string }> }) {
  const { atual } = await exigirPapel();
  const { periodo: periodoParam, perfil: perfilParam } = await searchParams;
  const periodo = (PERIODOS.some((p) => p.chave === periodoParam) ? periodoParam : "mes") as Periodo;
  // Minha aba por padrão (sdr/closer); sem perfil (admin/gestor, que só visualiza, não compete), cai na primeira aba.
  const perfil = (
    PERFIS_RANKING.includes(perfilParam as (typeof PERFIS_RANKING)[number])
      ? perfilParam
      : (atual.perfilGamificacao ?? PERFIS_RANKING[0])
  ) as (typeof PERFIS_RANKING)[number];
  const supabase = await criarClienteServidor();

  const [{ data: pontos }, { data: membros }, { data: niveis }] = await Promise.all([
    supabase.rpc("ranking_gamificacao", { p_empresa_id: atual.empresaId, p_perfil: perfil, p_desde: calcularDesde(periodo) ?? undefined }),
    supabase
      .from("empresa_membros")
      .select("id, ativo, perfis(nome, email)")
      .eq("empresa_id", atual.empresaId)
      .eq("ativo", true),
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", atual.empresaId).eq("ativa", true).order("xp_minimo"),
  ]);

  const nomes = new Map(
    (membros ?? []).map((m) => {
      const p = m.perfis as unknown as { nome: string; email: string } | null;
      return [m.id, p?.nome || p?.email || "(sem nome)"];
    }),
  );

  // Nível exibido no ranking é sempre o nível real da pessoa (XP ativo da
  // vida toda), nunca o total filtrado por perfil/período usado só pra
  // ordenar o ranking — mesma fonte única (calcularNivel) de jornada/
  // dashboard/início, pra não voltar a mostrar nível diferente em cada tela.
  const membroIds = (pontos ?? []).map((l) => l.membro_id);
  const { data: xpGlobalLinhas } = membroIds.length
    ? await supabase.from("point_ledger").select("membro_id, xp").eq("empresa_id", atual.empresaId).eq("estornado", false).in("membro_id", membroIds)
    : { data: [] as { membro_id: string; xp: number }[] };
  const xpGlobalPorMembro = new Map<string, number>();
  for (const l of xpGlobalLinhas ?? []) {
    xpGlobalPorMembro.set(l.membro_id, (xpGlobalPorMembro.get(l.membro_id) ?? 0) + l.xp);
  }
  const niveisNormalizados = (niveis ?? []).map((n) => ({ nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo }));

  const linhas = (pontos ?? [])
    .filter((l) => nomes.has(l.membro_id))
    .map((l) => ({
      membroId: l.membro_id,
      nome: nomes.get(l.membro_id)!,
      total: l.total_xp,
      nivel: calcularNivel(niveisNormalizados, xpGlobalPorMembro.get(l.membro_id) ?? 0),
    }));

  const maiorTotal = Math.max(1, ...linhas.map((l) => l.total));
  const podio = linhas.slice(0, 3);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Ranking</h1>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          {PERFIS_RANKING.map((p) => (
            <Link
              key={p}
              href={`/gamificacao/ranking?periodo=${periodo}&perfil=${p}`}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                perfil === p ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {ROTULO_PERFIL_GAMIFICACAO[p]}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          {PERIODOS.map((p) => (
            <Link
              key={p.chave}
              href={`/gamificacao/ranking?periodo=${p.chave}&perfil=${perfil}`}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                periodo === p.chave ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {p.rotulo}
            </Link>
          ))}
        </div>
      </div>
      {!atual.perfilGamificacao && (
        <p className="text-xs text-zinc-500">Você não compete no ranking comercial (sem perfil de gamificação) — só está visualizando.</p>
      )}

      {!linhas.length && (
        <Cartao>
          <p className="text-sm text-zinc-600">Ninguém pontuou nesse período ainda.</p>
        </Cartao>
      )}

      {podio.length > 0 && (
        <Cartao>
          <div className="flex items-end justify-center gap-3">
            {[podio[1], podio[0], podio[2]].map((linha, i) =>
              linha ? (
                <div
                  key={linha.membroId}
                  className={`flex flex-col items-center gap-1 rounded-lg px-3 pt-3 pb-2 text-center ${
                    i === 1 ? "order-2 bg-dourado/10" : "order-none bg-zinc-50"
                  }`}
                  style={{ minWidth: 88 }}
                >
                  <span className="text-2xl">{MEDALHAS[i === 1 ? 0 : i === 0 ? 1 : 2]}</span>
                  <span className="max-w-[80px] truncate text-sm font-medium text-zinc-900">{linha.nome}</span>
                  <span className="text-xs text-zinc-500">
                    {linha.nivel.nome ? `${linha.nivel.nome} · ` : ""}nível {linha.nivel.nivel}
                  </span>
                  <span className="text-sm font-semibold text-dourado">{linha.total.toLocaleString("pt-BR")} XP</span>
                </div>
              ) : (
                <div key={i} />
              ),
            )}
          </div>
        </Cartao>
      )}

      {linhas.length > 0 && (
        <Cartao titulo="Classificação completa">
          <ul className="flex flex-col gap-2.5">
            {linhas.map((linha, i) => (
              <li key={linha.membroId} className={`flex items-center gap-3 ${linha.membroId === atual.membroId ? "rounded-lg bg-dourado/5 p-1.5" : ""}`}>
                <span className="w-5 shrink-0 text-right text-sm text-zinc-500">{i + 1}º</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900">{linha.nome}</span>
                    <span className="shrink-0 text-sm font-semibold text-zinc-900">{linha.total.toLocaleString("pt-BR")} XP</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-dourado" style={{ width: `${Math.max(4, (linha.total / maiorTotal) * 100)}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
