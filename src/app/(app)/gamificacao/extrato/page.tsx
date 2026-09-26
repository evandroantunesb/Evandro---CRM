import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function ExtratoDePontos() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const { data: lancamentos } = await supabase
    .from("point_ledger")
    .select("id, pontos, descricao, estornado, created_at")
    .eq("empresa_id", atual.empresaId)
    .eq("membro_id", atual.membroId)
    .order("created_at", { ascending: false })
    .limit(200);

  const total = (lancamentos ?? []).filter((l) => !l.estornado).reduce((soma, l) => soma + l.pontos, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Extrato de pontos</h1>
      <Cartao titulo="Saldo atual">
        <p className="text-3xl font-semibold text-zinc-900">{total.toLocaleString("pt-BR")} pts</p>
      </Cartao>
      <Cartao titulo={`Lançamentos (${lancamentos?.length ?? 0})`}>
        {!lancamentos?.length && <p className="text-sm text-zinc-600">Nenhum lançamento ainda.</p>}
        <ul className="flex flex-col">
          {(lancamentos ?? []).map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2 text-sm first:border-t-0"
            >
              <div className="flex flex-col">
                <span className={l.estornado ? "text-zinc-400 line-through" : "text-zinc-900"}>{l.descricao}</span>
                <span className="text-xs text-zinc-500">{formatarDataHora(l.created_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                {l.estornado && <Selo tom="negativo">Estornado</Selo>}
                <span className={`font-medium ${l.estornado ? "text-zinc-400 line-through" : l.pontos >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {l.pontos >= 0 ? "+" : ""}
                  {l.pontos}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}
