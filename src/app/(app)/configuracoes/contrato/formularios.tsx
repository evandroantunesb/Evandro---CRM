"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { salvarModeloContrato } from "@/lib/acoes/contratos";

export function FormularioModeloContrato({ conteudoInicial }: { conteudoInicial: string }) {
  const [resultado, acao, pendente] = useActionState(salvarModeloContrato, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <textarea
        name="conteudo"
        defaultValue={conteudoInicial}
        rows={16}
        placeholder={"Ex.: Pelo presente instrumento, {{empresa_nome}}, CNPJ {{empresa_cnpj}}, e {{cliente_nome}}..."}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-carvao outline-none placeholder:text-zinc-400 focus:border-dourado focus:ring-2 focus:ring-dourado/20"
      />
      <div className="flex items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          Salvar modelo
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
