import type { ReactNode } from "react";
import { Cartao, Selo } from "@/components/ui";
import { formatarDataHora } from "@/lib/crm";
import type { ContatoClienteVM, ParticipanteObraVM, SetorDetalheVM } from "@/lib/obras/detalhe";
import { ROTULO_ESTADO_SETOR, ROTULO_SETOR } from "@/lib/obras/rotulos";
import type { DadosTecnicosVM } from "@/lib/obras/tecnico";

/** Blocos de exibição do detalhe da obra, usados pela tela de Obras e pelo card da Engenharia. */

const numero = (valor: number, casas = 2) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(valor);
export const comUnidade = (valor: number | null, unidade: string) => (valor == null ? null : `${numero(valor)} ${unidade}`);

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{rotulo}</dt>
      <dd className="break-words text-zinc-900">{children}</dd>
    </div>
  );
}

export function ListaParticipantes({ participantes }: { participantes: ParticipanteObraVM[] }) {
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
export function CartaoSetor({ setor, children }: { setor: SetorDetalheVM; children?: ReactNode }) {
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
        {children}
      </div>
    </Cartao>
  );
}

/** `fixacao`: linha da fixação do telhado (escolhida na obra), logo abaixo dos campos da venda. */
export function DadosTecnicos({ tecnico, fixacao }: { tecnico: DadosTecnicosVM; fixacao?: ReactNode }) {
  const campos: [string, string | null][] = [
    ["Kit", tecnico.kitNome],
    ["Potência", comUnidade(tecnico.potenciaKwp, "kWp")],
    ["Tipo de ligação", tecnico.tipoLigacao],
    ["Consumo médio", comUnidade(tecnico.consumoMedioKwh, "kWh/mês")],
    ["Geração estimada", comUnidade(tecnico.geracaoEstimadaKwhMes, "kWh/mês")],
    ["Distribuidora", tecnico.distribuidora],
    ["Tipo de telhado", tecnico.tipoTelhado],
  ];
  const preenchidos = campos.filter((c): c is [string, string] => c[1] !== null);
  if (preenchidos.length === 0 && tecnico.kit.length === 0 && !fixacao) return <p className="text-sm text-zinc-500">Sem dados técnicos registrados.</p>;
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
      {fixacao && <dl className="min-w-0">{fixacao}</dl>}
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
export function ContatoCliente({ contato }: { contato: ContatoClienteVM }) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      {contato.endereco && <Campo rotulo="Endereço">{contato.endereco}</Campo>}
      {contato.telefone && <Campo rotulo="Telefone">{contato.telefone}</Campo>}
      {contato.telefone2 && <Campo rotulo="Telefone 2">{contato.telefone2}</Campo>}
      {contato.email && <Campo rotulo="E-mail">{contato.email}</Campo>}
      {contato.documento && <Campo rotulo="CPF/CNPJ">{contato.documento}</Campo>}
      {contato.rg && <Campo rotulo="RG">{contato.rg}</Campo>}
      {contato.nascimento && <Campo rotulo="Data de nascimento">{contato.nascimento}</Campo>}
      {contato.inscricaoEstadual && <Campo rotulo="Inscrição estadual">{contato.inscricaoEstadual}</Campo>}
    </dl>
  );
}
