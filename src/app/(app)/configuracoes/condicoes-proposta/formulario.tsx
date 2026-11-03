"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { salvarCondicoesComerciais } from "@/lib/acoes/propostas-condicoes";
import { LIMITES_SIMPLES, PRAZOS_VALIDADE } from "@/lib/propostas/proposta-simples";

export type CondicoesIniciais = { validadeDias: number | null; avista: string; cartao: string; financiamento: string };

export function FormularioCondicoes({ inicial }: { inicial: CondicoesIniciais }) {
  const [resultado, acao, salvando] = useActionState(salvarCondicoesComerciais, null);
  return (
    <form action={acao} className="flex flex-col gap-3" data-testid="form-condicoes-proposta">
      <Selecao rotulo="Validade da proposta" name="validadeDias" defaultValue={inicial.validadeDias?.toString() ?? ""}>
        <option value="">Não configurada (emissão bloqueada)</option>
        {PRAZOS_VALIDADE.map((d) => (
          <option key={d} value={d}>
            {d} dias a partir da emissão
          </option>
        ))}
      </Selecao>
      <Campo rotulo="À vista" name="pagamentoAvista" defaultValue={inicial.avista} maxLength={LIMITES_SIMPLES.pagamento} placeholder="ex.: Pix ou transferência" />
      <Campo rotulo="Cartão" name="pagamentoCartao" defaultValue={inicial.cartao} maxLength={LIMITES_SIMPLES.pagamento} placeholder="ex.: em até 12x" />
      <Campo
        rotulo="Financiamento"
        name="pagamentoFinanciamento"
        defaultValue={inicial.financiamento}
        maxLength={LIMITES_SIMPLES.pagamento}
        placeholder="ex.: bancário, sujeito a análise de crédito"
      />
      <p className="text-xs text-zinc-500">
        As três formas aparecem juntas em toda proposta; o vendedor não escolhe uma nem edita o texto. Até {LIMITES_SIMPLES.pagamento} caracteres
        cada. Com qualquer campo vazio, a emissão fica bloqueada.
      </p>
      <Mensagem resultado={resultado} />
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Salvar"}
      </Botao>
    </form>
  );
}
