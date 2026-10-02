import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

export default async function ExtratoDePontos() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const { data: lancamentos } = await supabase
    .from("point_ledger")
    .select("id, xp, moedas, descricao, estornado, created_at")
    .eq("empresa_id", atual.empresaId)
    .eq("membro_id", atual.membroId)
    .order("created_at", { ascending: false })
    .limit(200);

  const ativos = (lancamentos ?? []).filter((l) => !l.estornado);
  const totalXp = ativos.reduce((soma, l) => soma + l.xp, 0);
  // Saldo real pode ficar negativo (moedas já gastas cuja origem foi revertida depois —
  // estado válido, nunca corrigido artificialmente). Mesma semântica de exibição da Loja:
  // nunca mostrar o número negativo bruto, só "0 disponíveis" + o ajuste separado. O
  // ledger (e os lançamentos individuais abaixo) continuam mostrando os valores reais.
  const saldoMoedasReal = ativos.reduce((soma, l) => soma + l.moedas, 0);
  const totalMoedas = Math.max(saldoMoedasReal, 0);
  const ajusteNegativo = saldoMoedasReal < 0 ? -saldoMoedasReal : 0;

  function valor(n: number, estornado: boolean) {
    if (n === 0) return null;
    return (
      <span className={`font-medium ${estornado ? "text-zinc-400 line-through" : n >= 0 ? "text-green-700" : "text-red-700"}`}>
        {n >= 0 ? "+" : ""}
        {n}
      </span>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Extrato</h1>
      <div className="grid grid-cols-2 gap-3">
        <Cartao titulo="XP acumulado">
          <p className="text-3xl font-semibold text-zinc-900">{totalXp.toLocaleString("pt-BR")}</p>
        </Cartao>
        <Cartao titulo="Saldo de moedas">
          <p className="text-3xl font-semibold text-zinc-900">{totalMoedas.toLocaleString("pt-BR")}</p>
          {ajusteNegativo > 0 && (
            <p className="text-sm text-zinc-500">{ajusteNegativo.toLocaleString("pt-BR")} moedas em ajuste</p>
          )}
        </Cartao>
      </div>
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
                {l.xp !== 0 && (
                  <span className="flex items-baseline gap-1">
                    {valor(l.xp, l.estornado)}
                    <span className="text-xs text-zinc-400">XP</span>
                  </span>
                )}
                {l.moedas !== 0 && (
                  <span className="flex items-baseline gap-1">
                    {valor(l.moedas, l.estornado)}
                    <span className="text-xs text-zinc-400">moedas</span>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}
