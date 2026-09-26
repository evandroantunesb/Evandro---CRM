"use client";

import { useActionState, useState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { alternarFormulario } from "./actions";

export function LinkFormulario({
  formulario,
  link,
  qrCode,
}: {
  formulario: { id: string; nome: string; funil: string; origem: string; ativo: boolean };
  link: string;
  qrCode: string;
}) {
  const [resultado, acao, pendente] = useActionState(alternarFormulario, null);
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-100 py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada localmente, sem otimização de imagem remota. */}
      <img src={qrCode} alt={`QR Code do formulário ${formulario.nome}`} width={112} height={112} className="rounded-md border border-zinc-200" />
      <div className="flex flex-1 flex-col gap-2">
        <div>
          <p className="font-medium text-zinc-900">{formulario.nome}</p>
          <p className="text-xs text-zinc-500">
            {formulario.funil} · {formulario.origem}
          </p>
        </div>
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
            {copiado ? "Copiado!" : "Copiar link"}
          </Botao>
        </div>
        <form action={acao} className="flex items-center gap-2">
          <input type="hidden" name="id" value={formulario.id} />
          <label className="flex items-center gap-1 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={formulario.ativo}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              disabled={pendente}
            />{" "}
            Ativo (aceitando envios)
          </label>
          {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
        </form>
      </div>
    </div>
  );
}
