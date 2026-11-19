"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { importarListaEquipamentos } from "@/lib/acoes/compras-precos";
import {
  adivinharMapaLista,
  decisaoPadraoLista,
  erroMapaLista,
  itensLista,
  montarPreviaLista,
  type LinhaLista,
  type MapaLista,
} from "@/lib/compras/equipamentos";
import { letraColuna, lerCsv, textoCelula, type Celula, type DecisaoNovo, type MaterialVM } from "@/lib/compras/precos";
import { situacaoPotencia } from "@/lib/compras/potencia";
import type { ResultadoAcao } from "@/lib/tipos";
import { DecisaoLinha, PotenciaPrevia } from "./tabela-previa-precos";

const TAMANHO_MAX = 10 * 1024 * 1024;
const MOSTRAR = 200;

async function lerPlanilha(arquivo: File): Promise<Celula[][]> {
  if (/\.csv$/i.test(arquivo.name)) return lerCsv(await arquivo.text());
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(arquivo)) as Celula[][];
}

/**
 * Enviar lista de equipamentos (item 5 do roadmap, prévia aprovada em 18/11/2026): planilha sem preço, o que é cada
 * coluna e a prévia (cadastra os novos e completa a potência de quem está sem; a potência cadastrada não muda).
 */
export function EnviarListaEquipamentos({ materiais }: { materiais: MaterialVM[] }) {
  const router = useRouter();
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Celula[][] | null>(null);
  const [mapa, setMapa] = useState<MapaLista | null>(null);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoNovo>>({});
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  const escolherArquivo = async (a: File | null) => {
    setResultado(null);
    setLinhas(null);
    setMapa(null);
    setDecisoes({});
    setNomeArquivo(null);
    if (!a) return;
    if (!/\.(xlsx|csv)$/i.test(a.name)) return setResultado({ ok: false, mensagem: "Envie a planilha em .xlsx ou .csv." });
    if (a.size > TAMANHO_MAX) return setResultado({ ok: false, mensagem: "A planilha tem mais de 10 MB." });
    setLendo(true);
    try {
      const lidas = await lerPlanilha(a);
      if (lidas.length < 2) throw new Error("vazia");
      setLinhas(lidas);
      setNomeArquivo(a.name);
      setMapa(adivinharMapaLista(lidas) ?? { cabecalho: 0, material: 0, categoria: null, unidade: null, potencia: null });
    } catch {
      setResultado({ ok: false, mensagem: `Não foi possível ler "${a.name}". Confira se é uma planilha .xlsx ou .csv com cabeçalho e linhas.` });
    } finally {
      setLendo(false);
    }
  };

  const problemaMapa = mapa ? erroMapaLista(mapa) : null;
  const previa = useMemo(() => (linhas && mapa && !problemaMapa ? montarPreviaLista({ linhas, mapa, materiais }) : null), [linhas, mapa, problemaMapa, materiais]);
  const decisaoDe = (l: LinhaLista) => decisoes[l.numero] ?? decisaoPadraoLista(l);
  const porId = useMemo(() => new Map(materiais.map((m) => [m.id, m])), [materiais]);
  const destino = (l: LinhaLista) => {
    const d = decisaoDe(l);
    return d.tipo === "ligar" ? porId.get(d.materialId) : undefined;
  };

  const colunas = useMemo(() => {
    if (!linhas || !mapa) return [];
    const n = Math.max(0, ...linhas.slice(0, 50).map((l) => l.length));
    const cab = linhas[mapa.cabecalho] ?? [];
    return Array.from({ length: n }, (_, i) => ({ indice: i, rotulo: `Coluna ${letraColuna(i)}${textoCelula(cab[i]) ? ` · "${textoCelula(cab[i]).slice(0, 30)}"` : ""}` }));
  }, [linhas, mapa]);

  const validas = previa?.filter((l) => !l.problema) ?? [];
  const novos = validas.filter((l) => decisaoDe(l).tipo === "criar").length;
  const completa = validas.filter((l) => situacaoPotencia(l.potencia, destino(l)) === "preenche").length;
  const problemas = (previa?.length ?? 0) - validas.length;

  const importar = async () => {
    if (!previa) return;
    const r = itensLista(previa, decisaoDe);
    if ("erro" in r) return setResultado({ ok: false, mensagem: r.erro });
    setEnviando(true);
    try {
      const res = await importarListaEquipamentos(r.itens);
      setResultado(res);
      if (res?.ok) {
        setLinhas(null);
        setMapa(null);
        setNomeArquivo(null);
        router.refresh();
      }
    } catch {
      setResultado({ ok: false, mensagem: "Não foi possível importar a lista. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="painel flex flex-col gap-3 p-4 md:p-6">
        <div>
          <p className="text-xs font-medium text-texto-2">1 · Planilha</p>
          <h2 className="font-titulo text-lg text-texto">Lista de equipamentos</h2>
          <p className="text-sm text-texto-2">Para cadastrar ou completar equipamentos de uma vez, sem preço (ex.: a lista do engenheiro). O preço continua vindo da tabela do fornecedor.</p>
        </div>
        <label className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-linha bg-superficie-2 p-4 text-sm">
          <input type="file" accept=".xlsx,.csv" onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)} disabled={lendo || enviando} />
          <span className="text-texto-2">{lendo ? "Lendo a planilha..." : (nomeArquivo ?? "CSV ou Excel (.xlsx), até 10 MB.")}</span>
        </label>
      </section>

      {mapa && linhas && (
        <section className="painel flex flex-col gap-3 p-4 md:p-6">
          <div>
            <p className="text-xs font-medium text-texto-2">2 · Colunas</p>
            <h2 className="font-titulo text-lg text-texto">O que é cada coluna da planilha</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Linha do cabeçalho</span>
              <input
                type="number"
                min={1}
                max={20}
                value={mapa.cabecalho + 1}
                onChange={(e) => setMapa({ ...mapa, cabecalho: Math.min(19, Math.max(0, Number(e.target.value) - 1 || 0)) })}
                className={CLASSE_ENTRADA}
              />
            </label>
            {(
              [
                ["material", "Equipamento", false],
                ["categoria", "Categoria", true],
                ["unidade", "Unidade", true],
                ["potencia", "Potência (W)", true],
              ] as const
            ).map(([campo, rotulo, opcional]) => (
              <label key={campo} className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-texto-2">{rotulo}</span>
                <select
                  value={mapa[campo] ?? ""}
                  onChange={(e) => {
                    setMapa({ ...mapa, [campo]: e.target.value === "" ? null : Number(e.target.value) });
                    setDecisoes({});
                  }}
                  className={CLASSE_ENTRADA}
                >
                  {opcional && <option value="">Não tem</option>}
                  {colunas.map((c) => (
                    <option key={c.indice} value={c.indice}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="text-xs text-texto-2">Potência: “620”, “620 W” e “620Wp” são lidos em W; “5 kW” vira 5.000 W.</p>
          {problemaMapa && <Mensagem resultado={{ ok: false, mensagem: problemaMapa }} />}
        </section>
      )}

      {previa && (
        <section className="painel overflow-hidden">
          <div className="p-4 md:p-6">
            <p className="text-xs font-medium text-texto-2">3 · Prévia</p>
            <h2 className="font-titulo text-lg text-texto">O que acontece com cada equipamento</h2>
          </div>
          <div className="overflow-x-auto border-t border-linha">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-linha text-left text-xs text-texto-2">
                  <th className="px-4 py-2 font-medium md:px-6">Linha</th>
                  <th className="px-2 py-2 font-medium">Equipamento na planilha</th>
                  <th className="px-2 py-2 font-medium">No Raion</th>
                  <th className="px-4 py-2 font-medium md:px-6">Potência</th>
                </tr>
              </thead>
              <tbody>
                {previa.slice(0, MOSTRAR).map((l) => (
                  <tr key={l.numero} className="border-b border-linha align-top last:border-b-0">
                    <td className="px-4 py-2 tabular-nums md:px-6">{l.numero}</td>
                    <td className="px-2 py-2">{l.descricao || "—"}</td>
                    <td className="px-2 py-2">
                      {l.problema ? (
                        <span className="text-erro">{l.problema}</span>
                      ) : (
                        <DecisaoLinha linha={l} decisao={decisaoDe(l)} materiais={materiais} aoMudar={(d) => setDecisoes((ds) => ({ ...ds, [l.numero]: d }))} />
                      )}
                    </td>
                    <td className="px-4 py-2 md:px-6">{l.problema ? "—" : <PotenciaPrevia lida={l.potencia} material={destino(l)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previa.length > MOSTRAR && (
              <p className="border-t border-linha px-4 py-2 text-xs text-texto-2 md:px-6">
                Mostrando {MOSTRAR} de {previa.length.toLocaleString("pt-BR")} linhas. A importação leva todas.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 border-t border-linha p-4 md:flex-row md:items-center md:justify-between md:px-6">
            <p className="text-sm text-texto">
              Cadastra {novos.toLocaleString("pt-BR")} {novos === 1 ? "equipamento" : "equipamentos"} e completa a potência de {completa.toLocaleString("pt-BR")}.
              {problemas > 0 && ` As ${problemas} linhas com problema não entram.`} Nenhum preço muda.
            </p>
            <div className="flex shrink-0 gap-2">
              <Botao type="button" variante="secundario" onClick={() => router.push("/compras/precos")} disabled={enviando}>
                Cancelar
              </Botao>
              <Botao type="button" onClick={() => void importar()} disabled={enviando || validas.length === 0}>
                {enviando ? "Importando..." : "Importar lista"}
              </Botao>
            </div>
          </div>
        </section>
      )}

      <Mensagem resultado={resultado} />
      <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
        Equipamento já cadastrado com outra potência mantém a cadastrada (troque à mão no material, se for o caso). Nada é apagado.
      </p>
    </div>
  );
}
