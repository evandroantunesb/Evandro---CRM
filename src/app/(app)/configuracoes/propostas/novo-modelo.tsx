"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao, Campo, Cartao, Mensagem, Selecao } from "@/components/ui";
import { criarModeloProposta } from "@/lib/acoes/proposta-modelos";

const BASES = [
  { valor: "comercial", rotulo: "Comercial (3 páginas, referência)" },
  { valor: "expressa", rotulo: "Expressa (2 páginas)" },
  { valor: "completa", rotulo: "Completa" },
  { valor: "em_branco", rotulo: "Em branco" },
] as const;

const CAPAS = [
  { valor: "foto", rotulo: "Foto (residência com painéis)" },
  { valor: "minimalista", rotulo: "Minimalista (tipográfica)" },
  { valor: "tecnica", rotulo: "Técnica (projeto/sistema)" },
] as const;

function NovoModelo() {
  const [resultado, acao, criando] = useActionState(criarModeloProposta, null);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <Campo rotulo="Nome do modelo" name="nome" placeholder="Ex.: Comercial padrão" required maxLength={80} />
      <Campo rotulo="Descrição (opcional)" name="descricao" maxLength={300} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Selecao rotulo="Base inicial" name="base" defaultValue="comercial">
          {BASES.map((b) => (
            <option key={b.valor} value={b.valor}>
              {b.rotulo}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Capa" name="capa_variante" defaultValue="foto">
          {CAPAS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </Selecao>
      </div>
      <Mensagem resultado={resultado} />
      <Botao type="submit" disabled={criando} className="self-start">
        {criando ? "Criando..." : "Criar modelo"}
      </Botao>
    </form>
  );
}

export function NovoModeloColapsavel() {
  const [aberto, setAberto] = useState(false);
  return (
    <Cartao
      titulo="Novo modelo"
      acao={
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="inline-flex items-center gap-1 text-sm font-medium text-carvao hover:text-dourado"
        >
          {aberto ? "Fechar" : "Criar modelo"}
          <ChevronDown size={14} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
      }
    >
      {aberto ? <NovoModelo /> : <p className="text-sm text-zinc-500">Clique em &quot;Criar modelo&quot; para montar um novo modelo de proposta.</p>}
    </Cartao>
  );
}
