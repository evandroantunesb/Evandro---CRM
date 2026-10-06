import { Crown, Users } from "lucide-react";
import { assinarAvatares } from "@/lib/avatares";
import { calcularNivel } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_PERFIL_GAMIFICACAO, type PerfilGamificacao } from "@/lib/tipos";
import { AbasSecao } from "../_compartilhado/abas-secao";
import { LinhaRankingGf, PodioGf, type ItemRankingGf } from "../_compartilhado/ranking-ui";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf, SeletorSegmentadoGf } from "../_compartilhado/ui";

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

export default async function Ranking({ searchParams }: { searchParams: Promise<{ periodo?: string; perfil?: string }> }) {
  const { atual } = await exigirPapel();
  const { periodo: periodoParam, perfil: perfilParam } = await searchParams;
  const periodo = (PERIODOS.some((p) => p.chave === periodoParam) ? periodoParam : "mes") as Periodo;
  // Minha aba por padrão (sdr/closer); sem perfil (admin/gestor, que só visualiza, não compete)
  // ou com perfil sem aba própria ainda (ex.: cs_farmer, sem gente usando hoje), cai na primeira.
  const meuPerfilTemAba = PERFIS_RANKING.includes(atual.perfilGamificacao as (typeof PERFIS_RANKING)[number]);
  const perfil = (
    PERFIS_RANKING.includes(perfilParam as (typeof PERFIS_RANKING)[number])
      ? perfilParam
      : meuPerfilTemAba
        ? atual.perfilGamificacao
        : PERFIS_RANKING[0]
  ) as (typeof PERFIS_RANKING)[number];
  const supabase = await criarClienteServidor();

  const [{ data: pontos }, { data: membros }, { data: niveis }] = await Promise.all([
    supabase.rpc("ranking_gamificacao", { p_empresa_id: atual.empresaId, p_perfil: perfil, p_desde: calcularDesde(periodo) ?? undefined }),
    supabase
      .from("empresa_membros")
      .select("id, ativo, perfis(nome, email, avatar_caminho)")
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
  const caminhosAvatar = new Map(
    (membros ?? []).map((m) => [m.id, (m.perfis as unknown as { avatar_caminho: string | null } | null)?.avatar_caminho ?? null]),
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

  // Fotos: uma assinatura em lote para todo o ranking.
  const urlsAvatar = await assinarAvatares(
    supabase,
    linhas.map((l) => caminhosAvatar.get(l.membroId)),
  );

  const maiorTotal = Math.max(1, ...linhas.map((l) => l.total));
  const itens: ItemRankingGf[] = linhas.map((l, i) => ({
    posicao: i + 1,
    membroId: l.membroId,
    nome: l.nome,
    total: l.total,
    avatarUrl: urlsAvatar.get(caminhosAvatar.get(l.membroId) ?? ""),
    detalhe: `Nível ${l.nivel.nivel}${l.nivel.nome ? ` · ${l.nivel.nome}` : ""}`,
  }));
  const podio = itens.slice(0, 3);
  const rotuloPeriodo = PERIODOS.find((p) => p.chave === periodo)?.rotulo ?? "Mês";

  return (
    <PaginaGf largura="larga">
      <AbasSecao secao="desempenho" papel={atual.papel} />
      <CabecalhoPaginaGf
        titulo="Ranking"
        descricao={`${ROTULO_PERFIL_GAMIFICACAO[perfil]} · ${rotuloPeriodo} · ordenado por XP acumulado no período`}
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <SeletorSegmentadoGf
              rotulo="Perfil do ranking"
              opcoes={PERFIS_RANKING.map((p) => ({
                href: `/gamificacao/ranking?periodo=${periodo}&perfil=${p}`,
                rotulo: ROTULO_PERFIL_GAMIFICACAO[p],
                ativo: perfil === p,
              }))}
            />
            <SeletorSegmentadoGf
              rotulo="Período do ranking"
              opcoes={PERIODOS.map((p) => ({
                href: `/gamificacao/ranking?periodo=${p.chave}&perfil=${perfil}`,
                rotulo: p.rotulo,
                ativo: periodo === p.chave,
              }))}
            />
          </div>
        }
      />
      {!atual.perfilGamificacao && (
        <p className="gf-t-aux">
          Você não compete no ranking comercial (sem perfil de gamificação) — só está visualizando.
        </p>
      )}

      {!linhas.length && (
        <CartaoGf>
          <EstadoVazioGf Icone={Users} titulo="Ninguém pontuou ainda">
            Nenhum participante somou XP nesse período. Assim que alguém pontuar, o pódio aparece aqui.
          </EstadoVazioGf>
        </CartaoGf>
      )}

      {podio.length > 0 && (
        <CartaoGf titulo="Pódio" Icone={Crown} tomIcone="dourado" className="gf-podio-card">
          <PodioGf itens={podio} membroAtualId={atual.membroId} variante="grande" />
        </CartaoGf>
      )}

      {itens.length > 0 && (
        <CartaoGf
          titulo="Classificação completa"
          descricao={`${itens.length} participante${itens.length === 1 ? "" : "s"}`}
        >
          <ul className="flex flex-col gap-1" aria-label="Classificação completa">
            {itens.map((item) => (
              <LinhaRankingGf
                key={item.membroId}
                item={item}
                membroAtualId={atual.membroId}
                maximo={maiorTotal}
                avatar
                larga
              />
            ))}
          </ul>
        </CartaoGf>
      )}
    </PaginaGf>
  );
}
