"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { Botao, CLASSE_ENTRADA, FOCO, Mensagem } from "@/components/ui";
import { dadosFornecedorTabela, importarTabelaPrecos } from "@/lib/acoes/compras-precos";
import { nomeSeguro } from "@/lib/anexos-regras";
import type { DadosFornecedorVM } from "@/lib/compras/dados-precos";
import {
  adivinharMapa,
  erroMapa,
  itensImportacao,
  letraColuna,
  lerCsv,
  montarPrevia,
  normalizarUnidade,
  resumoPrevia,
  textoCelula,
  type Celula,
  type DecisaoNovo,
  type LinhaPrevia,
  type MapaColunas,
  type MaterialVM,
} from "@/lib/compras/precos";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { ResultadoAcao } from "@/lib/tipos";
import { TabelaPrevia } from "./tabela-previa-precos";

const BUCKET = "compras-precos";
const TAMANHO_MAX = 10 * 1024 * 1024;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LIMITE_ENVIO = 900_000;
type Aba = "mudaram" | "novos" | "problema" | "iguais";

async function lerPlanilha(arquivo: File): Promise<Celula[][]> {
  if (/\.csv$/i.test(arquivo.name)) return lerCsv(await arquivo.text());
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(arquivo)) as Celula[][];
}

function decisaoPadrao(l: LinhaPrevia): DecisaoNovo {
  return l.materialId
    ? { tipo: "ligar", materialId: l.materialId }
    : { tipo: "criar", nome: l.descricao.slice(0, 120), categoria: "outros", unidade: normalizarUnidade(l.unidade) };
}

export function EnviarTabelaPrecos({ empresaId, materiais, fornecedores, hoje }: { empresaId: string; materiais: MaterialVM[]; fornecedores: string[]; hoje: string }) {
  const id = useId();
  const router = useRouter();
  const [fornecedor, setFornecedor] = useState("");
  const [dataTabela, setDataTabela] = useState(hoje);
  const [validoAte, setValidoAte] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<Celula[][] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [dados, setDados] = useState<{ chave: string; vm: DadosFornecedorVM } | null>(null);
  const [mapa, setMapa] = useState<MapaColunas | null>(null);
  const [mapaLembrado, setMapaLembrado] = useState(false);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoNovo>>({});
  const [aba, setAba] = useState<Aba>("mudaram");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const pedido = useRef(0);

  const chave = fornecedor.replace(/\s+/g, " ").trim().toLowerCase();

  /** Busca o mapa lembrado e os vínculos do fornecedor; aplica o mapa (ou o palpite) às linhas lidas. */
  const prepararFornecedor = async (linhasLidas: Celula[][] | null) => {
    if (chave.length < 2) return;
    const n = ++pedido.current;
    const vm = dados?.chave === chave ? dados.vm : await dadosFornecedorTabela(fornecedor);
    if (n !== pedido.current || !vm) return;
    setDados({ chave, vm });
    if (!linhasLidas) return;
    const colunas = Math.max(0, ...linhasLidas.slice(0, 50).map((l) => l.length));
    const lembrado = vm.mapa && Math.max(vm.mapa.material, vm.mapa.preco, vm.mapa.codigo ?? 0, vm.mapa.unidade ?? 0) < colunas ? vm.mapa : null;
    setMapa(lembrado ?? adivinharMapa(linhasLidas) ?? { cabecalho: 0, material: 0, preco: Math.min(1, Math.max(colunas - 1, 0)), codigo: null, unidade: null });
    setMapaLembrado(lembrado != null);
    setDecisoes({});
  };

  const escolherArquivo = async (a: File | null) => {
    setResultado(null);
    setArquivo(null);
    setLinhas(null);
    setMapa(null);
    if (!a) return;
    if (!/\.(xlsx|csv)$/i.test(a.name)) {
      setResultado({ ok: false, mensagem: "Envie a planilha em .xlsx ou .csv." });
      return;
    }
    if (a.size > TAMANHO_MAX) {
      setResultado({ ok: false, mensagem: "A planilha tem mais de 10 MB." });
      return;
    }
    setLendo(true);
    try {
      const lidas = await lerPlanilha(a);
      if (lidas.length < 2) throw new Error("vazia");
      setArquivo(a);
      setLinhas(lidas);
      await prepararFornecedor(lidas);
    } catch {
      setResultado({ ok: false, mensagem: `Não foi possível ler "${a.name}". Confira se é uma planilha .xlsx ou .csv com cabeçalho e linhas.` });
    } finally {
      setLendo(false);
    }
  };

  const problemaMapa = mapa ? erroMapa(mapa) : null;
  const previa = useMemo(
    () =>
      linhas && mapa && !problemaMapa && dados?.chave === chave
        ? montarPrevia({ linhas, mapa, materiais, vinculos: dados.vm.vinculos, precosAtuais: dados.vm.precosAtuais })
        : null,
    [linhas, mapa, problemaMapa, dados, chave, materiais],
  );
  const resumo = previa ? resumoPrevia(previa) : null;
  const decisaoDe = (l: LinhaPrevia) => decisoes[l.numero] ?? decisaoPadrao(l);
  const mudar = (l: LinhaPrevia, d: DecisaoNovo) => setDecisoes((ds) => ({ ...ds, [l.numero]: d }));

  const colunas = useMemo(() => {
    if (!linhas || !mapa) return [];
    const n = Math.max(0, ...linhas.slice(0, 50).map((l) => l.length));
    const cab = linhas[mapa.cabecalho] ?? [];
    return Array.from({ length: n }, (_, i) => ({ indice: i, rotulo: `Coluna ${letraColuna(i)}${textoCelula(cab[i]) ? ` · "${textoCelula(cab[i]).slice(0, 30)}"` : ""}` }));
  }, [linhas, mapa]);

  const importar = async () => {
    if (!previa || !arquivo || !mapa || !resumo) return;
    const decididas = Object.fromEntries(previa.filter((l) => l.situacao === "novo").map((l) => [l.numero, decisaoDe(l)]));
    const r = itensImportacao(previa, decididas);
    if ("erro" in r) {
      setResultado({ ok: false, mensagem: r.erro });
      return;
    }
    // Server Actions aceitam até 1 MB por envio (padrão do Next).
    if (new Blob([JSON.stringify(r.itens)]).size > LIMITE_ENVIO) {
      setResultado({ ok: false, mensagem: "A tabela é grande demais para um envio. Divida a planilha em partes e envie uma de cada vez." });
      return;
    }
    setEnviando(true);
    setResultado(null);
    const caminho = `${empresaId}/${nomeSeguro(arquivo.name)}`;
    const csv = /\.csv$/i.test(arquivo.name);
    const { error } = await criarClienteNavegador()
      .storage.from(BUCKET)
      .upload(caminho, arquivo, { contentType: csv ? "text/csv" : XLSX });
    if (error) {
      setEnviando(false);
      setResultado({ ok: false, mensagem: `Não foi possível enviar "${arquivo.name}". Tente de novo.` });
      return;
    }
    let res: ResultadoAcao;
    try {
      res = await importarTabelaPrecos({
        fornecedor,
        dataTabela,
        validoAte: validoAte || null,
        arquivo: { caminho, nome: arquivo.name },
        linhasLidas: previa.length,
        ignoradas: resumo.problemas,
        mapa,
        itens: r.itens,
      });
    } catch {
      res = { ok: false, mensagem: "Não foi possível importar a tabela. Tente de novo." };
    }
    setEnviando(false);
    setResultado(res);
    if (res?.ok) router.push("/compras/precos");
  };

  const validos = resumo ? resumo.iguais + resumo.subiram + resumo.baixaram + resumo.novos : 0;
  const daAba = (previa ?? []).filter((l) =>
    aba === "mudaram" ? l.situacao === "subiu" || l.situacao === "baixou" : aba === "novos" ? l.situacao === "novo" : aba === "problema" ? l.situacao === "problema" : l.situacao === "igual",
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="painel flex flex-col gap-3 p-4 md:p-6">
        <div>
          <p className="text-xs font-medium text-texto-2">1 · Arquivo</p>
          <h2 className="font-titulo text-lg text-texto">Fornecedor e planilha</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Fornecedor</span>
            <input
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              onBlur={() => void prepararFornecedor(linhas)}
              required
              minLength={2}
              maxLength={120}
              list={`${id}-fornecedores`}
              autoComplete="off"
              placeholder="Ex.: Distribuidora Solar Sul"
              className={CLASSE_ENTRADA}
            />
            <datalist id={`${id}-fornecedores`}>
              {fornecedores.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Data da tabela</span>
            <input type="date" value={dataTabela} max={hoje} onChange={(e) => setDataTabela(e.target.value)} required className={CLASSE_ENTRADA} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-texto-2">Vale até (opcional)</span>
            <input type="date" value={validoAte} min={dataTabela} onChange={(e) => setValidoAte(e.target.value)} className={CLASSE_ENTRADA} />
          </label>
        </div>
        <label className={`flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-linha bg-superficie-2 p-4 text-sm ${chave.length < 2 ? "opacity-60" : ""}`}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium text-texto">{arquivo ? arquivo.name : "Escolher a planilha"}</span>
            <span className="text-xs text-texto-2">
              {lendo ? "Lendo..." : linhas && previa ? `${previa.length.toLocaleString("pt-BR")} linhas lidas · ` : ""}planilha .xlsx ou .csv, até 10 MB
              {chave.length < 2 && " · informe o fornecedor antes"}
            </span>
          </span>
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={chave.length < 2 || lendo || enviando}
            onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)}
            className={`max-w-full text-sm ${FOCO}`}
          />
        </label>
      </section>

      {linhas && mapa && (
        <section className="painel flex flex-col gap-3 p-4 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-texto-2">2 · Colunas</p>
              <h2 className="font-titulo text-lg text-texto">O que é cada coluna da planilha</h2>
            </div>
            <span className="text-xs text-texto-2">{mapaLembrado ? "Lembrado para este fornecedor" : "Fica lembrado para este fornecedor"}</span>
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
                ["material", "Material", false],
                ["codigo", "Código do fornecedor", true],
                ["unidade", "Unidade", true],
                ["preco", "Preço de custo", false],
              ] as const
            ).map(([campo, rotulo, opcional]) => (
              <label key={campo} className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-texto-2">{rotulo}</span>
                <select
                  value={mapa[campo] ?? ""}
                  onChange={(e) => setMapa({ ...mapa, [campo]: e.target.value === "" ? null : Number(e.target.value) })}
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
          {problemaMapa && <Mensagem resultado={{ ok: false, mensagem: problemaMapa }} />}
        </section>
      )}

      {previa && resumo && (
        <section className="painel overflow-hidden">
          <div className="flex flex-col gap-3 p-4 md:p-6">
            <div>
              <p className="text-xs font-medium text-texto-2">3 · Prévia</p>
              <h2 className="font-titulo text-lg text-texto">O que muda com esta tabela</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                [resumo.iguais, "iguais, sem mudança"],
                [resumo.subiram + resumo.baixaram, "mudaram de preço"],
                [resumo.novos, "novos neste fornecedor"],
                [resumo.problemas, "com problema, ficam de fora"],
              ].map(([n, texto]) => (
                <div key={texto} className="rounded-xl bg-superficie-2 px-3.5 py-3">
                  <b className="block font-titulo text-2xl font-light tabular-nums">{(n as number).toLocaleString("pt-BR")}</b>
                  <span className="text-xs text-texto-2">{texto}</span>
                </div>
              ))}
            </div>
            <nav aria-label="Linhas da prévia" className="flex gap-1 overflow-x-auto border-b border-linha">
              {(
                [
                  ["mudaram", `Mudaram (${resumo.subiram + resumo.baixaram})`],
                  ["novos", `Novos (${resumo.novos})`],
                  ["problema", `Com problema (${resumo.problemas})`],
                  ["iguais", `Iguais (${resumo.iguais})`],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={aba === valor}
                  onClick={() => setAba(valor)}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap ${FOCO} ${
                    aba === valor ? "border-dourado font-semibold text-texto" : "border-transparent text-texto-2 hover:text-texto"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </nav>
          </div>
          <TabelaPrevia linhas={daAba} materiais={materiais} decisaoDe={decisaoDe} aoMudar={mudar} />
          <div className="flex flex-col gap-3 border-t border-linha p-4 md:flex-row md:items-center md:justify-between md:px-6">
            <p className="text-sm text-texto">
              Importa {validos.toLocaleString("pt-BR")} preços ({resumo.subiram + resumo.baixaram} mudanças, {resumo.novos} novos e {resumo.iguais} iguais, que
              ficam com a data desta tabela).
              {resumo.problemas > 0 && ` As ${resumo.problemas} linhas com problema não entram.`}
            </p>
            <div className="flex shrink-0 gap-2">
              <Botao type="button" variante="secundario" onClick={() => router.push("/compras/precos")} disabled={enviando}>
                Cancelar
              </Botao>
              <Botao type="button" onClick={() => void importar()} disabled={enviando || validos === 0}>
                {enviando ? "Importando..." : `Importar ${validos.toLocaleString("pt-BR")} preços`}
              </Botao>
            </div>
          </div>
        </section>
      )}

      <Mensagem resultado={resultado} />
      <p className="rounded-xl bg-dourado/10 p-3 text-xs leading-relaxed text-texto">
        A planilha original fica anexada à tabela do fornecedor. Preços antigos vão para o histórico do material; pedidos de compra já salvos não mudam.
        Material novo pode ser ligado a um material já cadastrado (o mesmo módulo com outro nome em outro fornecedor) para comparar preços.
      </p>
    </div>
  );
}
