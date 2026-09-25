import "server-only";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import path from "node:path";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_TIPO_LIGACAO, type ModoPreco, type TipoLigacao } from "@/lib/tipos";

const CARVAO = "#0F0F10";
const DOURADO = "#D4AF37";
const CINZA = "#6B7280";
const CINZA_CLARO = "#E5E7EB";

const estilos = StyleSheet.create({
  pagina: { padding: 40, fontSize: 11, color: CARVAO, fontFamily: "Helvetica" },
  logo: { height: 24, width: 110, marginBottom: 24, objectFit: "contain" },
  rotuloTopo: { fontSize: 9, color: DOURADO, letterSpacing: 2, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  endereco: { fontSize: 10, color: CINZA, marginBottom: 20 },
  mensagem: { fontSize: 10, color: CARVAO, marginBottom: 20, lineHeight: 1.4 },
  cartao: { borderWidth: 1, borderColor: CINZA_CLARO, borderRadius: 6, padding: 14, marginBottom: 14 },
  cartaoTitulo: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  linha: { flexDirection: "row", marginBottom: 8 },
  coluna: { width: "50%" },
  rotulo: { fontSize: 9, color: CINZA, marginBottom: 2 },
  valor: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  valorVerde: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#15803d" },
  rodape: { fontSize: 8, color: CINZA, marginTop: 10 },
});

export type DadosPropostaPdf = {
  clienteNome: string;
  clienteEndereco: string | null;
  mensagem: string | null;
  modoPreco: ModoPreco;
  kitNome: string;
  kitPotenciaKwp: number;
  tipoLigacao: TipoLigacao;
  geracaoEstimadaKwhMes: number;
  contaSemSolar: number;
  contaComSolar: number;
  economiaMensal: number;
  paybackMeses: number | null;
  kitPreco: number;
};

function numeroBr(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** PDF da proposta — mesmo conteúdo da página pública, para o cliente que prefere baixar em vez de abrir o link. */
export function PropostaPdfDocument({ dados }: { dados: DadosPropostaPdf }) {
  const logo = path.join(process.cwd(), "public", "marca", "logo-escuro.png");
  const comPreco = dados.modoPreco !== "sem_preco";

  return (
    <Document title={`Proposta - ${dados.clienteNome}`}>
      <Page size="A4" style={estilos.pagina}>
        {/* react-pdf's Image renders into the PDF, not the DOM — no alt text applies. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={logo} style={estilos.logo} />
        <Text style={estilos.rotuloTopo}>PROPOSTA DE ENERGIA SOLAR</Text>
        <Text style={estilos.titulo}>{dados.clienteNome}</Text>
        {dados.clienteEndereco && <Text style={estilos.endereco}>{dados.clienteEndereco}</Text>}
        {dados.mensagem && <Text style={estilos.mensagem}>{dados.mensagem}</Text>}

        <View style={estilos.cartao}>
          <Text style={estilos.cartaoTitulo}>O sistema</Text>
          <View style={estilos.linha}>
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Kit</Text>
              <Text style={estilos.valor}>{dados.kitNome}</Text>
            </View>
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Potência</Text>
              <Text style={estilos.valor}>{numeroBr(dados.kitPotenciaKwp)} kWp</Text>
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Ligação</Text>
              <Text style={estilos.valor}>{ROTULO_TIPO_LIGACAO[dados.tipoLigacao]}</Text>
            </View>
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Geração estimada</Text>
              <Text style={estilos.valor}>{numeroBr(dados.geracaoEstimadaKwhMes)} kWh/mês</Text>
            </View>
          </View>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.cartaoTitulo}>Sua economia</Text>
          <View style={estilos.linha}>
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Conta hoje</Text>
              <Text style={estilos.valor}>{formatarMoeda(dados.contaSemSolar)}/mês</Text>
            </View>
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Conta com o sistema</Text>
              <Text style={estilos.valor}>{formatarMoeda(dados.contaComSolar)}/mês</Text>
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Economia estimada</Text>
              <Text style={estilos.valorVerde}>{formatarMoeda(dados.economiaMensal)}/mês</Text>
            </View>
            {comPreco && dados.paybackMeses != null && (
              <View style={estilos.coluna}>
                <Text style={estilos.rotulo}>Retorno do investimento</Text>
                <Text style={estilos.valor}>{numeroBr(dados.paybackMeses)} meses</Text>
              </View>
            )}
          </View>
        </View>

        {comPreco && (
          <View style={estilos.cartao}>
            <Text style={estilos.cartaoTitulo}>Investimento</Text>
            <View style={estilos.linha}>
              {(dados.modoPreco === "avista" || dados.modoPreco === "completo") && (
                <View style={estilos.coluna}>
                  <Text style={estilos.rotulo}>À vista</Text>
                  <Text style={estilos.valor}>{formatarMoeda(dados.kitPreco)}</Text>
                </View>
              )}
              {(dados.modoPreco === "parcelado" || dados.modoPreco === "completo") && (
                <View style={estilos.coluna}>
                  <Text style={estilos.rotulo}>Parcelado</Text>
                  <Text style={estilos.valor}>Consulte condições com o vendedor</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <Text style={estilos.rodape}>
          Estimativa do modo comercial (sem simulação de engenharia). Os valores podem variar após a visita técnica.
        </Text>
      </Page>
    </Document>
  );
}
