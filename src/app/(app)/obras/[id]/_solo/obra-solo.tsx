import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { env } from "@/lib/env";
import { ROTULO_ETAPA } from "@/lib/obras/checklist";
import type { ObraSoloVM } from "@/lib/obras/solo-dados";
import { BotaoWhatsApp, ChecklistSolo } from "./checklist";
import { LinkCliente } from "./link-cliente";

const kwp = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)} kWp`;
const reais = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

/** Ficha da obra do Solo (quadro aprovado "SoloChecklist"): faixa, checklist, andamento, link do cliente e dados. */
export function ObraSolo({ obra: o, empresaId, hoje }: { obra: ObraSoloVM; empresaId: string; hoje: string }) {
  const link = o.linkCliente ? `${env.siteUrl}/obra/${o.linkCliente}` : null;
  const contexto = { obraId: o.id, empresaId, clienteNome: o.clienteNome, link, telefone: o.telefoneCliente };
  const posicaoAtual = o.andamento.atual ? o.etapas.findIndex((e) => e.etapa === o.andamento.atual) + 1 : null;
  const atual = o.etapas.find((e) => e.etapa === o.andamento.atual);
  const ultimaFeita = [...o.etapas].reverse().find((e) => e.feitaEm != null);
  const contrato = o.etapas.find((e) => e.etapa === "contrato")?.feitaEm;
  const dias = contrato ? Math.max(0, Math.round((Date.parse(hoje) - Date.parse(contrato)) / 86_400_000)) : null;
  const pct = Math.round((o.andamento.resolvidas / 10) * 100);
  const circunferencia = 2 * Math.PI * 42;
  const local = [o.cidade, o.uf].filter(Boolean).join(" / ");

  return (
    <div className="mx-auto flex max-w-6xl animate-entrar flex-col gap-4">
      <CabecalhoPagina
        detalhe
        voltar={{ href: "/obras", rotulo: "Obras" }}
        sobretitulo={["Obra", `#${o.numero}`, local].filter(Boolean).join(" · ")}
        titulo={[o.clienteNome || `Obra #${o.numero}`, o.potenciaKwp != null ? kwp(o.potenciaKwp) : null].filter(Boolean).join(" · ")}
        selos={
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-dourado px-2.5 py-1 text-xs font-medium text-carvao">
              {o.situacao === "entregue"
                ? "Entregue"
                : o.situacao === "cancelada"
                  ? "Cancelada"
                  : o.situacao === "pausada"
                    ? "Pausada"
                    : `Etapa ${posicaoAtual} de 10 · ${atual ? ROTULO_ETAPA[atual.etapa] : ""}`}
            </span>
            {dias != null && <span className="rounded-full bg-white/12 px-2.5 py-1 text-xs text-offwhite">{dias === 1 ? "1 dia" : `${dias} dias`} desde o contrato</span>}
          </div>
        }
        acoes={ultimaFeita && <BotaoWhatsApp etapa={ultimaFeita.etapa} contexto={contexto} className="text-offwhite" />}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChecklistSolo etapas={o.etapas} atual={o.andamento.atual} contexto={contexto} />
        <div className="flex flex-col gap-4">
          <section className="flex items-center gap-5 rounded-3xl bg-carvao p-5 text-offwhite">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-offwhite/12" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  strokeWidth="9"
                  strokeLinecap="round"
                  className="stroke-dourado"
                  strokeDasharray={circunferencia}
                  strokeDashoffset={circunferencia * (1 - pct / 100)}
                />
              </svg>
              <b className="absolute inset-0 grid place-items-center font-titulo text-2xl font-light">{pct}%</b>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-offwhite/70 uppercase">Andamento</p>
              <p className="font-titulo text-lg font-semibold">{o.andamento.resolvidas} de 10 etapas</p>
              {atual && (
                <p className="mt-1.5 text-sm text-offwhite/75">
                  Agora: <b className="text-offwhite">{ROTULO_ETAPA[atual.etapa]}</b>
                  {atual.previstaPara && (
                    <>
                      <br />
                      prevista para {atual.previstaPara.slice(8, 10)}/{atual.previstaPara.slice(5, 7)}
                    </>
                  )}
                </p>
              )}
            </div>
          </section>
          <LinkCliente obraId={o.id} link={link} primeiroNome={o.clienteNome.trim().split(/\s+/)[0] ?? ""} />
          <section className="painel p-5">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-texto-2 uppercase">Só você vê</p>
            <h2 className="mb-3 font-titulo text-[17px] font-semibold text-texto">Dados da obra</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3.5 gap-y-2 text-sm">
              <dt className="text-texto-2">Potência</dt>
              <dd>{o.potenciaKwp != null ? kwp(o.potenciaKwp) : "—"}</dd>
              <dt className="text-texto-2">UC</dt>
              <dd>{o.unidadeConsumidora || "—"}</dd>
              <dt className="text-texto-2">Valor</dt>
              <dd className="tabular-nums">{o.valorVendido != null ? reais(o.valorVendido) : "—"}</dd>
              <dt className="text-texto-2">Cliente</dt>
              <dd>{o.telefoneCliente || "sem telefone"}</dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
