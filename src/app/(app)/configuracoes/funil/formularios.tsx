"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { CAMPOS_OBRIGATORIOS, ROTULO_CAMPO_OBRIGATORIO } from "@/lib/tipos";
import {
  alternarEtapa,
  criarEtapa,
  criarFunil,
  definirCamposObrigatorios,
  definirCorEtapa,
  definirDiasConsideradoParado,
  definirHorasConsideradoSemContato,
  renomear,
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

/** Cor de acento da etapa, mostrada na coluna do Kanban. */
export function CorEtapa({ etapaId, cor }: { etapaId: string; cor: string | null }) {
  return (
    <form action={definirCorEtapa} className="flex items-center gap-1" title="Cor da etapa no Kanban">
      <input type="hidden" name="etapaId" value={etapaId} />
      <input
        type="color"
        name="cor"
        defaultValue={cor ?? "#a1a1aa"}
        aria-label="Cor da etapa"
        className="h-6 w-6 cursor-pointer rounded border border-zinc-300 p-0"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}

export function CamposObrigatorios({ etapaId, campos }: { etapaId: string; campos: string[] }) {
  const [resultado, acao, pendente] = useActionState(definirCamposObrigatorios, null);
  return (
    <details className="w-full pl-7 text-sm">
      <summary className="cursor-pointer text-zinc-600">
        Campos obrigatórios para entrar nesta etapa
        {campos.length > 0 &&
          ` (${campos.map((c) => ROTULO_CAMPO_OBRIGATORIO[c as keyof typeof ROTULO_CAMPO_OBRIGATORIO] ?? c).join(", ")})`}
      </summary>
      <form action={acao} className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <input type="hidden" name="etapaId" value={etapaId} />
        {CAMPOS_OBRIGATORIOS.map((c) => (
          <label key={c} className="flex items-center gap-1 text-zinc-700">
            <input type="checkbox" name="campos" value={c} defaultChecked={campos.includes(c)} />
            {ROTULO_CAMPO_OBRIGATORIO[c]}
          </label>
        ))}
        <Botao type="submit" variante="secundario" disabled={pendente}>
          Salvar campos
        </Botao>
        <Mensagem resultado={resultado} />
      </form>
    </details>
  );
}
