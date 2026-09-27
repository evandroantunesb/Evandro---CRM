"use client";

import { useActionState } from "react";
import { Botao, Campo, Cartao, Mensagem, Selecao } from "@/components/ui";
import { renomearModeloProposta } from "@/lib/acoes/proposta-modelos";

const CAPAS = [
  { valor: "foto", rotulo: "Foto (residência com painéis)" },
  { valor: "minimalista", rotulo: "Minimalista (tipográfica)" },
  { valor: "tecnica", rotulo: "Técnica (projeto/sistema)" },
] as const;

export function DetalhesModelo({ modelo }: { modelo: { id: string; nome: string; descricao: string | null; capaVariante: string } }) {
  const [resultado, acao, salvando] = useActionState(renomearModeloProposta, null);
  return (
    <Cartao titulo="Detalhes do modelo">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={modelo.id} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome do modelo" name="nome" defaultValue={modelo.nome} required maxLength={80} />
          <Selecao rotulo="Capa" name="capa_variante" defaultValue={modelo.capaVariante}>
            {CAPAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </Selecao>
        </div>
        <Campo rotulo="Descrição (opcional)" name="descricao" defaultValue={modelo.descricao ?? ""} maxLength={300} />
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={salvando} className="self-start">
          {salvando ? "Salvando..." : "Salvar detalhes"}
        </Botao>
      </form>
    </Cartao>
  );
}
