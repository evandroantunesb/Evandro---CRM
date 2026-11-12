import Link from "next/link";
import { CalendarClock, CheckCircle2, HardHat } from "lucide-react";
import { Indicadores } from "@/app/(app)/negocios/indicadores";
import { Avatar } from "@/components/avatar";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Selo } from "@/components/ui";
import { formatarDiaMes } from "@/lib/formatacao";
import { ETAPAS_CHECKLIST, ROTULO_ETAPA, etapaResolvida } from "@/lib/obras/checklist";
import { numerosSolo, type ObraSoloListaVM } from "@/lib/obras/solo-dados";

/*
 * Obras do Solo em cartões (quadro aprovado "SoloObras", subprojeto 4b): cada obra com as 10 barrinhas do checklist,
 * "X de 10 feitas" e a etapa atual com a data prevista; números Em andamento, Entregues no ano e Próxima data prevista;
 * filtro Em andamento / Entregues (e Canceladas, só quando há alguma).
 */

export type FiltroSolo = "andamento" | "entregues" | "canceladas";
const kwp = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)} kWp`;

export function ListaObrasSolo({ obras, filtro, hoje }: { obras: ObraSoloListaVM[]; filtro: FiltroSolo; hoje: string }) {
  const n = numerosSolo(obras, hoje);
  const entregues = obras.filter((o) => o.situacao === "entregue");
  const emCurso = obras.filter((o) => o.situacao === "em_andamento" || o.situacao === "pausada");
  const canceladas = obras.filter((o) => o.situacao === "cancelada");
  const visiveis = filtro === "entregues" ? entregues : filtro === "canceladas" ? canceladas : emCurso;
  const item = (ativo: boolean) =>
    `rounded-md px-3 py-1.5 ${ativo ? "bg-dourado font-medium text-carvao" : "text-offwhite/75 hover:text-offwhite"}`;

  return (
    <div className="mx-auto flex max-w-6xl animate-entrar flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Obras · do contrato à entrega"
        titulo={n.emAndamento === 1 ? "1 obra em andamento" : `${n.emAndamento} obras em andamento`}
        descricao="Cada obra tem um checklist de 10 etapas. Marque o que foi feito e o seu cliente acompanha tudo pelo link."
        acoes={
          <nav aria-label="Filtro" className="inline-flex w-fit rounded-lg border border-offwhite/20 bg-offwhite/5 p-0.5 text-sm">
            <Link href="/obras" aria-current={filtro === "andamento" ? "page" : undefined} className={item(filtro === "andamento")}>
              Em andamento ({emCurso.length})
            </Link>
            <Link href="/obras?filtro=entregues" aria-current={filtro === "entregues" ? "page" : undefined} className={item(filtro === "entregues")}>
              Entregues ({entregues.length})
            </Link>
            {canceladas.length > 0 && (
              <Link href="/obras?filtro=canceladas" aria-current={filtro === "canceladas" ? "page" : undefined} className={item(filtro === "canceladas")}>
                Canceladas ({canceladas.length})
              </Link>
            )}
          </nav>
        }
      />

      <Indicadores
        itens={[
          { Icone: HardHat, legenda: "Em andamento", valor: String(n.emAndamento), rodape: `${kwp(n.kwpEmAndamento)} no total` },
          { Icone: CheckCircle2, legenda: "Entregues no ano", valor: String(n.entreguesNoAno), rodape: "desde janeiro" },
          {
            Icone: CalendarClock,
            legenda: "Próxima data prevista",
            valor: n.proximaPrevista ? formatarDiaMes(n.proximaPrevista.data) : "—",
            rodape: n.proximaPrevista ? `${ROTULO_ETAPA[n.proximaPrevista.etapa].toLowerCase()} · ${n.proximaPrevista.clienteNome}` : "nenhuma data marcada",
          },
        ]}
      />

      {visiveis.length === 0 ? (
        <p className="painel p-6 text-sm text-texto-2">
          {filtro === "entregues"
            ? "Nenhuma obra entregue ainda."
            : filtro === "canceladas"
              ? "Nenhuma obra cancelada."
              : "Nenhuma obra em andamento. A obra nasce quando o contrato é assinado e a entrada é confirmada."}
        </p>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2">
          {visiveis.map((o) => (
            <CartaoObraSolo key={o.id} obra={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoObraSolo({ obra: o }: { obra: ObraSoloListaVM }) {
  const entregue = o.situacao === "entregue";
  const local = [o.potenciaKwp != null ? kwp(o.potenciaKwp) : null, o.cidade].filter(Boolean).join(" · ");
  const resolvida = (etapa: (typeof ETAPAS_CHECKLIST)[number]) => {
    const l = o.linhas.find((x) => x.etapa === etapa);
    return l != null && etapaResolvida(l);
  };
  return (
    <Link
      href={`/obras/${o.id}`}
      className={`painel flex flex-col gap-3 p-5 transition-colors duration-200 ease-raion hover:ring-2 hover:ring-dourado/50 ${entregue || o.situacao === "cancelada" ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Avatar nome={o.clienteNome || `Obra ${o.numero}`} tamanho={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-texto">{o.clienteNome || `Obra #${o.numero}`}</p>
          <p className="truncate text-xs text-texto-2">{local || `Obra #${o.numero}`}</p>
        </div>
        <span className="shrink-0 rounded-full bg-dourado/15 px-2.5 py-1 text-[11px] font-medium text-dourado-texto">
          {entregue ? "Entregue" : o.situacao === "cancelada" ? "Cancelada" : o.situacao === "pausada" ? "Pausada" : `${o.andamento.resolvidas} de 10 feitas`}
        </span>
      </div>
      <div className="grid grid-cols-10 gap-1" role="img" aria-label={`${o.andamento.resolvidas} de 10 etapas`}>
        {ETAPAS_CHECKLIST.map((etapa) => (
          <i
            key={etapa}
            className={`h-2 rounded-full ${resolvida(etapa) ? "bg-dourado" : etapa === o.andamento.atual ? "bg-carvao" : "bg-superficie-2"}`}
          />
        ))}
      </div>
      {o.alertaEstornoEm && (
        <div>
          <Selo tom="negativo">Entrada estornada</Selo>
        </div>
      )}
      <p className="text-[13px]">
        {entregue ? (
          <>
            <b>Entregue</b>
            {o.entregueEm && <span className="text-texto-2"> · entregue em {formatarDiaMes(o.entregueEm)}</span>}
          </>
        ) : o.andamento.atual ? (
          <>
            <b>{ROTULO_ETAPA[o.andamento.atual]}</b>
            <span className="text-texto-2"> · {o.atualPrevistaPara ? `prevista para ${formatarDiaMes(o.atualPrevistaPara)}` : "sem data prevista"}</span>
          </>
        ) : null}
      </p>
    </Link>
  );
}
