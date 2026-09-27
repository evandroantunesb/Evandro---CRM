import "server-only";
import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import path from "node:path";

const CARVAO = "#0F0F10";
const DOURADO = "#D4AF37";
const DOURADO_TEXTO = "#8C701D";
const CINZA = "#6B7280";

const estilos = StyleSheet.create({
  pagina: {
    paddingVertical: "18mm",
    paddingHorizontal: "16mm",
    fontFamily: "Helvetica",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { height: 24, width: 110, objectFit: "contain" },
  filete: { width: 56, height: 1.5, backgroundColor: DOURADO, marginTop: 28 },
  titulo: { marginTop: 24, fontSize: 30, fontFamily: "Helvetica-Bold", color: CARVAO, textAlign: "center", lineHeight: 1.25 },
  tituloDourado: { color: DOURADO_TEXTO },
  instrucao: { marginTop: 16, fontSize: 13, color: CINZA, textAlign: "center", lineHeight: 1.5, maxWidth: 320 },
  qrCaixa: { marginTop: 32, borderWidth: 1, borderColor: DOURADO, borderRadius: 16, padding: 20, backgroundColor: "#FFFFFF" },
  qr: { width: 260, height: 260 },
  rodape: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  rodapeTexto: { fontSize: 10, color: CINZA, marginLeft: 8 },
  rodapeDivisor: { width: 1, height: 12, backgroundColor: "rgba(212,175,55,0.6)", marginLeft: 8 },
});

/** Ícone simplificado de escudo com check, desenhado em vetor (sem depender de fonte de ícones). */
function IconeEscudo() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path
        d="M12 2 L20 5.5 V11 C20 16.5 16.8 20.8 12 22.5 C7.2 20.8 4 16.5 4 11 V5.5 Z"
        fill="none"
        stroke={CINZA}
        strokeWidth={1.6}
      />
      <Path d="M8.3 12.2 L11 14.9 L15.8 9.6" fill="none" stroke={CINZA} strokeWidth={1.6} />
    </Svg>
  );
}

/**
 * Pôster A4 de captação: peça pra o cliente final ler (feira, balcão, recepção), sem
 * texto administrativo — mesma composição usada na prévia dentro do Raion
 * (`poster-formulario.tsx`). O QR é gerado com a URL pública real do formulário.
 */
export function CapturaPdfDocument({ nome, qrCode }: { nome: string; qrCode: string }) {
  const logo = path.join(process.cwd(), "public", "marca", "logo-escuro.png");
  return (
    <Document title={`Pôster - ${nome}`}>
      <Page size="A4" style={estilos.pagina}>
        <View style={{ alignItems: "center" }}>
          {/* react-pdf's Image renders into the PDF, not the DOM — no alt text applies. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logo} style={estilos.logo} />
          <View style={estilos.filete} />
          <Text style={estilos.titulo}>
            Fale com um{"\n"}
            <Text style={estilos.tituloDourado}>especialista</Text>
          </Text>
          <Text style={estilos.instrucao}>
            Aponte a câmera do seu celular para o QR Code e abra o formulário. É rápido e leva menos de 1 minuto.
          </Text>
        </View>
        <View style={estilos.qrCaixa}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={qrCode} style={estilos.qr} />
        </View>
        <View style={estilos.rodape}>
          <IconeEscudo />
          <View style={estilos.rodapeDivisor} />
          <Text style={estilos.rodapeTexto}>Seus dados estão seguros com a Raion.</Text>
        </View>
      </Page>
    </Document>
  );
}
