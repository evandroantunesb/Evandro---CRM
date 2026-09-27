"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import type { FaixaComissao } from "@/lib/comissoes";
import type { MembroResumo } from "@/lib/crm";
import { ROTULO_TIPO_CALCULO_COMISSAO, TIPOS_CALCULO_COMISSAO, type TipoCalculoComissao } from "@/lib/tipos";
import { apagarPlano, calcularComissao, salvarPlano } from "./actions";

export type PlanoSalvo = {
  planoId: string | null;
  salarioBase: number | null;
  metaOte: number | null;
  tipoCalculo: TipoCalculoComissao;
  faixas: FaixaComissao[];
};

type LinhaFaixa = { min: string; max: string; valor: string };

function paraLinhas(faixas: FaixaComissao[]): LinhaFaixa[] {
  if (!faixas.length) return [{ min: "", max: "", valor: "" }];
  return faixas.map((f) => ({
    min: String(f.resultado_minimo),
    max: f.resultado_maximo === null ? "" : String(f.resultado_maximo),
    valor: String(f.valor),
  }));
}

function FaixasEditor({ faixasIniciais }: { faixasIniciais: FaixaComissao[] }) {
  const [linhas, setLinhas] = useState<LinhaFaixa[]>(() => paraLinhas(faixasIniciais));

  const json = JSON.stringify(
    linhas
      .filter((l) => l.min.trim() !== "" && l.valor.trim() !== "")
      .map((l) => ({
        resultado_minimo: Number(l.min),
        resultado_maximo: l.max.trim() === "" ? null : Number(l.max),
        valor: Number(l.valor),
      })),
  );

  function atualizar(i: number, campo: keyof LinhaFaixa, valor: string) {
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
      <legend className="px-1 text-xs font-medium text-zinc-500">Faixas de resultado</legend>
      {linhas.map((linha, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <Campo
            rotulo="De (R$)"
            type="number"
            min={0}
            step="0.01"
            value={linha.min}
            onChange={(e) => atualizar(i, "min", e.target.value)}
          />
          <Campo
            rotulo="Até (vazio = sem teto)"
            type="number"
            min={0}
            step="0.01"
            value={linha.max}
            onChange={(e) => atualizar(i, "max", e.target.value)}
          />
          <Campo
            rotulo="Valor"
            type="number"
            min={0}
            step="0.01"
            value={linha.valor}
            onChange={(e) => atualizar(i, "valor", e.target.value)}
          />
          <button
            type="button"
            onClick={() => setLinhas((atual) => (atual.length > 1 ? atual.filter((_, idx) => idx !== i) : atual))}
            className="mb-1.5 text-xs text-zinc-400 hover:text-red-700"
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setLinhas((atual) => [...atual, { min: "", max: "", valor: "" }])}
        className="self-start text-xs font-medium text-carvao hover:text-dourado"
      >
        + Adicionar faixa
      </button>
      <input type="hidden" name="faixasJson" value={json} />
    </fieldset>
  );
}

export function PlanoComissaoForm({ membro, plano }: { membro: MembroResumo; plano: PlanoSalvo }) {
  const [resultado, acao, pendente] = useActionState(salvarPlano, null);
  const [tipoCalculo, setTipoCalculo] = useState<TipoCalculoComissao>(plano.tipoCalculo);

  return (
    <form action={acao} className="flex flex-col gap-3 border-t border-zinc-100 py-4 first:border-t-0">
      <input type="hidden" name="membroId" value={membro.id} />
      {plano.planoId && <input type="hidden" name="id" value={plano.planoId} />}
      <p className="text-sm font-medium text-zinc-900">{membro.nome}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo
          rotulo="Salário-base (R$, opcional)"
          name="salarioBase"
          type="number"
          min={0}
          step="0.01"
          defaultValue={plano.salarioBase ?? undefined}
        />
        <Campo
          rotulo="Meta (OTE, R$, opcional)"
          name="metaOte"
          type="number"
          min={0}
          step="0.01"
          defaultValue={plano.metaOte ?? undefined}
        />
        <Selecao
          rotulo="Tipo de cálculo"
          name="tipoCalculo"
          value={tipoCalculo}
          onChange={(e) => setTipoCalculo(e.target.value as TipoCalculoComissao)}
        >
          {TIPOS_CALCULO_COMISSAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_CALCULO_COMISSAO[t]}
            </option>
          ))}
        </Selecao>
      </div>
      <FaixasEditor faixasIniciais={plano.faixas} />
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar plano
        </Botao>
        {plano.planoId && (
          <button type="submit" formAction={apagarPlano} className="text-xs text-zinc-400 hover:text-red-700">
            Apagar plano
          </button>
        )}
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function CalcularComissaoForm({ membros }: { membros: MembroResumo[] }) {
  const [resultado, acao, pendente] = useActionState(calcularComissao, null);

  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <Selecao rotulo="Colaborador" name="membroId" defaultValue="">
        <option value="" disabled>
          Escolha
        </option>
        {membros.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </Selecao>
      <Campo rotulo="Mês" name="mes" type="month" required />
      <Botao type="submit" disabled={pendente}>
        Calcular
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
