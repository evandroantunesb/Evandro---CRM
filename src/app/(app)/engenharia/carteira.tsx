import Link from "next/link";
import type { ReactNode } from "react";
import { Selo } from "@/components/ui";
import { diasDesde, type ColunaKanbanEngenharia, type GrupoEngenharia, type ObraNaEngenharia } from "@/lib/engenharia-regras";
import { seloPrazo, type PrazoObra } from "@/lib/engenharia-prazos-regras";
import { ROTULO_ESTADO_SETOR } from "@/lib/obras/rotulos";

export const formatarPotencia = (kwp: number | null) =>
  kwp == null ? "" : ` · ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(kwp)} kWp`;

const ha = (desde: string | null) => {
  if (!desde) return null;
  const dias = diasDesde(desde);
  return dias === 0 ? "desde hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`;
};

/** Resumo da carteira: as sete fases do Kanban em blocos, com a parte de cada uma no total. */
export function ResumoFases({ colunas, hrefKanban }: { colunas: ColunaKanbanEngenharia[]; hrefKanban: string }) {
  const total = Math.max(1, colunas.reduce((n, c) => n + c.obras.length, 0));
  return (
    <div role="region" aria-label="Resumo da carteira" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-linha sm:grid-cols-4 lg:grid-cols-7">
      {colunas.map((c) => (
        <Link
          key={c.fase}
          href={hrefKanban}
          className="flex min-w-0 flex-col gap-1.5 bg-superficie p-4 transition-colors duration-200 ease-raion last:col-span-2 hover:bg-superficie-2 sm:last:col-span-1"
        >
          <span className="text-xs font-medium text-texto-2">{c.rotulo}</span>
          <span className="font-titulo text-3xl font-light tracking-tight text-texto tabular-nums">{c.obras.length}</span>
          <span aria-hidden className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-superficie-2">
            <span className="block h-full rounded-full bg-dourado" style={{ width: `${(c.obras.length / total) * 100}%` }} />
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Carteira em lista, por etapa da Engenharia (grupos vazios ficam de fora). */
export function ListaPorEtapa({ grupos, prazos, vazio }: { grupos: GrupoEngenharia[]; prazos: ReadonlyMap<string, PrazoObra[]>; vazio: string }) {
  const comObras = grupos.filter((g) => g.obras.length > 0);
  if (comObras.length === 0) return <p className="text-sm text-zinc-500">{vazio}</p>;
  return (
    <div role="region" aria-label="Carteira por etapa" className="flex flex-col gap-5">
      {comObras.map((g) => (
        <section key={g.status} aria-label={g.rotulo}>
          <h3 className="mb-2 text-sm font-medium text-texto">
            {g.rotulo} <span className="text-zinc-500">({g.obras.length})</span>
          </h3>
          <ListaObras obras={g.obras} prazos={prazos} />
        </section>
      ))}
    </div>
  );
}

/**
 * Carteira em colunas por fase (spec v1.3, seção 31). Só leitura: o cartão abre o card da obra, onde está o trabalho;
 * não há arrastar. No celular as fases ficam uma embaixo da outra; da largura média em diante, lado a lado com rolagem
 * dentro do quadro.
 */
export function Kanban({ colunas, prazos }: { colunas: ColunaKanbanEngenharia[]; prazos: ReadonlyMap<string, PrazoObra[]> }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-zinc-500">A fase vem do que foi registrado na obra (etapa, checklist, protocolo e exigências). Para mudar, abra a obra.</p>
      <div role="region" aria-label="Kanban da carteira" className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-2">
        {colunas.map((c) => (
          <section key={c.fase} aria-label={c.rotulo} className="flex flex-col gap-2 md:w-64 md:shrink-0">
            <h3 className="text-sm font-medium text-texto">
              {c.rotulo} <span className="text-zinc-500">({c.obras.length})</span>
            </h3>
            {c.obras.length === 0 ? (
              <p className="rounded-lg border border-dashed border-linha px-3 py-2 text-xs text-zinc-500">Nenhuma obra.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.obras.map((o) => (
                  <li key={o.id}>
                    <CartaoKanban obra={o} prazos={prazos.get(o.id) ?? []} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function CartaoKanban({ obra: o, prazos }: { obra: ObraNaEngenharia; prazos: PrazoObra[] }) {
  const tempo = ha(o.desde);
  return (
    <article className="flex flex-col gap-1.5 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-sm transition-colors duration-200 ease-raion hover:border-dourado/60">
      <p className="font-medium break-words text-texto">
        Obra #{o.numero} · {o.clienteNome}
      </p>
      <p className="text-xs text-zinc-500">
        {o.cidadeUf}
        {formatarPotencia(o.potenciaKwp)}
      </p>
      {o.proximaAcao && <p className="text-zinc-700">{o.proximaAcao}</p>}
      <p className="text-xs text-zinc-500">
        {o.principalNome ?? "Sem responsável"}
        {tempo ? ` · ${o.aguardando ? "aguardando" : "na etapa"} ${tempo}` : ""}
      </p>
      <SelosObra obra={o} prazos={prazos} />
      <Link
        href={`/engenharia/${o.id}`}
        aria-label={`Continuar a obra #${o.numero}`}
        className="mt-1 w-fit text-sm font-medium text-texto underline decoration-dourado underline-offset-4 hover:decoration-2"
      >
        Continuar
      </Link>
    </article>
  );
}

function SelosObra({ obra: o, prazos }: { obra: ObraNaEngenharia; prazos: readonly PrazoObra[] }) {
  if (!o.aguardando && o.estado !== "parado" && prazos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {o.aguardando && <Selo tom="atencao">{o.aguardando}</Selo>}
      {o.estado === "parado" && <Selo tom="atencao">{ROTULO_ESTADO_SETOR.parado}</Selo>}
      {prazos.map((p) => {
        const selo = seloPrazo(p);
        return (
          <Selo key={p.chave} tom={selo.tom}>
            {selo.texto}
          </Selo>
        );
      })}
    </div>
  );
}

/** Linhas de obra. Com `acao`, destaca a próxima ação e a etapa; na carteira, só os dados da obra. */
export function ListaObras({ obras, prazos, acao = false }: { obras: ObraNaEngenharia[]; prazos: ReadonlyMap<string, PrazoObra[]>; acao?: boolean }) {
  return (
    <ul className="divide-y divide-linha rounded-lg border border-linha">
      {obras.map((o) => {
        const tempo = ha(o.desde);
        return (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div className="min-w-0">
              {acao && o.proximaAcao && <p className="font-medium text-texto">{o.proximaAcao}</p>}
              <p className={`break-words ${acao ? "text-zinc-700" : "font-medium text-texto"}`}>
                <Link href={`/engenharia/${o.id}`} className="hover:underline">
                  Obra #{o.numero} · {o.clienteNome}
                </Link>
              </p>
              <p className="text-xs text-zinc-500">
                {acao ? o.statusRotulo : o.cidadeUf}
                {!acao && formatarPotencia(o.potenciaKwp)}
                {o.principalNome ? ` · ${o.principalNome}` : " · Sem responsável"}
                {tempo ? ` · ${o.aguardando ? "aguardando" : "na etapa"} ${tempo}` : ""}
              </p>
            </div>
            <SelosObra obra={o} prazos={prazos.get(o.id) ?? []} />
          </li>
        );
      })}
    </ul>
  );
}

export function Aba({ href, atual, contagem = 0, children }: { href: string; atual: boolean; contagem?: number; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={atual ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${atual ? "border-dourado bg-dourado/10 font-medium text-texto" : "border-linha text-zinc-600 hover:border-dourado"}`}
    >
      {children}
      {contagem > 0 && (
        <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-dourado px-1.5 text-xs font-semibold text-carvao">
          {contagem}
        </span>
      )}
    </Link>
  );
}
