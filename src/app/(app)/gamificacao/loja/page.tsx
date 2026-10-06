import { Coins, Gift, PackageCheck } from "lucide-react";
import { formatarDataHora } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { StatusResgate } from "@/lib/tipos";
import { AbasSecao } from "../_compartilhado/abas-secao";
import { StatusResgateGf } from "../_compartilhado/resgate-ui";
import {
  CabecalhoPaginaGf,
  CartaoGf,
  EstadoVazioGf,
  formatarNumeroGf,
  formatarSinal,
  LinkAcaoGf,
  PaginaGf,
  SecaoGf,
} from "../_compartilhado/ui";
import { CartaoRecompensa } from "./formulario";

export default async function LojaDeRecompensas() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: lancamentos }, { data: recompensas }, { data: meusResgates }] = await Promise.all([
    supabase.from("point_ledger").select("moedas").eq("membro_id", atual.membroId).eq("estornado", false),
    supabase
      .from("recompensas")
      .select("id, nome, descricao, custo_moedas")
      .eq("empresa_id", atual.empresaId)
      .eq("ativa", true)
      .or(`validade_ate.is.null,validade_ate.gte.${hoje}`)
      .order("custo_moedas"),
    supabase
      .from("resgates")
      .select("id, status, moedas_debitadas, created_at, recompensas(nome)")
      .eq("membro_id", atual.membroId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Saldo real pode ficar negativo (moedas já gastas cuja origem foi revertida depois
  // — decisão do Evandro: estado válido, nunca corrigido artificialmente). O resgate
  // continua bloqueado com base no saldo REAL (via RPC); a exibição clampa em 0 e
  // mostra o ajuste pendente separadamente, pra não parecer uma dívida financeira.
  const saldoReal = (lancamentos ?? []).reduce((soma, l) => soma + l.moedas, 0);
  const saldoExibido = Math.max(saldoReal, 0);
  const ajusteNegativo = saldoReal < 0 ? -saldoReal : 0;
  const alcancaveis = (recompensas ?? []).filter((r) => saldoReal >= r.custo_moedas).length;

  return (
    <PaginaGf largura="larga">
      <AbasSecao secao="recompensas" papel={atual.papel} />
      <CabecalhoPaginaGf
        titulo="Loja de recompensas"
        descricao="Troque suas moedas por recompensas. O saldo é debitado no resgate."
        acao={<LinkAcaoGf href="/gamificacao/extrato">Ver extrato</LinkAcaoGf>}
      />

      <CartaoGf destaque className="gf-podio-card">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)] ring-1 ring-[var(--gf-dourado-borda)]">
              <Coins size={28} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="gf-t-rotulo">Seu saldo</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="gf-t-kpi-lg">{formatarNumeroGf(saldoExibido)}</span>
                <span className="text-lg font-medium text-[var(--gf-texto-sec)]">moedas</span>
              </p>
              {ajusteNegativo > 0 && (
                <p className="gf-t-aux mt-1">{formatarNumeroGf(ajusteNegativo)} moedas em ajuste</p>
              )}
            </div>
          </div>
          {!!recompensas?.length && (
            <p className="gf-t-aux max-w-xs">
              <span className="gf-num text-base font-semibold text-[var(--gf-texto)]">
                {alcancaveis} de {recompensas.length}
              </span>{" "}
              {recompensas.length === 1 ? "recompensa ao seu alcance" : "recompensas ao seu alcance"} agora.
            </p>
          )}
        </div>
      </CartaoGf>

      <SecaoGf titulo="Recompensas disponíveis" Icone={Gift} tom="dourado">
        {!recompensas?.length ? (
          <CartaoGf>
            <EstadoVazioGf Icone={Gift} titulo="Nenhuma recompensa disponível no momento">
              Quando a administração cadastrar recompensas, elas aparecem aqui para você resgatar com suas moedas.
            </EstadoVazioGf>
          </CartaoGf>
        ) : (
          <div className="grid gap-4 @min-[600px]:grid-cols-2 @min-[900px]:grid-cols-3">
            {recompensas.map((r) => (
              <CartaoRecompensa
                key={r.id}
                recompensa={{ id: r.id, nome: r.nome, descricao: r.descricao, custoMoedas: r.custo_moedas }}
                saldo={saldoReal}
              />
            ))}
          </div>
        )}
      </SecaoGf>

      <SecaoGf titulo="Meus resgates" Icone={PackageCheck}>
        <CartaoGf>
          {!meusResgates?.length ? (
            <EstadoVazioGf Icone={PackageCheck} compacto titulo="Você ainda não resgatou nada">
              Seus pedidos e o andamento de cada um aparecem aqui.
            </EstadoVazioGf>
          ) : (
            <ul>
              {meusResgates.map((r) => {
                const recompensa = r.recompensas as unknown as { nome: string } | null;
                const status = r.status as StatusResgate;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--gf-borda)] py-3 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--gf-dourado-10)] text-[var(--gf-dourado)]">
                        <Gift size={17} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="gf-t-item break-words">{recompensa?.nome ?? "(recompensa removida)"}</p>
                        <p className="gf-t-micro">{formatarDataHora(r.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`gf-num text-sm font-semibold whitespace-nowrap ${
                          status === "cancelado"
                            ? "text-[var(--gf-texto-ter)] line-through"
                            : "text-[var(--gf-vermelho)]"
                        }`}
                      >
                        {formatarSinal(-r.moedas_debitadas)}{" "}
                        <span className="text-xs font-normal text-[var(--gf-texto-sec)]">moedas</span>
                      </span>
                      <StatusResgateGf status={status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CartaoGf>
      </SecaoGf>
    </PaginaGf>
  );
}
