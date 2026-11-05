"use client";

import { useActionState, useEffect, useState } from "react";
import { Botao, Mensagem, Selecao } from "@/components/ui";
import { desligarComTransferencia, type CarteiraAberta } from "./actions";
import type { MembroLinha } from "./formularios";

/** Aparece no lugar do painel da pessoa quando o admin pede para desligar: transfere a carteira em aberto antes. */
export function PainelDesligamento({
  membro,
  carteira,
  onCancelar,
}: {
  membro: MembroLinha;
  carteira: CarteiraAberta;
  onCancelar: () => void;
}) {
  const [resultado, acao, pendente] = useActionState(desligarComTransferencia, null);
  const [modo, setModo] = useState<"aleatorio" | "manual">("aleatorio");
  const [destinos, setDestinos] = useState<string[]>(carteira.vendedores.map((v) => v.id));
  const temNegocios = carteira.negocios.length > 0;
  const semDestino = temNegocios && carteira.vendedores.length === 0;

  useEffect(() => {
    if (resultado?.ok) onCancelar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado]);

  return (
    <form action={acao} className="flex flex-col gap-2 border-t border-zinc-100 bg-amber-50/60 py-3">
      <input type="hidden" name="membroId" value={membro.id} />
      <p className="text-sm font-medium text-zinc-900">
        Desligar {membro.nome || membro.email}
        {temNegocios ? ` — ${carteira.negocios.length} negócio(s) em aberto na carteira` : " — sem negócios em aberto na carteira"}
      </p>

      {semDestino && (
        <p className="text-sm text-red-700">
          Não há outro vendedor ativo pra receber a carteira. Ative alguém antes de desligar {membro.nome || "essa pessoa"}.
        </p>
      )}

      {temNegocios && !semDestino && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="radio" name="modo" value="aleatorio" checked={modo === "aleatorio"} onChange={() => setModo("aleatorio")} />
            Distribuir aleatoriamente entre:
          </label>
          {modo === "aleatorio" && (
            <div className="ml-6 flex flex-wrap gap-3">
              {carteira.vendedores.map((v) => (
                <label key={v.id} className="flex items-center gap-1 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    name="destinos"
                    value={v.id}
                    checked={destinos.includes(v.id)}
                    onChange={(e) =>
                      setDestinos((atual) => (e.target.checked ? [...atual, v.id] : atual.filter((id) => id !== v.id)))
                    }
                  />
                  {v.nome}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="radio" name="modo" value="manual" checked={modo === "manual"} onChange={() => setModo("manual")} />
            Escolher manualmente por negócio
          </label>
          {modo === "manual" && (
            <div className="ml-6 flex flex-col gap-1">
              {carteira.negocios.map((n) => (
                <label key={n.id} className="flex items-center gap-2 text-sm text-zinc-700">
                  <span className="w-56 truncate">
                    #{n.numero} — {n.contatoNome}
                  </span>
                  <Selecao name={`destino_${n.id}`} defaultValue={carteira.vendedores[0]?.id}>
                    {carteira.vendedores.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nome}
                      </option>
                    ))}
                  </Selecao>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {!temNegocios && <input type="hidden" name="modo" value="aleatorio" />}

      <div className="flex items-center gap-2">
        <Botao type="submit" variante="perigo" disabled={pendente || semDestino}>
          {pendente ? "Desligando..." : "Confirmar e desligar"}
        </Botao>
        <Botao type="button" variante="secundario" onClick={onCancelar} disabled={pendente}>
          Cancelar
        </Botao>
      </div>
      {resultado && !resultado.ok && <Mensagem resultado={resultado} />}
    </form>
  );
}
