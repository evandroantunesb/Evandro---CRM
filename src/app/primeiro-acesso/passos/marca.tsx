"use client";

import { useState, useTransition } from "react";
import { CamposMarcaCores } from "@/components/marca-cores";
import { Mensagem } from "@/components/ui";
import { CampoImagem } from "@/app/(app)/configuracoes/propostas/identidade/form-identidade";
import { salvarMarcaEmpresa } from "@/lib/acoes/dados-empresa";
import type { ResultadoAcao } from "@/lib/tipos";
import { BotaoContinuar } from "./botao";

/**
 * Passo 2, "Marca e cores" (quadro `OnboardingProMarca`): a logo de fundo escuro (a que aparece na barra) e as duas
 * cores com a prévia e o contraste. Grava na identidade da proposta, como em Configurações › Marca e cores.
 */
export function PassoMarca({
  empresaId,
  nomeEmpresa,
  logoEscuroCaminho,
  logoEscuroUrl,
  cores,
  continuar,
}: {
  empresaId: string;
  nomeEmpresa: string;
  logoEscuroCaminho: string | null;
  logoEscuroUrl: string | null;
  cores: { corPrimaria: string; corDestaque: string };
  continuar: () => Promise<void>;
}) {
  const [logo, setLogo] = useState(logoEscuroCaminho);
  const [valor, setValor] = useState(cores);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [enviando, iniciar] = useTransition();
  const enviar = () =>
    iniciar(async () => {
      const r = await salvarMarcaEmpresa({ logoEscuro: logo !== logoEscuroCaminho ? (logo ?? "") : null, ...valor });
      if (!r?.ok) return setResultado(r);
      await continuar();
    });

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-texto-2">
        Escolha a cor de destaque (botões, abas e gráficos) e a cor da barra lateral e da faixa do topo. O resto fica no padrão para manter a leitura fácil.
      </p>
      <section className="painel flex flex-col gap-5 p-5">
        <CampoImagem
          empresaId={empresaId}
          rotulo="Logo da empresa (para fundo escuro)"
          descricao="Aparece na barra lateral, nas propostas e nos contratos. PNG com fundo transparente."
          campo="logo_escuro_url"
          caminho={logo}
          setCaminho={setLogo}
          previewUrl={logoEscuroUrl}
        />
        <CamposMarcaCores corPrimaria={valor.corPrimaria} corDestaque={valor.corDestaque} onChange={setValor} logoUrl={logoEscuroUrl} nomeEmpresa={nomeEmpresa} />
      </section>
      <Mensagem resultado={resultado} />
      <BotaoContinuar onClick={enviar} enviando={enviando} />
    </div>
  );
}
