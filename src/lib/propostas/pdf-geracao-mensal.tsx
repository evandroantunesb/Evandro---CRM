import { Line, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { escalaDoGrafico, legendaConsumo, MESES_ABREV, NOTA_GERACAO_MENSAL, resumoGeracaoMensal, type SerieMensal } from "@/lib/geracao-mensal";

/**
 * Seção "Geração e consumo mês a mês" do PDF (esquema 8; prévia aprovada pelo Evandro em 25/11/2026): barras da
 * geração (cor de destaque da empresa) e do consumo (cinza) de janeiro a dezembro, com eixo em kWh, a linha do maior e
 * do menor mês e a nota sobre os créditos. Só com os dados congelados na emissão.
 */

type Paleta = { fundo: string; cartao: string; borda: string; texto: string; suave: string; acento: string };

const TITULO = { fontFamily: "Manrope", fontWeight: 700 } as const;
const CINZA_BARRA = "#6B7280";
/** Metade da altura do rótulo do eixo: o texto fica centrado na linha da marca. */
const ROTULO_TOPO = 4;

export function SecaoGeracaoMensal({ mensal, p }: { mensal: SerieMensal; p: Paleta }) {
  const L = 440;
  const A = 130;
  const EIXO = 28;
  const { maximo, marcas } = escalaDoGrafico([...mensal.geracaoKwh, ...mensal.consumoKwh]);
  const passo = L / 12;
  const y = (v: number) => A - (Math.min(v, maximo) / maximo) * A;
  const legenda = (cor: string, texto: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: cor }} />
      <Text style={{ fontSize: 7.5, color: p.suave }}>{texto}</Text>
    </View>
  );
  return (
    <View style={{ backgroundColor: p.cartao, borderWidth: 1, borderColor: p.borda, borderRadius: 10, padding: 10, marginBottom: 6 }} wrap={false}>
      <Text style={{ fontSize: 12, ...TITULO, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: p.acento, paddingLeft: 8 }}>
        Geração e consumo mês a mês
      </Text>
      <View style={{ backgroundColor: p.fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 9 }}>
        <View style={{ flexDirection: "row", gap: 14, marginBottom: 7 - ROTULO_TOPO }}>
          {legenda(p.acento, "Geração estimada")}
          {legenda(CINZA_BARRA, legendaConsumo(mensal))}
        </View>
        {/* O rótulo do topo sobe ROTULO_TOPO acima da linha: o espaço fica reservado aqui, dentro da seção. */}
        <View style={{ flexDirection: "row", paddingTop: ROTULO_TOPO }}>
          <View style={{ width: EIXO, height: A, position: "relative" }}>
            {marcas.map((m) => (
              <Text key={m} style={{ position: "absolute", right: 4, top: y(m) - ROTULO_TOPO, fontSize: 6.5, color: p.suave }}>
                {Math.round(m).toLocaleString("pt-BR")}
              </Text>
            ))}
          </View>
          <Svg width={L} height={A}>
            {marcas.map((m) => (
              <Line key={m} x1={0} x2={L} y1={y(m)} y2={y(m)} strokeWidth={0.5} stroke={p.borda} />
            ))}
            {mensal.geracaoKwh.map((g, i) => (
              <Rect key={`g${i}`} x={i * passo + passo * 0.1} y={y(g)} width={passo * 0.42} height={A - y(g)} fill={p.acento} />
            ))}
            {mensal.consumoKwh.map((c, i) => (
              <Rect key={`c${i}`} x={i * passo + passo * 0.54} y={y(c)} width={passo * 0.34} height={A - y(c)} fill={CINZA_BARRA} />
            ))}
          </Svg>
        </View>
        <View style={{ flexDirection: "row", marginTop: 3, marginLeft: EIXO }}>
          {MESES_ABREV.map((m) => (
            <Text key={m} style={{ width: passo, textAlign: "center", fontSize: 6.8, color: p.suave }}>
              {m}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontSize: 7, color: p.suave }}>kWh por mês</Text>
          <Text style={{ fontSize: 7, color: p.texto }}>{resumoGeracaoMensal(mensal)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 7.5, color: p.suave, marginTop: 8, lineHeight: 1.4 }}>{NOTA_GERACAO_MENSAL}</Text>
    </View>
  );
}
