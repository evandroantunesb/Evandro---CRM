import { Line, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { textoPaybackAnosMeses } from "@/lib/projecao-exibicao";
import { paybackDepoisDoHorizonte, saldoNoHorizonte, textoPremissasEconomia, type EconomiaEmitida } from "./economia-emissao";

/**
 * Seção "Sua economia" do PDF (esquema 7; prévia aprovada pelo Evandro em 25/11/2026): conta antes e depois, economia,
 * retorno e o gráfico do saldo nos anos que o modelo escolheu. Cada parte só aparece com o bloco ativo no modelo; sem
 * payback, o card do retorno e o gráfico somem (nunca "0 meses" nem número inventado).
 */

type Paleta = { fundo: string; cartao: string; borda: string; texto: string; suave: string; acento: string; acentoSuave: string };

const TITULO = { fontFamily: "Manrope", fontWeight: 700 } as const;
const NEGRITO = { fontFamily: "Inter", fontWeight: 600 } as const;
const CINZA_BARRA = "#6B7280";

const reais = (v: number) => `${v < 0 ? "−" : ""}R$ ${Math.abs(Math.round(v)).toLocaleString("pt-BR")}`;

function estilos(p: Paleta) {
  return StyleSheet.create({
    cartao: { backgroundColor: p.cartao, borderWidth: 1, borderColor: p.borda, borderRadius: 10, padding: 10, marginBottom: 6 },
    titulo: { fontSize: 12, ...TITULO, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: p.acento, paddingLeft: 8 },
    mini: { flex: 1, backgroundColor: p.fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 9 },
    rotulo: { fontSize: 7, ...NEGRITO, letterSpacing: 0.8, color: p.acento, marginBottom: 4 },
    valor: { fontSize: 13, ...TITULO },
    sub: { fontSize: 7.5, color: p.suave, marginTop: 3 },
    nota: { fontSize: 7.5, color: p.suave, marginTop: 8, lineHeight: 1.4 },
  });
}

function Mini({ rotulo, valor, sub, e }: { rotulo: string; valor: string; sub: string; e: ReturnType<typeof estilos> }) {
  return (
    <View style={e.mini}>
      <Text style={e.rotulo}>{rotulo}</Text>
      <Text style={e.valor}>{valor}</Text>
      <Text style={e.sub}>{sub}</Text>
    </View>
  );
}

/** Duas barras: a conta de hoje e a conta com o sistema. */
function BarrasConta({ economia, p }: { economia: EconomiaEmitida; p: Paleta }) {
  const altura = 110;
  const max = Math.max(economia.contaSemSolar, economia.contaComSolar);
  const barra = (valor: number, cor: string, rotulo: string) => (
    <View style={{ width: "38%", alignItems: "center" }}>
      <Text style={{ fontSize: 10.5, ...TITULO, marginBottom: 4 }}>{reais(valor)}</Text>
      <View style={{ width: "100%", height: Math.max(4, (valor / max) * altura), backgroundColor: cor, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
      <Text style={{ fontSize: 7.5, color: p.suave, marginTop: 4 }}>{rotulo}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", backgroundColor: p.fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 9, height: altura + 46 }}>
      {barra(economia.contaSemSolar, CINZA_BARRA, "Hoje, por mês")}
      {barra(economia.contaComSolar, p.acento, "Com solar, por mês")}
    </View>
  );
}

/** Saldo acumulado ano a ano (cinza enquanto paga o sistema, cor de destaque depois). */
function GraficoSaldo({ economia, p }: { economia: EconomiaEmitida; p: Paleta }) {
  const L = 490;
  const A = 140;
  const saldos = economia.anos.map((a) => a.saldoAcumulado ?? 0);
  const max = Math.max(0, ...saldos);
  const min = Math.min(0, ...saldos);
  const amplitude = max - min || 1;
  const zero = (max / amplitude) * A;
  const n = saldos.length;
  const passo = L / n;
  const largura = passo * 0.72;
  return (
    <View>
      <Svg width={L} height={A}>
        {saldos.map((s, i) => {
          const h = Math.max((Math.abs(s) / amplitude) * A, 1);
          return <Rect key={i} x={i * passo + (passo - largura) / 2} y={s >= 0 ? zero - h : zero} width={largura} height={h} fill={s >= 0 ? p.acento : CINZA_BARRA} />;
        })}
        <Line x1={0} x2={L} y1={zero} y2={zero} strokeWidth={0.6} stroke={p.suave} />
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 3 }}>
        {economia.anos.map((a) => (
          <Text key={a.ano} style={{ width: passo, textAlign: "center", fontSize: 6.5, color: p.suave }}>
            {a.ano === 1 || a.ano % (n <= 10 ? 1 : 5) === 0 ? String(a.ano) : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function SecoesEconomia({ economia, p }: { economia: EconomiaEmitida; p: Paleta }) {
  const e = estilos(p);
  const { blocos, horizonteAnos: N } = economia;
  const payback = textoPaybackAnosMeses(economia.paybackMeses);
  const saldo = saldoNoHorizonte(economia);
  const comGrafico = blocos.retorno && payback != null && saldo != null;
  const depois = paybackDepoisDoHorizonte(economia);
  const cards = [
    <Mini key="mes" rotulo="ECONOMIA POR MÊS" valor={reais(economia.economiaMensal)} sub="no primeiro mês" e={e} />,
    <Mini key="ano" rotulo="ECONOMIA NO 1º ANO" valor={reais(economia.economiaPrimeiroAno)} sub="já com o reajuste" e={e} />,
    ...(payback ? [<Mini key="ret" rotulo="RETORNO" valor={payback} sub="o sistema se paga" e={e} />] : []),
    <Mini key="n" rotulo={`EM ${N} ANOS`} valor={reais(economia.economiaNoHorizonte)} sub="de economia acumulada" e={e} />,
  ];
  const premissas = <Text style={e.nota}>{textoPremissasEconomia(economia)}</Text>;

  return (
    <>
      {blocos.conta || blocos.resumo ? (
        <View style={e.cartao} wrap={false}>
          <Text style={e.titulo}>Sua conta antes e depois</Text>
          <View style={{ flexDirection: "row", gap: 9 }}>
            {blocos.conta ? (
              <View style={{ flex: blocos.resumo ? 1 : undefined, width: blocos.resumo ? undefined : "100%" }}>
                <BarrasConta economia={economia} p={p} />
              </View>
            ) : null}
            {blocos.resumo ? (
              <View style={{ flex: 1.15, gap: 7 }}>
                <View style={{ flexDirection: "row", gap: 7 }}>{cards.slice(0, 2)}</View>
                <View style={{ flexDirection: "row", gap: 7 }}>{cards.slice(2)}</View>
              </View>
            ) : null}
          </View>
          {comGrafico ? null : premissas}
        </View>
      ) : null}

      {comGrafico ? (
        <View style={e.cartao} wrap={false}>
          <Text style={e.titulo}>{`Retorno do investimento em ${N} anos`}</Text>
          <View style={{ flexDirection: "row", gap: 14, marginBottom: 6 }}>
            {(
              [
                [CINZA_BARRA, "Investimento ainda não recuperado"],
                [p.acento, "Já se pagou"],
              ] as const
            ).map(([cor, texto]) => (
              <View key={texto} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: cor }} />
                <Text style={{ fontSize: 7.5, color: p.suave }}>{texto}</Text>
              </View>
            ))}
          </View>
          <GraficoSaldo economia={economia} p={p} />
          <Text style={{ fontSize: 8.5, ...NEGRITO, marginTop: 6, color: depois ? p.texto : p.acento }}>
            {depois ? `O sistema se paga em ${payback}, depois do período mostrado. A partir daí, a economia fica com você.` : `O sistema se paga em ${payback}.`}
          </Text>
          <View style={{ flexDirection: "row", gap: 7, marginTop: 8 }}>
            <Mini rotulo="INVESTIMENTO" valor={reais(economia.investimento)} sub="valor da proposta" e={e} />
            <Mini rotulo={`ECONOMIA EM ${N} ANOS`} valor={reais(economia.economiaNoHorizonte)} sub="contas que você deixa de pagar" e={e} />
            <Mini rotulo={`SALDO EM ${N} ANOS`} valor={reais(saldo!)} sub={saldo! >= 0 ? "economia menos o investimento" : "ainda pagando o sistema"} e={e} />
          </View>
          {premissas}
        </View>
      ) : !(blocos.conta || blocos.resumo) ? (
        // Só o bloco de retorno ativo e sem payback: os números ficam, sem gráfico.
        <View style={e.cartao} wrap={false}>
          <Text style={e.titulo}>Sua economia</Text>
          <View style={{ flexDirection: "row", gap: 7 }}>{cards}</View>
          {premissas}
        </View>
      ) : null}
    </>
  );
}
