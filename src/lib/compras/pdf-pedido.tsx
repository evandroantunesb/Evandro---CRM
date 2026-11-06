import "server-only";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatarMoeda } from "@/lib/formatacao";
import type { ClienteFaturamentoVM } from "./faturamento";
import { numeroPedido, type PedidoVM } from "./regras";

/** PDF do pedido de compra (prévia aprovada "PDF do pedido (A4)"), gerado na hora com os dados atuais do pedido. */

const CARVAO = "#0F0F10";
const DOURADO = "#D4AF37";
const DOURADO_TEXTO = "#7A5610";
const CINZA = "#5F6672";
const LINHA = "#E5E2DA";
const OFF = "#FAF8F3";

const e = StyleSheet.create({
  pagina: { paddingTop: 42, paddingBottom: 48, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9.5, color: CARVAO },
  cab: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: DOURADO, paddingBottom: 12, marginBottom: 16 },
  empresa: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8.5, color: CINZA, marginTop: 2 },
  numero: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  grade: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  celula: { width: "50%", paddingHorizontal: 5, marginBottom: 10 },
  bloco: { borderWidth: 1, borderColor: LINHA, borderRadius: 6, padding: 10, minHeight: 74 },
  rotulo: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: DOURADO_TEXTO, marginBottom: 4, textTransform: "uppercase" },
  forte: { fontFamily: "Helvetica-Bold" },
  linha: { lineHeight: 1.45 },
  tabela: { marginTop: 4 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CARVAO, paddingVertical: 5, color: CINZA, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINHA, paddingVertical: 5 },
  cItem: { flex: 1, paddingRight: 6 },
  cQtd: { width: 46, textAlign: "right" },
  cUn: { width: 30, paddingLeft: 6 },
  cVal: { width: 78, textAlign: "right" },
  totais: { alignSelf: "flex-end", width: 210, marginTop: 10 },
  totalLinha: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  total: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: CARVAO, paddingTop: 5, fontSize: 12, fontFamily: "Helvetica-Bold" },
  obs: { marginTop: 14, backgroundColor: OFF, borderRadius: 6, padding: 10 },
  rodape: { position: "absolute", bottom: 22, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: CINZA, borderTopWidth: 1, borderTopColor: LINHA, paddingTop: 6 },
});

const data = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export type DadosPdfPedido = {
  pedido: PedidoVM;
  obraNumero: number;
  empresa: { nome: string; cnpj: string | null };
  cliente: ClienteFaturamentoVM | null;
  orcamentoArquivo: string | null;
  contato: string | null;
  emitidoEm: string;
  geradoEm: string;
};

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={e.celula}>
      <View style={e.bloco}>
        <Text style={e.rotulo}>{titulo}</Text>
        {children}
      </View>
    </View>
  );
}

export function PedidoPdfDocument({ pedido: p, obraNumero, empresa, cliente, orcamentoArquivo, contato, emitidoEm, geradoEm }: DadosPdfPedido) {
  const subtotal = p.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const faturaCliente = p.faturarPara === "cliente";
  return (
    <Document title={`Pedido de compra ${numeroPedido(p.numero)}`}>
      <Page size="A4" style={e.pagina}>
        <View style={e.cab}>
          <View>
            <Text style={e.empresa}>{empresa.nome}</Text>
            {empresa.cnpj && <Text style={e.meta}>CNPJ {empresa.cnpj}</Text>}
          </View>
          <View>
            <Text style={[e.meta, { textAlign: "right" }]}>Pedido de compra</Text>
            <Text style={e.numero}>{numeroPedido(p.numero)}</Text>
            <Text style={[e.meta, { textAlign: "right" }]}>
              Emitido em {data(emitidoEm)} · obra nº {obraNumero}
            </Text>
          </View>
        </View>

        <View style={e.grade}>
          <Bloco titulo="Fornecedor">
            <Text style={[e.linha, e.forte]}>{p.fornecedor}</Text>
            {p.numeroFornecedor && <Text style={e.linha}>Nº do pedido no fornecedor: {p.numeroFornecedor}</Text>}
            {orcamentoArquivo && <Text style={e.linha}>Orçamento de referência: {orcamentoArquivo}</Text>}
          </Bloco>
          <Bloco titulo="Condições">
            <Text style={e.linha}>Entrega prevista: {data(p.entregaPrevista)}</Text>
            <Text style={e.linha}>Vencimento do pagamento: {data(p.vencimento)}</Text>
            <Text style={e.linha}>Frete: {p.freteModalidade === "fob" ? "FOB (por conta do comprador)" : "CIF (por conta do fornecedor)"}</Text>
            {contato && <Text style={e.linha}>Contato: {contato}</Text>}
          </Bloco>
          <Bloco titulo="Faturar para">
            {faturaCliente && cliente ? (
              <>
                <Text style={[e.linha, e.forte]}>{cliente.nome}</Text>
                {cliente.documento && <Text style={e.linha}>{cliente.pj ? "CNPJ" : "CPF"} {cliente.documento}</Text>}
                {cliente.pj && cliente.inscricaoEstadual && <Text style={e.linha}>Inscrição estadual {cliente.inscricaoEstadual}</Text>}
                {!cliente.pj && cliente.dataNascimento && <Text style={e.linha}>Nascimento {data(cliente.dataNascimento)}</Text>}
                {cliente.endereco && <Text style={e.linha}>{cliente.endereco}</Text>}
                {(cliente.telefone || cliente.email) && <Text style={e.linha}>{[cliente.telefone, cliente.email].filter(Boolean).join(" · ")}</Text>}
              </>
            ) : (
              <>
                <Text style={[e.linha, e.forte]}>{empresa.nome}</Text>
                {empresa.cnpj && <Text style={e.linha}>CNPJ {empresa.cnpj}</Text>}
              </>
            )}
          </Bloco>
          <Bloco titulo="Entregar em">
            {p.entrega ? (
              <>
                <Text style={e.linha}>{p.entrega.endereco}</Text>
                <Text style={e.linha}>
                  Recebe: {p.entrega.recebe}
                  {p.entrega.telefone ? ` · ${p.entrega.telefone}` : ""}
                </Text>
              </>
            ) : (
              <>
                <Text style={[e.linha, e.forte]}>Mesmo endereço do faturamento</Text>
                {cliente?.endereco && <Text style={e.linha}>{cliente.endereco}</Text>}
                {cliente && <Text style={e.linha}>Recebe: {cliente.nome}</Text>}
              </>
            )}
          </Bloco>
        </View>

        <View style={e.tabela}>
          <View style={e.th}>
            <Text style={e.cItem}>Item</Text>
            <Text style={e.cQtd}>Qtd.</Text>
            <Text style={e.cUn}>Un.</Text>
            <Text style={e.cVal}>Valor unit.</Text>
            <Text style={e.cVal}>Total</Text>
          </View>
          {p.itens.map((i) => (
            <View key={i.id} style={e.tr} wrap={false}>
              <Text style={e.cItem}>{i.descricao}</Text>
              <Text style={e.cQtd}>{qtd(i.quantidade)}</Text>
              <Text style={e.cUn}>{i.unidade}</Text>
              <Text style={e.cVal}>{formatarMoeda(i.valorUnitario)}</Text>
              <Text style={e.cVal}>{formatarMoeda(i.quantidade * i.valorUnitario)}</Text>
            </View>
          ))}
        </View>

        <View style={e.totais} wrap={false}>
          <View style={e.totalLinha}>
            <Text style={{ color: CINZA }}>Itens</Text>
            <Text>{formatarMoeda(subtotal)}</Text>
          </View>
          <View style={e.totalLinha}>
            <Text style={{ color: CINZA }}>Frete ({p.freteModalidade.toUpperCase()})</Text>
            <Text>{formatarMoeda(p.frete)}</Text>
          </View>
          <View style={e.total}>
            <Text>Total</Text>
            <Text>{formatarMoeda(p.valorTotal)}</Text>
          </View>
        </View>

        <View style={e.obs} wrap={false}>
          <Text style={e.rotulo}>Observações</Text>
          {p.observacao && <Text style={[e.linha, { marginBottom: 4 }]}>{p.observacao}</Text>}
          <Text style={e.linha}>
            {faturaCliente
              ? 'Nota fiscal no nome e no documento indicados em "Faturar para". Os documentos do cliente seguem à parte.'
              : 'Nota fiscal no nome e no CNPJ indicados em "Faturar para".'}
          </Text>
        </View>

        <View style={e.rodape} fixed>
          <Text>Gerado pelo Raion em {geradoEm}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
