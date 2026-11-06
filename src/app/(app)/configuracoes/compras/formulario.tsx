"use client";

import { useActionState } from "react";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { definirAtendimentoCompras } from "@/lib/acoes/compras";

export function FormularioAtendimentoCompras({ atual }: { atual: string }) {
  const [resultado, acao, pendente] = useActionState(definirAtendimentoCompras, null);
  const enviar = useEnvioSemReset(acao);
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Selecao rotulo="Sem ninguém em Compras, quem atende" name="setor" defaultValue={atual}>
          <option value="administrativo">Administrativo</option>
          <option value="operacional">Operacional</option>
          <option value="nenhum">Só admin e gestor</option>
        </Selecao>
      </div>
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar"}
      </Botao>
      <Mensagem resultado={resultado} />
    </form>
  );
}
