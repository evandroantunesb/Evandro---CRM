import { Cartao } from "@/components/ui";
import { EVENTOS_GAMIFICACAO } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { OperadorCondicao, PeriodoLimiteRegra } from "@/lib/tipos";
import { LinhaConquista, LinhaNivel, LinhaRecompensa, LinhaRegra, NovaConquista, NovaRecompensa, NovoNivel, NovaRegra } from "./formularios";

export default async function ConfigGamificacao() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: regras }, { data: niveis }, { data: conquistas }, { data: recompensas }] = await Promise.all([
    supabase
      .from("gamification_rules")
      .select("id, nome, evento_tipo, condicao, pontos, limite_periodo, limite_quantidade, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo").eq("empresa_id", atual.empresaId).order("nivel"),
    supabase
      .from("conquistas")
      .select("id, nome, descricao, icone, criterio, xp_bonus, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
    supabase
      .from("recompensas")
      .select("id, nome, descricao, custo_pontos, estoque, limite_por_membro, validade_ate, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Gamificação</h1>

      <p className="text-sm text-zinc-600">
        Cada regra associa um evento do CRM a uma pontuação. Sempre que o evento acontecer (e a condição, se houver,
        for satisfeita), o ponto entra automaticamente no extrato do responsável.
      </p>
      <Cartao titulo="Nova regra de pontos">
        <NovaRegra eventos={EVENTOS_GAMIFICACAO} />
      </Cartao>
      <Cartao titulo={`Regras de pontos (${regras?.length ?? 0})`}>
        {(regras ?? []).map((r) => (
          <LinhaRegra
            key={r.id}
            regra={{
              id: r.id,
              nome: r.nome,
              eventoTipo: r.evento_tipo,
              condicao: r.condicao as { campo: string; operador: OperadorCondicao; valor: string } | null,
              pontos: r.pontos,
              limitePeriodo: r.limite_periodo as PeriodoLimiteRegra | null,
              limiteQuantidade: r.limite_quantidade,
              ativa: r.ativa,
            }}
            eventos={EVENTOS_GAMIFICACAO}
          />
        ))}
      </Cartao>

      <p className="mt-4 text-sm text-zinc-600">
        Níveis definem quanto XP (o mesmo saldo de pontos) é preciso acumular para subir. Sem níveis cadastrados, todo
        mundo fica no nível 1.
      </p>
      <Cartao titulo="Novo nível">
        <NovoNivel />
      </Cartao>
      <Cartao titulo={`Níveis (${niveis?.length ?? 0})`}>
        {(niveis ?? []).map((n) => (
          <LinhaNivel key={n.nivel} nivel={{ nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo }} />
        ))}
      </Cartao>

      <p className="mt-4 text-sm text-zinc-600">
        Conquistas desbloqueiam sozinhas quando o colaborador acumula os pontos exigidos, e podem dar um XP bônus.
      </p>
      <Cartao titulo="Nova conquista">
        <NovaConquista />
      </Cartao>
      <Cartao titulo={`Conquistas (${conquistas?.length ?? 0})`}>
        {(conquistas ?? []).map((c) => (
          <LinhaConquista
            key={c.id}
            conquista={{
              id: c.id,
              nome: c.nome,
              descricao: c.descricao,
              icone: c.icone,
              valorPontos: (c.criterio as { metrica: string; valor: number }).valor,
              xpBonus: c.xp_bonus,
              ativa: c.ativa,
            }}
          />
        ))}
      </Cartao>

      <p className="mt-4 text-sm text-zinc-600">
        A loja de recompensas deixa o colaborador trocar pontos por prêmios. O saldo é debitado assim que ele resgata;
        cancelar um resgate devolve os pontos.
      </p>
      <Cartao titulo="Nova recompensa">
        <NovaRecompensa />
      </Cartao>
      <Cartao titulo={`Recompensas (${recompensas?.length ?? 0})`}>
        {(recompensas ?? []).map((r) => (
          <LinhaRecompensa
            key={r.id}
            recompensa={{
              id: r.id,
              nome: r.nome,
              descricao: r.descricao,
              custoPontos: r.custo_pontos,
              estoque: r.estoque,
              limitePorMembro: r.limite_por_membro,
              validadeAte: r.validade_ate,
              ativa: r.ativa,
            }}
          />
        ))}
      </Cartao>
    </div>
  );
}
