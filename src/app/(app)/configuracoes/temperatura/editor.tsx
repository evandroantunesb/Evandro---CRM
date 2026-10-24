"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { ROTULO_SINAL_TEMPERATURA, SINAIS_COM_DIAS, type SinalTemperatura } from "@/lib/temperatura";
import { PRAZOS_INSTALACAO_QUALIF, ROTULO_PRAZO_INSTALACAO_QUALIF, type ResultadoAcao } from "@/lib/tipos";
import { salvarRegrasTemperatura } from "./actions";

export type RegraEditavel = {
  id: string;
  sinal: SinalTemperatura;
  ativa: boolean;
  temperatura: "quente" | "frio";
  parametros: { dias?: number; etapas?: string[]; prazos?: string[]; exige_decisor?: boolean };
};

const EXPLICACAO: Record<SinalTemperatura, string> = {
  contrato_gerado: "O negócio já tem contrato, mesmo em rascunho.",
  etapa: "O negócio está numa das etapas escolhidas.",
  etapa_negociacao: "A etapa atual está marcada como negociação em Funis e etapas.",
  proposta_emitida: "Uma proposta foi emitida há no máximo esse número de dias.",
  prazo_instalacao: "O prazo de instalação informado na qualificação é um dos escolhidos.",
  decisor: "Na qualificação, o contato é quem decide.",
  orcamento_outra_empresa: "Na qualificação, o cliente pediu orçamento em outra empresa.",
  busca_financiamento: "Na qualificação, o cliente busca financiamento.",
  somente_pesquisando: "Na qualificação, o prazo de instalação é \"somente pesquisando\".",
  sem_atividade: "Nenhuma mudança de etapa, nota ou tarefa concluída há pelo menos esse número de dias.",
  tarefa_atrasada: "Há tarefa em aberto vencida há pelo menos esse número de dias.",
};

export function EditorRegras({ regras: iniciais, etapas }: { regras: RegraEditavel[]; etapas: { id: string; nome: string }[] }) {
  const [regras, setRegras] = useState(iniciais);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciar] = useTransition();

  function alterar(id: string, mudanca: Partial<RegraEditavel>) {
    setResultado(null);
    setRegras((rs) => rs.map((r) => (r.id === id ? { ...r, ...mudanca } : r)));
  }
  function alterarParametros(r: RegraEditavel, mudanca: RegraEditavel["parametros"]) {
    alterar(r.id, { parametros: { ...r.parametros, ...mudanca } });
  }
  function mover(indice: number, direcao: -1 | 1) {
    setResultado(null);
    setRegras((rs) => {
      const novas = [...rs];
      [novas[indice], novas[indice + direcao]] = [novas[indice + direcao], novas[indice]];
      return novas;
    });
  }
  function alternarItem(lista: string[] | undefined, item: string, marcado: boolean) {
    const atual = lista ?? [];
    return marcado ? [...atual, item] : atual.filter((x) => x !== item);
  }
  function salvar() {
    iniciar(async () => {
      const r = await salvarRegrasTemperatura(
        JSON.stringify(regras.map(({ id, ativa, temperatura, parametros }) => ({ id, ativa, temperatura, parametros }))),
      );
      setResultado(r);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="painel divide-y divide-linha overflow-hidden">
        {regras.map((r, i) => (
          <li key={r.id} className={`flex flex-col gap-3 px-4 py-3 md:px-5 ${r.ativa ? "" : "opacity-70"}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-texto-2 tabular-nums">{i + 1}.</span>
              <label className="flex min-w-0 flex-1 items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={r.ativa}
                  onChange={(e) => alterar(r.id, { ativa: e.target.checked })}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-texto">{ROTULO_SINAL_TEMPERATURA[r.sinal]}</span>
                  <span className="block text-sm text-texto-2">{EXPLICACAO[r.sinal]}</span>
                </span>
              </label>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  aria-label={`Subir "${ROTULO_SINAL_TEMPERATURA[r.sinal]}"`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 hover:text-texto disabled:opacity-30 md:h-9 md:w-9"
                >
                  <ArrowUp size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === regras.length - 1}
                  aria-label={`Descer "${ROTULO_SINAL_TEMPERATURA[r.sinal]}"`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 hover:text-texto disabled:opacity-30 md:h-9 md:w-9"
                >
                  <ArrowDown size={16} aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 pl-8">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-texto-2">Deixa o negócio</span>
                <select
                  value={r.temperatura}
                  onChange={(e) => alterar(r.id, { temperatura: e.target.value as "quente" | "frio" })}
                  className={CLASSE_ENTRADA}
                >
                  <option value="quente">Quente</option>
                  <option value="frio">Frio</option>
                </select>
              </label>
              {SINAIS_COM_DIAS.includes(r.sinal) && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-texto-2">Dias</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    value={r.parametros.dias ?? ""}
                    onChange={(e) => alterarParametros(r, { dias: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className={`${CLASSE_ENTRADA} w-24`}
                  />
                </label>
              )}
            </div>

            {r.sinal === "etapa" && (
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1 pl-8 text-sm text-texto">
                <legend className="mb-1 font-medium text-texto-2">Etapas</legend>
                {etapas.map((e) => (
                  <label key={e.id} className="flex min-h-11 items-center gap-2 md:min-h-8">
                    <input
                      type="checkbox"
                      checked={r.parametros.etapas?.includes(e.id) ?? false}
                      onChange={(ev) => alterarParametros(r, { etapas: alternarItem(r.parametros.etapas, e.id, ev.target.checked) })}
                      className="h-4 w-4"
                    />
                    {e.nome}
                  </label>
                ))}
              </fieldset>
            )}

            {r.sinal === "prazo_instalacao" && (
              <fieldset className="flex flex-col gap-1 pl-8 text-sm text-texto">
                <legend className="mb-1 font-medium text-texto-2">Prazos</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {PRAZOS_INSTALACAO_QUALIF.map((p) => (
                    <label key={p} className="flex min-h-11 items-center gap-2 md:min-h-8">
                      <input
                        type="checkbox"
                        checked={r.parametros.prazos?.includes(p) ?? false}
                        onChange={(ev) => alterarParametros(r, { prazos: alternarItem(r.parametros.prazos, p, ev.target.checked) })}
                        className="h-4 w-4"
                      />
                      {ROTULO_PRAZO_INSTALACAO_QUALIF[p]}
                    </label>
                  ))}
                </div>
                <label className="flex min-h-11 items-center gap-2 md:min-h-8">
                  <input
                    type="checkbox"
                    checked={r.parametros.exige_decisor ?? false}
                    onChange={(ev) => alterarParametros(r, { exige_decisor: ev.target.checked })}
                    className="h-4 w-4"
                  />
                  Só se o contato também for o decisor
                </label>
              </fieldset>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Botao type="button" onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar regras"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </div>
  );
}
