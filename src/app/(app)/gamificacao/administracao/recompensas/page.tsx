import { Cartao } from "@/components/ui";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaRecompensa, NovaRecompensa } from "../_compartilhado/formularios";

export default async function Recompensas() {
  const { atual } = await exigirPapel("admin");
  const supabase = await criarClienteServidor();
  const { data: recompensas } = await supabase
    .from("recompensas")
    .select("id, nome, descricao, custo_moedas, estoque, limite_por_membro, validade_ate, ativa")
    .eq("empresa_id", atual.empresaId)
    .order("created_at");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Recompensas</h1>

      <p className="text-sm text-zinc-600">
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
