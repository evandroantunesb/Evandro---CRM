"use client";

import { useState, useTransition } from "react";
import { Campo, Mensagem } from "@/components/ui";
import { salvarDadosEmpresa } from "@/lib/acoes/dados-empresa";
import type { ResultadoAcao } from "@/lib/tipos";
import { BotaoContinuar } from "./botao";

/** Passo 1, "Sua empresa" (quadro `OnboardingEmpresa`): nome de exibição, CNPJ e WhatsApp, e onde cada um aparece. */
export function PassoEmpresa({ inicial, continuar }: { inicial: { nome: string; cnpj: string; whatsapp: string }; continuar: () => Promise<void> }) {
  const [dados, setDados] = useState(inicial);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [enviando, iniciar] = useTransition();
  const enviar = () =>
    iniciar(async () => {
      const r = await salvarDadosEmpresa(dados);
      if (!r?.ok) return setResultado(r);
      await continuar();
    });

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-texto-2">O nome que a equipe e os clientes veem, o CNPJ dos contratos e o WhatsApp que vai nas propostas.</p>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="painel flex flex-col gap-3.5 p-5">
          <h2 className="font-titulo text-[17px] font-semibold">Dados da empresa</h2>
          <Campo rotulo="Nome de exibição" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} maxLength={120} />
          <Campo rotulo="CNPJ" inputMode="numeric" value={dados.cnpj} onChange={(e) => setDados({ ...dados, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          <Campo
            rotulo="WhatsApp de contato (com DDD)"
            inputMode="tel"
            value={dados.whatsapp}
            onChange={(e) => setDados({ ...dados, whatsapp: e.target.value })}
            placeholder="(19) 99999-9999"
          />
          <p className="text-xs text-texto-2">O nome de exibição pode ser diferente da razão social. O CNPJ vai no contrato.</p>
        </section>
        <section className="painel flex flex-col gap-3 p-5 text-sm">
          <h2 className="font-titulo text-[17px] font-semibold">Onde isso aparece</h2>
          <p>
            <b>Barra lateral e Início</b> — o nome, enquanto não houver logo.
          </p>
          <p>
            <b>Proposta</b> — nome e WhatsApp no topo e no fechamento.
          </p>
          <p>
            <b>Contrato</b> — nome e CNPJ da empresa contratada.
          </p>
        </section>
      </div>
      <Mensagem resultado={resultado} />
      <BotaoContinuar onClick={enviar} enviando={enviando} />
    </div>
  );
}
