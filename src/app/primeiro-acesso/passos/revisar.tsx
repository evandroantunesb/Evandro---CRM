import Link from "next/link";
import { PASSOS, resumoDoPasso, type ChavePasso, type DadosRevisao } from "@/lib/assistente";
import { BotaoContinuar } from "./botao";

/**
 * Último passo, "Revisar e começar" (quadro `OnboardingRevisar`): o que ficou de cada passo, com "Editar" ou "Fazer
 * agora" no que foi pulado, os primeiros passos depois do assistente e "Começar a usar o Raion".
 */
export function PassoRevisar({
  passos,
  estados,
  dados,
  rever,
  concluir,
}: {
  passos: ChavePasso[];
  estados: Record<ChavePasso, "feito" | "pulado" | "pendente">;
  dados: DadosRevisao;
  rever: boolean;
  concluir: () => Promise<void>;
}) {
  const sufixo = rever ? "&rever=1" : "";
  const itens = passos.filter((p) => p !== "revisar");
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-texto-2">
        Confira o que ficou configurado. O que você pulou fica com o padrão do Raion e pode ser feito a qualquer hora em Configurações.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="painel flex flex-col p-5">
          <ul className="flex flex-col divide-y divide-linha">
            {itens.map((p) => {
              const pulado = estados[p] === "pulado";
              return (
                <li key={p} className="flex items-center gap-3.5 py-3 first:pt-0" data-testid={`revisar-${p}`}>
                  <span
                    aria-hidden
                    className={`grid size-[26px] shrink-0 place-items-center rounded-full text-xs ${pulado ? "bg-superficie-2 text-texto-2" : "bg-carvao text-dourado"}`}
                  >
                    {pulado ? "–" : "✓"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm text-texto">{PASSOS[p].titulo}</b>
                    <span className="block text-xs text-texto-2">{resumoDoPasso(p, pulado ? "pulado" : "feito", dados)}</span>
                  </span>
                  <Link href={`/primeiro-acesso?passo=${p}${sufixo}`} className="text-[13px] font-medium text-dourado-texto underline">
                    {pulado ? "Fazer agora" : "Editar"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl bg-[#0f0f10] p-5 text-[#faf8f3]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#faf8f3]/60 uppercase">Primeiros passos</p>
          <h2 className="font-titulo text-[17px] font-semibold">O que fazer depois</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-4 text-[13px] leading-relaxed text-[#faf8f3]/80">
            <li>Cadastre o primeiro negócio e monte a proposta.</li>
            <li>Ajuste o modelo de contrato em Configurações.</li>
            <li>Suba a tabela de preços do seu fornecedor.</li>
          </ol>
        </section>
      </div>
      <form action={concluir}>
        <BotaoContinuar rotulo={rever ? "Voltar a Configurações" : "Começar a usar o Raion"} />
      </form>
    </div>
  );
}
