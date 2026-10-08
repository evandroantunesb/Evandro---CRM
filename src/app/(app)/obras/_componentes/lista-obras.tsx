"use client";

import { useMemo, useState } from "react";
import { Cartao, Selecao } from "@/components/ui";
import {
  ROTULO_ESTADO_SETOR,
  filtrar,
  type EstadoSetor,
  type FiltroEstadoObra,
} from "@/lib/obras/derivados";
import type { ObraResumoVM } from "@/lib/obras/dados";
import { ROTULO_SETOR, SETORES_OPERACIONAIS, type SetorOperacional } from "@/lib/obras/rotulos";
import { EstadosObra } from "./estados-obra";
import { SetorCelula } from "./setor-celula";

const lugar = (o: ObraResumoVM) => [o.cidade, o.uf].filter(Boolean).join(" / ") || "—";
const potencia = (o: ObraResumoVM) =>
  o.potenciaKwp == null
    ? "—"
    : `${o.potenciaKwp.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kWp`;

export function ListaObras({
  obras,
  urlsAvatar,
}: {
  obras: ObraResumoVM[];
  urlsAvatar: Record<string, string>;
}) {
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState<SetorOperacional | "todos">("todos");
  const [estadoSetor, setEstadoSetor] = useState<EstadoSetor | "todos">("todos");
  const [estadoObra, setEstadoObra] = useState<FiltroEstadoObra>("todas");

  const visiveis = useMemo(
    () => filtrar(obras, { busca, setor, estadoSetor, estadoObra }),
    [obras, busca, setor, estadoSetor, estadoObra],
  );

  return (
    <Cartao titulo="Lista de obras">
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar obra"
          placeholder="Buscar por cliente, número ou cidade"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20"
        />
        <Selecao
          aria-label="Setor"
          value={setor}
          onChange={(e) => setSetor(e.target.value as SetorOperacional | "todos")}
        >
          <option value="todos">Todos os setores</option>
          {SETORES_OPERACIONAIS.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SETOR[s]}
            </option>
          ))}
        </Selecao>
        <Selecao
          aria-label="Estado do setor"
          value={estadoSetor}
          onChange={(e) => setEstadoSetor(e.target.value as EstadoSetor | "todos")}
        >
          <option value="todos">Qualquer estado do setor</option>
          {(
            [
              "parado",
              "aguardando",
              "em_andamento",
              "nao_iniciado",
              "concluido",
              "indisponivel",
            ] as const
          ).map((e) => (
            <option key={e} value={e}>
              {ROTULO_ESTADO_SETOR[e]}
            </option>
          ))}
        </Selecao>
        <Selecao
          aria-label="Estado da obra"
          value={estadoObra}
          onChange={(e) => setEstadoObra(e.target.value as FiltroEstadoObra)}
        >
          <option value="todas">Todas as obras</option>
          <option value="pausada">Pausadas</option>
          <option value="cancelada">Canceladas</option>
          <option value="alerta">Com alerta</option>
        </Selecao>
      </div>

      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          {obras.length === 0
            ? "Nenhuma obra disponível para você ainda."
            : "Nenhuma obra encontrada com esses filtros."}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-medium text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Nº</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Cidade / UF</th>
                  <th className="py-2 pr-4">Potência</th>
                  {SETORES_OPERACIONAIS.map((s) => (
                    <th key={s} className="py-2 pr-4">
                      {ROTULO_SETOR[s]}
                    </th>
                  ))}
                  <th className="py-2">Estados</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-zinc-100 align-top hover:bg-offwhite/60"
                  >
                    <td className="py-3 pr-4 text-zinc-700 [font-variant-numeric:tabular-nums]">
                      {o.numero}
                    </td>
                    <td className="py-3 pr-4 font-medium text-zinc-900">{o.clienteNome}</td>
                    <td className="py-3 pr-4 text-zinc-700">{lugar(o)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-zinc-700">{potencia(o)}</td>
                    {SETORES_OPERACIONAIS.map((s) => (
                      <td key={s} className="py-3 pr-4">
                        <SetorCelula setor={s} dados={o.setores[s]} urlsAvatar={urlsAvatar} />
                      </td>
                    ))}
                    <td className="py-3">
                      <EstadosObra obra={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {visiveis.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 [font-variant-numeric:tabular-nums]">
                      Obra nº {o.numero}
                    </p>
                    <p className="font-medium text-zinc-900">{o.clienteNome}</p>
                    <p className="text-sm text-zinc-600">
                      {lugar(o)} · {potencia(o)}
                    </p>
                  </div>
                </div>
                <EstadosObra obra={o} />
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {SETORES_OPERACIONAIS.map((s) => (
                    <div key={s} className="flex flex-col gap-1 border-t border-zinc-100 pt-2">
                      <dt className="text-xs font-medium text-zinc-500">{ROTULO_SETOR[s]}</dt>
                      <dd>
                        <SetorCelula setor={s} dados={o.setores[s]} urlsAvatar={urlsAvatar} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </Cartao>
  );
}
