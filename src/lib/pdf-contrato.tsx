import "server-only";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import path from "node:path";

const CARVAO = "#0F0F10";
const DOURADO = "#D4AF37";
const CINZA = "#6B7280";

const estilos = StyleSheet.create({
  pagina: { paddingTop: "18mm", paddingBottom: "20mm", paddingHorizontal: "18mm", fontFamily: "Helvetica", fontSize: 10, color: CARVAO },
  logo: { height: 20, width: 92, objectFit: "contain" },
  filete: { width: 48, height: 1.5, backgroundColor: DOURADO, marginTop: 14, marginBottom: 14 },
  rotulo: { fontSize: 8, letterSpacing: 2, color: CINZA, textTransform: "uppercase" },
  titulo: { marginTop: 4, marginBottom: 18, fontSize: 16, fontFamily: "Helvetica-Bold" },
  linha: { lineHeight: 1.5, marginBottom: 2 },
  rodape: { position: "absolute", bottom: "10mm", left: "18mm", right: "18mm", fontSize: 8, color: CINZA, textAlign: "right" },
});

/** PDF do contrato: o mesmo texto que o cliente vê na página pública, com a marca e a paginação. */
export function ContratoPdfDocument({ titulo, conteudo }: { titulo: string | null; conteudo: string }) {
  const logo = path.join(process.cwd(), "public", "marca", "logo-escuro.png");
  return (
    <Document title={titulo ? `Contrato - ${titulo}` : "Contrato"}>
      <Page size="A4" style={estilos.pagina}>
        <View fixed>
          {/* react-pdf's Image renders into the PDF, not the DOM — no alt text applies. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logo} style={estilos.logo} />
          <View style={estilos.filete} />
        </View>
        <Text style={estilos.rotulo}>Contrato</Text>
        {titulo && <Text style={estilos.titulo}>{titulo}</Text>}
        {/* Uma linha do texto por <Text>: o react-pdf quebra a página entre linhas, e linha vazia vira espaço. */}
        {conteudo.split(/\r?\n/).map((linha, i) => (
          <Text key={i} style={estilos.linha}>
            {linha || " "}
          </Text>
        ))}
        <Text style={estilos.rodape} fixed render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}
