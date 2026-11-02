import { Text, View } from "@react-pdf/renderer";
import { secoesCondicoesEmitidas, type SecaoCondicao } from "@/lib/condicoes-pagamento-exibicao";
import type { CondicoesEmitidas } from "@/lib/condicoes-pagamento-proposta";
import type { paletaDaEmpresa } from "./pdf-simples";

const TITULO = { fontFamily: "Manrope", fontWeight: 700 } as const;
const NEGRITO = { fontFamily: "Inter", fontWeight: 600 } as const;

type Paleta = ReturnType<typeof paletaDaEmpresa>;

/**
 * Condições de pagamento da proposta (esquema 5) no PDF, organizadas por modalidade: à vista ao lado do parcelado; o
 * financiamento (opções lado a lado) e o Personalizado (partes em duas colunas) em largura total; a observação
 * embaixo. Compacto para a proposta caber em 3 páginas no pior caso.
 */
export function CondicoesPagamentoPdf({ condicoes, p }: { condicoes: CondicoesEmitidas; p: Paleta }) {
  const secoes = secoesCondicoesEmitidas(condicoes);
  const de = (m: SecaoCondicao["modalidade"]) => secoes.find((s) => s.modalidade === m);
  const linhas = [[de("aVista"), de("parcelado")], [de("financiamento")], [de("personalizado")]].map((l) => l.filter((s): s is SecaoCondicao => !!s));

  return (
    <View style={{ marginTop: 7 }}>
      <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.acento, marginBottom: 5 }}>CONDIÇÕES DE PAGAMENTO</Text>
      <View style={{ gap: 5 }}>
        {linhas
          .filter((l) => l.length > 0)
          .map((l, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6 }}>
              {l.map((s) => (
                <Modalidade key={s.modalidade} secao={s} p={p} estreita={s.modalidade === "aVista" && l.length > 1} />
              ))}
            </View>
          ))}
      </View>
      {condicoes.observacao ? <Text style={{ fontSize: 8, color: p.suave, marginTop: 6, lineHeight: 1.35 }}>{condicoes.observacao}</Text> : null}
    </View>
  );
}

function Modalidade({ secao, p, estreita }: { secao: SecaoCondicao; p: Paleta; estreita: boolean }) {
  return (
    <View style={{ ...(estreita ? { width: 112 } : { flex: 1 }), backgroundColor: p.fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 7 }}>
      {/* Título e linha de apoio na mesma linha. */}
      <Text style={{ fontSize: 7, ...NEGRITO, letterSpacing: 0.8, color: p.acento }}>
        {secao.titulo.toUpperCase()}
        {secao.subtitulo ? <Text style={{ fontFamily: "Inter", fontWeight: 400, letterSpacing: 0, color: p.suave }}>{`  ·  ${secao.subtitulo}`}</Text> : null}
      </Text>
      {secao.modalidade === "aVista" ? (
        <Text style={{ fontSize: 14, ...TITULO, marginTop: 3 }}>{secao.itens[0]!.valor}</Text>
      ) : secao.modalidade === "parcelado" ? (
        // Parcelas em grade: até 24 opções sem virar parágrafo.
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 6, rowGap: 1, marginTop: 3 }}>
          {secao.itens.map((it, i) => (
            <Text key={i} style={{ width: 78, fontSize: 7.5 }}>
              {it.valor}
            </Text>
          ))}
        </View>
      ) : (
        // Opções do financiamento lado a lado; partes do Personalizado em duas colunas.
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 3, marginTop: 2 }}>
          {secao.itens.map((it, i) => (
            <View key={i} style={secao.modalidade === "financiamento" ? { flex: 1 } : { width: "48%" }}>
              <Text style={{ fontSize: 8.5, ...NEGRITO }}>{it.valor}</Text>
              {it.detalhe ? <Text style={{ fontSize: 7.5, color: p.suave, lineHeight: 1.25 }}>{it.detalhe}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
