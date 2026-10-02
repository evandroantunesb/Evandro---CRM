import { Cartao } from "@/components/ui";
import { EVENTOS_GAMIFICACAO } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { OperadorCondicao, PerfilGamificacao, PeriodoLimiteRegra } from "@/lib/tipos";
import { LinhaConquista, LinhaNivel, LinhaRecompensa, LinhaRegra, NovaConquista, NovaRecompensa, NovoNivel, NovaRegra } from "./formularios";

export default async function ConfigGamificacao() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const [{ data: regras }, { data: niveis }, { data: conquistas }, { data: recompensas }] = await Promise.all([
    supabase
      .from("gamification_rules")
      .select("id, nome, evento_tipo, condicao, xp, moedas, perfil_aplicavel, limite_periodo, limite_quantidade, unica_por_negocio, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
    supabase.from("niveis_gamificacao").select("nivel, nome, xp_minimo, ativa").eq("empresa_id", atual.empresaId).order("nivel"),
    supabase
      .from("conquistas")
      .select("id, nome, descricao, icone, criterio, xp_bonus, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
    supabase
      .from("recompensas")
      .select("id, nome, descricao, custo_moedas, estoque, limite_por_membro, validade_ate, ativa")
      .eq("empresa_id", atual.empresaId)
      .order("created_at"),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Gamificação</h1>

      <p className="text-sm text-zinc-600">
        Cada regra associa um evento do CRM a XP (progressão: ranking, nível, conquistas) e/ou moedas (saldo gastável
        na loja). Sempre que o evento acontecer (e a condição, se houver, for satisfeita), o lançamento entra
        automaticamente no extrato do responsável.
      </p>
      <Cartao titulo="Nova regra">
        <NovaRegra eventos={EVENTOS_GAMIFICACAO} />
      </Cartao>
      <Cartao titulo={`Regras (${regras?.length ?? 0})`}>
        {(regras ?? []).map((r) => (
          <LinhaRegra
            key={r.id}
            regra={{
              id: r.id,
              nome: r.nome,
              eventoTipo: r.evento_tipo,
              condicao: r.condicao as { campo: string; operador: OperadorCondicao; valor: string } | null,
              xp: r.xp,
              moedas: r.moedas,
              perfilAplicavel: r.perfil_aplicavel as PerfilGamificacao | null,
              limitePeriodo: r.limite_periodo as PeriodoLimiteRegra | null,
              limiteQuantidade: r.limite_quantidade,
              unicaPorNegocio: r.unica_por_negocio,
              ativa: r.ativa,
            }}
            eventos={EVENTOS_GAMIFICACAO}
          />
        ))}
      </Cartao>

      <p className="mt-4 text-sm text-zinc-600">
        Níveis definem quanto XP é preciso acumular para subir (XP nunca é gasto na loja). Sem níveis cadastrados,
        todo mundo fica no nível 1. O XP mínimo precisa crescer junto com o número do nível. Desativar um nível só
        tira ele do cálculo de todo mundo — a configuração continua salva e pode ser reativada.
      </p>
      <Cartao titulo="Novo nível">
        <NovoNivel />
      </Cartao>
      <Cartao titulo={`Níveis (${niveis?.length ?? 0})`}>
        {(niveis ?? []).map((n) => (
          <LinhaNivel key={n.nivel} nivel={{ nivel: n.nivel, nome: n.nome, xpMinimo: n.xp_minimo, ativa: n.ativa }} />
        ))}
      </Cartao>

      <p className="mt-4 text-sm text-zinc-600">
        Conquistas desbloqueiam sozinhas quando o colaborador acumula o XP exigido, e podem dar um XP bônus (nunca
        moedas — uma conquista que premie em moedas precisa de configuração própria, fora desta tela).
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
              valorXp: (c.criterio as { metrica: string; valor: number }).valor,
              xpBonus: c.xp_bonus,
              ativa: c.ativa,
            }}
          />
        ))}
      </Cartao>

      <p className="mt-4 text-sm text-zinc-600">
        A loja de recompensas deixa o colaborador trocar moedas por prêmios. O saldo é debitado assim que ele resgata;
        cancelar um resgate devolve as moedas.
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
              custoMoedas: r.custo_moedas,
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
