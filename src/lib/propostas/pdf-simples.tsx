import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_TIPO_COMPONENTE_KIT } from "@/lib/tipos";
import { FONTES_PDF } from "./fontes-pdf";
import { dataBr, opcoesDePagamento, textoPremissaGeracao, type DadosEmissaoSimples } from "./proposta-simples";

// Manrope nos títulos e Inter nos textos (identidade do Raion), embutidas: nada é buscado na rede na hora de gerar.
for (const fonte of FONTES_PDF) Font.register({ family: fonte.family, src: fonte.src, fontWeight: fonte.fontWeight });

const TITULO = { fontFamily: "Manrope", fontWeight: 700 } as const;
const NEGRITO = { fontFamily: "Inter", fontWeight: 600 } as const;

/**
 * PDF da proposta simples, seguindo a estrutura aprovada em `docs/referencias/proposta-solar-ibs.html` (spec
 * PROPOSTA_PDF_LAYOUT_IBS.md): capa fotográfica com três indicadores, página do sistema e página de oferta e
 * fechamento, com o investimento no fim. Sem economia, retorno, conta futura nem tipo de ligação: os mesmos espaços
 * mostram potência, geração (só se a produtividade estiver confirmada) e a descrição verificável da solução.
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
    <>
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
    </>
  );
}

function Rodape({ dados, pagina, e, texto }: { dados: DadosEmissaoSimples; pagina: number; e: ReturnType<typeof criarEstilos>; texto?: string }) {
  return (
    <View style={e.rodape}>
      <Text style={{ flex: 1 }}>{texto ?? (dados.identidade.nomeExibicao || "Proposta de energia solar")}</Text>
      <Text>{`${pagina} / 3`}</Text>
    </View>
  );
}

function Capa({ dados, imagens, p }: { dados: DadosEmissaoSimples; imagens: ImagensDoPdf; p: ReturnType<typeof paletaDaEmpresa> }) {
  const s = dados.sistema;
  const emitida = new Date(dados.emissao.emitidaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const inversor = s.componentes.find((c) => c.tipo === "inversor");
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
                <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>Estimativa comercial</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.suave }}>CONSUMO INFORMADO</Text>
                <Text style={{ fontSize: 19, ...TITULO, marginTop: 6 }}>{`${numero(s.consumoMedioKwh)} kWh/mês`}</Text>
                <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>Média informada pelo cliente</Text>
              </>
            )}
          </View>
          <View style={cartaoBase}>
            <Text style={{ fontSize: 7.5, ...NEGRITO, letterSpacing: 0.8, color: p.suave }}>SOLUÇÃO</Text>
            <Text style={{ fontSize: 19, ...TITULO, marginTop: 6 }}>
              {s.modulos ? `${numero(s.modulos.quantidade)} ${s.modulos.quantidade === 1 ? "módulo" : "módulos"}` : "Kit completo"}
            </Text>
            <Text style={{ fontSize: 8.5, color: p.suave, marginTop: 4 }}>
              {s.modulos?.potenciaW ? `de ${numero(s.modulos.potenciaW)} W cada` : inversor ? inversor.descricao.slice(0, 40) : "Equipamentos listados"}
            </Text>
          </View>
        </View>
      </View>
      </View>
    </Page>
  );
}

function PaginaSistema({ dados, imagens, e, p }: { dados: DadosEmissaoSimples; imagens: ImagensDoPdf; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const s = dados.sistema;
  return (
    <Page size="A4" style={e.pagina}>
      <Cabecalho dados={dados} imagens={imagens} e={e} />
      <View style={e.miolo}>
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
            <View style={e.mini}>
              <Text style={e.miniRotulo}>CONSUMO</Text>
              <Text style={e.miniValor}>{`${numero(s.consumoMedioKwh)} kWh`}</Text>
              <Text style={e.miniSub}>por mês, informado</Text>
            </View>
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
      </View>
      <Rodape dados={dados} pagina={2} e={e} />
    </Page>
  );
}

function Colunas({ dados, e, p }: { dados: DadosEmissaoSimples; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const { incluso, exclusos } = dados.comercial;
  if (!incluso && !exclusos) return null;
  const coluna = (titulo: string, itens: string[], cor: string, fundo: string) => (
    <View style={{ flex: 1, backgroundColor: fundo, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 11 }}>
      <Text style={{ fontSize: 8.5, ...NEGRITO, letterSpacing: 0.7, color: cor, marginBottom: 7 }}>{titulo}</Text>
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

function PaginaOferta({ dados, imagens, e, p }: { dados: DadosEmissaoSimples; imagens: ImagensDoPdf; e: ReturnType<typeof criarEstilos>; p: ReturnType<typeof paletaDaEmpresa> }) {
  const c = dados.comercial;
  return (
    <Page size="A4" style={e.pagina}>
      <Cabecalho dados={dados} imagens={imagens} e={e} />
      <View style={e.miolo}>
        <Colunas dados={dados} e={e} p={p} />

        {c.garantias ? (
          <View style={e.cartao} wrap={false}>
            <Text style={e.tituloCartao}>Garantias</Text>
            <View style={e.lista}>
              {c.garantias.map((g, i) => (
                <View key={i} style={e.itemLista}>
                  <View style={[e.ponto, { backgroundColor: p.acento }]} />
                  <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.3 }}>{g}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={e.cartao} wrap={false}>
          <Text style={e.tituloCartao}>Investimento</Text>
          <View style={{ borderWidth: 1, borderColor: p.acento, backgroundColor: p.acentoSuave, borderRadius: 9, padding: 11 }}>
            <Text style={{ fontSize: 8, ...NEGRITO, letterSpacing: 1, color: p.suave }}>VALOR DA PROPOSTA</Text>
            <Text style={{ fontSize: 26, ...TITULO, marginTop: 3 }}>{formatarMoeda(dados.preco.valor)}</Text>
          </View>
          {opcoesDePagamento(c.condicoesPagamento).length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 8, ...NEGRITO, letterSpacing: 0.8, color: p.acento, marginBottom: 5 }}>CONDIÇÕES DE PAGAMENTO</Text>
              {opcoesDePagamento(c.condicoesPagamento).length === 1 ? (
                <Text style={{ fontSize: 9.5, lineHeight: 1.4 }}>{opcoesDePagamento(c.condicoesPagamento)[0]}</Text>
              ) : (
                <View style={e.lista}>
                  {opcoesDePagamento(c.condicoesPagamento).map((opcao, i) => (
                    <View key={i} style={e.itemLista}>
                      <View style={[e.ponto, { backgroundColor: p.acento }]} />
                      <Text style={{ flex: 1, fontSize: 9.5, lineHeight: 1.35 }}>{opcao}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>

        {c.etapas ? (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }} wrap={false}>
            {c.etapas.map((et, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: p.cartao, borderWidth: 1, borderColor: p.borda, borderRadius: 8, padding: 8 }}>
                <Text style={{ fontSize: 7, ...NEGRITO, letterSpacing: 0.8, color: p.acento }}>{`PASSO ${i + 1}`}</Text>
                <Text style={{ fontSize: 9.5, ...NEGRITO, marginTop: 4 }}>{et.titulo}</Text>
                {et.prazo ? <Text style={{ fontSize: 8, color: p.suave, marginTop: 2 }}>{et.prazo}</Text> : null}
                {et.descricao ? <Text style={{ fontSize: 8, color: p.suave, marginTop: 3, lineHeight: 1.35 }}>{et.descricao}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ borderLeftWidth: 3, borderLeftColor: p.acento, backgroundColor: p.cartao, borderRadius: 9, padding: 10 }} wrap={false}>
          <Text style={{ fontSize: 11.5, ...TITULO }}>{dados.identidade.nomeExibicao ? `${dados.identidade.nomeExibicao}: próximos passos` : "Próximos passos"}</Text>
          <Text style={{ fontSize: 9, color: p.suave, marginTop: 4 }}>Fale com seu consultor para tirar dúvidas e avançar com a sua proposta.</Text>
          {dados.identidade.whatsapp ? <Text style={{ fontSize: 11, ...NEGRITO, color: p.verde, marginTop: 6 }}>{`WhatsApp: ${dados.identidade.whatsapp}`}</Text> : null}
          <Text style={{ fontSize: 9, color: p.suave, marginTop: 6 }}>
            {"Proposta válida até "}
            <Text style={{ ...NEGRITO, color: p.texto }}>{dataBr(c.validadeAte)}</Text>
          </Text>
        </View>
      </View>
      <Rodape dados={dados} pagina={3} e={e} texto={dados.rodape} />
    </Page>
  );
}

export function PropostaSimplesPdfDocument({ dados, imagens }: { dados: DadosEmissaoSimples; imagens: ImagensDoPdf }) {
  const p = paletaDaEmpresa(dados.identidade.corPrimaria, dados.identidade.corDestaque);
  const e = criarEstilos(p);
  return (
    <Document title={`Proposta - ${dados.cliente.nome}`}>
      <Capa dados={dados} imagens={imagens} p={p} />
      <PaginaSistema dados={dados} imagens={imagens} e={e} p={p} />
      <PaginaOferta dados={dados} imagens={imagens} e={e} p={p} />
    </Document>
  );
}
