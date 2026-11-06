import { DocumentosClienteObra } from "@/components/compras/documentos-cliente-obra";
import type { NfClienteObraVM } from "@/lib/financeiro/dados-nf-cliente";

/**
 * Dados e documentos para a NF do cliente (prévia P2c "Administrativo: dados e documentos para a NF"), só para
 * leitura: no cartão "Nota fiscal do cliente" da ficha da obra e na aba Notas fiscais da tela Financeiro.
 */
export function DadosNfCliente({ obra, dados }: { obra: { obraId: string; empresaId: string }; dados: NfClienteObraVM }) {
  const { cliente } = dados;
  const campos: [string, string | null][] = [
    [cliente.pj ? "Razão social" : "Nome", cliente.nome],
    [cliente.pj ? "CNPJ" : "CPF", cliente.documento],
    ...(cliente.pj ? ([["Inscrição estadual", cliente.inscricaoEstadual]] as [string, string | null][]) : []),
    ["E-mail", cliente.email],
  ];
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Dados para a NF" className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-texto-2 uppercase">Dados para a NF</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {campos.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-xs text-texto-2">{rotulo}</dt>
              <dd className="break-words text-texto">{valor ?? "—"}</dd>
            </div>
          ))}
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-texto-2">Endereço</dt>
            <dd className="break-words text-texto">{cliente.endereco ?? "—"}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="Documentos do cliente" className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-texto-2 uppercase">Documentos do cliente</h3>
        <DocumentosClienteObra obra={obra} documentos={dados.documentos} podeEscrever={false} descricao="Do negócio, da Engenharia ou anexados por Compras. Só para consulta." />
      </section>
    </div>
  );
}
