"use client";

import { useActionState, useEffect, useState } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { Botao, Mensagem } from "@/components/ui";
import { confirmarImportacaoCsv, lerCsvEquipamentos } from "@/lib/acoes/equipamentos";
import type { PreviewImportacao } from "@/lib/equipamentos";
import { SeloStatusTecnico } from "./selo-status";

const PASSOS = ["Selecionar arquivo", "Ler e validar", "Conferir preview", "Confirmar e importar"];

function Passos({ atual }: { atual: number }) {
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {PASSOS.map((p, i) => (
        <li key={p} className={i === atual ? "font-semibold text-carvao" : i < atual ? "text-zinc-500" : "text-zinc-400"}>
          <span
            className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full ${
              i <= atual ? "bg-dourado text-carvao" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {i + 1}
          </span>
          {p}
        </li>
      ))}
    </ol>
  );
}

/**
 * Importação do catálogo via CSV em etapas (Evandro, 2026-10-01): Selecionar arquivo → Ler →
 * Mapear/validar → Preview → Confirmar → Importar. A leitura (`lerCsvEquipamentos`) não grava
 * nada; só a confirmação (`confirmarImportacaoCsv`) grava, revalidando tudo no servidor.
 */
export function ImportacaoCsv({ onConcluido }: { onConcluido: (mensagem: string) => void }) {
  const [leitura, ler, lendo] = useActionState(lerCsvEquipamentos, null);
  const [confirmacao, confirmar, importando] = useActionState(confirmarImportacaoCsv, null);
  const [arquivoEscolhido, setArquivoEscolhido] = useState(false);

  useEffect(() => {
    if (confirmacao?.ok) onConcluido(confirmacao.mensagem);
  }, [confirmacao, onConcluido]);

  const preview = leitura?.ok ? leitura.preview : null;
  const passo = preview ? 2 : lendo ? 1 : 0;

  return (
    <div className="flex flex-col gap-3">
      <Passos atual={importando ? 3 : passo} />
      <form
        action={ler}
        onChange={() => setArquivoEscolhido(true)}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="max-w-sm flex-1">
          <CampoArquivo rotulo="Arquivo CSV" name="csv" accept=".csv,text/csv" />
        </div>
        <Botao type="submit" variante="secundario" disabled={lendo || !arquivoEscolhido}>
          {lendo ? "Lendo..." : preview ? "Ler de novo" : "Ler arquivo"}
        </Botao>
      </form>
      <p className="text-xs text-zinc-500">
        Ponto como separador decimal (ex.: 48.96). Reimportar o mesmo equipamento (tipo + fabricante + modelo) atualiza
        o cadastro em vez de duplicar, e mantém o status técnico escolhido à mão. Nada é gravado até você confirmar.
      </p>
      {leitura && !leitura.ok && <Mensagem resultado={leitura} />}
      {preview && leitura?.ok && (
        <PreviewCsv
          nomeArquivo={leitura.nomeArquivo}
          preview={preview}
          confirmar={confirmar}
          importando={importando}
        />
      )}
      {confirmacao && !confirmacao.ok && <Mensagem resultado={confirmacao} />}
    </div>
  );
}

function Resumo({ rotulo, valor, tom = "neutro" }: { rotulo: string; valor: number; tom?: "neutro" | "atencao" | "erro" }) {
  const cor = {
    neutro: "bg-zinc-50 text-carvao",
    atencao: valor ? "bg-amber-50 text-amber-800" : "bg-zinc-50 text-carvao",
    erro: valor ? "bg-red-50 text-red-800" : "bg-zinc-50 text-carvao",
  }[tom];
  return (
    <div className={`rounded-lg px-3 py-2 ${cor}`}>
      <p className="text-lg font-semibold">{valor}</p>
      <p className="text-xs">{rotulo}</p>
    </div>
  );
}

function PreviewCsv({
  nomeArquivo,
  preview,
  confirmar,
  importando,
}: {
  nomeArquivo: string;
  preview: PreviewImportacao;
  confirmar: (formData: FormData) => void;
  importando: boolean;
}) {
  const novos = preview.validas.filter((v) => v.acao === "novo").length;
  const incompletos = preview.validas.filter((v) => v.statusTecnico === "incompleto").length;
  // Só as colunas preenchidas voltam pro servidor (vazio e ausente são lidos igual), pra manter o envio pequeno.
  const linhasParaEnviar = JSON.stringify(
    preview.validas.map((v) => Object.fromEntries(Object.entries(v.original).filter(([, valor]) => valor !== ""))),
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3">
      <p className="text-sm font-medium text-zinc-800">
        Preview de &quot;{nomeArquivo}&quot; · {preview.totalLinhas} linha(s) lida(s)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Resumo rotulo={`válidas (${novos} novas)`} valor={preview.validas.length} />
        <Resumo rotulo="atualizam existentes" valor={preview.validas.length - novos} />
        <Resumo rotulo="ficam incompletas" valor={incompletos} tom="atencao" />
        <Resumo rotulo="duplicadas no arquivo" valor={preview.duplicados.length} tom="atencao" />
        <Resumo rotulo="com erro (ignoradas)" valor={preview.erros.length} tom="erro" />
      </div>

      {preview.avisos.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {preview.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {preview.duplicados.length > 0 && (
        <details className="text-xs text-zinc-700">
          <summary className="cursor-pointer font-medium">Duplicados ({preview.duplicados.length}) — vale a última linha</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {preview.duplicados.map((d) => (
              <li key={d.linha}>
                Linha {d.linha} repete a linha {d.repeteLinha}: {d.descricao}
              </li>
            ))}
          </ul>
        </details>
      )}
      {preview.erros.length > 0 && (
        <details open className="text-xs text-red-800">
          <summary className="cursor-pointer font-medium">Erros ({preview.erros.length}) — essas linhas não serão importadas</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {preview.erros.map((e) => (
              <li key={e.linha}>
                Linha {e.linha}: {e.erro}
              </li>
            ))}
          </ul>
        </details>
      )}

      {preview.validas.length > 0 && (
        <div className="-mx-3 overflow-x-auto px-3">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="py-1.5 pr-2 font-medium">Linha</th>
                <th className="py-1.5 pr-2 font-medium">Equipamento</th>
                <th className="py-1.5 pr-2 font-medium">Potência</th>
                <th className="py-1.5 pr-2 font-medium">Ação</th>
                <th className="py-1.5 pr-2 font-medium">Status técnico</th>
                <th className="py-1.5 font-medium">Campos faltantes</th>
              </tr>
            </thead>
            <tbody>
              {preview.validas.map((v) => (
                <tr key={v.linha} className="border-b border-zinc-100 align-top">
                  <td className="py-1.5 pr-2 text-zinc-500">{v.linha}</td>
                  <td className="py-1.5 pr-2 text-zinc-800">
                    <span className="text-zinc-500">{v.tipo === "modulo" ? "Módulo" : "Inversor"} · </span>
                    {v.fabricante} {v.modelo}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{v.potenciaW.toLocaleString("pt-BR")} W</td>
                  <td className="py-1.5 pr-2">{v.acao === "novo" ? "Novo" : "Atualiza"}</td>
                  <td className="py-1.5 pr-2">
                    <SeloStatusTecnico status={v.statusTecnico} />
                  </td>
                  <td className="py-1.5 text-zinc-500">{v.faltantes.length ? v.faltantes.join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.validas.length > 0 ? (
        <form action={confirmar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="linhas" value={linhasParaEnviar} />
          <Botao type="submit" disabled={importando}>
            {importando ? "Importando..." : `Confirmar e importar ${preview.validas.length} equipamento(s)`}
          </Botao>
          <span className="text-xs text-zinc-500">Linhas com erro ficam de fora.</span>
        </form>
      ) : (
        <p className="text-sm text-zinc-600">Nenhuma linha válida para importar — corrija o arquivo e leia de novo.</p>
      )}
    </div>
  );
}
