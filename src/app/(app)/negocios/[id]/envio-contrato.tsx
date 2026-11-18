"use client";

import { useState } from "react";
import { Botao } from "@/components/ui";
import { linkWhatsAppContrato } from "@/lib/contrato-envio";

/** Contato do negócio: o WhatsApp abre a conversa dele. */
export type ClienteContrato = { nome: string | null; telefone: string | null };

/** Telefone com pelo menos 10 dígitos: o mesmo critério de `linkWhatsApp`. */
const telefoneValido = (telefone: string | null) => (telefone ?? "").replace(/\D/g, "").length >= 10;

export function EnvioContrato({ token, siteUrl, cliente }: { token: string; siteUrl: string; cliente: ClienteContrato }) {
  const [copiado, setCopiado] = useState(false);
  const link = `${siteUrl}/contrato/${token}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <a href={linkWhatsAppContrato(cliente, link)} target="_blank" rel="noopener noreferrer">
          <Botao type="button">Enviar no WhatsApp</Botao>
        </a>
        <a href={`/contrato/${token}/pdf`} target="_blank" rel="noopener noreferrer">
          <Botao type="button" variante="secundario">
            Baixar PDF
          </Botao>
        </a>
        <Botao
          type="button"
          variante="secundario"
          onClick={() => {
            navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          {copiado ? "Copiado!" : "Copiar link"}
        </Botao>
      </div>
      {telefoneValido(cliente.telefone) && (
        <p className="text-xs text-texto-2">
          Abre a conversa com {cliente.nome ?? "o cliente"} · {cliente.telefone}
        </p>
      )}
    </div>
  );
}
