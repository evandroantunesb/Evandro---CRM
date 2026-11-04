import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { carregarPagamentosAConfirmar } from "@/lib/avisos-pagamento";
import { PAGAMENTOS_A_CONFIRMAR, VER_NEGOCIO_DA_OBRA, pode } from "@/lib/permissoes";
import { exigirPapel } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { LinhaPagamento } from "./linha-pagamento";

/**
 * Pagamentos a confirmar (20261113100000_aviso_pagamento_vendedor.sql): os avisos do vendedor ("o cliente pagou",
 * com comprovante) esperando conferência. Admin e gestor veem os dos negócios que enxergam; quem é do Operacional vê
 * todos da empresa, só com estes dados. Quem é da Operação sem o setor Operacional recebe a lista vazia da RPC.
 */
export default async function PagamentosAConfirmar() {
  const { atual } = await exigirPapel(...PAGAMENTOS_A_CONFIRMAR);
  const supabase = await criarClienteServidor();
  const pagamentos = await carregarPagamentosAConfirmar(supabase, atual.empresaId);
  const abreNegocio = pode(atual.papel, VER_NEGOCIO_DA_OBRA);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Operação"
        titulo="Pagamentos a confirmar"
        descricao="Vendas com contrato assinado em que o vendedor informou o pagamento. Ao confirmar, a venda passa a contar para pontos e comissão e a obra é criada."
      />
      <Cartao titulo={`Aguardando conferência (${pagamentos.length})`}>
        {pagamentos.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhum pagamento esperando confirmação. Quando um vendedor informar um pagamento, ele aparece aqui.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-linha">
            {pagamentos.map((p) => (
              <LinhaPagamento key={p.avisoId} pagamento={p} abreNegocio={abreNegocio} />
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
