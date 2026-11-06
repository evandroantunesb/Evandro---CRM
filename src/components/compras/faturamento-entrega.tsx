"use client";

import { CLASSE_ENTRADA } from "@/components/ui";
import type { FaturamentoPedidoVM } from "@/lib/compras/faturamento";

/**
 * Faturamento e entrega do pedido (prévia aprovada "Pedido: faturamento e entrega"). O endereço, quem recebe e o
 * telefone vão no envio do formulário (`entregaEndereco`, `entregaRecebe`, `entregaTelefone`) quando a entrega não é no
 * endereço do faturamento. Faturando para a empresa (sem endereço cadastrado), a entrega precisa de endereço próprio.
 */
export function FaturamentoEntrega({
  faturamento,
  faturarPara,
  aoMudarFaturarPara,
  mesmaEntrega,
  aoMudarMesmaEntrega,
  entregaInicial,
}: {
  faturamento: FaturamentoPedidoVM;
  faturarPara: "cliente" | "empresa";
  aoMudarFaturarPara: (v: "cliente" | "empresa") => void;
  mesmaEntrega: boolean;
  aoMudarMesmaEntrega: (v: boolean) => void;
  entregaInicial: { endereco: string; recebe: string; telefone: string | null } | null;
}) {
  const { cliente, empresa } = faturamento;
  const podeMesma = faturarPara === "cliente";
  const usarMesma = podeMesma && mesmaEntrega;
  const opcao = (valor: "cliente" | "empresa", rotulo: string) => (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${
        faturarPara === valor ? "border-dourado bg-dourado/10 font-medium text-texto" : "border-linha bg-superficie text-texto"
      }`}
    >
      <input type="radio" name="faturarPara" value={valor} checked={faturarPara === valor} onChange={() => aoMudarFaturarPara(valor)} className="size-4 accent-current" />
      {rotulo}
    </label>
  );
  return (
    <>
      <section className="painel flex flex-col gap-3 p-4 md:p-6">
        <h2 className="font-titulo text-lg text-texto">Faturamento</h2>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium text-texto-2">Faturar em nome de</legend>
          <div className="flex flex-wrap gap-2">
            {opcao("cliente", "Cliente")}
            {opcao("empresa", `Empresa (${empresa.nome})`)}
          </div>
          {faturarPara === "cliente" ? (
            cliente ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-superficie-2 p-3 text-sm md:p-4">
                <dt className="text-texto-2">Nome</dt>
                <dd className="text-texto">{cliente.nome}</dd>
                <dt className="text-texto-2">{cliente.pj ? "CNPJ" : "CPF"}</dt>
                <dd className="text-texto tabular-nums">{cliente.documento ?? "—"}</dd>
                {cliente.pj && (
                  <>
                    <dt className="text-texto-2">Inscrição estadual</dt>
                    <dd className="text-texto">{cliente.inscricaoEstadual ?? "—"}</dd>
                  </>
                )}
                <dt className="text-texto-2">Endereço</dt>
                <dd className="break-words text-texto">{cliente.endereco ?? "—"}</dd>
              </dl>
            ) : (
              <p className="text-sm text-texto-2">Os dados do cliente aparecem para quem atua em Compras na obra.</p>
            )
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-superficie-2 p-3 text-sm md:p-4">
              <dt className="text-texto-2">Nome</dt>
              <dd className="text-texto">{empresa.nome}</dd>
              <dt className="text-texto-2">CNPJ</dt>
              <dd className="text-texto tabular-nums">{empresa.cnpj ?? "não cadastrado"}</dd>
            </dl>
          )}
        </fieldset>
      </section>

      <section className="painel flex flex-col gap-3 p-4 md:p-6">
        <h2 className="font-titulo text-lg text-texto">Entregar em</h2>
        {podeMesma ? (
          <label className="flex min-h-11 items-center gap-2.5 text-sm text-texto">
            <input type="checkbox" checked={mesmaEntrega} onChange={(e) => aoMudarMesmaEntrega(e.target.checked)} className="size-4 accent-current" />
            Mesmos dados do faturamento
          </label>
        ) : (
          <p className="text-sm text-texto-2">A empresa não tem endereço cadastrado: informe onde entregar.</p>
        )}
        {!usarMesma && (
          <div className="grid grid-cols-1 gap-3 rounded-xl bg-superficie-2 p-3 sm:grid-cols-2 md:p-4">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-texto-2">Endereço de entrega</span>
              <input name="entregaEndereco" required minLength={5} maxLength={300} defaultValue={entregaInicial?.endereco ?? cliente?.endereco ?? undefined} className={CLASSE_ENTRADA} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Quem recebe</span>
              <input name="entregaRecebe" required minLength={2} maxLength={120} defaultValue={entregaInicial?.recebe} className={CLASSE_ENTRADA} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-texto-2">Telefone de quem recebe (opcional)</span>
              <input name="entregaTelefone" type="tel" maxLength={30} defaultValue={entregaInicial?.telefone ?? undefined} className={CLASSE_ENTRADA} />
            </label>
          </div>
        )}
      </section>
    </>
  );
}
