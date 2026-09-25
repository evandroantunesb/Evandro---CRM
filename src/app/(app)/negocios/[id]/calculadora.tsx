"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { salvarCalculo } from "@/lib/acoes/calculadora";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_TIPO_LIGACAO, TIPOS_LIGACAO, type TipoLigacao } from "@/lib/tipos";

export type Kit = { id: string; nome: string; potenciaKwp: number; preco: number; ativo: boolean };
export type CalculoSalvo = {
  id: string;
  kitId: string | null;
  kitNome: string;
  tipoLigacao: TipoLigacao;
  consumoMedioKwh: number;
  tarifaKwh: number;
  geracaoEstimadaKwhMes: number;
  economiaMensal: number;
  paybackMeses: number | null;
  observacoes: string | null;
};

function numeroBr(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function Calculadora({ negocioId, kits, calculo }: { negocioId: string; kits: Kit[]; calculo: CalculoSalvo | null }) {
  const [resultado, acao, pendente] = useActionState(salvarCalculo, null);
  const [editando, setEditando] = useState(!calculo);
  // Fecha o formulário assim que o cálculo é salvo (sem useEffect: ajusta o
  // estado durante a renderização, como recomenda a documentação do React).
  const [ultimoResultado, setUltimoResultado] = useState(resultado);
  if (resultado !== ultimoResultado) {
    setUltimoResultado(resultado);
    if (resultado?.ok) setEditando(false);
  }

  if (kits.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        Nenhum kit cadastrado ainda. Cadastre os kits em{" "}
        <a href="/configuracoes/listas" className="text-amber-700 hover:underline">
          Configurações → Listas
        </a>{" "}
        para poder calcular.
      </p>
    );
  }

  if (calculo && !editando) {
    return (
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Kit</dt>
            <dd className="font-medium text-zinc-900">{calculo.kitNome}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Ligação</dt>
            <dd>{ROTULO_TIPO_LIGACAO[calculo.tipoLigacao]}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Geração estimada</dt>
            <dd>{numeroBr(calculo.geracaoEstimadaKwhMes)} kWh/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Consumo médio</dt>
            <dd>{numeroBr(calculo.consumoMedioKwh)} kWh/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Economia estimada</dt>
            <dd className="font-medium text-green-700">{formatarMoeda(calculo.economiaMensal)}/mês</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Payback estimado</dt>
            <dd>{calculo.paybackMeses != null ? `${numeroBr(calculo.paybackMeses)} meses` : "—"}</dd>
          </div>
        </dl>
        {calculo.observacoes && <p className="text-sm text-zinc-600">{calculo.observacoes}</p>}
        <p className="text-xs text-zinc-400">
          Estimativa do modo comercial (sem simulação de engenharia) — confirme com o time técnico antes de fechar.
        </p>
        <Botao type="button" variante="secundario" onClick={() => setEditando(true)} className="self-start">
          Recalcular
        </Botao>
      </div>
    );
  }

  const kitsVisiveis = kits.filter((k) => k.ativo || k.id === calculo?.kitId);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="negocioId" value={negocioId} />
      <Selecao rotulo="Kit" name="kitId" required defaultValue={calculo?.kitId ?? ""}>
        <option value="" disabled>
          Escolha o kit
        </option>
        {kitsVisiveis.map((k) => (
          <option key={k.id} value={k.id}>
            {k.nome} · {numeroBr(k.potenciaKwp)} kWp · {formatarMoeda(k.preco)}
          </option>
        ))}
      </Selecao>
      <Selecao rotulo="Tipo de ligação" name="tipoLigacao" required defaultValue={calculo?.tipoLigacao ?? "trifasico"}>
        {TIPOS_LIGACAO.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_LIGACAO[t]}
          </option>
        ))}
      </Selecao>
      <Campo
        rotulo="Consumo médio (kWh/mês)"
        name="consumoMedioKwh"
        inputMode="decimal"
        placeholder="ex.: 450"
        defaultValue={calculo ? numeroBr(calculo.consumoMedioKwh) : ""}
      />
      <p className="-mt-2 text-xs text-zinc-400">Sem o consumo em kWh? Preencha o valor médio da fatura abaixo em vez disso.</p>
      <Campo rotulo="Valor médio da fatura (R$, opcional)" name="valorFaturaMedio" inputMode="decimal" placeholder="ex.: 450,00" />
      <Campo
        rotulo="Tarifa (R$/kWh)"
        name="tarifaKwh"
        inputMode="decimal"
        required
        placeholder="ex.: 0,95"
        defaultValue={calculo ? numeroBr(calculo.tarifaKwh) : ""}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">Observações (opcional)</span>
        <textarea
          name="observacoes"
          rows={2}
          defaultValue={calculo?.observacoes ?? ""}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
        />
      </label>
      <div className="flex items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Calculando..." : "Calcular"}
        </Botao>
        {calculo && (
          <Botao type="button" variante="secundario" onClick={() => setEditando(false)}>
            Cancelar
          </Botao>
        )}
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}
