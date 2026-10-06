import { Cartao } from "@/components/ui";
import { EVENTOS_GAMIFICACAO, EVENTOS_GAMIFICACAO_SELECIONAVEIS } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { OperadorCondicao, PerfilGamificacao, PeriodoLimiteRegra } from "@/lib/tipos";
import { LinhaRegra, NovaRegra } from "../_compartilhado/formularios";

export default async function RegrasDePontos() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: regras } = await supabase
    .from("gamification_rules")
    .select("id, nome, evento_tipo, condicao, xp, moedas, perfil_aplicavel, limite_periodo, limite_quantidade, unica_por_negocio, ativa")
    .eq("empresa_id", atual.empresaId)
    .order("created_at");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Regras de pontos</h1>

      <p className="text-sm text-zinc-600">
        Cada regra associa um evento do CRM a XP (progressão: ranking, nível, conquistas) e/ou moedas (saldo gastável
        na loja). Sempre que o evento acontecer (e a condição, se houver, for satisfeita), o lançamento entra
        automaticamente no extrato do responsável.
      </p>
      <Cartao titulo="Nova regra">
        <NovaRegra eventos={EVENTOS_GAMIFICACAO_SELECIONAVEIS} />
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
    </div>
  );
}
