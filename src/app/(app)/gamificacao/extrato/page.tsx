import { Wallet, Zap } from "lucide-react";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDataHora } from "@/lib/formatacao";
import { CartaoGf, EstadoVazioGf, LinhaLancamento } from "../_compartilhado/ui";

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-[var(--gf-texto)]">Extrato</h1>
      <div className="grid grid-cols-2 gap-3">
        <CartaoGf titulo="XP acumulado">
          <p className="flex items-center gap-2 text-3xl font-semibold text-[var(--gf-texto)]">
            <Zap size={22} className="text-[var(--gf-verde)]" />
            {totalXp.toLocaleString("pt-BR")}
          </p>
        </CartaoGf>
        <CartaoGf titulo="Saldo de moedas">
          <p className="flex items-center gap-2 text-3xl font-semibold text-[var(--gf-texto)]">
            <Wallet size={22} className="text-[var(--gf-verde)]" />
            {totalMoedas.toLocaleString("pt-BR")}
          </p>
          {ajusteNegativo > 0 && (
            <p className="mt-1 text-sm text-[var(--gf-texto-sec)]">{ajusteNegativo.toLocaleString("pt-BR")} moedas em ajuste</p>
          )}
        </CartaoGf>
      </div>
      <CartaoGf titulo={`Lançamentos (${lancamentos?.length ?? 0})`}>
        {!lancamentos?.length ? (
          <EstadoVazioGf>Nenhum lançamento ainda.</EstadoVazioGf>
        ) : (
          <ul className="flex flex-col">
            {lancamentos.map((l) => (
              <LinhaLancamento
                key={l.id}
                descricao={l.descricao}
                tempo={formatarDataHora(l.created_at)}
                xp={l.xp}
                moedas={l.moedas}
                estornado={l.estornado}
              />
            ))}
          </ul>
        )}
      </CartaoGf>
    </div>
  );
}
