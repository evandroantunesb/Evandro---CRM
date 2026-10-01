"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { Download, Plus, Search, Upload } from "lucide-react";
import { Botao, Mensagem } from "@/components/ui";
import { gerarModeloCsv, statusTecnicoExibido } from "@/lib/equipamentos";
import { FormularioEquipamento, type EquipamentoCatalogo } from "./formulario-equipamento";
import { ImportacaoCsv } from "./importacao-csv";
import { SeloStatusTecnico } from "./selo-status";

type Filtro = "todos" | "modulo" | "inversor";
type Painel = "novo" | "importar" | null;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "modulo", rotulo: "Módulos" },
  { valor: "inversor", rotulo: "Inversores" },
];

function baixarModeloCsv() {
  // BOM pra planilhas (Excel) abrirem os acentos certo; o leitor do CSV já ignora o BOM.
  const blob = new Blob(["﻿", gerarModeloCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-catalogo-equipamentos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Catálogo de equipamentos (módulos e inversores avulsos) que o motor de dimensionamento combina
 * sozinho a partir do consumo — separado dos Kits comerciais prontos (Evandro, 2026-10-01).
 * Filtro e busca são no navegador: o catálogo de uma empresa é pequeno (dezenas de itens).
 */
export function Catalogo({ itens }: { itens: EquipamentoCatalogo[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState<Painel>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [mensagemImportacao, setMensagemImportacao] = useState<string | null>(null);
  const [chaveImportacao, setChaveImportacao] = useState(0);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return itens.filter(
      (i) =>
        (filtro === "todos" || i.tipo === filtro) &&
        (!termo || normalizar(`${i.fabricante} ${i.modelo}`).includes(termo)),
    );
  }, [itens, filtro, busca]);

  const contagem = (f: Filtro) => (f === "todos" ? itens.length : itens.filter((i) => i.tipo === f).length);

  const concluirImportacao = useCallback((mensagem: string) => {
    setMensagemImportacao(mensagem);
    setPainel(null);
    setChaveImportacao((k) => k + 1);
  }, []);

  function alternarPainel(p: Exclude<Painel, null>) {
    setPainel((atual) => (atual === p ? null : p));
    setMensagemImportacao(null);
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,15,16,0.04)] sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Catálogo de equipamentos</h2>
        <p className="text-sm text-zinc-600">
          Módulos e inversores que o sistema combina sozinho a partir do consumo em &quot;Adicionar negócio&quot;. Só
          entram no dimensionamento automático os ativos com status Completo ou Verificado.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Botao type="button" onClick={() => alternarPainel("novo")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo equipamento
        </Botao>
        <Botao type="button" variante="secundario" onClick={() => alternarPainel("importar")} className="gap-1.5">
          <Upload className="h-4 w-4" /> Importar CSV
        </Botao>
        <Botao type="button" variante="secundario" onClick={baixarModeloCsv} className="gap-1.5">
          <Download className="h-4 w-4" /> Baixar modelo CSV
        </Botao>
      </div>

      {mensagemImportacao && <Mensagem resultado={{ ok: true, mensagem: mensagemImportacao }} />}

      {painel === "novo" && (
        <div className="rounded-lg border border-dourado/40 bg-offwhite p-3">
          <p className="mb-2 text-sm font-semibold text-carvao">Novo equipamento</p>
          <FormularioEquipamento onConcluido={() => setPainel(null)} />
        </div>
      )}
      {painel === "importar" && (
        <div className="rounded-lg border border-dourado/40 bg-offwhite p-3">
          <p className="mb-2 text-sm font-semibold text-carvao">Importar CSV</p>
          <ImportacaoCsv key={chaveImportacao} onConcluido={concluirImportacao} />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1" role="group" aria-label="Filtrar por tipo">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              onClick={() => setFiltro(f.valor)}
              aria-pressed={filtro === f.valor}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none ${
                filtro === f.valor ? "bg-white text-carvao shadow-sm" : "text-zinc-500 hover:text-carvao"
              }`}
            >
              {f.rotulo} <span className="text-xs text-zinc-400">{contagem(f.valor)}</span>
            </button>
          ))}
        </div>
        <label className="relative sm:w-64">
          <span className="sr-only">Buscar por fabricante ou modelo</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar fabricante ou modelo"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20"
          />
        </label>
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nenhum equipamento cadastrado ainda. Use &quot;Novo equipamento&quot; ou &quot;Importar CSV&quot;.
        </p>
      ) : visiveis.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum equipamento encontrado com esse filtro.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="hidden px-2 py-2 font-medium sm:table-cell">Tipo</th>
                <th className="px-2 py-2 font-medium first:pl-4 sm:first:pl-2">Fabricante</th>
                <th className="px-2 py-2 font-medium">Modelo</th>
                <th className="px-2 py-2 text-right font-medium">Potência</th>
                <th className="px-2 py-2 font-medium">Status técnico</th>
                <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Prioridade</th>
                <th className="px-2 py-2 pr-4 font-medium sm:pr-2">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => {
                const aberto = abertoId === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr
                      onClick={() => setAbertoId(aberto ? null : item.id)}
                      className={`cursor-pointer border-b border-zinc-100 hover:bg-offwhite ${aberto ? "bg-offwhite" : ""}`}
                    >
                      <td className="hidden px-2 py-2 text-zinc-600 sm:table-cell">
                        {item.tipo === "modulo" ? "Módulo" : "Inversor"}
                      </td>
                      <td className="px-2 py-2 text-zinc-800 first:pl-4 sm:first:pl-2">{item.fabricante}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          aria-expanded={aberto}
                          className="text-left font-medium text-carvao underline-offset-2 hover:underline"
                        >
                          {item.modelo}
                        </button>
                        <span className="block text-xs text-zinc-400 sm:hidden">
                          {item.tipo === "modulo" ? "Módulo" : "Inversor"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-zinc-700">
                        {Number.isFinite(item.potencia_w) ? `${item.potencia_w.toLocaleString("pt-BR")} W` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <SeloStatusTecnico status={statusTecnicoExibido(item.tipo, item)} />
                      </td>
                      <td className="hidden px-2 py-2 text-right text-zinc-700 sm:table-cell">{item.prioridade ?? 0}</td>
                      <td className="px-2 py-2 pr-4 text-zinc-700 sm:pr-2">{item.ativo ? "Sim" : "Não"}</td>
                    </tr>
                    {aberto && (
                      <tr className="border-b border-zinc-200">
                        <td colSpan={7} className="bg-offwhite px-4 py-3 sm:px-3">
                          <FormularioEquipamento item={item} onConcluido={() => setAbertoId(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
