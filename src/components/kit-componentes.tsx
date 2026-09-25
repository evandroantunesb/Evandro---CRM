"use client";

import { useState, useTransition } from "react";
import { Botao, Campo } from "@/components/ui";
import { buscarComponentesCatalogo } from "@/lib/acoes/opensolar";
import { ROTULO_TIPO_COMPONENTE_KIT, TIPOS_COMPONENTE_KIT, type TipoComponenteKit } from "@/lib/tipos";

export type LinhaComponente = { tipo: TipoComponenteKit; descricao: string; potenciaW: string; quantidade: string };

export function novaLinhaComponente(tipo: TipoComponenteKit): LinhaComponente {
  return { tipo, descricao: "", potenciaW: "", quantidade: "1" };
}

/** Aceita "550", "550,5"; vazio ou inválido vira null. */
function numero(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Converte as linhas do editor para o formato salvo (só as com descrição preenchida). */
export function linhasParaComponentes(linhas: LinhaComponente[]) {
  return linhas
    .filter((l) => l.descricao.trim())
    .map((l) => ({
      tipo: l.tipo,
      descricao: l.descricao.trim(),
      potenciaW: numero(l.potenciaW),
      quantidade: Math.max(1, Math.round(numero(l.quantidade) ?? 1)),
    }));
}

/**
 * Campo "Modelo / descrição": pra módulo e inversor, busca no catálogo técnico
 * (OpenSolar) conforme digita e preenche a potência junto ao escolher um resultado.
 * Continua aceitando texto livre (a busca é só um atalho).
 */
function CampoModeloComBusca({
  tipo,
  valor,
  placeholder,
  onChangeTexto,
  onSelecionar,
}: {
  tipo: TipoComponenteKit;
  valor: string;
  placeholder: string;
  onChangeTexto: (v: string) => void;
  onSelecionar: (descricao: string, potenciaW: string) => void;
}) {
  const [resultados, setResultados] = useState<{ id: number; descricao: string; potenciaW: number | null }[]>([]);
  const [, iniciar] = useTransition();
  const pesquisavel = tipo === "modulo" || tipo === "inversor";

  function pesquisar(termo: string) {
    onChangeTexto(termo);
    if (!pesquisavel) return;
    if (termo.trim().length < 2) return setResultados([]);
    iniciar(async () => setResultados(await buscarComponentesCatalogo(tipo, termo)));
  }

  return (
    <div className="relative">
      <Campo rotulo="Modelo / descrição" value={valor} onChange={(e) => pesquisar(e.target.value)} placeholder={placeholder} />
      {resultados.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white text-sm shadow-md">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onSelecionar(r.descricao, r.potenciaW != null ? String(r.potenciaW) : "");
                  setResultados([]);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-zinc-50"
              >
                {r.descricao}
                {r.potenciaW != null && <span className="text-zinc-400"> · {r.potenciaW} W</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Editor do kit personalizado: módulos, inversor, baterias e outros itens (múltiplos de cada). */
export function EditorComponentesKit({
  linhas,
  onChange,
}: {
  linhas: LinhaComponente[];
  onChange: (linhas: LinhaComponente[]) => void;
}) {
  function adicionar(tipo: TipoComponenteKit) {
    onChange([...linhas, novaLinhaComponente(tipo)]);
  }
  function atualizar(indice: number, patch: Partial<LinhaComponente>) {
    onChange(linhas.map((l, i) => (i === indice ? { ...l, ...patch } : l)));
  }
  function remover(indice: number) {
    onChange(linhas.filter((_, i) => i !== indice));
  }

  return (
    <div className="flex flex-col gap-4">
      {TIPOS_COMPONENTE_KIT.map((tipo) => {
        const doTipo = linhas.map((l, i) => ({ l, i })).filter(({ l }) => l.tipo === tipo);
        return (
          <div key={tipo} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">{ROTULO_TIPO_COMPONENTE_KIT[tipo]}</span>
              <button
                type="button"
                onClick={() => adicionar(tipo)}
                className="text-xs font-medium text-amber-700 hover:underline"
              >
                + Adicionar {ROTULO_TIPO_COMPONENTE_KIT[tipo].toLowerCase()}
              </button>
            </div>
            {doTipo.length === 0 && <p className="text-xs text-zinc-400">Nenhum item.</p>}
            {doTipo.map(({ l, i }) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg bg-zinc-50 p-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                <CampoModeloComBusca
                  tipo={tipo}
                  valor={l.descricao}
                  placeholder={tipo === "modulo" ? "Ex.: Canadian 550 W" : "Ex.: Growatt 5 kW"}
                  onChangeTexto={(v) => atualizar(i, { descricao: v })}
                  onSelecionar={(descricao, potenciaW) => atualizar(i, { descricao, potenciaW })}
                />
                <Campo
                  rotulo="Potência (W)"
                  inputMode="decimal"
                  value={l.potenciaW}
                  onChange={(e) => atualizar(i, { potenciaW: e.target.value })}
                  placeholder="Opcional"
                />
                <Campo
                  rotulo="Qtd."
                  inputMode="numeric"
                  value={l.quantidade}
                  onChange={(e) => atualizar(i, { quantidade: e.target.value })}
                />
                <Botao type="button" variante="secundario" onClick={() => remover(i)}>
                  Remover
                </Botao>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
