import Link from "next/link";
import { Documento, TOM_SELO } from "@/components/financeiro/comum";
import { AnexarNf, Encerrar, FormNfCliente, RegistrarPagamento } from "@/components/financeiro/formularios";
import { estornarPagamentoConta } from "@/lib/acoes/financeiro-obra";
import { prazoConta, rotuloObra, type ContaFinanceiroVM, type NfClientePendenteVM } from "@/lib/financeiro/regras";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_CATEGORIA_CUSTO } from "@/lib/obras/custos";
import { DadosNfLinha } from "./dados-nf-linha";
import { CabecalhoTabela, LinhaFinanceiro, type AcaoLinha } from "./linha";

/** Tabelas das abas do Financeiro (desenho aprovado "Perfis · Administrativo › Financeiro"). */

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const classeSelo = "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

function Vazio({ children }: { children: string }) {
  return <p className="p-6 text-sm text-texto-2">{children}</p>;
}

function Fornecedor({ c }: { c: ContaFinanceiroVM }) {
  return (
    <>
      <p className="font-semibold text-texto">{c.fornecedor}</p>
      <p className="text-xs text-texto-2">
        {ROTULO_CATEGORIA_CUSTO[c.categoria]}
        {c.descricao && ` · ${c.descricao}`}
      </p>
    </>
  );
}

function ObraLink({ obraId, clienteNome, obraNumero }: { obraId: string; clienteNome: string | null; obraNumero: number | null }) {
  return (
    <Link href={`/obras/${obraId}`} className="text-texto underline-offset-2 hover:underline">
      {rotuloObra({ clienteNome, obraNumero })}
    </Link>
  );
}

const Valor = ({ valor }: { valor: number }) => <p className="font-medium text-texto tabular-nums md:text-right">{formatarMoeda(valor)}</p>;

const obraDe = (c: { obraId: string }, empresaId: string) => ({ obraId: c.obraId, empresaId });

const COLUNAS_A_PAGAR = "md:grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1.1fr)_120px_140px_minmax(180px,auto)]";

export function TabelaAPagar({ contas, empresaId, hoje, busca }: { contas: ContaFinanceiroVM[]; empresaId: string; hoje: string; busca: string }) {
  if (contas.length === 0) return <Vazio>{busca ? "Nenhuma conta a pagar com essa busca." : "Nenhuma conta a pagar. Quando o Administrativo lançar um pagamento a fornecedor, ele aparece aqui."}</Vazio>;
  return (
    <>
      <CabecalhoTabela
        colunas={COLUNAS_A_PAGAR}
        titulos={[{ texto: "Vence" }, { texto: "Fornecedor" }, { texto: "Obra" }, { texto: "Valor", direita: true }, { texto: "Situação" }, { texto: "" }]}
      />
      <ul>
        {contas.map((c) => {
          const prazo = prazoConta(c.vencimento, hoje);
          const acoes: AcaoLinha[] = c.podeEscrever
            ? [{ rotulo: "Registrar pagamento", principal: true, conteudo: <RegistrarPagamento obra={obraDe(c, empresaId)} contaId={c.id} hoje={hoje} /> }]
            : [];
          return (
            <LinhaFinanceiro
              key={c.id}
              colunas={COLUNAS_A_PAGAR}
              celulas={[
                <p key="v" className="text-texto tabular-nums">
                  {dataBr(c.vencimento)}
                </p>,
                <Fornecedor key="f" c={c} />,
                <ObraLink key="o" {...c} />,
                <Valor key="r" valor={c.valor} />,
                <span key="s" className={`${classeSelo} ${prazo.vencido ? TOM_SELO.vencido : TOM_SELO.aberto}`}>
                  {prazo.rotulo}
                </span>,
              ]}
              acoes={acoes}
            />
          );
        })}
      </ul>
    </>
  );
}

const COLUNAS_PAGOS = "md:grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1.1fr)_120px_minmax(0,1fr)_minmax(160px,auto)]";

export function TabelaPagos({ contas, empresaId, busca }: { contas: ContaFinanceiroVM[]; empresaId: string; busca: string }) {
  if (contas.length === 0) return <Vazio>{busca ? "Nenhum pagamento com essa busca." : "Nenhum pagamento registrado ainda."}</Vazio>;
  return (
    <>
      <CabecalhoTabela
        colunas={COLUNAS_PAGOS}
        titulos={[{ texto: "Pago em" }, { texto: "Fornecedor" }, { texto: "Obra" }, { texto: "Valor", direita: true }, { texto: "Documentos" }, { texto: "" }]}
      />
      <ul>
        {contas.map((c) => {
          const obra = obraDe(c, empresaId);
          const acoes: AcaoLinha[] = c.podeEscrever
            ? [
                ...(!c.nfNome ? [{ rotulo: "Anexar nota fiscal", principal: true, conteudo: <AnexarNf obra={obra} contaId={c.id} /> }] : []),
                {
                  rotulo: "Estornar",
                  conteudo: <Encerrar obraId={c.obraId} contaId={c.id} acaoServidor={estornarPagamentoConta} botao="Confirmar estorno" pendenteTexto="Estornando..." />,
                },
              ]
            : [];
          return (
            <LinhaFinanceiro
              key={c.id}
              colunas={COLUNAS_PAGOS}
              celulas={[
                <p key="p" className="text-texto tabular-nums">
                  {c.pagoEm ? dataBr(c.pagoEm) : "—"}
                </p>,
                <Fornecedor key="f" c={c} />,
                <ObraLink key="o" {...c} />,
                <Valor key="r" valor={c.valor} />,
                <p key="d" className="flex flex-wrap gap-x-3 text-xs text-texto-2">
                  {c.comprovanteNome && <Documento rotulo="comprovante" url={c.comprovanteUrl} />}
                  {c.nfNome ? <Documento rotulo="NF" url={c.nfUrl} /> : <span className={`${classeSelo} ${TOM_SELO.vencido}`}>NF pendente</span>}
                </p>,
              ]}
              acoes={acoes}
            />
          );
        })}
      </ul>
    </>
  );
}

const COLUNAS_NF_FORNECEDOR = "md:grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1.1fr)_120px_minmax(170px,auto)]";
const COLUNAS_NF_CLIENTE = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(170px,auto)]";

export function NotasPendentes({
  fornecedor,
  cliente,
  empresaId,
  busca,
}: {
  fornecedor: ContaFinanceiroVM[];
  cliente: NfClientePendenteVM[];
  empresaId: string;
  busca: string;
}) {
  if (fornecedor.length === 0 && cliente.length === 0)
    return <Vazio>{busca ? "Nenhuma nota pendente com essa busca." : "Nenhuma nota fiscal pendente."}</Vazio>;
  return (
    <div className="flex flex-col">
      {fornecedor.length > 0 && (
        <section aria-labelledby="nf-fornecedor">
          <h2 id="nf-fornecedor" className="border-b border-linha px-4 pt-4 pb-2 text-sm font-semibold text-texto">
            De fornecedor ({fornecedor.length})
            <span className="block text-xs font-normal text-texto-2">Pagamentos já registrados sem a nota do fornecedor.</span>
          </h2>
          <CabecalhoTabela colunas={COLUNAS_NF_FORNECEDOR} titulos={[{ texto: "Pago em" }, { texto: "Fornecedor" }, { texto: "Obra" }, { texto: "Valor", direita: true }, { texto: "" }]} />
          <ul>
            {fornecedor.map((c) => (
              <LinhaFinanceiro
                key={c.id}
                colunas={COLUNAS_NF_FORNECEDOR}
                celulas={[
                  <p key="p" className="text-texto tabular-nums">
                    {c.pagoEm ? dataBr(c.pagoEm) : "—"}
                  </p>,
                  <Fornecedor key="f" c={c} />,
                  <ObraLink key="o" {...c} />,
                  <Valor key="r" valor={c.valor} />,
                ]}
                acoes={c.podeEscrever ? [{ rotulo: "Anexar nota fiscal", principal: true, conteudo: <AnexarNf obra={obraDe(c, empresaId)} contaId={c.id} /> }] : []}
              />
            ))}
          </ul>
        </section>
      )}
      {cliente.length > 0 && (
        <section aria-labelledby="nf-cliente" className={fornecedor.length > 0 ? "border-t border-linha" : undefined}>
          <h2 id="nf-cliente" className="border-b border-linha px-4 pt-4 pb-2 text-sm font-semibold text-texto">
            Do cliente ({cliente.length})
            <span className="block text-xs font-normal text-texto-2">Obras com a instalação concluída e a nota do cliente por anexar. Anexar conclui o marco &quot;NF do cliente&quot;.</span>
          </h2>
          <CabecalhoTabela colunas={COLUNAS_NF_CLIENTE} titulos={[{ texto: "Obra" }, { texto: "Situação" }, { texto: "" }]} />
          <ul>
            {cliente.map((o) => (
              <LinhaFinanceiro
                key={o.obraId}
                colunas={COLUNAS_NF_CLIENTE}
                celulas={[
                  <ObraLink key="o" {...o} />,
                  <span key="s" className={`${classeSelo} ${TOM_SELO.vencido}`}>
                    Instalação concluída
                  </span>,
                ]}
                acoes={[
                  ...(o.podeEscrever ? [{ rotulo: "Anexar nota fiscal", principal: true, conteudo: <FormNfCliente obra={obraDe(o, empresaId)} /> }] : []),
                  { rotulo: "Dados e documentos", conteudo: <DadosNfLinha obra={obraDe(o, empresaId)} /> },
                ]}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
