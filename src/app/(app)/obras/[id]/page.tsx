import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora, formatarMoeda } from "@/lib/crm";
import {
  carregarDetalheObra,
  type ContatoClienteVM,
  type MarcoDetalheVM,
  type ParticipanteObraVM,
  type SetorDetalheVM,
} from "@/lib/obras/detalhe";
import type { DadosTecnicosVM } from "@/lib/obras/tecnico";
import {
  ROTULO_ALERTA_OBRA,
  ROTULO_ESTADO_SETOR,
  ROTULO_SETOR,
  ROTULO_SITUACAO_OBRA,
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

const numero = (valor: number, casas = 2) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(valor);
const comUnidade = (valor: number | null, unidade: string) => (valor == null ? null : `${numero(valor)} ${unidade}`);

export default async function DetalheObra({ params }: PageProps<"/obras/[id]">) {
  // Lista positiva (OBRAS): os quatro papéis comerciais e `operacao`. A RLS decide o que cada um vê.
  const { atual } = await exigirPapel(...OBRAS);
  const { id } = await params;

  const supabase = await criarClienteServidor();
  const obra = await carregarDetalheObra(supabase, { empresaId: atual.empresaId, papel: atual.papel, obraId: id });
  if (!obra) notFound();

  const { resumo } = obra;
  const local = [resumo.cidade, resumo.uf].filter(Boolean).join("/");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link href="/obras" className="text-sm text-zinc-600 hover:underline">
        ← Voltar para Obras
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">{resumo.clienteNome}</h1>
        <Selo>Obra #{resumo.numero}</Selo>
        <Selo tom={TOM_SITUACAO[resumo.situacao]}>{ROTULO_SITUACAO_OBRA[resumo.situacao]}</Selo>
        {resumo.alertas.map((a) => (
          <Selo key={a} tom={TOM_ALERTA[a]}>
            {ROTULO_ALERTA_OBRA[a]}
          </Selo>
        ))}
      </div>
      {resumo.negocioId && (
        <Link href={`/negocios/${resumo.negocioId}`} className="w-fit text-sm text-zinc-600 underline hover:text-zinc-900">
          Ver negócio
        </Link>
      )}

      <Cartao titulo="Resumo">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Cliente">{resumo.clienteNome}</Campo>
          <Campo rotulo="Cidade/UF">{local || "—"}</Campo>
          <Campo rotulo="Potência">{comUnidade(resumo.potenciaKwp, "kWp") ?? "—"}</Campo>
          <Campo rotulo="Tipo de ligação">{resumo.tipoLigacao ?? "—"}</Campo>
          <Campo rotulo="Unidade consumidora">{resumo.unidadeConsumidora ?? "—"}</Campo>
          <Campo rotulo="Criada em">{formatarDataHora(resumo.criadaEm)}</Campo>
        </dl>
        {resumo.pausaMotivo && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-medium">Obra pausada.</span> Motivo: {resumo.pausaMotivo}
          </p>
        )}
        {resumo.cancelamentoMotivo && (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900">
            <span className="font-medium">Obra cancelada.</span> Motivo: {resumo.cancelamentoMotivo}
          </p>
        )}
        {obra.participantesComerciais.length > 0 && (
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <p className="mb-1 text-xs text-zinc-500">Comercial</p>
            <ListaParticipantes participantes={obra.participantesComerciais} />
          </div>
        )}
      </Cartao>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Setores</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {obra.setores.map((s) => (
            <CartaoSetor key={s.setor} setor={s} />
          ))}
        </div>
      </section>

      <Cartao titulo="Marcos">
        <ul className="flex flex-col gap-2 text-sm">
          {obra.marcos.map((m) => (
            <ItemMarco key={m.marco} marco={m} />
          ))}
        </ul>
      </Cartao>

      <Cartao titulo="Dados técnicos">
        <DadosTecnicos tecnico={obra.tecnico} />
      </Cartao>

      {obra.valorVendido != null && (
        <Cartao titulo="Valor vendido">
          <p className="text-2xl font-semibold text-zinc-900">{formatarMoeda(obra.valorVendido)}</p>
        </Cartao>
      )}

      {obra.contatoCliente && (
        <Cartao titulo="Contato do cliente">
          <ContatoCliente contato={obra.contatoCliente} />
        </Cartao>
      )}

      <Cartao titulo="Histórico">
        {obra.historico.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum evento registrado.</p>
        ) : (
          <ol className="flex flex-col">
            {obra.historico.map((h, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-t border-zinc-100 py-2 text-sm first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900">{h.tipoRotulo}</span>
                  {h.setorRotulo && <Selo>{h.setorRotulo}</Selo>}
                </div>
                {h.descricao && <p className="text-zinc-700">{h.descricao}</p>}
                <p className="text-xs text-zinc-500">
                  {formatarDataHora(h.quando)} · {h.autor}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Cartao>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{rotulo}</dt>
      <dd className="break-words text-zinc-900">{children}</dd>
    </div>
  );
}

function ListaParticipantes({ participantes }: { participantes: ParticipanteObraVM[] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {participantes.map((p, i) => (
        <li key={i} className="text-zinc-800">
          {p.nome} <span className="text-xs text-zinc-500">· {p.principal ? `${p.funcaoRotulo} principal` : p.funcaoRotulo}</span>
        </li>
      ))}
    </ul>
  );
}

/** Um setor: status, estado (parado / aguardando), desde quando e participantes ativos. */
function CartaoSetor({ setor }: { setor: SetorDetalheVM }) {
  return (
    <Cartao titulo={ROTULO_SETOR[setor.setor]}>
      <div className="flex flex-col items-start gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <Selo>{setor.statusRotulo}</Selo>
          {setor.estado === "parado" && <Selo tom="atencao">{ROTULO_ESTADO_SETOR.parado}</Selo>}
        </div>
        {setor.aguardando && setor.estado !== "concluido" && <p className="text-zinc-700">{setor.aguardando}</p>}
        {setor.paradoMotivo && <p className="text-zinc-700">Motivo da parada: {setor.paradoMotivo}</p>}
        {setor.statusDesde && <p className="text-xs text-zinc-500">Neste status desde {formatarDataHora(setor.statusDesde)}</p>}
        <div className="w-full border-t border-zinc-100 pt-2">
          <p className="mb-1 text-xs text-zinc-500">Participantes</p>
          {setor.participantes.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhum participante ativo.</p>
          ) : (
            <ListaParticipantes participantes={setor.participantes} />
          )}
        </div>
      </div>
    </Cartao>
  );
}

function ItemMarco({ marco }: { marco: MarcoDetalheVM }) {
  return (
    <li className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-zinc-900">{marco.rotulo}</span>
      <span className="flex flex-wrap items-center gap-2">
        <Selo>{marco.statusRotulo}</Selo>
        {marco.motivo && <span className="text-xs text-zinc-600">{marco.motivo}</span>}
      </span>
    </li>
  );
}

function DadosTecnicos({ tecnico }: { tecnico: DadosTecnicosVM }) {
  const campos: [string, string | null][] = [
    ["Kit", tecnico.kitNome],
    ["Potência", comUnidade(tecnico.potenciaKwp, "kWp")],
    ["Tipo de ligação", tecnico.tipoLigacao],
    ["Consumo médio", comUnidade(tecnico.consumoMedioKwh, "kWh/mês")],
    ["Geração estimada", comUnidade(tecnico.geracaoEstimadaKwhMes, "kWh/mês")],
    ["Distribuidora", tecnico.distribuidora],
    ["Tipo de telhado", tecnico.tipoTelhado],
    ["Estrutura do telhado", tecnico.estruturaTelhado],
    ["Padrão do cliente", tecnico.padraoCliente],
  ];
  const preenchidos = campos.filter((c): c is [string, string] => c[1] !== null);
  if (preenchidos.length === 0 && tecnico.kit.length === 0) return <p className="text-sm text-zinc-500">Sem dados técnicos registrados.</p>;
  return (
    <div className="flex flex-col gap-4">
      {preenchidos.length > 0 && (
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {preenchidos.map(([rotulo, valor]) => (
            <Campo key={rotulo} rotulo={rotulo}>
              {valor}
            </Campo>
          ))}
        </dl>
      )}
      {tecnico.kit.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                {["Tipo", "Descrição", "Potência", "Quantidade"].map((c) => (
                  <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tecnico.kit.map((k, i) => (
                <tr key={i} className="border-t border-zinc-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-700">{k.tipo}</td>
                  <td className="min-w-44 px-3 py-2 text-zinc-900">{k.descricao}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-700">{comUnidade(k.potenciaW, "W") ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-700">{k.quantidade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Só os campos que vieram preenchidos da RPC: nada além do que o banco liberou. */
function ContatoCliente({ contato }: { contato: ContatoClienteVM }) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      {contato.endereco && <Campo rotulo="Endereço">{contato.endereco}</Campo>}
      {contato.telefone && <Campo rotulo="Telefone">{contato.telefone}</Campo>}
      {contato.telefone2 && <Campo rotulo="Telefone 2">{contato.telefone2}</Campo>}
      {contato.documento && <Campo rotulo="CPF/CNPJ">{contato.documento}</Campo>}
    </dl>
  );
}
