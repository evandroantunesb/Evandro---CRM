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
        Só os equipamentos ativados aqui entram na recomendação automática de kit em &quot;Adicionar negócio&quot;.
        Prioridade maior aparece primeiro entre as opções tecnicamente válidas.
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Selecao rotulo="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value as "modulo" | "inversor"); setResultados([]); }}>
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
                        title={!r.potenciaW ? "Sem potência na ficha técnica — não é possível ativar" : "Ativar"}
                      >
                        {r.descricao}
                        {r.potenciaW != null && <span className="text-zinc-400"> · {r.potenciaW} W</span>}
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
      {itens.length === 0 && <p className="text-xs text-zinc-400">Nenhum equipamento ativado ainda.</p>}
      {itens.map((item) => (
        <LinhaEquipamento key={item.id} item={item} />
      ))}
    </div>
  );
}

function LinhaEquipamento({ item }: { item: EquipamentoAtivoLinha }) {
  const [resultado, acao, pendente] = useActionState(editarEquipamento, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2 first:border-t-0">
      <input type="hidden" name="id" value={item.id} />
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
        {item.fabricante} {item.modelo} <span className="text-zinc-400">· {item.potenciaW} W</span>
      </span>
      <div className="w-24">
        <Campo rotulo="Prioridade" name="prioridade" inputMode="numeric" defaultValue={String(item.prioridade)} />
      </div>
      <label className="flex items-center gap-1 text-sm text-zinc-700">
        <input type="checkbox" name="ativo" defaultChecked={item.ativo} /> Ativo
      </label>
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
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
