import Link from "next/link";
import type { ReactNode } from "react";
import { Botao, Selecao, Selo } from "@/components/ui";
import { carregarObras, type KpisObras, type ObraListaVM, type SetorObraVM } from "@/lib/obras/dados";
import { filtrarObras } from "@/lib/obras/derivados";
import {
  ALERTAS_OBRA,
  ESTADOS_SETOR,
  ROTULO_ALERTA_OBRA,
  ROTULO_ESTADO_SETOR,
  ROTULO_SETOR,
  ROTULO_SITUACAO_OBRA,
  SETORES_OBRA,
  SITUACOES_OBRA,
  type AlertaObra,
  type SituacaoObra,
} from "@/lib/obras/rotulos";
import { OBRAS } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

type Tom = "neutro" | "negativo" | "atencao";
// Sem verde (reservado ao WhatsApp): "Concluída" fica neutra. Vermelho só para o que é perda/erro.
const TOM_SITUACAO: Record<SituacaoObra, Tom> = { em_andamento: "neutro", concluida: "neutro", pausada: "atencao", cancelada: "negativo" };
const TOM_ALERTA: Record<AlertaObra, Tom> = { estorno: "negativo", venda_alterada: "atencao", parado: "atencao", aguardando: "neutro" };

const umDe = <T extends string>(valores: readonly T[], v: string): T | undefined => valores.find((x) => x === v);

const formatarPotencia = (kwp: number | null) =>
  kwp == null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(kwp)} kWp`;

const cidadeUf = (o: ObraListaVM) => [o.cidade, o.uf].filter(Boolean).join("/") || "—";

export default async function Obras({ searchParams }: PageProps<"/obras">) {
  // Lista positiva (OBRAS): os quatro papéis comerciais e `operacao`. A RLS decide o que cada um vê.
  const { atual } = await exigirPapel(...OBRAS);
  const filtros = await searchParams;
  const texto = (k: string) => (typeof filtros[k] === "string" ? (filtros[k] as string) : "");

  const supabase = await criarClienteServidor();
  const { obras, kpis } = await carregarObras(supabase, { empresaId: atual.empresaId, papel: atual.papel });

  const busca = texto("q");
  const situacao = umDe(SITUACOES_OBRA, texto("situacao"));
  const alerta = umDe(ALERTAS_OBRA, texto("alerta"));
  const setor = umDe(SETORES_OBRA, texto("setor"));
  const estado = umDe(ESTADOS_SETOR, texto("estado"));
  const visiveis = filtrarObras(obras, { busca, situacao, alerta, setor, estado });
  const filtrando = Boolean(busca || situacao || alerta || estado);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 md:text-[28px]">Obras</h1>
        <p className="text-sm text-zinc-500">Vendas já pagas e o andamento de cada setor da obra.</p>
      </div>

      <Indicadores kpis={kpis} />

      <form action="/obras" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={busca}
          placeholder="Buscar cliente ou nº da obra"
          className="min-w-56 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <Selecao name="situacao" defaultValue={situacao ?? ""} aria-label="Situação da obra">
          <option value="">Situação: todas</option>
          {SITUACOES_OBRA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SITUACAO_OBRA[s]}
            </option>
          ))}
        </Selecao>
        <Selecao name="alerta" defaultValue={alerta ?? ""} aria-label="Alerta">
          <option value="">Alerta: todos</option>
          {ALERTAS_OBRA.map((a) => (
            <option key={a} value={a}>
              {ROTULO_ALERTA_OBRA[a]}
            </option>
          ))}
        </Selecao>
        <Selecao name="setor" defaultValue={setor ?? ""} aria-label="Setor">
          <option value="">Setor: todos</option>
          {SETORES_OBRA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SETOR[s]}
            </option>
          ))}
        </Selecao>
        <Selecao name="estado" defaultValue={estado ?? ""} aria-label="Estado do setor">
          <option value="">Estado do setor: todos</option>
          {ESTADOS_SETOR.map((e) => (
            <option key={e} value={e}>
              {ROTULO_ESTADO_SETOR[e]}
            </option>
          ))}
        </Selecao>
        <Botao type="submit" variante="secundario">
          Filtrar
        </Botao>
        <Link href="/obras" className="text-xs text-zinc-500 underline hover:text-zinc-800">
          Limpar filtros
        </Link>
      </form>

      <p className="text-xs text-zinc-500">
        {visiveis.length} de {obras.length} obra{obras.length === 1 ? "" : "s"}
      </p>

      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
          {filtrando ? "Nenhuma obra com esses filtros." : "Nenhuma obra para mostrar."}
        </p>
      ) : (
        <ListaObras obras={visiveis} />
      )}
    </div>
  );
}

function Indicadores({ kpis }: { kpis: KpisObras }) {
  const itens: [string, number][] = [
    ["Obras", kpis.total],
    ["Em andamento", kpis.emAndamento],
    ["Concluídas", kpis.concluidas],
    ["Pausadas", kpis.pausadas],
    ["Canceladas", kpis.canceladas],
    ["Com setor parado", kpis.comSetorParado],
    ["Com setor aguardando", kpis.comSetorAguardando],
    ["Pagamento estornado", kpis.comEstorno],
    ["Venda alterada", kpis.comVendaAlterada],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="rounded-xl border border-zinc-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,15,16,0.04)]">
          <p className="text-2xl font-semibold text-zinc-900">{valor}</p>
          <p className="text-xs text-zinc-600">{rotulo}</p>
        </div>
      ))}
    </div>
  );
}

/** Selos de situação e de alertas. */
function Situacao({ obra }: { obra: ObraListaVM }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Selo tom={TOM_SITUACAO[obra.situacao]}>{ROTULO_SITUACAO_OBRA[obra.situacao]}</Selo>
      {obra.alertas
        .filter((a) => a === "estorno" || a === "venda_alterada")
        .map((a) => (
          <Selo key={a} tom={TOM_ALERTA[a]}>
            {a === "estorno" ? "Estorno" : "Venda alterada"}
          </Selo>
        ))}
    </span>
  );
}

/** Um setor: selo do status, responsável principal e, se houver, "Parado" / "Aguardando …". */
function CelulaSetor({ s }: { s: SetorObraVM }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Selo>{s.statusRotulo}</Selo>
      {s.estado === "parado" && <Selo tom="atencao">Parado</Selo>}
      {s.aguardando && s.estado === "aguardando" && <span className="text-xs text-zinc-600">{s.aguardando}</span>}
      {s.principalNome && <span className="text-xs text-zinc-500">{s.principalNome}</span>}
    </div>
  );
}

/** Tabela só no desktop (rola na horizontal se não couber); no celular, um card por obra. */
function ListaObras({ obras }: { obras: ObraListaVM[] }) {
  const cabecalho = ["Obra", "Cliente", "Cidade/UF", "Potência", ...SETORES_OBRA.map((s) => ROTULO_SETOR[s]), "Situação"];
  const celulas = (o: ObraListaVM): ReactNode[] => [
    <Link key="n" href={`/obras/${o.id}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
      #{o.numero}
    </Link>,
    <Link key="c" href={`/obras/${o.id}`} className="text-zinc-900 underline-offset-2 hover:underline">
      {o.clienteNome}
    </Link>,
    <span key="u" className="text-zinc-700">{cidadeUf(o)}</span>,
    <span key="p" className="text-zinc-700">{formatarPotencia(o.potenciaKwp)}</span>,
    ...o.setores.map((s) => <CelulaSetor key={s.setor} s={s} />),
    <Situacao key="s" obra={o} />,
  ];
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              {cabecalho.map((c) => (
                <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {obras.map((o) => (
              <tr key={o.id} className="border-t border-zinc-100 align-top hover:bg-zinc-50/60">
                {celulas(o).map((c, i) => (
                  // Cliente fica com o espaço que sobra (e pode quebrar); os demais não quebram.
                  <td key={i} className={i === 1 ? "min-w-44 px-3 py-2" : "px-3 py-2 whitespace-nowrap"}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {obras.map((o) => (
          <li key={o.id} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/obras/${o.id}`} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                    #{o.numero} {o.clienteNome}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {cidadeUf(o)} · {formatarPotencia(o.potenciaKwp)}
                  </p>
                </div>
                <Situacao obra={o} />
              </div>
              {o.setores.map((s) => (
                <div key={s.setor} className="flex items-start justify-between gap-2">
                  <span className="pt-0.5 text-xs text-zinc-500">{ROTULO_SETOR[s.setor]}</span>
                  <div className="[&>div]:items-end">
                    <CelulaSetor s={s} />
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
