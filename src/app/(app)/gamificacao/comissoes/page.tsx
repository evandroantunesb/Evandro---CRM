import { Banknote, Wallet } from "lucide-react";
import type { FaixaComissao } from "@/lib/comissoes";
import { formatarFaixa } from "@/lib/comissoes";
import { formatarMoeda } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ROTULO_TIPO_CALCULO_COMISSAO, type StatusComissao, type TipoCalculoComissao } from "@/lib/tipos";
import { AbasSecao } from "../_compartilhado/abas-secao";
import { formatarReferenciaComissao, StatusComissaoGf } from "../_compartilhado/comissao-ui";
import { CabecalhoPaginaGf, CartaoGf, EstadoVazioGf, PaginaGf } from "../_compartilhado/ui";

/** Valor monetário com rótulo — célula do histórico e do resumo. */
function Valor({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="gf-t-micro @min-[680px]:sr-only">{rotulo}</p>
      <p
        className={`gf-num break-words ${forte ? "text-base font-bold text-[var(--gf-texto)]" : "text-sm font-medium text-[var(--gf-texto)]"}`}
      >
        {valor}
      </p>
    </div>
  );
}

export default async function MinhasComissoes() {
  const { atual } = await exigirPapel();
  const supabase = await criarClienteServidor();
  const hoje = new Date().toISOString().slice(0, 10);
  const [{ data: plano }, { data: historico }] = await Promise.all([
    supabase
      .from("planos_comissao")
      .select("salario_base, meta_ote, tipo_calculo, faixas")
      .eq("empresa_id", atual.empresaId)
      .eq("membro_id", atual.membroId)
      .lte("vigencia_inicio", hoje)
      .order("vigencia_inicio", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("comissoes_calculadas")
      .select("id, referencia, resultado_apurado, salario_base, valor_comissao, valor_total, status")
      .eq("empresa_id", atual.empresaId)
      .eq("membro_id", atual.membroId)
      .order("referencia", { ascending: false })
      .limit(24),
  ]);

  const ultimo = historico?.[0] ?? null;
  const semNada = !plano && !historico?.length;

  return (
    <PaginaGf largura="media">
      <AbasSecao secao="desempenho" papel={atual.papel} />
      <CabecalhoPaginaGf titulo="Comissões" descricao="Seu plano, o resultado apurado e o histórico de cálculos." />

      {semNada ? (
        <CartaoGf>
          <EstadoVazioGf Icone={Wallet} titulo="Nenhum plano de comissão por aqui ainda">
            Quando seu plano for configurado e o primeiro cálculo for feito, o resultado, a comissão e o histórico
            aparecem nesta tela. Em caso de dúvida, fale com a administração.
          </EstadoVazioGf>
        </CartaoGf>
      ) : (
        <>
          {ultimo && (
            <CartaoGf
              destaque
              titulo={`Último cálculo · ${formatarReferenciaComissao(ultimo.referencia)}`}
              Icone={Banknote}
              acao={<StatusComissaoGf status={ultimo.status as StatusComissao} />}
            >
              <dl className="grid grid-cols-1 gap-4 @min-[560px]:grid-cols-3">
                <div className="rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-4">
                  <dt className="gf-t-aux">Resultado apurado</dt>
                  <dd className="gf-t-kpi mt-1 break-words">{formatarMoeda(ultimo.resultado_apurado)}</dd>
                </div>
                <div className="rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface)] p-4">
                  <dt className="gf-t-aux">Comissão</dt>
                  <dd className="gf-t-kpi mt-1 break-words text-[var(--gf-verde)]">
                    {formatarMoeda(ultimo.valor_comissao)}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--gf-verde-borda)] bg-[var(--gf-verde-10)] p-4">
                  <dt className="gf-t-aux">Total</dt>
                  <dd className="gf-t-kpi mt-1 break-words">{formatarMoeda(ultimo.valor_total)}</dd>
                </div>
              </dl>
            </CartaoGf>
          )}

          {plano ? (
            <CartaoGf titulo="Seu plano" descricao="Vigente hoje">
              <div className="grid gap-6 @min-[680px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <dl className="flex flex-col gap-3">
                  {plano.salario_base !== null && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="gf-t-aux">Salário-base</dt>
                      <dd className="gf-num text-sm font-semibold">{formatarMoeda(plano.salario_base)}</dd>
                    </div>
                  )}
                  {plano.meta_ote !== null && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="gf-t-aux">Meta (OTE)</dt>
                      <dd className="gf-num text-sm font-semibold">{formatarMoeda(plano.meta_ote)}</dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="gf-t-aux">Tipo de cálculo</dt>
                    <dd className="text-sm font-semibold">
                      {ROTULO_TIPO_CALCULO_COMISSAO[plano.tipo_calculo as TipoCalculoComissao]}
                    </dd>
                  </div>
                </dl>
                <div>
                  <p className="gf-t-rotulo mb-2">Faixas de resultado</p>
                  <ol className="flex flex-col gap-1.5">
                    {(plano.faixas as unknown as FaixaComissao[]).map((f, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-[var(--gf-borda)] bg-[var(--gf-surface-alta)] px-3 py-2 text-sm"
                      >
                        <span className="gf-t-micro shrink-0">Faixa {i + 1}</span>
                        <span className="gf-num min-w-0 font-medium">
                          {formatarFaixa(plano.tipo_calculo as TipoCalculoComissao, f)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </CartaoGf>
          ) : (
            <CartaoGf titulo="Seu plano">
              <EstadoVazioGf compacto Icone={Wallet}>
                Você ainda não tem um plano de comissão vigente configurado.
              </EstadoVazioGf>
            </CartaoGf>
          )}

          <CartaoGf titulo="Histórico de cálculo" descricao={historico?.length ? "Últimos 24 meses" : undefined}>
            {!historico?.length ? (
              <EstadoVazioGf compacto Icone={Banknote}>
                Nenhum cálculo feito ainda.
              </EstadoVazioGf>
            ) : (
              <div>
                <div
                  aria-hidden
                  className="gf-t-rotulo hidden grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_6.5rem] gap-4 border-b border-[var(--gf-borda)] pb-2 @min-[680px]:grid"
                >
                  <span>Período</span>
                  <span>Resultado</span>
                  <span>Comissão</span>
                  <span>Total</span>
                  <span>Status</span>
                </div>
                <ul>
                  {historico.map((h) => (
                    <li
                      key={h.id}
                      className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-[var(--gf-borda)] py-3 first:border-t-0 @min-[680px]:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_6.5rem] @min-[680px]:items-center"
                    >
                      <div className="col-span-3 flex items-center justify-between gap-2 @min-[680px]:col-span-1">
                        <p className="gf-t-item">{formatarReferenciaComissao(h.referencia)}</p>
                        <span className="@min-[680px]:hidden">
                          <StatusComissaoGf status={h.status as StatusComissao} />
                        </span>
                      </div>
                      <Valor rotulo="Resultado" valor={formatarMoeda(h.resultado_apurado)} />
                      <Valor rotulo="Comissão" valor={formatarMoeda(h.valor_comissao)} />
                      <Valor rotulo="Total" valor={formatarMoeda(h.valor_total)} forte />
                      <div className="hidden @min-[680px]:block">
                        <StatusComissaoGf status={h.status as StatusComissao} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CartaoGf>
        </>
      )}
    </PaginaGf>
  );
}
