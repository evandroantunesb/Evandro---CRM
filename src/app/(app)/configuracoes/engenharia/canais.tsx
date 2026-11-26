"use client";

import { useActionState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import type { CanalConcessionaria } from "@/lib/engenharia-enquadramento-regras";
import { ROTULO_TIPO_SOLICITACAO, TIPOS_SOLICITACAO } from "@/lib/engenharia-protocolos-regras";
import { salvarCanal } from "./acoes-concessionarias";

const entrada = `min-w-0 text-sm ${CLASSE_ENTRADA}`;
const TIPOS_CANAL = TIPOS_SOLICITACAO.filter((t) => t !== "outro");
const ROTULO_TENSAO = { baixa: "Baixa", media: "Média" } as const;

/** Resumo do "vale para" de um canal, como na lista. */
function valePara(canal: CanalConcessionaria): string {
  if (canal.tipos.length === 0) return "sem condição";
  const tipos = canal.tipos.map((t) => ROTULO_TIPO_SOLICITACAO[t as keyof typeof ROTULO_TIPO_SOLICITACAO] ?? t).join(", ");
  const tensoes = canal.tensoes.map((t) => ROTULO_TENSAO[t as keyof typeof ROTULO_TENSAO] ?? t).join(" ou ");
  return tensoes ? `${tipos} (ligação nova e aumento de carga só em tensão ${tensoes.toLowerCase()})` : tipos;
}

/**
 * Canais de entrada da concessionária (só o admin; 20261224100000). Cada canal abre o próprio formulário; "Novo canal"
 * cria. Sem tipos, o canal vale para qualquer pedido e só aparece na lista do protocolo, sem ser sugerido.
 */
export function CanaisConcessionaria({ concessionariaId, canais }: { concessionariaId: string; canais: CanalConcessionaria[] }) {
  const proximaOrdem = (canais.at(-1)?.ordem ?? 0) + 10;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-600">
        Por onde o pedido entra na distribuidora. A Engenharia vê o canal sugerido no enquadramento da obra, pelas respostas,
        e escolhe o canal ao registrar o protocolo. Sem condição, o canal vale para qualquer pedido. Canal desativado sai da
        lista do protocolo; os protocolos antigos continuam com o nome gravado.
      </p>
      {canais.length === 0 && <p className="text-sm text-zinc-500">Nenhum canal cadastrado.</p>}
      <ul className="flex flex-col gap-2">
        {canais.map((c) => (
          <li key={c.id}>
            <details className="rounded-lg border border-linha px-3 py-2">
              <summary className="cursor-pointer text-sm">
                <span className={`font-medium ${c.ativo ? "text-texto" : "text-zinc-500 line-through"}`}>{c.nome}</span>
                <span className="text-zinc-600"> · {c.ativo ? valePara(c) : "desativado"}</span>
              </summary>
              <div className="pt-3">
                <FormCanal concessionariaId={concessionariaId} canal={c} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="rounded-lg border border-dashed border-linha px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-texto">Novo canal</summary>
        <div className="pt-3">
          <FormCanal concessionariaId={concessionariaId} ordem={proximaOrdem} />
        </div>
      </details>
    </div>
  );
}

function FormCanal({ concessionariaId, canal, ordem }: { concessionariaId: string; canal?: CanalConcessionaria; ordem?: number }) {
  const [resultado, acao, pendente] = useActionState(salvarCanal, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="concessionariaId" value={concessionariaId} />
      {canal && <input type="hidden" name="id" value={canal.id} />}
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-zinc-600">
          Nome
          <input name="nome" required maxLength={60} defaultValue={canal?.nome ?? ""} className={entrada} />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs text-zinc-600">
          Ordem
          <input name="ordem" type="number" min={0} max={9999} defaultValue={canal?.ordem ?? ordem ?? 0} className={entrada} />
        </label>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-zinc-600">Vale para o tipo de solicitação</legend>
        <div className="flex flex-wrap gap-2">
          {TIPOS_CANAL.map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2 rounded-full border border-linha px-3 text-sm md:min-h-9">
              <input type="checkbox" name="tipos" value={t} defaultChecked={canal?.tipos.includes(t) ?? false} />
              {ROTULO_TIPO_SOLICITACAO[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-zinc-600">Só em ligação nova e aumento de carga: tensão</legend>
        <div className="flex flex-wrap gap-2">
          {(["baixa", "media"] as const).map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-2 rounded-full border border-linha px-3 text-sm md:min-h-9">
              <input type="checkbox" name="tensoes" value={t} defaultChecked={canal?.tensoes.includes(t) ?? false} />
              {ROTULO_TENSAO[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" name="ativo" defaultChecked={canal?.ativo ?? true} /> Ativo
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : canal ? "Salvar canal" : "Criar canal"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
