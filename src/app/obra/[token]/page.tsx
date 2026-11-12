import type { Metadata } from "next";
import { Check } from "lucide-react";
import { formatarDiaMes } from "@/lib/formatacao";
import { ROTULO_ETAPA, etapaResolvida, linkWhatsApp } from "@/lib/obras/checklist";
import { carregarAcompanhamento, type EmpresaAcompanhamento } from "@/lib/obras/acompanhamento";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acompanhe sua obra", robots: { index: false, follow: false } };

const atualizado = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  return `${f({ day: "2-digit", month: "2-digit" })} às ${f({ hour: "2-digit", minute: "2-digit" })}`;
};

/** Página pública do cliente (quadro aprovado "SoloClienteObra", versão enxuta): mobile primeiro, sem login. */
export default async function AcompanheSuaObra({ params }: PageProps<"/obra/[token]">) {
  const { token } = await params;
  const a = await carregarAcompanhamento(token);

  if (a.tipo !== "ativa") {
    return (
      <Moldura empresa={a.tipo === "encerrada" ? a.empresa : null}>
        <p className="px-6 py-10 text-center text-base text-texto">
          {a.tipo === "encerrada" ? "Esta obra foi encerrada. Fale com a empresa." : "Link inválido ou trocado."}
        </p>
      </Moldura>
    );
  }

  const destaque = a.empresa.corDestaque ?? "#D4AF37";
  const pct = Math.round((a.andamento.resolvidas / 10) * 100);
  const atual = a.etapas.find((e) => e.etapa === a.andamento.atual);
  const whatsapp = linkWhatsApp(a.empresa.whatsapp, `Olá! Sou ${a.clientePrimeiroNome || "cliente"} e estou acompanhando a minha obra.`);
  const quando = atualizado(a.atualizadoEm);

  return (
    <Moldura
      empresa={a.empresa}
      topo={
        <>
          <p className="mt-6 text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: destaque }}>
            Acompanhe sua obra
          </p>
          <h1 className="mt-1.5 font-titulo text-[28px] leading-tight font-light">
            {a.clientePrimeiroNome ? `Olá, ${a.clientePrimeiroNome}.` : "Olá."}
            <br />
            {a.andamento.concluida ? "Sua usina foi entregue." : `Sua usina está ${pct}% pronta.`}
          </h1>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-offwhite/15" role="img" aria-label={`${pct}% pronta`}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: destaque }} />
          </div>
          {atual && (
            <p className="mt-2.5 text-[13px] text-offwhite/75">
              Agora: <b className="text-offwhite">{ROTULO_ETAPA[atual.etapa]}</b>
              {atual.previstaPara && `, prevista para ${formatarDiaMes(atual.previstaPara)}`}
            </p>
          )}
        </>
      }
    >
      <ol className="flex flex-col px-5 pt-5">
        {a.etapas.map((e, i) => {
          const resolvida = etapaResolvida(e);
          const ehAtual = e.etapa === a.andamento.atual;
          return (
            <li key={e.etapa} className="relative flex gap-3 pb-4 last:pb-2">
              {i < a.etapas.length - 1 && <span aria-hidden className={`absolute top-6 bottom-0 left-[11px] w-0.5 ${resolvida ? "bg-dourado" : "bg-linha"}`} />}
              <b
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${
                  resolvida ? "bg-dourado text-carvao" : ehAtual ? "bg-carvao text-offwhite ring-4 ring-dourado/30" : "bg-white text-texto-2 ring-2 ring-linha ring-inset"
                }`}
              >
                {resolvida ? <Check size={13} strokeWidth={2.5} /> : i + 1}
              </b>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={`text-sm ${resolvida || ehAtual ? "font-semibold text-texto" : "text-texto-2"}`}>{ROTULO_ETAPA[e.etapa]}</p>
                {e.feitaEm ? (
                  <p className="text-xs text-texto-2">{formatarDiaMes(e.feitaEm)}</p>
                ) : e.naoSeAplica ? (
                  <p className="text-xs text-texto-2">Não se aplica</p>
                ) : e.previstaPara ? (
                  <p className="text-xs text-dourado-texto">prevista para {formatarDiaMes(e.previstaPara)}</p>
                ) : null}
                {e.fotos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.fotos.map((url, n) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração do Storage */}
                        <img src={url} alt={`Foto ${n + 1} de ${ROTULO_ETAPA[e.etapa]}`} className="h-[54px] w-[72px] rounded-[10px] object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-2.5 px-4 pt-2 pb-7">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex min-h-[50px] items-center justify-center rounded-full bg-energia px-4 text-[15px] font-semibold text-white">
            Falar com {a.empresa.nome} no WhatsApp
          </a>
        )}
        {quando && <p className="text-center text-[11px] text-texto-2">Atualizado em {quando}</p>}
      </div>
    </Moldura>
  );
}

function Moldura({ empresa, topo, children }: { empresa: EmpresaAcompanhamento | null; topo?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-md bg-offwhite text-carvao">
      <header className="relative overflow-hidden px-5 pt-5 pb-7 text-offwhite" style={{ background: empresa?.corPrimaria ?? "#0F0F10" }}>
        {empresa?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração do Storage
          <img src={empresa.logoUrl} alt={empresa.nome} className="h-7 w-auto" />
        ) : (
          <span className="font-titulo text-sm font-bold tracking-[0.15em] uppercase">{empresa?.nome ?? "Acompanhe sua obra"}</span>
        )}
        {topo}
      </header>
      {children}
    </main>
  );
}
