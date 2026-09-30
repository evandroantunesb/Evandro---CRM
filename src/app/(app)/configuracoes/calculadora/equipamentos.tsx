"use client";

import { useActionState, useState, useTransition } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { apagarEquipamento, ativarEquipamento, editarEquipamento } from "@/lib/acoes/equipamentos";
import { buscarComponentesCatalogo } from "@/lib/acoes/opensolar";
import type { ComponenteCatalogo } from "@/lib/opensolar";

export type EquipamentoAtivoLinha = {
  id: string;
  tipo: "modulo" | "inversor";
  fabricante: string;
  modelo: string;
  potenciaW: number;
  ativo: boolean;
  prioridade: number;
  // Módulo.
  vocV: number | null;
  iscA: number | null;
  vmpV: number | null;
  impA: number | null;
  coefTempVocPctC: number | null;
  // Inversor.
  tensaoMaxDcV: number | null;
  mpptMinV: number | null;
  mpptMaxV: number | null;
  correnteMaxEntradaA: number | null;
  quantidadeMppt: number | null;
};

/**
 * Empresa escolhe, entre os módulos/inversores do catálogo técnico (OpenSolar),
 * quais ficam disponíveis pro dimensionamento automático do kit — ver
 * `src/lib/dimensionamento.ts`. Sem nenhum ativo, o wizard não consegue montar
 * kit sozinho e o vendedor cai de volta no kit personalizado manual.
 */
export function Equipamentos({ itens }: { itens: EquipamentoAtivoLinha[] }) {
  const [tipo, setTipo] = useState<"modulo" | "inversor">("modulo");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ComponenteCatalogo[]>([]);
  const [buscando, iniciarBusca] = useTransition();
  const [resultadoAtivar, acaoAtivar] = useActionState(ativarEquipamento, null);

  function pesquisar(v: string) {
    setTermo(v);
    if (v.trim().length < 2) return setResultados([]);
    iniciarBusca(async () => setResultados(await buscarComponentesCatalogo(tipo, v)));
  }

  const modulos = itens.filter((i) => i.tipo === "modulo");
  const inversores = itens.filter((i) => i.tipo === "inversor");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        Só os equipamentos ativados aqui entram na recomendação automática de kit em &quot;Adicionar
        negócio&quot;. Prioridade maior aparece primeiro entre as opções tecnicamente válidas.
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Selecao
            rotulo="Tipo"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as "modulo" | "inversor");
              setResultados([]);
            }}
          >
            <option value="modulo">Módulo</option>
            <option value="inversor">Inversor</option>
          </Selecao>
          <div className="relative min-w-64 flex-1">
            <Campo
              rotulo="Buscar no catálogo (OpenSolar)"
              value={termo}
              onChange={(e) => pesquisar(e.target.value)}
              placeholder="Fabricante ou modelo"
            />
            {resultados.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white text-sm shadow-md">
                {resultados.map((r) => (
                  <li key={r.id}>
                    <form action={acaoAtivar}>
                      <input type="hidden" name="tipo" value={tipo} />
                      <input type="hidden" name="opensolarId" value={r.id} />
                      <input type="hidden" name="fabricante" value={r.fabricante} />
                      <input type="hidden" name="modelo" value={r.modelo} />
                      <input type="hidden" name="potenciaW" value={r.potenciaW ?? ""} />
                      <button
                        type="submit"
                        disabled={!r.potenciaW}
                        className="block w-full px-3 py-2 text-left hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          !r.potenciaW
                            ? "Sem potência na ficha técnica — não é possível ativar"
                            : "Ativar"
                        }
                      >
                        {r.descricao}
                        {r.potenciaW != null && (
                          <span className="text-zinc-400"> · {r.potenciaW} W</span>
                        )}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {buscando && <p className="text-xs text-zinc-400">Buscando...</p>}
        <Mensagem resultado={resultadoAtivar} />
      </div>

      <ListaEquipamentos titulo="Módulos ativos" itens={modulos} />
      <ListaEquipamentos titulo="Inversores ativos" itens={inversores} />
    </div>
  );
}

function ListaEquipamentos({ titulo, itens }: { titulo: string; itens: EquipamentoAtivoLinha[] }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-zinc-700">
        {titulo} ({itens.filter((i) => i.ativo).length})
      </p>
      {itens.length === 0 && (
        <p className="text-xs text-zinc-400">Nenhum equipamento ativado ainda.</p>
      )}
      {itens.map((item) => (
        <LinhaEquipamento key={item.id} item={item} />
      ))}
    </div>
  );
}

function LinhaEquipamento({ item }: { item: EquipamentoAtivoLinha }) {
  const [resultado, acao, pendente] = useActionState(editarEquipamento, null);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const temDadosEletricos =
    item.tipo === "modulo"
      ? item.vocV != null && item.vmpV != null && item.coefTempVocPctC != null
      : item.tensaoMaxDcV != null && item.mpptMinV != null && item.mpptMaxV != null;

  return (
    <form
      action={acao}
      className="flex flex-col gap-2 border-t border-zinc-100 py-2 first:border-t-0"
    >
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="tipo" value={item.tipo} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
          {item.fabricante} {item.modelo}{" "}
          <span className="text-zinc-400">· {item.potenciaW} W</span>
        </span>
        {!temDadosEletricos && (
          <span
            className="text-xs text-amber-600"
            title="Sem string/MPPT validado — kit automático não confere tensão"
          >
            dados elétricos não verificados
          </span>
        )}
        <div className="w-24">
          <Campo
            rotulo="Prioridade"
            name="prioridade"
            inputMode="numeric"
            defaultValue={String(item.prioridade)}
          />
        </div>
        <label className="flex items-center gap-1 text-sm text-zinc-700">
          <input type="checkbox" name="ativo" defaultChecked={item.ativo} /> Ativo
        </label>
        <button
          type="button"
          onClick={() => setDetalhesAbertos((v) => !v)}
          className="text-xs text-zinc-500 hover:underline"
        >
          {detalhesAbertos ? "Ocultar detalhes técnicos" : "Detalhes técnicos"}
        </button>
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar
        </Botao>
        <button
          type="button"
          onClick={() => {
            const fd = new FormData();
            fd.set("id", item.id);
            apagarEquipamento(fd);
          }}
          className="text-xs text-red-600 hover:underline"
        >
          Remover
        </button>
      </div>
      {detalhesAbertos && (
        <div className="grid grid-cols-2 gap-2 rounded-md bg-zinc-50 p-2 sm:grid-cols-3">
          {item.tipo === "modulo" ? (
            <>
              <Campo
                rotulo="Voc (V)"
                name="vocV"
                inputMode="decimal"
                defaultValue={item.vocV ?? ""}
                placeholder="41,5"
              />
              <Campo
                rotulo="Isc (A)"
                name="iscA"
                inputMode="decimal"
                defaultValue={item.iscA ?? ""}
                placeholder="18,5"
              />
              <Campo
                rotulo="Vmp (V)"
                name="vmpV"
                inputMode="decimal"
                defaultValue={item.vmpV ?? ""}
                placeholder="34,8"
              />
              <Campo
                rotulo="Imp (A)"
                name="impA"
                inputMode="decimal"
                defaultValue={item.impA ?? ""}
                placeholder="17,8"
              />
              <Campo
                rotulo="Coef. temp. Voc (%/°C)"
                name="coefTempVocPctC"
                inputMode="decimal"
                defaultValue={item.coefTempVocPctC ?? ""}
                placeholder="-0,26"
              />
            </>
          ) : (
            <>
              <Campo
                rotulo="Tensão máx. DC (V)"
                name="tensaoMaxDcV"
                inputMode="decimal"
                defaultValue={item.tensaoMaxDcV ?? ""}
                placeholder="600"
              />
              <Campo
                rotulo="MPPT mín. (V)"
                name="mpptMinV"
                inputMode="decimal"
                defaultValue={item.mpptMinV ?? ""}
                placeholder="80"
              />
              <Campo
                rotulo="MPPT máx. (V)"
                name="mpptMaxV"
                inputMode="decimal"
                defaultValue={item.mpptMaxV ?? ""}
                placeholder="550"
              />
              <Campo
                rotulo="Corrente máx. entrada (A)"
                name="correnteMaxEntradaA"
                inputMode="decimal"
                defaultValue={item.correnteMaxEntradaA ?? ""}
                placeholder="20"
              />
              <Campo
                rotulo="Quantidade de MPPTs"
                name="quantidadeMppt"
                inputMode="numeric"
                defaultValue={item.quantidadeMppt ?? ""}
                placeholder="2"
              />
            </>
          )}
        </div>
      )}
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
