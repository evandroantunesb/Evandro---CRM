"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { alternarEtapa, criarEtapa, criarFunil, renomear } from "./actions";

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

export function Renomear({ tabela, id, nome }: { tabela: "funis" | "etapas"; id: string; nome: string }) {
  const [resultado, acao, pendente] = useActionState(renomear, null);
  return (
    <form action={acao} className="flex min-w-0 flex-1 items-center gap-2">
      <input type="hidden" name="tabela" value={tabela} />
      <input type="hidden" name="id" value={id} />
      <input name="nome" defaultValue={nome} aria-label="Nome" className={inputClasse} required />
      <button disabled={pendente} className="text-sm text-zinc-600 hover:underline">
        Salvar
      </button>
      {resultado && !resultado.ok && <span className="text-sm text-red-700">{resultado.mensagem}</span>}
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
