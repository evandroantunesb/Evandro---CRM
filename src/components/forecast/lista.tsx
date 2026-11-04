import Link from "next/link";
import type { ReactNode } from "react";
import { Selo } from "@/components/ui";
import {
  CATEGORIAS,
  MOTIVOS_FORA,
  ROTULO_CATEGORIA,
  ROTULO_MOTIVO_FORA,
  mesCurto,
  nomeDoMes,
  type ForecastVM,
  type NegocioForecast,
} from "@/lib/forecast";
import { formatarMoeda } from "@/lib/formatacao";
import { MarcaCategoria, queryForecast, type FiltrosForecast } from "./comum";

const LIMITE_LISTA = 10;

function Segmento({ rotulo, itens }: { rotulo: string; itens: { href: string; ativo: boolean; texto: ReactNode }[] }) {
  return (
    <nav aria-label={rotulo} className="inline-flex max-w-full flex-wrap rounded-lg border border-linha bg-superficie p-0.5 text-sm">
      {itens.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.ativo ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 ${i.ativo ? "bg-carvao font-medium text-offwhite" : "text-texto-2 hover:text-texto"}`}
        >
          {i.texto}
        </Link>
      ))}
    </nav>
  );
}

export function ListaForecast({
  vm,
  filtros,
  mesAtual,
  nomeDe,
}: {
  vm: ForecastVM;
  filtros: FiltrosForecast;
  mesAtual: string;
  nomeDe: (membroId: string | null) => string;
}) {
  const doMes = vm.negocios.filter((n) => n.mes === filtros.mes);
  const visiveis = filtros.categoria ? doMes.filter((n) => n.categoria === filtros.categoria) : doMes;
  const mostrados = filtros.todos ? visiveis : visiveis.slice(0, LIMITE_LISTA);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmento
          rotulo="Categoria"
          itens={[
            {
              href: queryForecast({ ...filtros, categoria: undefined, todos: false }, mesAtual),
              ativo: !filtros.categoria,
              texto: (
                <>
                  Todos <span className="ml-1 text-xs opacity-70">{doMes.length}</span>
                </>
              ),
            },
            ...CATEGORIAS.map((c) => ({
              href: queryForecast({ ...filtros, categoria: c, todos: false }, mesAtual),
              ativo: filtros.categoria === c,
              texto: ROTULO_CATEGORIA[c],
            })),
          ]}
        />
        <Segmento
          rotulo="Mês"
          itens={vm.meses.map((m) => ({
            href: queryForecast({ ...filtros, mes: m.mes, todos: false }, mesAtual),
            ativo: filtros.mes === m.mes,
            texto: nomeDoMes(m.mes),
          }))}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-linha bg-superficie">
        {visiveis.length === 0 ? (
          <p className="p-6 text-center text-sm text-texto-2">Nenhum negócio no forecast com esses filtros.</p>
        ) : (
          <ul className="divide-y divide-linha md:hidden">
            {mostrados.map((n) => (
              <CartaoNegocio key={n.id} n={n} responsavel={nomeDe(n.responsavelId)} />
            ))}
          </ul>
        )}
        {visiveis.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-carvao text-xs text-offwhite">
                <tr>
                  {["Negócio", "Categoria", "Etapa", "Chance", "Valor", "Ponderado", "Previsto", "Responsável", "Risco"].map((t) => (
                    <th key={t} scope="col" className="px-4 py-2.5 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mostrados.map((n) => (
                  <LinhaNegocio key={n.id} n={n} responsavel={nomeDe(n.responsavelId)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-linha px-4 py-3.5 text-xs text-texto-2">
          Mais prováveis primeiro · mostrando {mostrados.length} de {visiveis.length}
          {!filtros.todos && visiveis.length > mostrados.length && (
            <>
              {" · "}
              <Link href={queryForecast({ ...filtros, todos: true }, mesAtual)} className="font-medium text-dourado-texto underline">
                ver todos
              </Link>
            </>
          )}
        </p>
      </section>
    </>
  );
}

/** No celular, cada negócio vira um cartão com o essencial: cliente, categoria, chance, ponderado e risco. */
function CartaoNegocio({ n, responsavel }: { n: NegocioForecast; responsavel: string }) {
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/negocios/${n.id}`} className="font-medium hover:underline">
            {n.contatoNome}
          </Link>
          <p className="truncate text-xs text-texto-2">
            #{n.numero} · {n.etapaNome} · {responsavel}
          </p>
        </div>
        <span className="text-right font-semibold whitespace-nowrap tabular-nums">{formatarMoeda(n.ponderado)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-2">
        <MarcaCategoria categoria={n.categoria}>{ROTULO_CATEGORIA[n.categoria]}</MarcaCategoria>
        <span className="tabular-nums">
          {n.chance}% de {formatarMoeda(n.valor)}
        </span>
        <span>{mesCurto(n.mes)}</span>
      </div>
      {n.risco && (
        <div>
          <Selo tom="atencao">{n.risco}</Selo>
        </div>
      )}
    </li>
  );
}

function LinhaNegocio({ n, responsavel }: { n: NegocioForecast; responsavel: string }) {
  return (
    <tr className="border-t border-linha align-middle">
      <td className="px-4 py-3">
        <Link href={`/negocios/${n.id}`} className="font-medium hover:underline">
          {n.contatoNome}
        </Link>
        <p className="text-xs text-texto-2">
          #{n.numero} · {n.titulo}
        </p>
      </td>
      <td className="px-4 py-3">
        <MarcaCategoria categoria={n.categoria}>{ROTULO_CATEGORIA[n.categoria]}</MarcaCategoria>
      </td>
      <td className="px-4 py-3">{n.etapaNome}</td>
      <td className="px-4 py-3">
        <div className="flex w-16 flex-col gap-1.5">
          <span className="text-[13px] leading-none font-semibold tabular-nums">{n.chance}%</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-linha">
            <span className="block h-full rounded-full bg-dourado" style={{ width: `${n.chance}%` }} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatarMoeda(n.valor)}</td>
      <td className="px-4 py-3 font-semibold tabular-nums whitespace-nowrap">{formatarMoeda(n.ponderado)}</td>
      <td className="px-4 py-3 tabular-nums">{mesCurto(n.mes)}</td>
      <td className="px-4 py-3">{responsavel}</td>
      <td className="px-4 py-3">{n.risco ? <Selo tom="atencao">{n.risco}</Selo> : <span className="text-texto-2">—</span>}</td>
    </tr>
  );
}

/** "Para limpar": negócios abertos fora da conta, por motivo, com o link para corrigir cada um. */
export function ForaDoForecast({ vm, diasParado }: { vm: ForecastVM; diasParado: number }) {
  return (
    <section className="min-w-0 rounded-2xl border border-linha bg-superficie p-5">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-texto-2 uppercase">Para limpar</p>
      <h2 className="font-titulo text-lg font-semibold">Fora do forecast ({vm.fora.length})</h2>
      <p className="mt-1 mb-3 text-sm text-texto-2">Negócios em andamento que não entram na conta até alguém completar os dados.</p>
      {vm.fora.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum: todos os negócios abertos têm os dados do forecast.</p>
      ) : (
        <ul>
          {MOTIVOS_FORA.map((motivo) => {
            const itens = vm.fora.filter((n) => n.motivo === motivo);
            if (!itens.length) return null;
            return (
              <li key={motivo} className="border-t border-linha py-2.5 text-[13px] first:border-t-0 first:pt-0">
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span>
                      <strong>{itens.length}</strong> {ROTULO_MOTIVO_FORA[motivo](diasParado)}
                    </span>
                    <span className="font-medium text-dourado-texto">Ver e corrigir →</span>
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1 pl-3">
                    {itens.map((n) => (
                      <li key={n.id}>
                        <Link href={`/negocios/${n.id}`} className="hover:underline">
                          #{n.numero} · {n.contatoNome}
                        </Link>
                        <span className="text-texto-2"> · {n.etapaNome}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function RegrasForecast({ exemplo }: { exemplo: string }) {
  const regras = [
    ["Chance base pela etapa", `${exemplo}. Definida em Configurações › Funis e etapas.`],
    ["Ajuste pela temperatura", "Quente +10 pontos, Frio −10 pontos."],
    ["Só entra quem tem chance real", "Chance a partir de 20%, com valor e com mês previsto de fechamento."],
  ];
  return (
    <section className="min-w-0 rounded-2xl border border-linha bg-superficie p-5">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-texto-2 uppercase">Regras</p>
      <h2 className="font-titulo text-lg font-semibold">Como a chance é calculada</h2>
      <ol className="mt-3 flex flex-col gap-3">
        {regras.map(([titulo, texto], i) => (
          <li key={titulo} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-carvao text-xs font-semibold text-offwhite">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{titulo}</p>
              <p className="text-xs text-texto-2">{texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
