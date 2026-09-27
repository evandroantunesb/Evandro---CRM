import "server-only";
import { Document, Image, Page, StyleSheet, Text } from "@react-pdf/renderer";
import path from "node:path";

const CARVAO = "#0F0F10";
const DOURADO = "#D4AF37";
const CINZA = "#6B7280";

const estilos = StyleSheet.create({
  pagina: { padding: 48, fontSize: 11, color: CARVAO, fontFamily: "Helvetica", alignItems: "center" },
  logo: { height: 22, width: 100, objectFit: "contain", marginBottom: 40, alignSelf: "flex-start" },
  rotuloTopo: { fontSize: 9, color: DOURADO, letterSpacing: 2, marginBottom: 6, fontFamily: "Helvetica-Bold", alignSelf: "flex-start" },
  titulo: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4, alignSelf: "flex-start" },
  subtitulo: { fontSize: 11, color: CINZA, marginBottom: 32, alignSelf: "flex-start" },
  qr: { width: 240, height: 240, marginBottom: 24 },
  link: { fontSize: 11, color: CARVAO, marginBottom: 8, textAlign: "center" },
  instrucao: { fontSize: 10, color: CINZA, marginBottom: 32, textAlign: "center" },
  rodape: { fontSize: 9, color: CINZA, alignSelf: "flex-start" },
});

/** PDF "cartão" do formulário de captura — QR Code + link, para imprimir ou enviar a um parceiro. */
export function CapturaPdfDocument({ nome, link, qrCode }: { nome: string; link: string; qrCode: string }) {
  const logo = path.join(process.cwd(), "public", "marca", "logo-escuro.png");
  return (
    <Document title={`Formulário - ${nome}`}>
      <Page size="A4" style={estilos.pagina}>
        {/* react-pdf's Image renders into the PDF, not the DOM — no alt text applies. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={logo} style={estilos.logo} />
        <Text style={estilos.rotuloTopo}>CAPTURA DE LEADS</Text>
        <Text style={estilos.titulo}>{nome}</Text>
        <Text style={estilos.subtitulo}>Escaneie o QR Code ou acesse o link para falar com um consultor.</Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={qrCode} style={estilos.qr} />
        <Text style={estilos.link}>{link}</Text>
        <Text style={estilos.instrucao}>Aponte a câmera do seu celular para se cadastrar.</Text>
        <Text style={estilos.rodape}>Raion CRM · gerado automaticamente</Text>
      </Page>
    </Document>
  );
}
