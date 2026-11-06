"use client";

import { useEffect, useState } from "react";
import { DadosNfCliente } from "@/components/financeiro/dados-nf-cliente";
import { buscarDadosNfCliente } from "@/lib/acoes/dados-nf-cliente";
import type { NfClienteObraVM } from "@/lib/financeiro/dados-nf-cliente";

type Estado = { tipo: "carregando" } | { tipo: "erro" } | { tipo: "pronto"; dados: NfClienteObraVM | null };

/** "Dados e documentos" da linha da NF do cliente: busca ao abrir (prévia P2c "Administrativo: dados e documentos para a NF"). */
export function DadosNfLinha({ obra }: { obra: { obraId: string; empresaId: string } }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  useEffect(() => {
    let ativo = true;
    buscarDadosNfCliente(obra.obraId).then(
      (dados) => ativo && setEstado({ tipo: "pronto", dados }),
      () => ativo && setEstado({ tipo: "erro" }),
    );
    return () => {
      ativo = false;
    };
  }, [obra.obraId]);

  if (estado.tipo === "carregando") return <p className="text-sm text-texto-2">Carregando os dados do cliente...</p>;
  if (estado.tipo === "erro") return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Não foi possível carregar os dados do cliente.</p>;
  if (!estado.dados) return <p className="text-sm text-texto-2">Os dados do cliente ficam visíveis para quem atua no Administrativo desta obra.</p>;
  return (
    <div className="rounded-xl bg-superficie-2 p-4">
      <DadosNfCliente obra={obra} dados={estado.dados} />
    </div>
  );
}
