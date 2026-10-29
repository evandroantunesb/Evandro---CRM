"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { salvarValidadeProposta } from "./actions";

export function FormularioValidade({ validadeDias }: { validadeDias: number }) {
  const [resultado, acao, salvando] = useActionState(salvarValidadeProposta, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo
        rotulo="Validade padrão da proposta (dias)"
        name="validadeDias"
        type="number"
        inputMode="numeric"
        min={1}
        max={180}
        step={1}
        required
        defaultValue={validadeDias}
      />
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
