"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Botao, Cartao, Mensagem, Selo } from "@/components/ui";
import type { Etapa, Funil } from "@/lib/crm";
import { CAMPOS_OBRIGATORIOS, ROTULO_CAMPO_OBRIGATORIO, type ResultadoAcao } from "@/lib/tipos";
import {
  alternarEtapa,
  alternarFunil,
  criarEtapa,
  criarFunil,
  definirCorEtapa,
  definirDiasConsideradoParado,
  definirHorasConsideradoSemContato,
  definirInicial,
  reordenarEtapa,
  salvarFunis,
} from "./actions";

const inputClasse = "min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm";

export function NovoFunil() {
  const [resultado, acao, pendente] = useActionState(criarFunil, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input name="nome" placeholder="Nome do novo funil (ex.: Pós-venda)" className={inputClasse} required />
      <Botao type="submit" disabled={pendente}>
        Criar funil
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function DiasConsideradoParado({ dias }: { dias: number }) {
  const [resultado, acao, pendente] = useActionState(definirDiasConsideradoParado, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        name="dias"
        min={1}
        max={365}
        defaultValue={dias}
        className={`${inputClasse} max-w-20 flex-none`}
        required
      />
      <span className="text-sm text-zinc-600">dias sem atividade pra considerar &quot;parado&quot; (leads e propostas)</span>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function HorasConsideradoSemContato({ horas }: { horas: number }) {
  const [resultado, acao, pendente] = useActionState(definirHorasConsideradoSemContato, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        name="horas"
        min={1}
        max={168}
        defaultValue={horas}
        className={`${inputClasse} max-w-20 flex-none`}
        required
      />
      <span className="text-sm text-zinc-600">horas sem nenhum contato pra considerar um lead novo &quot;sem contato&quot;</span>
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}

export function NovaEtapa({ funilId }: { funilId: string }) {
  const [resultado, acao, pendente] = useActionState(criarEtapa, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="funilId" value={funilId} />
      <input name="nome" placeholder="Nova etapa" className={inputClasse} required />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Adicionar etapa
      </Botao>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}

export function AlternarEtapa({ etapaId, ativa }: { etapaId: string; ativa: boolean }) {
  const [resultado, acao, pendente] = useActionState(alternarEtapa, null);
  return (
    <form action={acao} className="flex items-center gap-2">
      <input type="hidden" name="etapaId" value={etapaId} />
      <input type="hidden" name="ativa" value={String(!ativa)} />
      <button disabled={pendente} className="text-sm text-zinc-600 hover:underline">
        {ativa ? "Desativar" : "Reativar"}
      </button>
      {resultado && !resultado.ok && <span className="text-sm text-red-700">{resultado.mensagem}</span>}
    </form>
  );
}

/** Cor de acento da etapa, mostrada na coluna do Kanban. */
export function CorEtapa({ etapaId, cor }: { etapaId: string; cor: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);

  // O onChange do React em <input type="color"> se comporta como o evento nativo "input":
  // dispara a cada movimento do dedo/mouse dentro do seletor, não só ao confirmar a cor.
  // Isso inundava a server action de submissões (uma por movimento) e travava a tela.
  // O evento nativo "change" só dispara quando o seletor fecha com uma cor definida.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    function aoConfirmarCor() {
      input?.form?.requestSubmit();
    }
    input.addEventListener("change", aoConfirmarCor);
    return () => input.removeEventListener("change", aoConfirmarCor);
  }, []);

  return (
    <form action={definirCorEtapa} className="flex items-center gap-1" title="Cor da etapa no Kanban">
      <input type="hidden" name="etapaId" value={etapaId} />
      <input
        ref={inputRef}
        type="color"
        name="cor"
        defaultValue={cor ?? "#a1a1aa"}
        aria-label="Cor da etapa"
        className="h-6 w-6 cursor-pointer rounded border border-zinc-300 p-0"
      />
    </form>
  );
}

/** Checkboxes de campos obrigatórios da etapa — controlado, faz parte do "Salvar" único do topo da página. */
function CamposEtapa({ campos, aoMudar }: { campos: string[]; aoMudar: (campos: string[]) => void }) {
  return (
    <details className="w-full pl-7 text-sm">
      <summary className="cursor-pointer text-zinc-600">
        Campos obrigatórios para entrar nesta etapa
        {campos.length > 0 &&
          ` (${campos.map((c) => ROTULO_CAMPO_OBRIGATORIO[c as keyof typeof ROTULO_CAMPO_OBRIGATORIO] ?? c).join(", ")})`}
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {CAMPOS_OBRIGATORIOS.map((c) => (
          <label key={c} className="flex items-center gap-1 text-zinc-700">
            <input
              type="checkbox"
              checked={campos.includes(c)}
              onChange={(e) => aoMudar(e.target.checked ? [...campos, c] : campos.filter((v) => v !== c))}
            />
            {ROTULO_CAMPO_OBRIGATORIO[c]}
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * Nomes dos funis/etapas e campos obrigatórios das etapas, com um único botão "Salvar" no topo
 * salvando tudo de uma vez (substitui os antigos botões "Salvar" repetidos por funil/etapa).
 * O resto (cor, ativar/desativar, tornar inicial, reordenar) continua imediato, sem precisar de Salvar.
 */
export function ListaFunis({ funis, etapas }: { funis: Funil[]; etapas: Etapa[] }) {
  // Guardam só o que foi editado nesta sessão (não o valor de cada item inteiro): assim, um item
  // criado depois — por uma ação imediata como "Adicionar etapa", que revalida a página — aparece
  // certinho com seu próprio nome, sem precisar sincronizar este estado com as props a cada render.
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciar] = useTransition();

  const nomeDe = (id: string, original: string) => nomes[id] ?? original;
  const camposDe = (id: string, original: string[]) => campos[id] ?? original;

  function aoSalvar() {
    setResultado(null);
    iniciar(async () => {
      const r = await salvarFunis(
        funis.map((f) => ({ id: f.id, nome: nomeDe(f.id, f.nome) })),
        etapas.map((e) => ({ id: e.id, nome: nomeDe(e.id, e.nome), camposObrigatorios: camposDe(e.id, e.camposObrigatorios) })),
      );
      setResultado(r);
    });
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white/95 p-4 shadow-[0_1px_2px_rgba(15,15,16,0.04)] backdrop-blur">
        <p className="text-sm text-zinc-600">
          A etapa inicial é onde os negócios novos entram. Ganho e perdido não são etapas: ficam como status do negócio. Em
          cada etapa você pode exigir campos preenchidos (ex.: valor antes de &quot;Proposta enviada&quot;).
        </p>
        <Botao onClick={aoSalvar} disabled={pendente} className="shrink-0">
          {pendente ? "Salvando…" : "Salvar"}
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
      {funis.map((funil) => {
        const doFunil = etapas.filter((e) => e.funilId === funil.id);
        return (
          <Cartao
            key={funil.id}
            acao={
              <form action={alternarFunil}>
                <input type="hidden" name="funilId" value={funil.id} />
                <input type="hidden" name="ativo" value={String(!funil.ativo)} />
                <button className="text-sm text-zinc-600 hover:underline">{funil.ativo ? "Desativar funil" : "Reativar funil"}</button>
              </form>
            }
          >
            <div className="mb-3 flex items-center gap-2">
              <input
                value={nomeDe(funil.id, funil.nome)}
                onChange={(e) => setNomes((n) => ({ ...n, [funil.id]: e.target.value }))}
                aria-label="Nome do funil"
                className={inputClasse}
              />
              {!funil.ativo && <Selo tom="negativo">Inativo</Selo>}
            </div>
            <ol className="mb-3 flex flex-col">
              {doFunil.map((etapa, i) => (
                <li key={etapa.id} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 py-2">
                  <span className="w-5 text-sm text-zinc-400">{i + 1}</span>
                  <CorEtapa etapaId={etapa.id} cor={etapa.cor} />
                  <input
                    value={nomeDe(etapa.id, etapa.nome)}
                    onChange={(e) => setNomes((n) => ({ ...n, [etapa.id]: e.target.value }))}
                    aria-label="Nome da etapa"
                    className={inputClasse}
                  />
                  {etapa.inicial ? (
                    <Selo tom="atencao">Inicial</Selo>
                  ) : (
                    etapa.ativa && (
                      <form action={definirInicial}>
                        <input type="hidden" name="etapaId" value={etapa.id} />
                        <button className="text-sm text-zinc-600 hover:underline">Tornar inicial</button>
                      </form>
                    )
                  )}
                  {!etapa.ativa && <Selo tom="negativo">Inativa</Selo>}
                  {(["cima", "baixo"] as const).map((direcao) => (
                    <form key={direcao} action={reordenarEtapa}>
                      <input type="hidden" name="etapaId" value={etapa.id} />
                      <input type="hidden" name="direcao" value={direcao} />
                      <button
                        disabled={direcao === "cima" ? i === 0 : i === doFunil.length - 1}
                        aria-label={direcao === "cima" ? "Subir" : "Descer"}
                        className="rounded border border-zinc-300 px-2 text-sm disabled:opacity-30"
                      >
                        {direcao === "cima" ? "↑" : "↓"}
                      </button>
                    </form>
                  ))}
                  <AlternarEtapa etapaId={etapa.id} ativa={etapa.ativa} />
                  <CamposEtapa
                    campos={camposDe(etapa.id, etapa.camposObrigatorios)}
                    aoMudar={(novos) => setCampos((c) => ({ ...c, [etapa.id]: novos }))}
                  />
                </li>
              ))}
            </ol>
            <NovaEtapa funilId={funil.id} />
          </Cartao>
        );
      })}
    </>
  );
}
