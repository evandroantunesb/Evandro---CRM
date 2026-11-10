"use client";

import { useActionState, useState } from "react";
import { CartaoTelasOpcionais } from "@/components/telas-empresa";
import { Botao, Mensagem } from "@/components/ui";
import { salvarTelasEmpresa } from "@/lib/acoes/telas-empresa";
import { TELAS_OPCIONAIS, type TelaOpcional } from "@/lib/telas-empresa";

/** Chaves das telas opcionais e "Salvar" (grava a lista inteira de desligadas). */
export function FormularioTelas({ ligadasIniciais, eletropostoLiberado }: { ligadasIniciais: TelaOpcional[]; eletropostoLiberado: boolean }) {
  const [ligadas, setLigadas] = useState<TelaOpcional[]>(ligadasIniciais);
  const [resultado, acao, enviando] = useActionState(salvarTelasEmpresa, null);
  // Sem liberação do super-admin, o Eletroposto não entra na lista: a chave nem aparece.
  const desligadas = TELAS_OPCIONAIS.filter((t) => !ligadas.includes(t) && (t !== "eletroposto" || eletropostoLiberado));
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="desligadas" value={JSON.stringify(desligadas)} />
      <CartaoTelasOpcionais ligadas={ligadas} eletropostoLiberado={eletropostoLiberado} onChange={setLigadas} />
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
