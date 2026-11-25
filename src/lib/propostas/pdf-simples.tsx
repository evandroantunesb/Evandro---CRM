import { Document, Font, Image, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_TIPO_COMPONENTE_KIT } from "@/lib/tipos";
import { FONTES_PDF } from "./fontes-pdf";
import { CondicoesPagamentoPdf } from "./pdf-condicoes";
import { SecoesEconomia } from "./pdf-economia";
import {
  coberturaDoConsumo,
  dataBr,
  economiaDaEmissao,
  linhasCondicoesPagamento,
  linkWhatsappDaProposta,
  textoPremissaGeracao,
  type DadosEmissaoSimples,
  type Institucional,
} from "./proposta-simples";

// Manrope nos títulos e Inter nos textos (identidade do Raion), embutidas: nada é buscado na rede na hora de gerar.
for (const fonte of FONTES_PDF) Font.register({ family: fonte.family, src: fonte.src, fontWeight: fonte.fontWeight });

const TITULO = { fontFamily: "Manrope", fontWeight: 700 } as const;
const NEGRITO = { fontFamily: "Inter", fontWeight: 600 } as const;

/**
 * PDF da proposta simples, seguindo a estrutura aprovada em `docs/referencias/proposta-solar-ibs.html` (spec
 * PROPOSTA_PDF_LAYOUT_IBS.md) e o "depois" aprovado pelo Evandro em 24/11/2026: capa fotográfica com três
 * indicadores, "Sobre a empresa" (só quando a empresa escreveu conteúdo institucional), página do sistema e página de
 * oferta e fechamento (investimento, linha do tempo, pós-venda e QR do WhatsApp). Esquema 7: com a economia do cálculo
 * v2 vigente, a capa mostra a economia por mês e a seção "Sua economia" (pdf-economia.tsx) entra depois do sistema;
 * sem ela, os mesmos espaços mostram potência, geração e cobertura do consumo (só se a produtividade estiver
 * confirmada) e a descrição verificável da solução. Depois da capa, as seções correm em fluxo contínuo: a
 * folha vira quando enche, com o mesmo cabeçalho e a numeração total no rodapé, e seção ausente não deixa espaço.
 * Identidade (cores, logo, foto de capa) vem da empresa emissora; nada da marca de exemplo é reproduzido.
 */

export type ImagensDoPdf = { logoUrl: string | null; fotoCapaUrl: string | null };

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Paleta escura derivada da identidade da empresa (a referência é escura; a marca vem de quem emite). */
export function paletaDaEmpresa(primaria: string, destaque: string) {
  const base = HEX.test(primaria) ? primaria : "#0F0F10";
  const fundo = luminancia(base) > 0.12 ? mix(base, "#000000", 0.78) : base;
  const acento = HEX.test(destaque) ? destaque : "#D4AF37";
  return {
    fundo,
    cartao: mix(fundo, "#FFFFFF", 0.07),
    borda: mix(fundo, "#FFFFFF", 0.16),
    texto: "#FFFFFF",
    suave: mix("#FFFFFF", fundo, 0.32),
    acento,
    acentoSuave: mix(fundo, acento, 0.22),
    verde: "#34D399",
  };
}


function criarEstilos(p: ReturnType<typeof paletaDaEmpresa>) {
  return StyleSheet.create({
    pagina: { backgroundColor: p.fundo, color: p.texto, fontFamily: "Inter", fontSize: 10, paddingTop: 0, paddingBottom: 40, paddingHorizontal: 0 },
    barraTopo: { height: 4, backgroundColor: p.acento },
    miolo: { paddingHorizontal: 40, paddingTop: 8 },
    cabecalho: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: p.borda, marginBottom: 6 },
    marca: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginRight: 10 },
    marcaNome: { fontSize: 11, ...TITULO },
    etiqueta: { flexShrink: 0, borderWidth: 1, borderColor: p.borda, backgroundColor: p.acentoSuave, color: p.acento, fontSize: 7.5, ...NEGRITO, letterSpacing: 1, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 10 },
    cartao: { backgroundColor: p.cartao, borderWidth: 1, borderColor: p.borda, borderRadius: 10, padding: 10, marginBottom: 6 },
    tituloCartao: { fontSize: 12, ...TITULO, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: p.acento, paddingLeft: 8 },
    mini: { flex: 1, backgroundColor: p.fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 10 },
    miniRotulo: { fontSize: 7, ...NEGRITO, letterSpacing: 0.8, color: p.acento, marginBottom: 4 },
    miniValor: { fontSize: 13, ...TITULO },
    miniSub: { fontSize: 8, color: p.suave, marginTop: 3 },
    linhaItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: p.fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 6, marginBottom: 5 },
    qtd: { width: 34, height: 26, borderRadius: 6, backgroundColor: p.acentoSuave, borderWidth: 1, borderColor: p.borda, alignItems: "center", justifyContent: "center" },
    qtdTexto: { fontSize: 9, ...NEGRITO, color: p.acento },
    itemTitulo: { fontSize: 9.5, ...NEGRITO },
    itemSub: { fontSize: 8, color: p.suave, marginTop: 2 },
    pilula: { fontSize: 8, ...NEGRITO, color: p.fundo, backgroundColor: p.verde, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
    lista: { gap: 4 },
    itemLista: { flexDirection: "row", gap: 6 },
    ponto: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
    rodape: { position: "absolute", bottom: 18, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: p.suave, borderTopWidth: 1, borderTopColor: p.borda, paddingTop: 7 },
  });
}

const numero = (n: number) => n.toLocaleString("pt-BR");

function Cabecalho({ dados, imagens, e }: { dados: DadosEmissaoSimples; imagens: ImagensDoPdf; e: ReturnType<typeof criarEstilos> }) {
  const nome = dados.identidade.nomeExibicao;
  return (
    <View fixed>
      <View style={e.barraTopo} />
      <View style={[e.miolo, { paddingTop: 10 }]}>
        <View style={e.cabecalho}>
          <View style={e.marca}>
            {imagens.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={imagens.logoUrl} style={{ height: 22, width: 90, objectFit: "contain" }} />
            ) : null}
            {nome && !imagens.logoUrl ? <Text style={e.marcaNome}>{nome}</Text> : null}
          </View>
          <Text style={e.etiqueta}>{`ENERGIA SOLAR · ${dados.cliente.nome.toUpperCase()}`.slice(0, 38)}</Text>
        </View>
      </View>
    </View>
  );
}

/** Rodapé de toda página do miolo: o nome da empresa; na última, o aviso aprovado (sem economia nem retorno). */
function Rodape({ dados, e }: { dados: DadosEmissaoSimples; e: ReturnType<typeof criarEstilos> }) {
  const nome = dados.identidade.nomeExibicao || "Proposta de energia solar";
  return (
    <View style={e.rodape} fixed>
      <Text style={{ flex: 1 }} render={({ pageNumber, totalPages }) => (pageNumber === totalPages ? dados.rodape : nome)} />
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Capa({ dados, imagens, p }: { dados: DadosEmissaoSimples; imagens: ImagensDoPdf; p: ReturnType<typeof paletaDaEmpresa> }) {
  const s = dados.sistema;
  const cobertura = coberturaDoConsumo(dados);
  const emitida = new Date(dados.emissao.emitidaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const inversor = s.componentes.find((c) => c.tipo === "inversor");
  const economia = economiaDaEmissao(dados);
  const cartaoBase = { flex: 1, backgroundColor: mix(p.fundo, "#FFFFFF", 0.09), borderWidth: 1, borderColor: p.borda, borderRadius: 10, padding: 12 } as const;
  return (
    <Page size="A4" style={{ backgroundColor: p.fundo, padding: 0, color: p.texto, fontFamily: "Inter" }}>
      <View style={{ position: "relative", width: "100%", height: "100%" }}>
      {imagens.fotoCapaUrl ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={imagens.fotoCapaUrl} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: p.fundo, opacity: 0.62 }} />
        </>
      ) : null}
      <View style={{ position: "absolute", top: 0, left: 0, width: 10, height: "100%", backgroundColor: p.acento }} />
      <View style={{ paddingHorizontal: 52, paddingTop: 52 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          {imagens.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={imagens.logoUrl} style={{ height: 40, width: 150, objectFit: "contain" }} />
          ) : (
            <Text style={{ fontSize: 16, ...TITULO }}>{dados.identidade.nomeExibicao || "Proposta comercial"}</Text>
          )}
          <View style={{ borderWidth: 1, borderColor: p.borda, backgroundColor: mix(p.fundo, "#FFFFFF", 0.08), borderRadius: 8, padding: 9 }}>
            <Text style={{ fontSize: 8.5, color: p.suave, textAlign: "right" }}>
              {"Proposta nº "}
              <Text style={{ ...NEGRITO, color: p.acento }}>{dados.emissao.versao}</Text>
            </Text>
            <Text style={{ fontSize: 8.5, color: p.suave, textAlign: "right", marginTop: 2 }}>{`Emissão: ${emitida}`}</Text>
            <Text style={{ fontSize: 8.5, color: p.suave, textAlign: "right", marginTop: 2 }}>
              {"Válida até "}
              <Text style={{ ...NEGRITO, color: p.acento }}>{dataBr(dados.comercial.validadeAte)}</Text>
            </Text>
          </View>
        </View>
      </View>
      <View style={{ position: "absolute", left: 52, right: 52, bottom: 60 }}>
        <View style={{ width: 40, height: 3, backgroundColor: p.acento, marginBottom: 14 }} />
        <Text style={{ alignSelf: "flex-start", fontSize: 8, ...NEGRITO, letterSpacing: 1.4, color: p.acento, borderWidth: 1, borderColor: p.borda, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, marginBottom: 12 }}>
          PROPOSTA COMERCIAL · ENERGIA SOLAR
        </Text>
        <Text style={{ fontSize: 28, ...TITULO, lineHeight: 1.15 }}>{dados.cliente.nome}</Text>
        {dados.cliente.endereco ? <Text style={{ fontSize: 11, color: p.suave, marginTop: 6 }}>{dados.cliente.endereco}</Text> : null}
        <View style={{ height: 1, backgroundColor: p.borda, marginVertical: 18 }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={cartaoBase}>
            <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.suave }}>POTÊNCIA DO SISTEMA</Text>
            <Text style={{ fontSize: 19, ...TITULO, color: p.acento, marginTop: 6 }}>{`${numero(s.potenciaKwp)} kWp`}</Text>
            <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>Soma dos módulos do kit</Text>
          </View>
          <View style={cartaoBase}>
            {s.geracao ? (
              <>
                <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.suave }}>GERAÇÃO ESTIMADA</Text>
                <Text style={{ fontSize: 19, ...TITULO, marginTop: 6 }}>{`${numero(Math.round(s.geracao.kwhMes))} kWh/mês`}</Text>
                <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>{cobertura != null ? `cobre ${numero(cobertura)}% do seu consumo` : "Estimativa comercial"}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.suave }}>CONSUMO INFORMADO</Text>
                <Text style={{ fontSize: 19, ...TITULO, marginTop: 6 }}>{`${numero(s.consumoMedioKwh)} kWh/mês`}</Text>
                <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>Média informada pelo cliente</Text>
              </>
            )}
          </View>
          {economia ? (
            <View style={cartaoBase}>
              <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.suave }}>ECONOMIA ESTIMADA</Text>
              <Text style={{ fontSize: 19, ...TITULO, color: p.acento, marginTop: 6 }}>{`${formatarMoeda(Math.round(economia.economiaMensal)).replace(/,00$/, "")}/mês`}</Text>
              <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>na conta de energia</Text>
            </View>
          ) : (
          <View style={cartaoBase}>
            <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.suave }}>SOLUÇÃO</Text>
            <Text style={{ fontSize: 19, ...TITULO, marginTop: 6 }}>
              {s.modulos ? `${numero(s.modulos.quantidade)} ${s.modulos.quantidade === 1 ? "módulo" : "módulos"}` : "Kit completo"}
            </Text>
            <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>
              {s.modulos?.potenciaW ? `de ${numero(s.modulos.potenciaW)} W cada` : inversor ? inversor.descricao.slice(0, 40) : "Equipamentos listados"}
            </Text>
          </View>
          )}
        </View>
      </View>
      </View>
    </Page>
  );
}

/** Números do sistema, equipamentos e garantias. */
function SecoesSistema({ dados, e, p }: { dados: DadosEmissaoSimples; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const s = dados.sistema;
  const cobertura = coberturaDoConsumo(dados);
  return (
    <>
        <View style={e.cartao} wrap={false}>
          <Text style={e.tituloCartao}>Seu sistema solar em números simples</Text>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <View style={e.mini}>
              <Text style={e.miniRotulo}>MÓDULOS</Text>
              <Text style={e.miniValor}>{s.modulos ? numero(s.modulos.quantidade) : "—"}</Text>
              <Text style={e.miniSub}>{s.modulos?.potenciaW ? `de ${numero(s.modulos.potenciaW)} W` : "conforme a lista"}</Text>
            </View>
            <View style={e.mini}>
              <Text style={e.miniRotulo}>POTÊNCIA</Text>
              <Text style={e.miniValor}>{`${numero(s.potenciaKwp)} kWp`}</Text>
              <Text style={e.miniSub}>soma dos módulos</Text>
            </View>
            {s.geracao ? (
              <View style={e.mini}>
                <Text style={e.miniRotulo}>ENERGIA GERADA</Text>
                <Text style={e.miniValor}>{`${numero(Math.round(s.geracao.kwhMes))} kWh/mês`}</Text>
                <Text style={e.miniSub}>{`cerca de ${numero(Math.round(s.geracao.kwhMes * 12))} kWh/ano`}</Text>
              </View>
            ) : null}
            {cobertura != null ? (
              <View style={e.mini}>
                <Text style={e.miniRotulo}>COBERTURA</Text>
                <Text style={e.miniValor}>{`${numero(cobertura)}%`}</Text>
                <Text style={e.miniSub}>{`do consumo de ${numero(s.consumoMedioKwh)} kWh`}</Text>
              </View>
            ) : (
              <View style={e.mini}>
                <Text style={e.miniRotulo}>CONSUMO</Text>
                <Text style={e.miniValor}>{`${numero(s.consumoMedioKwh)} kWh`}</Text>
                <Text style={e.miniSub}>por mês, informado</Text>
              </View>
            )}
          </View>
          {s.geracao ? <Text style={{ fontSize: 7.5, color: p.suave, marginTop: 9, lineHeight: 1.4 }}>{textoPremissaGeracao(dados)}</Text> : null}
        </View>

        <View style={e.cartao} wrap={false}>
          <Text style={e.tituloCartao}>Equipamentos que serão instalados</Text>
          {s.componentes.map((c, i) => (
            <View key={i} style={e.linhaItem}>
              <View style={e.qtd}>
                <Text style={e.qtdTexto}>{`${c.quantidade}x`}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={e.itemTitulo}>{c.descricao}</Text>
                <Text style={e.itemSub}>{ROTULO_TIPO_COMPONENTE_KIT[c.tipo]}</Text>
              </View>
              {c.potenciaW != null ? <Text style={[e.pilula, { backgroundColor: p.acentoSuave, color: p.acento }]}>{`${numero(c.potenciaW)} W`}</Text> : null}
            </View>
          ))}
        </View>

        {/* Garantias junto dos equipamentos: a página de oferta fica livre para as condições de pagamento. */}
        {dados.comercial.garantias ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>Garantias</Text>
            <View style={e.lista}>
              {dados.comercial.garantias.map((g, i) => (
                <View key={i} style={e.itemLista}>
                  <View style={[e.ponto, { backgroundColor: p.acento }]} />
                  <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.3 }}>{g}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
    </>
  );
}

function Colunas({ dados, e, p }: { dados: DadosEmissaoSimples; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const { incluso, exclusos } = dados.comercial;
  if (!incluso && !exclusos) return null;
  const coluna = (titulo: string, itens: string[], cor: string, fundo: string) => (
    <View style={{ flex: 1, backgroundColor: fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 8 }}>
      <Text style={{ fontSize: 8.5, ...NEGRITO, letterSpacing: 0.7, color: cor, marginBottom: 5 }}>{titulo}</Text>
      <View style={e.lista}>
        {itens.map((item, i) => (
          <View key={i} style={e.itemLista}>
            <View style={[e.ponto, { backgroundColor: cor }]} />
            <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.3 }}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
  return (
    <View style={e.cartao} wrap={false}>
      <Text style={e.tituloCartao}>O que está incluso na sua proposta</Text>
      <View style={{ flexDirection: "row", gap: 9 }}>
        {incluso ? coluna("INCLUSO", incluso, p.verde, mix(p.fundo, p.verde, 0.1)) : null}
        {exclusos ? coluna("NÃO INCLUSO", exclusos, "#F87171", mix(p.fundo, "#F87171", 0.08)) : null}
      </View>
    </View>
  );
}

/** Incluso, investimento, linha do tempo, pós-venda e fechamento. */
function SecoesOferta({ dados, e, p }: { dados: DadosEmissaoSimples; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const c = dados.comercial;
  return (
    <>
        <Colunas dados={dados} e={e} p={p} />

        <View style={e.cartao} wrap={false}>
          {/* Valor na faixa do título e condições em largura total: as condições por modalidade cabem nas 3 páginas. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: p.acento, backgroundColor: p.acentoSuave, borderRadius: 9, paddingVertical: 5, paddingHorizontal: 10 }}>
            <View>
              <Text style={{ fontSize: 12, ...TITULO }}>Investimento</Text>
              <Text style={{ fontSize: 7, ...NEGRITO, letterSpacing: 1, color: p.suave, marginTop: 2 }}>VALOR DA PROPOSTA</Text>
            </View>
            <Text style={{ fontSize: 22, ...TITULO }}>{formatarMoeda(dados.preco.valor)}</Text>
          </View>
          {dados.esquema !== 4 ? (
            <CondicoesPagamentoPdf condicoes={dados.comercial.condicoesPagamento} p={p} />
          ) : linhasCondicoesPagamento(dados).length > 0 ? (
            // Esquema 4 (texto livre): uma opção por linha.
            <View style={{ marginTop: 7 }}>
              <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.acento, marginBottom: 4 }}>CONDIÇÕES DE PAGAMENTO</Text>
              <View style={{ gap: 2.5 }}>
                {linhasCondicoesPagamento(dados).map((opcao, i) => (
                  <View key={i} style={e.itemLista}>
                    <View style={[e.ponto, { backgroundColor: p.acento, marginTop: 3.5 }]} />
                    <Text style={{ flex: 1, fontSize: 8.5, lineHeight: 1.3 }}>{opcao}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {c.etapas ? <LinhaDoTempo etapas={c.etapas} e={e} p={p} /> : null}

        {(dados.esquema === 6 || dados.esquema === 7) && dados.comercial.posVenda ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>Depois da instalação</Text>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {dados.comercial.posVenda.map((item, i) => (
                <View key={i} style={[e.mini, e.itemLista, { padding: 8 }]}>
                  <View style={[e.ponto, { backgroundColor: p.acento }]} />
                  <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.35 }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Fechamento dados={dados} p={p} />
    </>
  );
}

/** Etapas da empresa em linha do tempo: círculos numerados ligados por uma linha, com prazo e descrição embaixo. */
function LinhaDoTempo({ etapas, e, p }: { etapas: NonNullable<DadosEmissaoSimples["comercial"]["etapas"]>; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const meia = 50 / etapas.length;
  return (
    <View style={e.cartao} wrap={false}>
      <Text style={e.tituloCartao}>Do contrato à energia ligada</Text>
      <View style={{ position: "relative", flexDirection: "row" }}>
        {etapas.length > 1 ? <View style={{ position: "absolute", top: 9, left: `${meia}%`, right: `${meia}%`, height: 1.5, backgroundColor: p.borda }} /> : null}
        {etapas.map((et, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }}>
            <View style={{ width: 19, height: 19, borderRadius: 10, borderWidth: 1.5, borderColor: p.acento, backgroundColor: p.acentoSuave, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 8, ...TITULO, color: p.acento }}>{i + 1}</Text>
            </View>
            <Text style={{ fontSize: 9, ...NEGRITO, marginTop: 5, textAlign: "center" }}>{et.titulo}</Text>
            {et.prazo ? <Text style={{ fontSize: 7.5, ...NEGRITO, color: p.acento, marginTop: 2, textAlign: "center" }}>{et.prazo}</Text> : null}
            {et.descricao ? <Text style={{ fontSize: 7.5, color: p.suave, marginTop: 2, lineHeight: 1.35, textAlign: "center" }}>{et.descricao}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** QR code desenhado em vetor (nítido em qualquer zoom), uma faixa por sequência de módulos escuros na linha. */
function QrCodePdf({ texto, tamanho }: { texto: string; tamanho: number }) {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const faixas: { x: number; y: number; w: number }[] = [];
  for (let y = 0; y < n; y++) {
    let inicio = -1;
    for (let x = 0; x <= n; x++) {
      const escuro = x < n && modules.get(y, x);
      if (escuro && inicio < 0) inicio = x;
      if (!escuro && inicio >= 0) {
        faixas.push({ x: inicio, y, w: x - inicio });
        inicio = -1;
      }
    }
  }
  const borda = 2;
  return (
    <Svg width={tamanho} height={tamanho} viewBox={`0 0 ${n + borda * 2} ${n + borda * 2}`}>
      <Rect x={0} y={0} width={n + borda * 2} height={n + borda * 2} fill="#FFFFFF" />
      {faixas.map((f, i) => (
        <Rect key={i} x={f.x + borda} y={f.y + borda} width={f.w} height={1} fill="#000000" />
      ))}
    </Svg>
  );
}

/** Faixa final: próximos passos, WhatsApp e validade; com QR do WhatsApp quando o número é um telefone válido. */
function Fechamento({ dados, p }: { dados: DadosEmissaoSimples; p: ReturnType<typeof paletaDaEmpresa> }) {
  const link = (dados.esquema === 6 || dados.esquema === 7) ? linkWhatsappDaProposta(dados) : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderLeftWidth: 3, borderLeftColor: p.acento, backgroundColor: p.cartao, borderRadius: 9, padding: 9 }} wrap={false}>
      {link ? <QrCodePdf texto={link} tamanho={62} /> : null}
      <View style={{ flex: 1 }}>
        {/* Duas linhas: título e WhatsApp; convite e validade. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 11.5, ...TITULO, flexShrink: 1 }}>{dados.identidade.nomeExibicao ? `${dados.identidade.nomeExibicao}: próximos passos` : "Próximos passos"}</Text>
          {dados.identidade.whatsapp ? <Text style={{ fontSize: 11, ...NEGRITO, color: p.verde }}>{`WhatsApp: ${dados.identidade.whatsapp}`}</Text> : null}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: p.suave, flexShrink: 1 }}>
            {link ? "Aponte a câmera para o QR code e fale com o seu consultor pelo WhatsApp." : "Fale com seu consultor para tirar dúvidas e avançar com a sua proposta."}
          </Text>
          <Text style={{ fontSize: 9, color: p.suave }}>
            {"Válida até "}
            <Text style={{ ...NEGRITO, color: p.texto }}>{dataBr(dados.comercial.validadeAte)}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

/** "Sobre a empresa": só o que a empresa escreveu nos blocos institucionais do modelo; seção vazia não aparece. */
function SecoesSobre({ inst, e, p }: { inst: Institucional; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const iniciais = (nome: string) =>
    nome
      .split(/\s+/)
      .filter((parte) => /^[A-Za-zÀ-ÿ]/.test(parte))
      .slice(0, 2)
      .map((parte) => parte[0]!.toUpperCase())
      .join("");
  return (
    <>
        {inst.sobre ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>Quem somos</Text>
            <Text style={{ fontSize: 9.5, lineHeight: 1.5 }}>{inst.sobre}</Text>
          </View>
        ) : null}
        {inst.numeros ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>Nossos números</Text>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {inst.numeros.map((n, i) => (
                <View key={i} style={e.mini}>
                  <Text style={[e.miniValor, { color: p.acento }]}>{n.valor}</Text>
                  <Text style={e.miniSub}>{n.rotulo}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {inst.projetos ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>Projetos que já entregamos</Text>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {inst.projetos.map((pr, i) => (
                <View key={i} style={e.mini}>
                  <Text style={e.itemTitulo}>{pr.titulo}</Text>
                  {pr.descricao ? <Text style={e.miniSub}>{pr.descricao}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {inst.depoimentos ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>O que nossos clientes dizem</Text>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {inst.depoimentos.map((d, i) => (
                <View key={i} style={e.mini}>
                  <Text style={{ fontSize: 9, lineHeight: 1.45 }}>{`“${d.texto}”`}</Text>
                  <Text style={[e.miniSub, { ...NEGRITO, color: p.acento, marginTop: 6 }]}>{d.nome}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {inst.equipe ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>Nossa equipe</Text>
            {inst.equipe.map((m, i) => (
              <View key={i} style={e.linhaItem}>
                <View style={[e.qtd, { width: 26, borderRadius: 13 }]}>
                  <Text style={e.qtdTexto}>{iniciais(m.nome) || "•"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={e.itemTitulo}>{m.registro ? `${m.nome} · ${m.registro}` : m.nome}</Text>
                  {m.texto ? <Text style={e.itemSub}>{m.texto}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
    </>
  );
}

export function PropostaSimplesPdfDocument({ dados, imagens }: { dados: DadosEmissaoSimples; imagens: ImagensDoPdf }) {
  const p = paletaDaEmpresa(dados.identidade.corPrimaria, dados.identidade.corDestaque);
  const e = criarEstilos(p);
  const institucional = (dados.esquema === 6 || dados.esquema === 7) ? dados.institucional : null;
  const economia = economiaDaEmissao(dados);
  return (
    <Document title={`Proposta - ${dados.cliente.nome}`}>
      <Capa dados={dados} imagens={imagens} p={p} />
      {/* Miolo em fluxo contínuo (pedido do Evandro, 24/11/2026): as seções seguem uma atrás da outra e a folha vira
          quando enche, sem cartão cortado ao meio; seção desligada no modelo só encurta a proposta, sem deixar vazio. */}
      <Page size="A4" style={e.pagina}>
        <Cabecalho dados={dados} imagens={imagens} e={e} />
        <View style={e.miolo}>
          {institucional ? <SecoesSobre inst={institucional} e={e} p={p} /> : null}
          <SecoesSistema dados={dados} e={e} p={p} />
          {economia ? <SecoesEconomia economia={economia} p={p} /> : null}
          <SecoesOferta dados={dados} e={e} p={p} />
        </View>
        <Rodape dados={dados} e={e} />
      </Page>
    </Document>
  );
}
