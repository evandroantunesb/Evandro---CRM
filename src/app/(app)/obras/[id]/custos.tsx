"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { ajustarOrcamentoObra, estornarCustoObra, lancarCustoObra } from "@/lib/acoes/obras";
import { formatarMoeda, formatarNumeroBr } from "@/lib/formatacao";
import { CATEGORIAS_CUSTO_OBRA, ROTULO_CATEGORIA_CUSTO, type CategoriaCustoObra, type CustosObraVM } from "@/lib/obras/custos";

/**
 * Custos da obra na ficha: planejado × realizado por categoria (o planejado nasce do negócio e admin ou gestor
 * ajustam), os lançamentos e o estorno. Quem pode o quê o servidor decide; aqui só aparecem os controles liberados.
 */

const CAMPO =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20";

export type LancamentoVM = {
  id: string;
  categoria: CategoriaCustoObra;
  valor: number;
  data: string;
  descricao: string;
  estornaId: string | null;
  estornado: boolean;
};

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function CustosObraFicha({
  obraId,
  custos,
  lancamentos,
  podeAjustar,
  podeLancar,
  hoje,
}: {
  obraId: string;
  custos: CustosObraVM;
  lancamentos: LancamentoVM[];
  podeAjustar: boolean;
  podeLancar: boolean;
  hoje: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-zinc-100">
        {custos.categorias.map((c) => (
          <li key={c.categoria} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-texto">
                {c.nome}
                {!c.encerrada && <span className="ml-1 text-xs font-normal text-texto-2">em andamento</span>}
              </p>
              <p className="text-xs text-texto-2 tabular-nums">
                Planejado {formatarMoeda(c.planejado)} · Realizado <span className={c.acima ? "font-semibold text-erro" : ""}>{formatarMoeda(c.realizado)}</span>
              </p>
            </div>
            {podeAjustar && <AjusteOrcamento key={`${c.categoria}-${c.planejado}`} obraId={obraId} categoria={c.categoria} planejado={c.planejado} />}
          </li>
        ))}
      </ul>
      <p className="text-xs text-texto-2 tabular-nums">
        Total: planejado {formatarMoeda(custos.planejado)} · realizado {formatarMoeda(custos.realizado)} · projetado {formatarMoeda(custos.projetado)}
      </p>
      {podeAjustar && (
        <Link href="/configuracoes/deducoes-obras" className="w-fit text-xs text-zinc-600 underline hover:text-zinc-900">
          Impostos e comissões descontados do lucro
        </Link>
      )}

      {podeLancar && <NovoLancamento obraId={obraId} hoje={hoje} />}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Lançamentos</p>
        {lancamentos.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhum custo lançado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100">
            {lancamentos.map((l) => (
              <Lancamento key={l.id} obraId={obraId} lancamento={l} podeEstornar={podeLancar && !l.estornaId && !l.estornado} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AjusteOrcamento({ obraId, categoria, planejado }: { obraId: string; categoria: CategoriaCustoObra; planejado: number }) {
  const [resultado, acao, pendente] = useActionState(ajustarOrcamentoObra, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <form onSubmit={enviar} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="categoria" value={categoria} />
      <input
        name="planejado"
        inputMode="decimal"
        defaultValue={formatarNumeroBr(planejado)}
        aria-label={`Planejado de ${ROTULO_CATEGORIA_CUSTO[categoria]} (R$)`}
        className={`${CAMPO} w-32`}
      />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "Salvando..." : "Ajustar"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

function NovoLancamento({ obraId, hoje }: { obraId: string; hoje: string }) {
  const [resultado, acao, pendente] = useActionState(lancarCustoObra, null);
  return (
    <details className="group rounded-lg border border-zinc-200 bg-zinc-50/60 text-sm">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-zinc-800 select-none group-open:border-b group-open:border-zinc-200">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> Lançar custo
      </summary>
      <form action={acao} className="grid gap-2 p-3 sm:grid-cols-2">
        <input type="hidden" name="obraId" value={obraId} />
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Categoria
          <Selecao name="categoria" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {CATEGORIAS_CUSTO_OBRA.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA_CUSTO[c]}
              </option>
            ))}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Valor (R$)
          <input name="valor" inputMode="decimal" required placeholder="Ex.: 1.250,00" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Data
          <input name="data" type="date" required max={hoje} defaultValue={hoje} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Descrição
          <input name="descricao" required minLength={3} maxLength={300} placeholder="Ex.: diária da equipe de instalação" className={CAMPO} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Botao type="submit" disabled={pendente}>
            {pendente ? "Lançando..." : "Lançar custo"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </details>
  );
}

function Lancamento({ obraId, lancamento: l, podeEstornar }: { obraId: string; lancamento: LancamentoVM; podeEstornar: boolean }) {
  const [resultado, acao, pendente] = useActionState(estornarCustoObra, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <li className="flex flex-col gap-1 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 text-texto">
          {dataBr(l.data)} · {ROTULO_CATEGORIA_CUSTO[l.categoria]} · <span className="break-words">{l.descricao}</span>
          {l.estornaId && <span className="ml-1 text-xs text-texto-2">(estorno)</span>}
          {l.estornado && <span className="ml-1 text-xs text-texto-2">(estornado)</span>}
        </span>
        <span className={`tabular-nums ${l.valor < 0 ? "text-texto-2" : "font-medium text-texto"}`}>{formatarMoeda(l.valor)}</span>
      </div>
      {podeEstornar && (
        <details className="group">
          <summary className="w-fit cursor-pointer list-none text-xs text-zinc-600 underline select-none hover:text-zinc-900">Estornar</summary>
          <form onSubmit={enviar} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="hidden" name="obraId" value={obraId} />
            <input type="hidden" name="custoId" value={l.id} />
            <input name="motivo" required minLength={3} maxLength={300} aria-label="Motivo do estorno" placeholder="Motivo do estorno" className={`${CAMPO} sm:flex-1`} />
            <Botao type="submit" variante="secundario" disabled={pendente}>
              {pendente ? "Estornando..." : "Confirmar estorno"}
            </Botao>
          </form>
          <Mensagem resultado={resultado} />
        </details>
      )}
    </li>
  );
}
