"use client";

import { useActionState, useState } from "react";
import { CartaoSetoresObra, CartaoTelasOpcionais } from "@/components/telas-empresa";
import { Botao, Mensagem } from "@/components/ui";
import { salvarTelasEmpresa } from "@/lib/acoes/telas-empresa";
import { TELAS_OPCIONAIS, type SetorDesligavel, type TelaOpcional } from "@/lib/telas-empresa";

/** Chaves das telas opcionais e dos setores da obra e "Salvar" (grava as duas listas inteiras de desligados). */
export function FormularioTelas({
  ligadasIniciais,
  setoresDesligadosIniciais,
  eletropostoLiberado,
}: {
  ligadasIniciais: TelaOpcional[];
  setoresDesligadosIniciais: SetorDesligavel[];
  eletropostoLiberado: boolean;
}) {
  const [ligadas, setLigadas] = useState<TelaOpcional[]>(ligadasIniciais);
  const [setoresDesligados, setSetoresDesligados] = useState<SetorDesligavel[]>(setoresDesligadosIniciais);
  const [resultado, acao, enviando] = useActionState(salvarTelasEmpresa, null);
  // Sem liberação do super-admin, o Eletroposto não entra na lista: a chave nem aparece.
  const desligadas = TELAS_OPCIONAIS.filter((t) => !ligadas.includes(t) && (t !== "eletroposto" || eletropostoLiberado));
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="desligadas" value={JSON.stringify(desligadas)} />
      <input type="hidden" name="setores_desligados" value={JSON.stringify(setoresDesligados)} />
      <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
        <CartaoTelasOpcionais ligadas={ligadas} eletropostoLiberado={eletropostoLiberado} onChange={setLigadas} />
        <CartaoSetoresObra desligados={setoresDesligados} obrasLigada={ligadas.includes("obras")} onChange={setSetoresDesligados} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
