"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { editarNegocio } from "@/lib/acoes/negocios";

type Opcao = { id: string; nome: string };

export function EdicaoNegocio({
  negocio,
  etapas,
  origens,
  responsaveis,
}: {
  negocio: {
    id: string;
    titulo: string;
    etapaId: string;
    origemId: string | null;
    responsavelId: string | null;
    valor: number | null;
    descricao: string | null;
  };
  etapas: Opcao[];
  origens: Opcao[];
  responsaveis: Opcao[];
}) {
  const [resultado, acao, pendente] = useActionState(editarNegocio, null);
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="negocioId" value={negocio.id} />
      <Campo rotulo="Nome do negócio" name="titulo" defaultValue={negocio.titulo} required />
      <Selecao rotulo="Etapa" name="etapa_id" defaultValue={negocio.etapaId}>
        {etapas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </Selecao>
      <Selecao rotulo="Origem" name="origem_id" defaultValue={negocio.origemId ?? ""}>
        <option value="">Sem origem</option>
        {origens.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </Selecao>
      {responsaveis.length > 0 && (
        <Selecao rotulo="Responsável" name="responsavel_id" defaultValue={negocio.responsavelId ?? ""}>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </Selecao>
      )}
      <Campo
        rotulo="Valor (R$)"
        name="valor"
        inputMode="decimal"
        defaultValue={negocio.valor != null ? String(negocio.valor).replace(".", ",") : ""}
      />
      <label className="flex flex-col gap-1 text-sm md:col-span-2">
        <span className="font-medium text-zinc-700">Descrição</span>
        <textarea
          name="descricao"
          rows={3}
          defaultValue={negocio.descricao ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2"
        />
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <Botao type="submit" disabled={pendente}>
          Salvar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
