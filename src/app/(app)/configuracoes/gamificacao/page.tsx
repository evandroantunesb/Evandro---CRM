import { Cartao } from "@/components/ui";
import { EVENTOS_GAMIFICACAO } from "@/lib/gamificacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { OperadorCondicao, PeriodoLimiteRegra } from "@/lib/tipos";
import { LinhaRegra, NovaRegra } from "./formularios";

export default async function ConfigGamificacao() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: regras } = await supabase
    .from("gamification_rules")
    .select("id, nome, evento_tipo, condicao, pontos, limite_periodo, limite_quantidade, ativa")
    .eq("empresa_id", atual.empresaId)
    .order("created_at");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Regras de pontos</h1>
      <p className="text-sm text-zinc-600">
        Cada regra associa um evento do CRM a uma pontuação. Sempre que o evento acontecer (e a condição, se houver,
        for satisfeita), o pontos entra automaticamente no extrato do responsável.
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
              pontos: r.pontos,
              limitePeriodo: r.limite_periodo as PeriodoLimiteRegra | null,
              limiteQuantidade: r.limite_quantidade,
              ativa: r.ativa,
            }}
            eventos={EVENTOS_GAMIFICACAO}
          />
        ))}
      </Cartao>
    </div>
  );
}
