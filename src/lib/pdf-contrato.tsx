import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { blocosDocumento, type Trecho } from "@/lib/documento-formatado";
import { registrarErro } from "@/lib/log";
import type { MarcaPdf } from "@/lib/marca-pdf";

const CARVAO = "#0F0F10";
const DOURADO = "#D4AF37";
const CINZA = "#6B7280";

const estilos = StyleSheet.create({
  pagina: { paddingTop: "18mm", paddingBottom: "20mm", paddingHorizontal: "18mm", fontFamily: "Helvetica", fontSize: 10, color: CARVAO },
  marca: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { maxHeight: 16, maxWidth: 72, objectFit: "contain" },
  nomeEmpresa: { fontSize: 8, color: CINZA },
  filete: { width: 48, height: 1.5, backgroundColor: DOURADO, marginTop: 14, marginBottom: 14 },
  rotulo: { fontSize: 8, letterSpacing: 2, color: CINZA, textTransform: "uppercase" },
  titulo: { marginTop: 4, marginBottom: 18, fontSize: 16, fontFamily: "Helvetica-Bold" },
  linha: { lineHeight: 1.5, marginBottom: 2 },
  titulo1: { fontSize: 13, fontFamily: "Helvetica-Bold", lineHeight: 1.3, marginTop: 4, marginBottom: 8 },
  titulo2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", lineHeight: 1.4, marginTop: 10, marginBottom: 3 },
  item: { lineHeight: 1.5, marginBottom: 2, paddingLeft: 10 },
  negrito: { fontFamily: "Helvetica-Bold" },
  rodape: { position: "absolute", bottom: "10mm", left: "18mm", right: "18mm", fontSize: 8, color: CINZA, textAlign: "right" },
});

function TrechosPdf({ trechos }: { trechos: Trecho[] }) {
  return trechos.map((t, i) =>
    t.negrito ? (
      <Text key={i} style={estilos.negrito}>
        {t.texto}
      </Text>
    ) : (
      t.texto
    ),
  );
}

type PropsDocumento ={ rotulo: string; titulo: string | null; conteudo: string; marca: MarcaPdf };

/**
 * PDF de um documento da empresa (contrato, procuração): cabeçalho discreto com o logo e o nome da própria empresa
 * (sem logo, só o nome; nunca a marca Raion), rótulo, título, o texto linha a linha e a paginação.
 */
export function DocumentoPdf({ rotulo, titulo, conteudo, marca }: PropsDocumento) {
  return (
    <Document title={titulo ? `${rotulo} - ${titulo}` : rotulo}>
      <Page size="A4" style={estilos.pagina}>
        <View fixed>
          {(marca.logoUrl || marca.nome) && (
            <View style={estilos.marca}>
              {/* react-pdf's Image renders into the PDF, not the DOM — no alt text applies. */}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              {marca.logoUrl && <Image src={marca.logoUrl} style={estilos.logo} />}
              {marca.nome && <Text style={estilos.nomeEmpresa}>{marca.nome}</Text>}
            </View>
          )}
          <View style={estilos.filete} />
        </View>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        {titulo && <Text style={estilos.titulo}>{titulo}</Text>}
        {/* Um bloco (linha do texto) por <Text>: o react-pdf quebra a página entre linhas, e linha vazia vira espaço. */}
        {blocosDocumento(conteudo).map((bloco, i) => {
          if (bloco.tipo === "vazio") {
            return (
              <Text key={i} style={estilos.linha}>
                {" "}
              </Text>
            );
          }
          const estilo =
            bloco.tipo === "titulo" ? (bloco.nivel === 1 ? estilos.titulo1 : estilos.titulo2) : bloco.tipo === "item" ? estilos.item : estilos.linha;
          return (
            <Text key={i} style={estilo}>
              {bloco.tipo === "item" ? "• " : null}
              <TrechosPdf trechos={bloco.trechos} />
            </Text>
          );
        })}
        <Text style={estilos.rodape} fixed render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}

/** Gera os bytes do PDF; se o logo não carregar (URL vencida, Storage fora do ar), gera de novo sem ele. */
export async function renderizarDocumentoPdf(props: PropsDocumento): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(await renderToBuffer(DocumentoPdf(props)));
  } catch (erro) {
    if (!props.marca.logoUrl) throw erro;
    registrarErro("O logo da empresa não carregou no PDF; gerando só com o nome.", erro);
    return new Uint8Array(await renderToBuffer(DocumentoPdf({ ...props, marca: { ...props.marca, logoUrl: null } })));
  }
}
