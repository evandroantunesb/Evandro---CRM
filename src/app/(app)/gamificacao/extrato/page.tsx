import { Receipt, Wallet, Zap } from "lucide-react";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarDataHora } from "@/lib/formatacao";
import { AbasSecao } from "../_compartilhado/abas-secao";
import {
  CabecalhoPaginaGf,
  CartaoGf,
  EstadoVazioGf,
  formatarNumeroGf,
  LinhaLancamento,
  LinkAcaoGf,
  PaginaGf,
} from "../_compartilhado/ui";

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
  const totalLancamentos = lancamentos?.length ?? 0;

  return (
    <PaginaGf largura="media">
      <AbasSecao secao="recompensas" papel={atual.papel} />
      <CabecalhoPaginaGf
        titulo="Extrato"
        descricao="Tudo que entrou e saiu do seu XP e das suas moedas."
        acao={<LinkAcaoGf href="/gamificacao/loja">Ir para a loja</LinkAcaoGf>}
      />

      <div className="grid gap-3 @min-[520px]:grid-cols-2">
        <CartaoGf destaque>
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--gf-verde-10)] text-[var(--gf-verde)]">
              <Zap size={24} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="gf-t-rotulo">XP acumulado</p>
              <p className="gf-t-kpi mt-1">{formatarNumeroGf(totalXp)}</p>
            </div>
          </div>
        </CartaoGf>
        <CartaoGf destaque>
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
              <Wallet size={24} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="gf-t-rotulo">Saldo de moedas</p>
              <p className="gf-t-kpi mt-1">{formatarNumeroGf(totalMoedas)}</p>
              {ajusteNegativo > 0 && (
                <p className="gf-t-aux mt-0.5">{formatarNumeroGf(ajusteNegativo)} moedas em ajuste</p>
              )}
            </div>
          </div>
        </CartaoGf>
      </div>

      <CartaoGf
        titulo="Lançamentos"
        descricao={
          totalLancamentos >= 200
            ? "Exibindo os 200 lançamentos mais recentes."
            : `${totalLancamentos} ${totalLancamentos === 1 ? "lançamento" : "lançamentos"}`
        }
      >
        {!lancamentos?.length ? (
          <EstadoVazioGf Icone={Receipt} titulo="Nenhum lançamento ainda">
            Seus pontos e moedas aparecem aqui assim que você pontuar.
          </EstadoVazioGf>
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
    </PaginaGf>
  );
}
