"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { formatarNumeroBr } from "@/lib/formatacao";
import { salvarDeducoesObra } from "./actions";

/** Impostos e comissões, em % da venda; aparecem somados como "Impostos e comissões" no lucro da obra. */
export function FormularioDeducoes({ impostos, comissoes }: { impostos: number; comissoes: number }) {
  const [resultado, acao, pendente] = useActionState(salvarDeducoesObra, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Impostos (% da venda)" name="impostos_percentual" inputMode="decimal" defaultValue={formatarNumeroBr(impostos)} placeholder="0" />
        <Campo rotulo="Comissões (% da venda)" name="comissoes_percentual" inputMode="decimal" defaultValue={formatarNumeroBr(comissoes)} placeholder="0" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
