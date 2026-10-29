import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CustosPorCategoria, ResultadoFinanceiro } from "@/components/obras/apresentacao/financeiro";
import { Gantt, LegendaGantt } from "@/components/obras/apresentacao/gantt";
import { PalcoApresentacao } from "@/components/obras/apresentacao/palco";
import { ModosObras } from "@/components/obras/modos-obras";
import { NavegacaoObras } from "@/components/obras/navegacao-obras";
import { formatarMoeda } from "@/lib/crm";
import { carregarApresentacaoObra, hojeBrasilia } from "@/lib/obras/apresentacao/dados";
import type { ApresentacaoObraVM } from "@/lib/obras/apresentacao/tipos";
import { carregarObras } from "@/lib/obras/dados";
import { filtrosDeParams, hrefObra, montarNavegacao, queryDosFiltros } from "@/lib/obras/navegacao";
import { ROTULO_SETOR, ROTULO_SITUACAO_OBRA } from "@/lib/obras/rotulos";
import { OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const BASE = "/obras/apresentacao";
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const kwp = (v: number | null) => (v == null ? null : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)} kWp`);

/**
 * Modo Apresentação (OPR 3B, V1): visão executiva de UMA obra, somente leitura, navegável como
 * slides pela lista filtrada (mesma empresa, RLS e filtros da listagem). Blocos sem fonte real
 * (prazo, avanço, cronograma, custos, margem) mostram estado vazio; o conteúdo fictício só
 * aparece com a demonstração local ligada, sempre com o selo "Dados fictícios".
 */
export default async function ApresentacaoObra({ params, searchParams }: PageProps<"/obras/apresentacao/[id]">) {
  const { atual } = await exigirPapel(...OBRAS);
  const { id } = await params;
  const filtros = filtrosDeParams(await searchParams);
  const query = queryDosFiltros(filtros);
  const hoje = hojeBrasilia();

  const supabase = await criarClienteServidor();
  const [obra, lista] = await Promise.all([
    carregarApresentacaoObra(supabase, { empresaId: atual.empresaId, papel: atual.papel, obraId: id, hojeIso: hoje }),
    carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel, comResponsaveis: false }),
  ]);
  if (!obra) notFound();
  const navegacao = montarNavegacao(lista.obras, filtros, id);
  const href = (destino: string | null) => (destino ? hrefObra(BASE, destino, query) : null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PalcoApresentacao
        anteriorHref={href(navegacao.anteriorId)}
        proximaHref={href(navegacao.proximaId)}
        barra={
          <>
            <ModosObras modo="apresentacao" hrefGestao={hrefObra("/obras", id, query)} hrefApresentacao={hrefObra(BASE, id, query)} />
            {/* key: o seletor recomeça a cada obra. */}
            <NavegacaoObras key={id} navegacao={navegacao} atualId={id} base={BASE} query={query} />
          </>
        }
      >
        <Slide obra={obra} hoje={hoje} />
      </PalcoApresentacao>
    </div>
  );
}

function Slide({ obra, hoje }: { obra: ApresentacaoObraVM; hoje: string }) {
  const responsaveis = obra.setores.filter((s) => s.responsavel);
  return (
    <article aria-label={`Apresentação da obra ${obra.numero}`} className="flex flex-col gap-4">
      {obra.demonstracao && (
        <p role="note" className="rounded-lg border border-dashed border-linha bg-superficie-2 px-3 py-2 text-xs text-texto-2">
          <span className="font-semibold text-texto">Dados fictícios</span> — cronograma, avanço, custos e margem desta obra são de demonstração local e não
          existem no banco.
        </p>
      )}

      {/* Cabeçalho */}
      <header className="flex flex-col gap-3 rounded-xl border border-linha bg-superficie p-5 shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs tracking-[0.15em] text-texto-2 uppercase">Obra #{obra.numero}</p>
            <h1 className="text-3xl font-light tracking-tight break-words text-texto md:text-4xl">{obra.clienteNome}</h1>
          </div>
          <span className="rounded-full border border-linha px-3 py-1 text-sm font-medium text-texto">{ROTULO_SITUACAO_OBRA[obra.situacao]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Dado rotulo="Potência">{kwp(obra.potenciaKwp) ?? "Não informada"}</Dado>
          <Dado rotulo="Local">{obra.local ?? "Não informado"}</Dado>
          <Dado rotulo="Prazo">{obra.prazo ? dataBr(obra.prazo) : <SemFonte>A definir</SemFonte>}</Dado>
          <Dado rotulo="Responsáveis">
            {responsaveis.length ? responsaveis.map((s) => `${ROTULO_SETOR[s.setor]}: ${s.responsavel}`).join(" · ") : <SemFonte>Não definidos</SemFonte>}
          </Dado>
        </dl>
      </header>

      {/* Indicadores */}
      <section aria-label="Resumo executivo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Avanço físico">
          {obra.avancoFisico != null ? (
            <>
              <span className="text-3xl font-semibold text-texto tabular-nums">{obra.avancoFisico}%</span>
              <span className="mt-2 block h-1.5 rounded-full bg-cinza-claro">
                <span className="block h-full rounded-full bg-dourado" style={{ width: `${obra.avancoFisico}%` }} />
              </span>
            </>
          ) : (
            <SemFonte>Sem medição registrada</SemFonte>
          )}
        </Indicador>
        <Indicador rotulo="Prazo">
          {obra.prazo ? <span className="text-xl font-semibold text-texto tabular-nums">{dataBr(obra.prazo)}</span> : <SemFonte>A definir</SemFonte>}
        </Indicador>
        <Indicador rotulo="Pendências críticas">
          <span className={`text-3xl font-semibold tabular-nums ${obra.pendencias.length ? "text-amber-700" : "text-texto"}`}>{obra.pendencias.length}</span>
        </Indicador>
        <Indicador rotulo="Próxima entrega">
          {obra.proximasEntregas[0] ? <span className="text-sm font-medium text-texto">{obra.proximasEntregas[0]}</span> : <span className="text-sm text-texto-2">Nada pendente</span>}
        </Indicador>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Bloco titulo="Setores" className="lg:col-span-2">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {obra.setores.map((s) => (
              <li key={s.setor} className="rounded-lg border border-linha p-3">
                <p className="text-xs text-texto-2">{ROTULO_SETOR[s.setor]}</p>
                <p className="text-sm font-medium text-texto">{s.statusRotulo}</p>
                {s.parado && <p className="mt-1 text-xs font-medium text-amber-700">Parado</p>}
                {s.aguardando && <p className="mt-1 text-xs text-texto-2">{s.aguardando}</p>}
              </li>
            ))}
          </ul>
        </Bloco>
        <Bloco titulo="Pendências e próximas entregas">
          {obra.pendencias.length === 0 && obra.proximasEntregas.length === 0 ? (
            <p className="text-sm text-texto-2">Nada pendente.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {obra.pendencias.map((p) => (
                <li key={p.texto} className="flex gap-2 text-amber-800">
                  <span aria-hidden>•</span>
                  {p.texto}
                </li>
              ))}
              {obra.proximasEntregas.map((t) => (
                <li key={t} className="flex gap-2 text-texto-2">
                  <span aria-hidden className="text-texto-2">
                    •
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>

      <Bloco titulo="Cronograma">
        {obra.cronograma ? (
          <div className="flex flex-col gap-2">
            <Gantt atividades={obra.cronograma} hojeIso={hoje} />
            <LegendaGantt />
          </div>
        ) : (
          <Vazio>Cronograma ainda não cadastrado para esta obra.</Vazio>
        )}
      </Bloco>

      {obra.financeiro.estado !== "sem_permissao" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
          <Bloco titulo="Custos por categoria">
            {obra.financeiro.estado === "disponivel" ? <CustosPorCategoria custos={obra.financeiro.custos} /> : <Vazio>Orçamento e custos ainda não cadastrados.</Vazio>}
          </Bloco>
          <Bloco titulo="Resultado financeiro">
            {obra.financeiro.estado === "disponivel" ? (
              <ResultadoFinanceiro entrada={obra.financeiro.resultado} valorVendido={obra.financeiro.valorVendido} />
            ) : (
              <div className="flex flex-col gap-3">
                {obra.financeiro.valorVendido != null && (
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="text-texto-2">Valor vendido (contrato)</span>
                    <span className="font-medium text-texto tabular-nums">{formatarMoeda(obra.financeiro.valorVendido)}</span>
                  </p>
                )}
                <Vazio>Receita líquida, custo projetado e margem dependem do orçamento da obra, ainda não cadastrado.</Vazio>
              </div>
            )}
          </Bloco>
        </div>
      )}
    </article>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-texto-2">{rotulo}</dt>
      <dd className="break-words text-texto">{children}</dd>
    </div>
  );
}

function Indicador({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-1 rounded-xl border border-linha bg-superficie p-4">
      <p className="text-xs text-texto-2">{rotulo}</p>
      <div>{children}</div>
    </div>
  );
}

function Bloco({ titulo, children, className = "" }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 rounded-xl border border-linha bg-superficie p-5 shadow-[0_1px_2px_rgba(15,15,16,0.04)] ${className}`}>
      <h2 className="text-base font-semibold text-texto">{titulo}</h2>
      {children}
    </section>
  );
}

/** Informação sem fonte no banco: texto discreto, nunca um número inventado. */
function SemFonte({ children }: { children: ReactNode }) {
  return <span className="text-sm text-texto-2 italic">{children}</span>;
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-linha px-3 py-6 text-center text-sm text-texto-2">{children}</p>;
}
