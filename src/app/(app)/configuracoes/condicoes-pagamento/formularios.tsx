"use client";

import { useActionState, useState } from "react";
import { Botao, CLASSE_ENTRADA, Campo, Mensagem } from "@/components/ui";
import { MAX_PARCELAS, ROTULO_MEIO_PARCELAMENTO, type MeioParcelamento, type PreferenciasCondicoes, type TaxaParcela } from "@/lib/condicoes-pagamento";
import { salvarPreferenciasCondicoes, salvarTaxasParcelamento } from "./actions";

const formatar = (n: number) => String(n).replace(".", ",");

export function FormularioPreferencias({ preferencias }: { preferencias: PreferenciasCondicoes }) {
  const [resultado, acao, salvando] = useActionState(salvarPreferenciasCondicoes, null);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          rotulo="Desconto máximo do vendedor (%)"
          name="descontoMaxVendedor"
          inputMode="decimal"
          defaultValue={formatar(preferencias.descontoMaxVendedor)}
        />
        <Campo rotulo="Desconto máximo do gestor (%)" name="descontoMaxGestor" inputMode="decimal" defaultValue={formatar(preferencias.descontoMaxGestor)} />
      </div>
      <p className="text-xs text-texto-2">
        Até esse percentual, o desconto à vista sai direto na proposta. Acima dele, o vendedor ou o gestor pede aprovação. O admin não tem limite.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="personalizadoAtivo" defaultChecked={preferencias.personalizadoAtivo} className="mt-0.5" />
        <span>
          <span className="font-medium text-texto">Permitir condição Personalizada</span>
          <span className="block text-xs text-texto-2">
            O vendedor monta um acordo em partes (por exemplo, entrada no PIX e o restante ao final da instalação).
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function FormularioTaxas({ meio, taxas }: { meio: MeioParcelamento; taxas: TaxaParcela[] }) {
  const [resultado, acao, salvando] = useActionState(salvarTaxasParcelamento, null);
  const [marcadas, setMarcadas] = useState(() => new Set(taxas.map((t) => t.parcelas)));
  const taxaDe = new Map(taxas.map((t) => [t.parcelas, t.taxa]));
  const rotulo = ROTULO_MEIO_PARCELAMENTO[meio];

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="meio" value={meio} />
      <p className="text-xs text-texto-2">
        Marque as parcelas que a empresa oferece no {rotulo.toLowerCase()} e a taxa que a operadora desconta em cada uma. Nenhuma marcada: o{" "}
        {rotulo.toLowerCase()} não aparece para o vendedor.
      </p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((n) => {
          const ativa = marcadas.has(n);
          return (
            <div key={n} className="flex items-center gap-3">
              <label className="flex w-16 items-center gap-2 text-sm font-medium text-texto">
                <input
                  type="checkbox"
                  name={`disponivel_${n}`}
                  checked={ativa}
                  onChange={(e) =>
                    setMarcadas((atual) => {
                      const nova = new Set(atual);
                      if (e.target.checked) nova.add(n);
                      else nova.delete(n);
                      return nova;
                    })
                  }
                />
                {n}x
              </label>
              <label className="flex flex-1 items-center gap-2 text-sm text-texto-2">
                <span className="sr-only">Taxa em {n}x (%)</span>
                <input
                  name={`taxa_${n}`}
                  inputMode="decimal"
                  disabled={!ativa}
                  defaultValue={taxaDe.has(n) ? formatar(taxaDe.get(n)!) : ""}
                  placeholder="0"
                  className={`${CLASSE_ENTRADA} w-24`}
                />
                %
              </label>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : `Salvar ${rotulo.toLowerCase()}`}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
