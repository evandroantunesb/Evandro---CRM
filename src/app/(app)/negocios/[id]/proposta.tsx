"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { definirModoPreco, gerarLinkProposta } from "@/lib/acoes/propostas";
import { formatarDataHora } from "@/lib/formatacao";
import { MODOS_PRECO, ROTULO_MODO_PRECO, type ModoPreco } from "@/lib/tipos";

export type PropostaSalva = {
  token: string;
  modoPreco: ModoPreco;
  aberturas: number;
  ultimaAbertura: string | null;
};

export function Proposta({
  negocioId,
  temCalculo,
  proposta,
  siteUrl,
}: {
  negocioId: string;
  temCalculo: boolean;
  proposta: PropostaSalva | null;
  siteUrl: string;
}) {
  const [resultadoGerar, acaoGerar, gerando] = useActionState(gerarLinkProposta, null);
  const [resultadoModo, acaoModo] = useActionState(definirModoPreco, null);
  const [copiado, setCopiado] = useState(false);

  if (!temCalculo) {
    return <p className="text-sm text-zinc-600">Calcule o kit acima para poder gerar a proposta.</p>;
  }

  if (!proposta) {
    return (
      <form action={acaoGerar} className="flex flex-col gap-3">
        <input type="hidden" name="negocioId" value={negocioId} />
        <p className="text-sm text-zinc-600">Gere um link para enviar a proposta ao cliente, sem precisar de PDF.</p>
        <Mensagem resultado={resultadoGerar} />
        <Botao type="submit" disabled={gerando} className="self-start">
          {gerando ? "Gerando..." : "Gerar link da proposta"}
        </Botao>
      </form>
    );
  }

  const link = `${siteUrl}/proposta/${proposta.token}`;
  const linkWhatsapp = `https://wa.me/?text=${encodeURIComponent(`Segue a proposta: ${link}`)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700">Link da proposta</span>
        <div className="flex flex-wrap gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 outline-none"
          />
          <Botao
            type="button"
            variante="secundario"
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
          >
            {copiado ? "Copiado!" : "Copiar"}
          </Botao>
          <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer">
            <Botao type="button">Enviar no WhatsApp</Botao>
          </a>
          <a href={`/proposta/${proposta.token}/pdf`} target="_blank" rel="noopener noreferrer">
            <Botao type="button" variante="secundario">
              Baixar PDF
            </Botao>
          </a>
        </div>
      </div>

      <form action={acaoModo} className="flex items-end gap-2">
        <input type="hidden" name="negocioId" value={negocioId} />
        <Selecao rotulo="Como mostrar o preço" name="modoPreco" defaultValue={proposta.modoPreco}>
          {MODOS_PRECO.map((m) => (
            <option key={m} value={m}>
              {ROTULO_MODO_PRECO[m]}
            </option>
          ))}
        </Selecao>
        <Botao type="submit" variante="secundario">
          Salvar
        </Botao>
      </form>
      <Mensagem resultado={resultadoModo} />

      <p className="text-sm text-zinc-600">
        {proposta.aberturas === 0
          ? "O cliente ainda não abriu o link."
          : `Aberta ${proposta.aberturas} ${proposta.aberturas === 1 ? "vez" : "vezes"}${
              proposta.ultimaAbertura ? ` · última em ${formatarDataHora(proposta.ultimaAbertura)}` : ""
            }`}
      </p>
    </div>
  );
}
