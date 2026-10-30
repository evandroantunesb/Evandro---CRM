"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem, Selo } from "@/components/ui";
import {
  concluirEngenhariaSemConexao,
  registrarArquivoVistoriaEngenharia,
  registrarEventoVistoriaEngenharia,
  solicitarVistoriaEngenharia,
} from "@/lib/acoes/engenharia";
import {
  BUCKET_ARQUIVOS_VISTORIA,
  ROTULO_EVENTO_VISTORIA,
  ROTULO_STATUS_VISTORIA,
  aceitaDataFutura,
  registroExigeDescricao,
  registrosPossiveis,
  vistoriaAtiva,
  type AtuacaoVistoria,
  type StatusVistoria,
  type TipoRegistroVistoria,
  type VistoriaVM,
} from "@/lib/engenharia-vistoria-regras";
import { LinkArquivo, Rotulo, dataBr, hojeBr, useEnvioDepois } from "./eventos-comum";

// Sem verde (WhatsApp); não conformidade é atenção, não erro.
const TOM: Record<StatusVistoria, "neutro" | "atencao"> = {
  solicitada: "neutro",
  agendada: "neutro",
  realizada: "neutro",
  aprovada: "neutro",
  com_nao_conformidade: "atencao",
  cancelada: "neutro",
};

/**
 * Vistoria, medição e conexão: a Engenharia pede a vistoria à distribuidora e registra aqui (o Raion não acessa o
 * portal), o resultado formal, o medidor adequado e a conexão confirmada; a Engenharia ou o Operacional registram o
 * agendamento e a vistoria realizada em campo; o Operacional, a correção de campo. Vistoria aprovada não é conexão.
 * Para admin e quem atua em Engenharia ou no Operacional na obra (`atuo` diz em quais).
 */
export function VistoriaEngenharia({
  obraId,
  pasta,
  vistorias,
  podeAgir,
  atuo,
  bloqueioPedido,
  admin,
  engenhariaConcluida,
}: {
  obraId: string;
  pasta: string;
  vistorias: VistoriaVM[];
  podeAgir: boolean;
  atuo: AtuacaoVistoria;
  /** Gate G5: por que ainda não dá para pedir (null = dá). */
  bloqueioPedido: string | null;
  admin: boolean;
  engenhariaConcluida: boolean;
}) {
  const ativa = vistorias.find((v) => vistoriaAtiva(v.status)) ?? null;
  const ultima = vistorias[0] ?? null;
  // Sem pedido ativo, a última vistoria com não conformidade fica aberta: é nela que o Operacional registra a correção.
  const comNaoConformidade = !ativa && ultima?.status === "com_nao_conformidade" ? ultima : null;
  const anteriores = vistorias.filter((v) => v !== ativa && v !== comNaoConformidade);
  return (
    <div className="flex flex-col gap-4">
      {ativa ? (
        <Vistoria obraId={obraId} pasta={pasta} vistoria={ativa} podeAgir={podeAgir} atuo={atuo} />
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          {comNaoConformidade ? (
            <>
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                A última vistoria apontou não conformidade. O Operacional registra a correção de campo; depois a Engenharia pede uma nova vistoria.
              </p>
              <Vistoria obraId={obraId} pasta={pasta} vistoria={comNaoConformidade} podeAgir={podeAgir} atuo={atuo} />
            </>
          ) : (
            <p className="text-zinc-600">Nenhuma vistoria em andamento.</p>
          )}
          {podeAgir && atuo.engenharia && !engenhariaConcluida && (bloqueioPedido ? <p className="text-zinc-700">{bloqueioPedido}</p> : <PedidoVistoria obraId={obraId} pasta={pasta} />)}
        </div>
      )}
      {anteriores.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600">Vistorias anteriores ({anteriores.length})</summary>
          <div className="mt-3 flex flex-col gap-4">
            {anteriores.map((v) => (
              <Vistoria key={v.id} obraId={obraId} pasta={pasta} vistoria={v} podeAgir={false} atuo={atuo} />
            ))}
          </div>
        </details>
      )}
      {admin && atuo.engenharia && podeAgir && !engenhariaConcluida && !ativa?.conexaoConfirmadaEm && <ConcluirSemConexao obraId={obraId} />}
    </div>
  );
}

function PedidoVistoria({ obraId, pasta }: { obraId: string; pasta: string }) {
  const router = useRouter();
  const [resultado, acao, pendente] = useActionState(solicitarVistoriaEngenharia, null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  useEnvioDepois(resultado, registrarArquivoVistoriaEngenharia, pasta, obraId, arquivos, setErroArquivo, router.refresh, BUCKET_ARQUIVOS_VISTORIA);

  return (
    <form action={acao} className="flex flex-col gap-3 rounded-lg border border-linha p-3">
      <input type="hidden" name="obraId" value={obraId} />
      <p className="text-xs text-zinc-600">Peça a vistoria no portal da distribuidora e registre aqui. A Engenharia passa para Aguardando vistoria.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Rotulo texto="Data do pedido">
          <input type="date" name="solicitadaEm" defaultValue={hojeBr()} max={hojeBr()} required className={CLASSE_ENTRADA} />
        </Rotulo>
        <Rotulo texto="Número do pedido (opcional)">
          <input name="numero" maxLength={60} className={CLASSE_ENTRADA} />
        </Rotulo>
        <Rotulo texto="Comprovante (opcional)">
          <input type="file" multiple onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} className="text-sm" />
        </Rotulo>
      </div>
      <Rotulo texto="Observação (opcional)">
        <textarea name="observacao" maxLength={1000} rows={2} className={CLASSE_ENTRADA} />
      </Rotulo>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Registrando..." : "Registrar pedido de vistoria"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
      {erroArquivo && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{erroArquivo}</p>}
    </form>
  );
}

function Vistoria({ obraId, pasta, vistoria, podeAgir, atuo }: { obraId: string; pasta: string; vistoria: VistoriaVM; podeAgir: boolean; atuo: AtuacaoVistoria }) {
  const possiveis = podeAgir ? registrosPossiveis(vistoria, atuo) : [];
  const datas: [string, string | null][] = [
    ["Pedida em", vistoria.solicitadaEm],
    ["Agendada para", vistoria.agendadaPara],
    ["Realizada em", vistoria.realizadaEm],
    ["Medidor adequado em", vistoria.medidorAdequadoEm],
    ["Conexão confirmada em", vistoria.conexaoConfirmadaEm],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-texto">Vistoria{vistoria.numero ? ` · Pedido ${vistoria.numero}` : ""}</p>
        <Selo tom={TOM[vistoria.status]}>{ROTULO_STATUS_VISTORIA[vistoria.status]}</Selo>
      </div>
      <p className="text-xs text-zinc-500">
        {datas
          .filter(([, d]) => d)
          .map(([r, d]) => `${r} ${dataBr(d!)}`)
          .join(" · ")}{" "}
        · registrado manualmente
      </p>
      {vistoria.status === "aprovada" && !vistoria.conexaoConfirmadaEm && (
        <p className="text-xs text-zinc-700">Vistoria aprovada não é conexão: registre o medidor adequado e depois a conexão confirmada.</p>
      )}
      {vistoria.conexaoConfirmadaEm && podeAgir && atuo.engenharia && (
        <p className="text-xs text-zinc-700">Conexão confirmada. Conclua a Engenharia em &quot;Atualizar Engenharia&quot;.</p>
      )}

      <ol className="flex flex-col border-l border-linha pl-3">
        {vistoria.eventos.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 py-1.5 text-sm">
            <p className="font-medium text-texto">
              {ROTULO_EVENTO_VISTORIA[e.tipo]} <span className="text-xs font-normal text-zinc-500">· {dataBr(e.ocorridoEm)}{e.autor ? ` · ${e.autor}` : ""}</span>
            </p>
            {e.descricao && <p className="whitespace-pre-line text-zinc-700">{e.descricao}</p>}
            {e.arquivos.map((a) => (
              <LinkArquivo key={a.id} href={`/arquivos-vistoria/${a.id}`} nome={a.nome} />
            ))}
          </li>
        ))}
      </ol>

      {possiveis.length > 0 && <NovoRegistro obraId={obraId} pasta={pasta} vistoria={vistoria} possiveis={possiveis} />}
    </div>
  );
}

const ROTULO_DATA: Record<TipoRegistroVistoria, string> = {
  agendada: "Data agendada",
  realizada: "Data em que a vistoria foi feita",
  aprovada: "Data da vistoria",
  nao_conformidade: "Data da vistoria",
  correcao_campo: "Data da correção",
  cancelada: "Data do cancelamento",
  medidor_adequado: "Data da troca/adequação do medidor",
  conexao_confirmada: "Data da conexão",
};

function NovoRegistro({ obraId, pasta, vistoria, possiveis }: { obraId: string; pasta: string; vistoria: VistoriaVM; possiveis: TipoRegistroVistoria[] }) {
  const router = useRouter();
  const [resultado, acao, pendente] = useActionState(registrarEventoVistoriaEngenharia, null);
  const [tipo, setTipo] = useState<TipoRegistroVistoria>(possiveis[0]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  useEnvioDepois(resultado, registrarArquivoVistoriaEngenharia, pasta, obraId, arquivos, setErroArquivo, router.refresh, BUCKET_ARQUIVOS_VISTORIA);
  const atual = possiveis.includes(tipo) ? tipo : possiveis[0];

  return (
    <form action={acao} className="flex flex-col gap-3 rounded-lg border border-linha p-3">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="vistoriaId" value={vistoria.id} />
      <p className="text-sm font-medium text-texto">Registrar andamento</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Rotulo texto="O que aconteceu">
          <select name="tipo" value={atual} onChange={(e) => setTipo(e.target.value as TipoRegistroVistoria)} className={CLASSE_ENTRADA}>
            {possiveis.map((t) => (
              <option key={t} value={t}>
                {ROTULO_EVENTO_VISTORIA[t]}
              </option>
            ))}
          </select>
        </Rotulo>
        <Rotulo texto={ROTULO_DATA[atual]}>
          <input
            key={atual}
            type="date"
            name="data"
            defaultValue={hojeBr()}
            min={vistoria.solicitadaEm}
            max={aceitaDataFutura(atual) ? undefined : hojeBr()}
            required
            className={CLASSE_ENTRADA}
          />
        </Rotulo>
      </div>
      <Rotulo
        texto={
          atual === "nao_conformidade"
            ? "O que foi apontado"
            : atual === "correcao_campo"
              ? "O que foi corrigido"
              : atual === "cancelada"
                ? "Motivo do cancelamento"
                : "Observação (opcional)"
        }
      >
        <textarea name="descricao" rows={3} maxLength={4000} required={registroExigeDescricao(atual)} minLength={registroExigeDescricao(atual) ? 3 : undefined} className={CLASSE_ENTRADA} />
      </Rotulo>
      <Rotulo texto="Arquivos (relatório, fotos, comprovante — opcional)">
        <input type="file" multiple onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} className="text-sm" />
      </Rotulo>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Registrando..." : "Registrar"}
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
      {erroArquivo && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{erroArquivo}</p>}
    </form>
  );
}

function ConcluirSemConexao({ obraId }: { obraId: string }) {
  const [resultado, acao, pendente] = useActionState(concluirEngenhariaSemConexao, null);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-zinc-600">Concluir a Engenharia sem conexão confirmada (só admin)</summary>
      <form action={acao} className="mt-2 flex flex-col gap-2 rounded-lg border border-linha p-3">
        <input type="hidden" name="obraId" value={obraId} />
        <p className="text-xs text-zinc-600">Para obra sem conexão nova (por exemplo). O motivo fica guardado no histórico.</p>
        <Rotulo texto="Motivo">
          <textarea name="motivo" rows={2} required minLength={10} maxLength={500} className={CLASSE_ENTRADA} />
        </Rotulo>
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" variante="secundario" disabled={pendente}>
            {pendente ? "Concluindo..." : "Concluir sem conexão"}
          </Botao>
          <Mensagem resultado={resultado} />
        </div>
      </form>
    </details>
  );
}
