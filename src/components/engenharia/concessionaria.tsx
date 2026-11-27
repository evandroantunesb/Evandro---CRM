"use client";

import { useActionState, useEffect, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { definirConcessionariaObra } from "@/lib/acoes/engenharia";

type Opcao = { id: string; nome: string };

/** Mesmo texto da recusa de `aplicar_checklist_engenharia` (20261223100000_concessionarias.sql). */
export const AVISO_SEM_CONCESSIONARIA = "Escolha a concessionária da obra para aplicar o checklist.";

/**
 * Concessionária da obra na tela da Engenharia (entrega 2 do item 6; prévia aprovada em 26/11/2026). Com
 * concessionária: o nome e "Trocar". Sem: aviso em âmbar com o seletor ali mesmo. Só quem atualiza a Engenharia da
 * obra (`podeEditar`) vê o seletor; a RPC confere de novo e grava o histórico.
 */
export function ConcessionariaDaObra({
  obraId,
  atual,
  opcoes,
  podeEditar,
  distribuidoraNegocio,
  checklist,
}: {
  obraId: string;
  atual: Opcao | null;
  opcoes: Opcao[];
  podeEditar: boolean;
  /** Texto da distribuidora informado no negócio, para explicar o aviso. */
  distribuidoraNegocio: string | null;
  /** Regra 7: sem checklist aplicado, checklist que troca (nada enviado) ou que fica (já houve envio). */
  checklist: "sem" | "trocavel" | "fica";
}) {
  const [trocando, setTrocando] = useState(false);

  if (!atual) {
    return (
      <section aria-label="Concessionária da obra" className="flex flex-col gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">Concessionária sem cadastro</p>
        <p>
          {distribuidoraNegocio
            ? `O negócio informou a distribuidora "${distribuidoraNegocio}", que não está entre as concessionárias da empresa.`
            : "O negócio não informou a distribuidora."}{" "}
          {AVISO_SEM_CONCESSIONARIA}
        </p>
        {podeEditar && <Seletor obraId={obraId} opcoes={opcoes} rotulo="Concessionária da obra" />}
      </section>
    );
  }

  return (
    <section aria-label="Concessionária da obra" className="painel flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="sobretitulo">Concessionária da obra</p>
          <p className="font-semibold text-texto">{atual.nome}</p>
        </div>
        {podeEditar && !trocando && (
          <Botao type="button" variante="secundario" onClick={() => setTrocando(true)}>
            Trocar
          </Botao>
        )}
      </div>
      {trocando && (
        <Seletor
          obraId={obraId}
          opcoes={opcoes.filter((o) => o.id !== atual.id)}
          rotulo="Trocar para"
          observacao={(nome) =>
            checklist === "trocavel"
              ? `Nenhum documento foi enviado: o checklist da obra será trocado pelo da ${nome}.`
              : checklist === "fica"
                ? `Esta obra já tem documento enviado: o checklist continua o da ${atual.nome}. Ajuste os itens à mão, se precisar.`
                : null
          }
          aoCancelar={() => setTrocando(false)}
          aoSalvar={() => setTrocando(false)}
        />
      )}
    </section>
  );
}

function Seletor({
  obraId,
  opcoes,
  rotulo,
  observacao,
  aoCancelar,
  aoSalvar,
}: {
  obraId: string;
  opcoes: Opcao[];
  rotulo: string;
  /** Texto sob o seletor, conforme a concessionária escolhida (nulo até escolher). */
  observacao?: (nome: string) => string | null;
  aoCancelar?: () => void;
  aoSalvar?: () => void;
}) {
  const [resultado, acao, pendente] = useActionState(definirConcessionariaObra, null);
  const [escolhida, setEscolhida] = useState("");
  const nomeEscolhida = opcoes.find((o) => o.id === escolhida)?.nome ?? null;
  const texto = nomeEscolhida && observacao ? observacao(nomeEscolhida) : null;
  useEffect(() => {
    if (resultado?.ok) aoSalvar?.();
  }, [resultado, aoSalvar]);

  if (opcoes.length === 0) return <p className="text-sm text-zinc-600">Não há outra concessionária cadastrada na empresa.</p>;
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-zinc-600">
          {rotulo}
          <select name="concessionariaId" required value={escolhida} onChange={(e) => setEscolhida(e.target.value)} className={CLASSE_ENTRADA}>
            <option value="" disabled>
              Escolha…
            </option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
        </Botao>
        {aoCancelar && (
          <Botao type="button" variante="secundario" onClick={aoCancelar} disabled={pendente}>
            Cancelar
          </Botao>
        )}
      </div>
      {texto && <p className="rounded-md bg-superficie-2 px-3 py-2 text-xs text-texto">{texto}</p>}
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
