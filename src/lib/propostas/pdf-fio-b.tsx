import { Text, View } from "@react-pdf/renderer";
import { NOTA_FIO_B_PREMISSA, PARAGRAFOS_FIO_B, rotuloAnoFioB, rotuloPercentualFioB, TITULO_FIO_B } from "./textos-economia";
import type { FioBEmitido } from "./proposta-simples";

/**
 * "Como funciona a conta com energia solar" no PDF (esquema 9; texto aprovado pelo Evandro em 26/11/2026, opção A):
 * os três parágrafos e as barras do Fio B por ano, com o ano da emissão em destaque e o ano da premissa (2029+) em
 * tom mais claro. Só com os dados congelados na emissão.
 */

type Paleta = { fundo: string; cartao: string; borda: string; texto: string; suave: string; acento: string };

const TITULO = { fontFamily: "Manrope", fontWeight: 700 } as const;
const NEGRITO = { fontFamily: "Inter", fontWeight: 600 } as const;

export function SecaoFioB({ fioB, p }: { fioB: FioBEmitido; p: Paleta }) {
  const ALTURA = 44;
  return (
    <View style={{ backgroundColor: p.cartao, borderWidth: 1, borderColor: p.borda, borderRadius: 10, padding: 10, marginBottom: 6 }} wrap={false}>
      <Text style={{ fontSize: 12, ...TITULO, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: p.acento, paddingLeft: 8 }}>{TITULO_FIO_B}</Text>
      {PARAGRAFOS_FIO_B.map((t, i) => (
        <Text key={i} style={{ fontSize: 8.5, lineHeight: 1.45, marginTop: i === 0 ? 0 : 5 }}>
          {t}
        </Text>
      ))}
      <View style={{ flexDirection: "row", gap: 5, marginTop: 9 }}>
        {fioB.anos.map((a) => {
          const hoje = a.ano === fioB.anoEmissao;
          return (
            <View key={a.ano} style={{ flex: 1, alignItems: "center" }}>
              <View style={{ width: "100%", height: ALTURA, justifyContent: "flex-end", backgroundColor: p.fundo, borderRadius: 3 }}>
                <View style={{ height: a.percentual * ALTURA, backgroundColor: p.acento, opacity: a.premissa ? 0.45 : 1, borderRadius: 2 }} />
              </View>
              <Text style={{ fontSize: 7, marginTop: 3, color: hoje ? p.texto : p.suave, ...(hoje ? NEGRITO : {}) }}>{rotuloAnoFioB(a)}</Text>
              <Text style={{ fontSize: 7, color: hoje ? p.texto : p.suave, ...(hoje ? NEGRITO : {}) }}>{rotuloPercentualFioB(a)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 7, color: p.suave, marginTop: 6 }}>{NOTA_FIO_B_PREMISSA}</Text>
    </View>
  );
}
