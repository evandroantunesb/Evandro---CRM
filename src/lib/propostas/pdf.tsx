import "server-only";
import { Document, Image, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_TIPO_COMPONENTE_KIT, ROTULO_TIPO_LIGACAO } from "@/lib/tipos";
import { definicaoDoBloco, type TipoBloco } from "./blocos";
import { calcularQuebras } from "./pdf-paginacao";
import type { BlocoRenderizavel, DadosSistemaProposta, IdentidadeProposta } from "./pdf-tipos";

const CARVAO = "#0F0F10";
const CINZA = "#6B7280";
const CINZA_CLARO = "#E5E7EB";
const BRANCO = "#FFFFFF";
const DOURADO_PADRAO = "#D4AF37";
const HEX = /^#[0-9a-fA-F]{6}$/;

function cor(valor: string | null | undefined, fallback: string) {
  return valor && HEX.test(valor) ? valor : fallback;
}

const estilos = StyleSheet.create({
  pagina: { padding: 40, fontSize: 10.5, color: CARVAO, fontFamily: "Helvetica" },
  secao: { marginBottom: 16 },
  tituloSecao: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  linha: { flexDirection: "row", marginBottom: 8, gap: 12 },
  coluna: { flex: 1 },
  rotulo: { fontSize: 9, color: CINZA, marginBottom: 2 },
  valor: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  paragrafo: { fontSize: 10.5, lineHeight: 1.5, color: CARVAO },
  tabelaLinha: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: CINZA_CLARO, paddingVertical: 6 },
  tabelaCelula: { fontSize: 10 },
  lista: { flexDirection: "column", gap: 6 },
  itemLista: { flexDirection: "row", gap: 6, fontSize: 10.5 },
});

function Cartao({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <View style={estilos.secao}>
      {titulo && <Text style={estilos.tituloSecao}>{titulo}</Text>}
      {children}
    </View>
  );
}

function Capa({
  variante,
  identidade,
  dados,
}: {
  variante: "foto" | "minimalista" | "tecnica";
  identidade: IdentidadeProposta;
  dados: DadosSistemaProposta;
}) {
  const primaria = cor(identidade.corPrimaria, CARVAO);
  const destaque = cor(identidade.corDestaque, DOURADO_PADRAO);
  const logoClaro = identidade.logoEscuroUrl || identidade.logoUrl;

  if (variante === "foto" && identidade.fotoCapaUrl) {
    return (
      <View style={{ position: "relative", height: "100%", width: "100%" }}>
        {/* react-pdf's Image renders into the PDF, not the DOM — no alt text applies. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={identidade.fotoCapaUrl} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: CARVAO, opacity: 0.55 }} />
        <View style={{ position: "absolute", bottom: 40, left: 40, right: 40 }}>
          {logoClaro ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoClaro} style={{ height: 26, width: 120, objectFit: "contain", marginBottom: 20 }} />
          ) : (
            <Text style={{ fontSize: 14, color: BRANCO, fontFamily: "Helvetica-Bold", marginBottom: 20 }}>
              {identidade.nomeExibicao || "Proposta comercial"}
            </Text>
          )}
          <Text style={{ fontSize: 9, color: destaque, letterSpacing: 2, marginBottom: 6, fontFamily: "Helvetica-Bold" }}>
            PROPOSTA DE ENERGIA SOLAR
          </Text>
          <Text style={{ fontSize: 24, color: BRANCO, fontFamily: "Helvetica-Bold" }}>{dados.clienteNome}</Text>
          {dados.clienteEndereco && <Text style={{ fontSize: 10, color: "#E5E7EB", marginTop: 4 }}>{dados.clienteEndereco}</Text>}
        </View>
      </View>
    );
  }

  if (variante === "tecnica") {
    return (
      <View style={{ height: "100%", width: "100%" }}>
        <View style={{ height: 10, width: "100%", backgroundColor: destaque }} />
        <View style={{ padding: 40 }}>
          {identidade.logoUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={identidade.logoUrl} style={{ height: 24, width: 110, objectFit: "contain", marginBottom: 40 }} />
          )}
          <Text style={{ fontSize: 9, color: destaque, letterSpacing: 2, marginBottom: 8, fontFamily: "Helvetica-Bold" }}>
            PROPOSTA TÉCNICA · ENERGIA SOLAR
          </Text>
          <Text style={{ fontSize: 24, color: primaria, fontFamily: "Helvetica-Bold" }}>{dados.clienteNome}</Text>
          {dados.clienteEndereco && <Text style={{ fontSize: 10, color: CINZA, marginTop: 4 }}>{dados.clienteEndereco}</Text>}
          <View style={{ marginTop: 30 }}>
            <View style={estilos.linha}>
              <View style={estilos.coluna}>
                <Text style={estilos.rotulo}>Sistema</Text>
                <Text style={estilos.valor}>{dados.kitPotenciaKwp.toLocaleString("pt-BR")} kWp</Text>
              </View>
              <View style={estilos.coluna}>
                <Text style={estilos.rotulo}>Ligação</Text>
                <Text style={estilos.valor}>{ROTULO_TIPO_LIGACAO[dados.tipoLigacao]}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ height: "100%", width: "100%", backgroundColor: primaria, alignItems: "center", justifyContent: "center", padding: 60 }}>
      {logoClaro && (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={logoClaro} style={{ height: 28, width: 130, objectFit: "contain", marginBottom: 40 }} />
      )}
      <Text style={{ fontSize: 9, color: destaque, letterSpacing: 3, marginBottom: 10, fontFamily: "Helvetica-Bold" }}>PROPOSTA DE ENERGIA SOLAR</Text>
      <Text style={{ fontSize: 26, color: BRANCO, fontFamily: "Helvetica-Bold", textAlign: "center" }}>{dados.clienteNome}</Text>
      {dados.clienteEndereco && <Text style={{ fontSize: 10, color: "#E5E7EB", marginTop: 8, textAlign: "center" }}>{dados.clienteEndereco}</Text>}
    </View>
  );
}

function ComoFunciona() {
  const passos = [
    {
      titulo: "Instalação do sistema",
      texto: "Os módulos fotovoltaicos são instalados no telhado ou solo, na posição de melhor captação de luz solar.",
    },
    { titulo: "Geração de energia", texto: "Os módulos convertem a luz do sol em energia elétrica contínua (CC)." },
    { titulo: "Conversão pelo inversor", texto: "O inversor transforma a energia contínua em energia alternada (CA), pronta pro uso." },
    { titulo: "Compensação na conta", texto: "A energia gerada vira créditos que abatem sua conta de luz junto à distribuidora." },
  ];
  return (
    <Cartao titulo="Como funciona a energia solar">
      <View style={{ gap: 10 }}>
        {passos.map((p, i) => (
          <View key={p.titulo} style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: CINZA_CLARO, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{p.titulo}</Text>
              <Text style={estilos.paragrafo}>{p.texto}</Text>
            </View>
          </View>
        ))}
      </View>
    </Cartao>
  );
}

function ResumoSistema({ dados }: { dados: DadosSistemaProposta }) {
  return (
    <Cartao titulo="Seu sistema fotovoltaico">
      <View style={estilos.linha}>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Kit</Text>
          <Text style={estilos.valor}>{dados.kitNome}</Text>
        </View>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Potência</Text>
          <Text style={estilos.valor}>{dados.kitPotenciaKwp.toLocaleString("pt-BR")} kWp</Text>
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Ligação</Text>
          <Text style={estilos.valor}>{ROTULO_TIPO_LIGACAO[dados.tipoLigacao]}</Text>
        </View>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Geração média estimada</Text>
          <Text style={estilos.valor}>{dados.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh/mês</Text>
        </View>
      </View>
    </Cartao>
  );
}

function ResumoEquipamentos({ dados }: { dados: DadosSistemaProposta }) {
  const itens =
    dados.componentes.length > 0 ? dados.componentes : [{ tipo: "outro" as const, descricao: `Kit ${dados.kitNome}`, quantidade: 1, potenciaW: null }];
  return (
    <Cartao titulo="Principais equipamentos">
      <View>
        {itens.map((item, i) => (
          <View key={i} style={estilos.tabelaLinha}>
            <Text style={[estilos.tabelaCelula, { width: 70, color: CINZA }]}>{ROTULO_TIPO_COMPONENTE_KIT[item.tipo]}</Text>
            <Text style={[estilos.tabelaCelula, { flex: 1 }]}>{item.descricao}</Text>
            <Text style={[estilos.tabelaCelula, { width: 50, textAlign: "right" }]}>{item.quantidade}x</Text>
            {item.potenciaW != null && <Text style={[estilos.tabelaCelula, { width: 60, textAlign: "right" }]}>{item.potenciaW} W</Text>}
          </View>
        ))}
      </View>
    </Cartao>
  );
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function GraficoGeracaoMensal({ dados, destaque }: { dados: DadosSistemaProposta; destaque: string }) {
  const largura = 460;
  const altura = 90;
  const gap = 6;
  const larguraBarra = (largura - gap * 11) / 12;
  return (
    <Cartao titulo="Geração estimada por mês">
      <Svg width={largura} height={altura + 16}>
        {MESES.map((_, i) => (
          <Rect key={i} x={i * (larguraBarra + gap)} y={16} width={larguraBarra} height={altura} fill={destaque} opacity={0.85} />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 4 }}>
        {MESES.map((m) => (
          <Text key={m} style={{ fontSize: 7, color: CINZA, width: larguraBarra + gap, textAlign: "center" }}>
            {m}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 9, color: CINZA, marginTop: 6 }}>
        Média estimada: {dados.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh/mês (estimativa constante, sem simulação de sazonalidade).
      </Text>
    </Cartao>
  );
}

function ContaAntesDepois({ dados, primaria, destaque }: { dados: DadosSistemaProposta; primaria: string; destaque: string }) {
  const max = Math.max(dados.contaSemSolar, dados.contaComSolar, 1);
  const alturaMax = 90;
  const alturaAntes = (dados.contaSemSolar / max) * alturaMax;
  const alturaDepois = (dados.contaComSolar / max) * alturaMax;
  return (
    <Cartao titulo="Conta de energia: antes e depois">
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 40 }}>
        <View style={{ alignItems: "center" }}>
          <Svg width={70} height={alturaMax}>
            <Rect x={5} y={alturaMax - alturaAntes} width={60} height={alturaAntes} fill={CINZA} />
          </Svg>
          <Text style={{ fontSize: 9, color: CINZA, marginTop: 4 }}>Hoje</Text>
          <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>{formatarMoeda(dados.contaSemSolar)}</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Svg width={70} height={alturaMax}>
            <Rect x={5} y={alturaMax - alturaDepois} width={60} height={alturaDepois} fill={destaque} />
          </Svg>
          <Text style={{ fontSize: 9, color: CINZA, marginTop: 4 }}>Com o sistema</Text>
          <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: primaria }}>{formatarMoeda(dados.contaComSolar)}</Text>
        </View>
        <View>
          <Text style={estilos.rotulo}>Economia estimada</Text>
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: "#15803d" }}>{formatarMoeda(dados.economiaMensal)}/mês</Text>
        </View>
      </View>
    </Cartao>
  );
}

function ValorProposta({ dados, primaria }: { dados: DadosSistemaProposta; primaria: string }) {
  return (
    <Cartao titulo="Valor da proposta">
      <Text style={{ fontSize: 30, fontFamily: "Helvetica-Bold", color: primaria }}>{formatarMoeda(dados.kitPreco)}</Text>
      {dados.paybackMeses != null && (
        <Text style={{ fontSize: 10, color: CINZA, marginTop: 4 }}>Retorno estimado do investimento: {dados.paybackMeses.toLocaleString("pt-BR")} meses</Text>
      )}
    </Cartao>
  );
}

function CondicoesPagamento({ dados }: { dados: DadosSistemaProposta }) {
  return (
    <Cartao titulo="Condições de pagamento">
      <View style={estilos.linha}>
        {(dados.modoPreco === "avista" || dados.modoPreco === "completo") && (
          <View style={estilos.coluna}>
            <Text style={estilos.rotulo}>À vista</Text>
            <Text style={estilos.valor}>{formatarMoeda(dados.kitPreco)}</Text>
          </View>
        )}
        {(dados.modoPreco === "parcelado" || dados.modoPreco === "completo") && (
          <View style={estilos.coluna}>
            <Text style={estilos.rotulo}>Parcelado</Text>
            <Text style={estilos.valor}>Consulte condições com o vendedor</Text>
          </View>
        )}
      </View>
    </Cartao>
  );
}

const SERVICOS_PADRAO = [
  "Projeto e homologação junto à distribuidora",
  "Instalação e comissionamento do sistema",
  "Documentação técnica completa",
  "Suporte no período de garantia",
];

function itensDoConfig(config: unknown): string[] | null {
  if (!config || typeof config !== "object") return null;
  const itens = (config as { itens?: unknown }).itens;
  if (!Array.isArray(itens)) return null;
  const validos = itens.filter((i): i is string => typeof i === "string" && i.trim().length > 0);
  return validos.length > 0 ? validos : null;
}

function ItensInclusos({ config }: { config: unknown }) {
  const itens = itensDoConfig(config) ?? SERVICOS_PADRAO;
  return (
    <Cartao titulo="O que está incluso">
      <View style={estilos.lista}>
        {itens.map((item, i) => (
          <View key={i} style={estilos.itemLista}>
            <Text>•</Text>
            <Text style={{ flex: 1 }}>{item}</Text>
          </View>
        ))}
      </View>
    </Cartao>
  );
}

function ProximosPassos({ identidade, config, primaria, destaque }: { identidade: IdentidadeProposta; config: unknown; primaria: string; destaque: string }) {
  const cfg = (config && typeof config === "object" ? (config as Record<string, unknown>) : {}) as { texto?: string; ctaTexto?: string };
  const texto =
    typeof cfg.texto === "string" && cfg.texto.trim()
      ? cfg.texto
      : "Fale com seu vendedor pra tirar dúvidas e avançar com a instalação do seu sistema.";
  const ctaTexto = typeof cfg.ctaTexto === "string" && cfg.ctaTexto.trim() ? cfg.ctaTexto : identidade.whatsapp ? `WhatsApp: ${identidade.whatsapp}` : null;
  return (
    <View style={{ backgroundColor: primaria, padding: 20, borderRadius: 6, marginBottom: 16 }}>
      <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: BRANCO, marginBottom: 6 }}>Próximos passos</Text>
      <Text style={{ fontSize: 10.5, color: "#E5E7EB", lineHeight: 1.5 }}>{texto}</Text>
      {ctaTexto && <Text style={{ fontSize: 10.5, color: destaque, marginTop: 8, fontFamily: "Helvetica-Bold" }}>{ctaTexto}</Text>}
    </View>
  );
}

type ContextoBloco = { dados: DadosSistemaProposta; identidade: IdentidadeProposta; primaria: string; destaque: string };

function renderizarBloco(bloco: BlocoRenderizavel, ctx: ContextoBloco) {
  switch (bloco.tipo) {
    case "how_it_works":
      return <ComoFunciona />;
    case "system_summary":
      return <ResumoSistema dados={ctx.dados} />;
    case "equipment_summary":
      return <ResumoEquipamentos dados={ctx.dados} />;
    case "generation_monthly_chart":
      return <GraficoGeracaoMensal dados={ctx.dados} destaque={ctx.destaque} />;
    case "before_after_bill":
      return <ContaAntesDepois dados={ctx.dados} primaria={ctx.primaria} destaque={ctx.destaque} />;
    case "investment_main":
      return <ValorProposta dados={ctx.dados} primaria={ctx.primaria} />;
    case "payment_options":
      return <CondicoesPagamento dados={ctx.dados} />;
    case "included_services":
      return <ItensInclusos config={bloco.config} />;
    case "next_steps":
      return <ProximosPassos identidade={ctx.identidade} config={bloco.config} primaria={ctx.primaria} destaque={ctx.destaque} />;
    default:
      return null;
  }
}

/** Blocos de preço não fazem sentido (e ficam vazios) quando a proposta é "sem preço". */
function blocoTemConteudo(tipo: TipoBloco, dados: DadosSistemaProposta) {
  if ((tipo === "investment_main" || tipo === "payment_options") && dados.modoPreco === "sem_preco") return false;
  return true;
}

/**
 * Monta o PDF de uma proposta a partir de um modelo (blocos ativos, na ordem
 * escolhida pelo gestor) e dos dados já resolvidos (kit, cálculo, identidade
 * visual com URLs assinadas). Só blocos com renderer pronto (`implementado`
 * em blocos.ts) e com conteúdo aplicável entram no documento final.
 */
export function ModeloPdfDocument({
  modelo,
  blocos,
  identidade,
  dados,
}: {
  modelo: { capaVariante: "foto" | "minimalista" | "tecnica" };
  blocos: BlocoRenderizavel[];
  identidade: IdentidadeProposta;
  dados: DadosSistemaProposta;
}) {
  const primaria = cor(identidade.corPrimaria, CARVAO);
  const destaque = cor(identidade.corDestaque, DOURADO_PADRAO);
  const capa = blocos.find((b) => b.tipo === "cover" && b.ativo);
  const conteudo = blocos
    .filter((b) => b.ativo && b.tipo !== "cover" && definicaoDoBloco(b.tipo)?.implementado && blocoTemConteudo(b.tipo, dados))
    .sort((a, b) => a.ordem - b.ordem);
  const quebras = calcularQuebras(conteudo);

  return (
    <Document title={`Proposta - ${dados.clienteNome}`}>
      {capa && (
        <Page size="A4" style={{ padding: 0 }}>
          <Capa variante={modelo.capaVariante} identidade={identidade} dados={dados} />
        </Page>
      )}
      <Page size="A4" style={estilos.pagina} wrap>
        {conteudo.map((bloco, i) => (
          <View key={bloco.tipo} break={quebras[i]}>
            {renderizarBloco(bloco, { dados, identidade, primaria, destaque })}
          </View>
        ))}
        {identidade.rodapeTexto && <Text style={{ fontSize: 8, color: CINZA, marginTop: 10 }}>{identidade.rodapeTexto}</Text>}
      </Page>
    </Document>
  );
}
