"use client";

import { useActionState } from "react";
import { Botao, Campo, Cartao, Mensagem } from "@/components/ui";
import { salvarValidadePadraoProposta } from "@/lib/acoes/proposta-validade";

export function FormValidade({ validadeDias }: { validadeDias: number | null }) {
  const [resultado, acao, salvando] = useActionState(salvarValidadePadraoProposta, null);

  return (
    <Cartao titulo="Validade padrão da proposta">
      <form action={acao} className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600">
          Quando o vendedor emite uma proposta, o campo &quot;Válida até&quot; já vem preenchido com esse número de dias a partir de hoje.
          Vale sobre a &quot;Validade (dias)&quot; do modelo padrão de proposta; sem nenhum dos dois, o sistema usa 10 dias.
        </p>
        <Campo
          rotulo="Dias de validade"
          type="number"
          name="validade_dias"
          min={1}
          max={180}
          required
          defaultValue={validadeDias ?? 10}
        />
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={salvando} className="self-start">
          {salvando ? "Salvando..." : "Salvar"}
        </Botao>
      </form>
    </Cartao>
  );
}
