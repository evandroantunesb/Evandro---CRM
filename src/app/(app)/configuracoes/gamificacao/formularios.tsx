"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import {
  OPERADORES_CONDICAO,
  PERIODOS_LIMITE_REGRA,
  ROTULO_OPERADOR_CONDICAO,
  ROTULO_PERIODO_LIMITE_REGRA,
  type OperadorCondicao,
  type PeriodoLimiteRegra,
} from "@/lib/tipos";
import { apagarRegra, criarRegra, editarRegra } from "./actions";

type EventoOpcao = { tipo: string; rotulo: string; campos: readonly string[] };

export type RegraSalva = {
  id: string;
  nome: string;
  eventoTipo: string;
  condicao: { campo: string; operador: OperadorCondicao; valor: string } | null;
  pontos: number;
  limitePeriodo: PeriodoLimiteRegra | null;
  limiteQuantidade: number | null;
  ativa: boolean;
};

export function NovaRegra({ eventos }: { eventos: readonly EventoOpcao[] }) {
  const [resultado, acao, pendente] = useActionState(criarRegra, null);
  const [eventoTipo, setEventoTipo] = useState(eventos[0]?.tipo ?? "");
  const campos = eventos.find((e) => e.tipo === eventoTipo)?.campos ?? [];

  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome da regra" name="nome" placeholder="Ex.: Negócio ganho acima de R$ 5 mil" required />
        <Selecao rotulo="Evento" name="eventoTipo" value={eventoTipo} onChange={(e) => setEventoTipo(e.target.value)}>
          {eventos.map((ev) => (
            <option key={ev.tipo} value={ev.tipo}>
              {ev.rotulo}
            </option>
          ))}
        </Selecao>
      </div>
      <Campo rotulo="Pontos" name="pontos" type="number" step={1} defaultValue={10} required />
      <CondicaoTeto campos={campos} />
      <div className="flex items-center gap-2">
        <Botao type="submit" disabled={pendente} className="self-start">
          Criar regra
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function LinhaRegra({ regra, eventos }: { regra: RegraSalva; eventos: readonly EventoOpcao[] }) {
  const [resultado, acao, pendente] = useActionState(editarRegra, null);
  const [eventoTipo, setEventoTipo] = useState(regra.eventoTipo);
  const campos = eventos.find((e) => e.tipo === eventoTipo)?.campos ?? [];

  return (
    <form action={acao} className="flex flex-col gap-3 border-t border-zinc-100 py-3 first:border-t-0">
      <input type="hidden" name="id" value={regra.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" name="nome" defaultValue={regra.nome} required />
        <Selecao rotulo="Evento" name="eventoTipo" value={eventoTipo} onChange={(e) => setEventoTipo(e.target.value)}>
          {eventos.map((ev) => (
            <option key={ev.tipo} value={ev.tipo}>
              {ev.rotulo}
            </option>
          ))}
        </Selecao>
      </div>
      <Campo rotulo="Pontos" name="pontos" type="number" step={1} defaultValue={regra.pontos} required />
      <CondicaoTeto campos={campos} condicaoInicial={regra.condicao} limitePeriodoInicial={regra.limitePeriodo} limiteQuantidadeInicial={regra.limiteQuantidade} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-sm text-zinc-700">
          <input type="checkbox" name="ativa" defaultChecked={regra.ativa} /> Ativa
        </label>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button type="submit" formAction={apagarRegra} className="text-xs text-zinc-400 hover:text-red-700">
          Apagar
        </button>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

function CondicaoTeto({
  campos,
  condicaoInicial,
  limitePeriodoInicial,
  limiteQuantidadeInicial,
}: {
  campos: readonly string[];
  condicaoInicial?: { campo: string; operador: OperadorCondicao; valor: string } | null;
  limitePeriodoInicial?: PeriodoLimiteRegra | null;
  limiteQuantidadeInicial?: number | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <fieldset className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
        <legend className="px-1 text-xs font-medium text-zinc-500">Condição (opcional)</legend>
        <Selecao rotulo="Campo" name="condicaoCampo" defaultValue={condicaoInicial?.campo ?? ""}>
          <option value="">Sem condição</option>
          {campos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Operador" name="condicaoOperador" defaultValue={condicaoInicial?.operador ?? ""}>
          <option value=""></option>
          {OPERADORES_CONDICAO.map((op) => (
            <option key={op} value={op}>
              {ROTULO_OPERADOR_CONDICAO[op]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Valor" name="condicaoValor" placeholder="Ex.: 5000" defaultValue={condicaoInicial?.valor ?? ""} />
      </fieldset>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
        <legend className="px-1 text-xs font-medium text-zinc-500">Teto (opcional)</legend>
        <Selecao rotulo="Período" name="limitePeriodo" defaultValue={limitePeriodoInicial ?? ""}>
          <option value="">Sem teto</option>
          {PERIODOS_LIMITE_REGRA.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PERIODO_LIMITE_REGRA[p]}
            </option>
          ))}
        </Selecao>
        <Campo
          rotulo="Quantidade máxima"
          name="limiteQuantidade"
          type="number"
          min={1}
          step={1}
          defaultValue={limiteQuantidadeInicial ?? undefined}
        />
      </fieldset>
    </div>
  );
}
