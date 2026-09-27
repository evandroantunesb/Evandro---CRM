import "server-only";
import { Document, Image, Link, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
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

// --- Helpers genéricos de config pros blocos abaixo (2ª leva do catálogo) ---
// Listas usam a mesma convenção de `included_services`: um item por linha no
// editor, aqui guardado em `config.itens`. Itens com mais de um campo (ex.:
// "título | texto") usam "|" como separador — mantém o editor simples (uma
// textarea) em vez de formulários dinâmicos por campo.

function campoTexto(config: unknown, chave: string): string {
  const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const v = cfg[chave];
  return typeof v === "string" ? v.trim() : "";
}

function partes(linha: string): string[] {
  return linha.split("|").map((p) => p.trim());
}

function numerosDoConfig(config: unknown, chave: string): number[] | null {
  const texto = campoTexto(config, chave);
  if (!texto) return null;
  const valores = texto.split(",").map((v) => Number(v.trim().replace(",", ".")));
  return valores.length === 12 && valores.every((v) => Number.isFinite(v)) ? valores : null;
}

function SemDados({ texto }: { texto: string }) {
  return <Text style={{ fontSize: 9.5, color: CINZA, fontStyle: "italic" }}>{texto}</Text>;
}

function DadosDocumento({ config, dados }: { config: unknown; dados: DadosSistemaProposta }) {
  const numero = campoTexto(config, "numero");
  const validade = campoTexto(config, "validadeDias");
  const vendedor = campoTexto(config, "vendedorNome");
  const tipoImovel = campoTexto(config, "tipoImovel");
  return (
    <Cartao titulo="Dados da proposta">
      <View style={estilos.linha}>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Cliente</Text>
          <Text style={estilos.valor}>{dados.clienteNome}</Text>
        </View>
        {numero && (
          <View style={estilos.coluna}>
            <Text style={estilos.rotulo}>Número</Text>
            <Text style={estilos.valor}>{numero}</Text>
          </View>
        )}
      </View>
      {(validade || vendedor || tipoImovel) && (
        <View style={estilos.linha}>
          {validade && (
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Validade</Text>
              <Text style={estilos.valor}>{validade} dias</Text>
            </View>
          )}
          {vendedor && (
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Vendedor</Text>
              <Text style={estilos.valor}>{vendedor}</Text>
            </View>
          )}
          {tipoImovel && (
            <View style={estilos.coluna}>
              <Text style={estilos.rotulo}>Tipo de imóvel</Text>
              <Text style={estilos.valor}>{tipoImovel}</Text>
            </View>
          )}
        </View>
      )}
    </Cartao>
  );
}

/** Lista genérica "1 item" ou "2 itens (título | texto)" por linha, com fallback opcional. */
function BlocoLista({ titulo, config, duasColunas, padrao }: { titulo: string; config: unknown; duasColunas: boolean; padrao?: string[] }) {
  const linhas = itensDoConfig(config) ?? padrao ?? null;
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <View style={estilos.lista}>
        {linhas.map((linha, i) => {
          const p = partes(linha);
          return (
            <View key={i} style={estilos.itemLista}>
              <Text>•</Text>
              <View style={{ flex: 1 }}>
                {duasColunas && p[0] ? (
                  <>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>{p[0]}</Text>
                    {p[1] && <Text style={estilos.paragrafo}>{p[1]}</Text>}
                  </>
                ) : (
                  <Text style={estilos.paragrafo}>{p[0]}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </Cartao>
  );
}

/** "rótulo | valor" por linha — indicadores, itens com preço, perguntas e respostas. */
function BlocoPares({ titulo, config }: { titulo: string; config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <View style={{ gap: 8 }}>
        {linhas.map((linha, i) => {
          const [a, b] = partes(linha);
          return (
            <View key={i}>
              <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>{a}</Text>
              {b && <Text style={estilos.paragrafo}>{b}</Text>}
            </View>
          );
        })}
      </View>
    </Cartao>
  );
}

/** "rótulo | valor" numa grade compacta — pra números institucionais e validade/prazo. */
function BlocoIndicadores({ titulo, config }: { titulo: string; config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {linhas.map((linha, i) => {
          const [rotulo, valor] = partes(linha);
          return (
            <View key={i} style={{ minWidth: 100 }}>
              <Text style={estilos.rotulo}>{rotulo}</Text>
              <Text style={estilos.valor}>{valor}</Text>
            </View>
          );
        })}
      </View>
    </Cartao>
  );
}

/** "nome | subtítulo | texto" — equipe, portfólio, depoimentos. */
function BlocoPessoas({ titulo, config }: { titulo: string; config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={titulo}>
      <View style={{ gap: 10 }}>
        {linhas.map((linha, i) => {
          const [nome, subtitulo, texto] = partes(linha);
          return (
            <View key={i}>
              <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>{nome}</Text>
              {subtitulo && <Text style={{ fontSize: 9.5, color: CINZA, marginBottom: 2 }}>{subtitulo}</Text>}
              {texto && <Text style={estilos.paragrafo}>{texto}</Text>}
            </View>
          );
        })}
      </View>
    </Cartao>
  );
}

/** "título | prazo | descrição" — cronograma de etapas. */
function BlocoEtapas({ config }: { config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Sem etapas cadastradas ainda." />;
  return (
    <Cartao titulo="Etapas da instalação">
      <View style={{ gap: 8 }}>
        {linhas.map((linha, i) => {
          const [titulo, prazo, descricao] = partes(linha);
          return (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: CINZA_CLARO, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>
                  {titulo}
                  {prazo && <Text style={{ fontSize: 9, color: CINZA, fontFamily: "Helvetica" }}> · {prazo}</Text>}
                </Text>
                {descricao && <Text style={estilos.paragrafo}>{descricao}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </Cartao>
  );
}

/** "nome | url" — anexos externos, com link clicável no PDF. */
function BlocoAnexos({ config }: { config: unknown }) {
  const linhas = itensDoConfig(config);
  if (!linhas) return <SemDados texto="Nenhum anexo cadastrado." />;
  return (
    <Cartao titulo="Anexos">
      <View style={estilos.lista}>
        {linhas.map((linha, i) => {
          const [nome, url] = partes(linha);
          return (
            <View key={i} style={estilos.itemLista}>
              <Text>•</Text>
              {url ? (
                <Link src={url} style={{ color: "#1d4ed8", textDecoration: "underline" }}>
                  {nome || url}
                </Link>
              ) : (
                <Text>{nome}</Text>
              )}
            </View>
          );
        })}
      </View>
    </Cartao>
  );
}

/** Duas listas simples (uma por linha cada) — o que está e o que não está incluso. */
function BlocoEscopo({ config }: { config: unknown }) {
  const incluido = itensDoConfig(config && typeof config === "object" ? { itens: (config as Record<string, unknown>).incluido } : null);
  const excluido = itensDoConfig(config && typeof config === "object" ? { itens: (config as Record<string, unknown>).excluido } : null);
  if (!incluido && !excluido) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo="Inclusões e exclusões">
      <View style={estilos.linha}>
        {incluido && (
          <View style={estilos.coluna}>
            <Text style={{ ...estilos.rotulo, color: "#15803d" }}>Incluso</Text>
            <View style={estilos.lista}>
              {incluido.map((item, i) => (
                <View key={i} style={estilos.itemLista}>
                  <Text>•</Text>
                  <Text style={{ flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {excluido && (
          <View style={estilos.coluna}>
            <Text style={{ ...estilos.rotulo, color: "#b91c1c" }}>Não incluso</Text>
            <View style={estilos.lista}>
              {excluido.map((item, i) => (
                <View key={i} style={estilos.itemLista}>
                  <Text>•</Text>
                  <Text style={{ flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Cartao>
  );
}

/** Texto livre com título fixo ou configurável — quem somos, geração dia/noite, condições, etc. */
function BlocoTexto({ titulo, config, tituloConfiguravel, padrao }: { titulo: string; config: unknown; tituloConfiguravel?: boolean; padrao?: string }) {
  const texto = campoTexto(config, "texto") || padrao;
  const tituloFinal = (tituloConfiguravel && campoTexto(config, "titulo")) || titulo;
  if (!texto) return <SemDados texto="Sem conteúdo cadastrado pra este bloco ainda." />;
  return (
    <Cartao titulo={tituloFinal}>
      <Text style={estilos.paragrafo}>{texto}</Text>
    </Cartao>
  );
}

function PerfilCliente({ config, dados }: { config: unknown; dados: DadosSistemaProposta }) {
  const objetivo = campoTexto(config, "objetivo");
  return (
    <Cartao titulo="Perfil do projeto">
      <View style={estilos.linha}>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Cliente</Text>
          <Text style={estilos.valor}>{dados.clienteNome}</Text>
        </View>
        {dados.clienteEndereco && (
          <View style={estilos.coluna}>
            <Text style={estilos.rotulo}>Local</Text>
            <Text style={estilos.valor}>{dados.clienteEndereco}</Text>
          </View>
        )}
      </View>
      {objetivo && <Text style={{ ...estilos.paragrafo, marginTop: 4 }}>{objetivo}</Text>}
    </Cartao>
  );
}

function ConsumoAtual({ dados }: { dados: DadosSistemaProposta }) {
  return (
    <Cartao titulo="Consumo atual">
      <View style={estilos.linha}>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Consumo médio</Text>
          <Text style={estilos.valor}>{dados.consumoMedioKwh.toLocaleString("pt-BR")} kWh/mês</Text>
        </View>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Valor médio da conta</Text>
          <Text style={estilos.valor}>{formatarMoeda(dados.contaSemSolar)}</Text>
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={estilos.coluna}>
          <Text style={estilos.rotulo}>Ligação</Text>
          <Text style={estilos.valor}>{ROTULO_TIPO_LIGACAO[dados.tipoLigacao]}</Text>
        </View>
      </View>
    </Cartao>
  );
}

function TabelaEquipamentos({ dados }: { dados: DadosSistemaProposta }) {
  if (dados.componentes.length === 0) return <SemDados texto="Sem componentes cadastrados no kit deste negócio." />;
  return (
    <Cartao titulo="Relação técnica dos equipamentos">
      <View style={{ ...estilos.tabelaLinha, borderBottomWidth: 1.5 }}>
        <Text style={[estilos.tabelaCelula, { width: 70, color: CINZA, fontFamily: "Helvetica-Bold" }]}>Tipo</Text>
        <Text style={[estilos.tabelaCelula, { flex: 1, color: CINZA, fontFamily: "Helvetica-Bold" }]}>Descrição</Text>
        <Text style={[estilos.tabelaCelula, { width: 50, textAlign: "right", color: CINZA, fontFamily: "Helvetica-Bold" }]}>Qtd.</Text>
        <Text style={[estilos.tabelaCelula, { width: 60, textAlign: "right", color: CINZA, fontFamily: "Helvetica-Bold" }]}>Potência</Text>
      </View>
      {dados.componentes.map((item, i) => (
        <View key={i} style={estilos.tabelaLinha}>
          <Text style={[estilos.tabelaCelula, { width: 70 }]}>{ROTULO_TIPO_COMPONENTE_KIT[item.tipo]}</Text>
          <Text style={[estilos.tabelaCelula, { flex: 1 }]}>{item.descricao}</Text>
          <Text style={[estilos.tabelaCelula, { width: 50, textAlign: "right" }]}>{item.quantidade}x</Text>
          <Text style={[estilos.tabelaCelula, { width: 60, textAlign: "right" }]}>{item.potenciaW != null ? `${item.potenciaW} W` : "—"}</Text>
        </View>
      ))}
    </Cartao>
  );
}

function BlocoImagem({ config }: { config: unknown }) {
  const imagemUrl = campoTexto(config, "imagemUrl");
  const texto = campoTexto(config, "texto");
  if (!imagemUrl && !texto) return <SemDados texto="Sem imagem ou descrição cadastrada pra este bloco ainda." />;
  return (
    <Cartao titulo="Layout da instalação">
      {imagemUrl && (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={imagemUrl} style={{ width: "100%", maxHeight: 260, objectFit: "contain", marginBottom: texto ? 8 : 0 }} />
      )}
      {texto && <Text style={estilos.paragrafo}>{texto}</Text>}
    </Cartao>
  );
}

function ResumoEnergetico({ dados }: { dados: DadosSistemaProposta }) {
  const anual = dados.geracaoEstimadaKwhMes * 12;
  const cobertura = dados.consumoMedioKwh > 0 ? Math.round((dados.geracaoEstimadaKwhMes / dados.consumoMedioKwh) * 100) : null;
  return (
    <Cartao titulo="Resumo energético">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View style={{ minWidth: 100 }}>
          <Text style={estilos.rotulo}>Média mensal</Text>
          <Text style={estilos.valor}>{dados.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh</Text>
        </View>
        <View style={{ minWidth: 100 }}>
          <Text style={estilos.rotulo}>Total estimado no ano</Text>
          <Text style={estilos.valor}>{anual.toLocaleString("pt-BR")} kWh</Text>
        </View>
        {cobertura != null && (
          <View style={{ minWidth: 100 }}>
            <Text style={estilos.rotulo}>Cobertura estimada do consumo</Text>
            <Text style={estilos.valor}>{cobertura}%</Text>
          </View>
        )}
      </View>
    </Cartao>
  );
}

function GraficoConsumoVsGeracao({ config, dados, destaque }: { config: unknown; dados: DadosSistemaProposta; destaque: string }) {
  const consumo = numerosDoConfig(config, "valoresConsumo");
  if (!consumo) return <SemDados texto="Cadastre os 12 valores mensais de consumo pra ativar este gráfico." />;
  const largura = 460;
  const altura = 90;
  const gap = 6;
  const larguraBarra = (largura - gap * 11) / 12;
  const max = Math.max(...consumo, dados.geracaoEstimadaKwhMes, 1);
  return (
    <Cartao titulo="Consumo × geração">
      <Svg width={largura} height={altura + 16}>
        {MESES.flatMap((_, i) => {
          const alturaConsumo = (consumo[i]! / max) * altura;
          const alturaGeracao = (dados.geracaoEstimadaKwhMes / max) * altura;
          const x = i * (larguraBarra + gap);
          const largMeia = (larguraBarra - 2) / 2;
          return [
            <Rect key={`c${i}`} x={x} y={16 + (altura - alturaConsumo)} width={largMeia} height={alturaConsumo} fill={CINZA} />,
            <Rect key={`g${i}`} x={x + largMeia + 2} y={16 + (altura - alturaGeracao)} width={largMeia} height={alturaGeracao} fill={destaque} />,
          ];
        })}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 4 }}>
        {MESES.map((m) => (
          <Text key={m} style={{ fontSize: 7, color: CINZA, width: larguraBarra + gap, textAlign: "center" }}>
            {m}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 9, color: CINZA, marginTop: 6 }}>Cinza: consumo mensal cadastrado. Dourado: geração média estimada do sistema.</Text>
    </Cartao>
  );
}

function GraficoConsumoMensal({ config }: { config: unknown }) {
  const consumo = numerosDoConfig(config, "valores");
  if (!consumo) return <SemDados texto="Cadastre os 12 valores mensais de consumo pra ativar este gráfico." />;
  const largura = 460;
  const altura = 90;
  const gap = 6;
  const larguraBarra = (largura - gap * 11) / 12;
  const max = Math.max(...consumo, 1);
  return (
    <Cartao titulo="Histórico de consumo">
      <Svg width={largura} height={altura + 16}>
        {consumo.map((v, i) => (
          <Rect key={i} x={i * (larguraBarra + gap)} y={16 + (altura - (v / max) * altura)} width={larguraBarra} height={(v / max) * altura} fill={CINZA} />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 4 }}>
        {MESES.map((m) => (
          <Text key={m} style={{ fontSize: 7, color: CINZA, width: larguraBarra + gap, textAlign: "center" }}>
            {m}
          </Text>
        ))}
      </View>
    </Cartao>
  );
}

function EconomiaEstimada({ dados }: { dados: DadosSistemaProposta }) {
  const anual = dados.economiaMensal * 12;
  return (
    <Cartao titulo="Economia estimada">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View style={{ minWidth: 100 }}>
          <Text style={estilos.rotulo}>Economia mensal</Text>
          <Text style={{ ...estilos.valor, color: "#15803d" }}>{formatarMoeda(dados.economiaMensal)}</Text>
        </View>
        <View style={{ minWidth: 100 }}>
          <Text style={estilos.rotulo}>Economia anual</Text>
          <Text style={{ ...estilos.valor, color: "#15803d" }}>{formatarMoeda(anual)}</Text>
        </View>
        {dados.paybackMeses != null && (
          <View style={{ minWidth: 100 }}>
            <Text style={estilos.rotulo}>Retorno estimado</Text>
            <Text style={estilos.valor}>{dados.paybackMeses.toLocaleString("pt-BR")} meses</Text>
          </View>
        )}
      </View>
    </Cartao>
  );
}

function RetornoInvestimento({ config, dados }: { config: unknown; dados: DadosSistemaProposta }) {
  const texto = campoTexto(config, "texto");
  return (
    <Cartao titulo="Retorno do investimento">
      {dados.paybackMeses != null && (
        <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: texto ? 6 : 0 }}>
          Retorno estimado em {dados.paybackMeses.toLocaleString("pt-BR")} meses
        </Text>
      )}
      {texto ? <Text style={estilos.paragrafo}>{texto}</Text> : dados.paybackMeses == null && <SemDados texto="Sem cálculo de retorno disponível pra este negócio." />}
    </Cartao>
  );
}

function ContatosFinais({ identidade, config }: { identidade: IdentidadeProposta; config: unknown }) {
  const email = campoTexto(config, "email");
  const telefone = campoTexto(config, "telefone");
  const enderecoExtra = campoTexto(config, "endereco");
  return (
    <Cartao titulo="Contatos">
      <View style={{ gap: 4 }}>
        {identidade.nomeExibicao && <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>{identidade.nomeExibicao}</Text>}
        {identidade.whatsapp && <Text style={estilos.paragrafo}>WhatsApp: {identidade.whatsapp}</Text>}
        {telefone && <Text style={estilos.paragrafo}>Telefone: {telefone}</Text>}
        {email && <Text style={estilos.paragrafo}>E-mail: {email}</Text>}
        {enderecoExtra && <Text style={estilos.paragrafo}>{enderecoExtra}</Text>}
      </View>
    </Cartao>
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
    case "proposal_identity":
      return <DadosDocumento config={bloco.config} dados={ctx.dados} />;
    case "cover_benefits":
      return (
        <BlocoLista
          titulo="Benefícios"
          config={bloco.config}
          duasColunas
          padrao={["Economia na conta de energia", "Energia limpa e renovável", "Mais valorização para o imóvel", "Sistema com garantia"]}
        />
      );
    case "about_company":
      return <BlocoTexto titulo="Quem somos" config={bloco.config} />;
    case "company_highlights":
      return <BlocoLista titulo="Diferenciais" config={bloco.config} duasColunas />;
    case "company_numbers":
      return <BlocoIndicadores titulo="Nossos números" config={bloco.config} />;
    case "team_and_certifications":
      return <BlocoPessoas titulo="Equipe e qualificações" config={bloco.config} />;
    case "portfolio":
      return <BlocoPessoas titulo="Nossos projetos" config={bloco.config} />;
    case "testimonials":
      return <BlocoPares titulo="Depoimentos" config={bloco.config} />;
    case "solar_benefits":
      return (
        <BlocoLista
          titulo="Benefícios da energia solar"
          config={bloco.config}
          duasColunas={false}
          padrao={["Redução na conta de energia", "Energia limpa e renovável", "Valorização do imóvel", "Proteção contra aumentos na tarifa"]}
        />
      );
    case "day_night":
      return (
        <BlocoTexto
          titulo="Geração dia e noite"
          config={bloco.config}
          padrao="Durante o dia, o sistema gera energia e abastece o imóvel; o excedente vira crédito com a distribuidora. À noite, sem geração própria, o imóvel usa esses créditos acumulados pra compensar o consumo da rede."
        />
      );
    case "solar_faq":
      return <BlocoPares titulo="Perguntas frequentes" config={bloco.config} />;
    case "customer_profile":
      return <PerfilCliente config={bloco.config} dados={ctx.dados} />;
    case "current_consumption":
      return <ConsumoAtual dados={ctx.dados} />;
    case "consumption_chart":
      return <GraficoConsumoMensal config={bloco.config} />;
    case "equipment_table":
      return <TabelaEquipamentos dados={ctx.dados} />;
    case "installation_layout":
      return <BlocoImagem config={bloco.config} />;
    case "generation_vs_consumption":
      return <GraficoConsumoVsGeracao config={bloco.config} dados={ctx.dados} destaque={ctx.destaque} />;
    case "generation_summary":
      return <ResumoEnergetico dados={ctx.dados} />;
    case "simulation_assumptions":
      return <BlocoTexto titulo="Premissas técnicas" config={bloco.config} />;
    case "long_term_generation":
      return <BlocoTexto titulo="Projeção de longo prazo" config={bloco.config} />;
    case "savings_summary":
      return <EconomiaEstimada dados={ctx.dados} />;
    case "cashflow_payback":
      return <RetornoInvestimento config={bloco.config} dados={ctx.dados} />;
    case "extra_costs":
      return <BlocoPares titulo="Itens e serviços adicionais" config={bloco.config} />;
    case "validity_timeline":
      return <BlocoIndicadores titulo="Validade e prazo" config={bloco.config} />;
    case "project_steps":
      return <BlocoEtapas config={bloco.config} />;
    case "warranties":
      return (
        <BlocoLista
          titulo="Garantias"
          config={bloco.config}
          duasColunas
          padrao={["Garantia dos equipamentos conforme fabricante", "Garantia de instalação conforme contrato"]}
        />
      );
    case "support_maintenance":
      return <BlocoLista titulo="Suporte e manutenção" config={bloco.config} duasColunas={false} />;
    case "scope_inclusions_exclusions":
      return <BlocoEscopo config={bloco.config} />;
    case "commercial_conditions":
      return <BlocoTexto titulo="Condições comerciais" config={bloco.config} />;
    case "company_contacts":
      return <ContatosFinais identidade={ctx.identidade} config={bloco.config} />;
    case "custom_content":
      return <BlocoTexto titulo="Observações" config={bloco.config} tituloConfiguravel />;
    case "pdf_attachment":
      return <BlocoAnexos config={bloco.config} />;
    default:
      return null;
  }
}

const TIPOS_LISTA_SIMPLES: TipoBloco[] = [
  "company_highlights",
  "company_numbers",
  "team_and_certifications",
  "portfolio",
  "testimonials",
  "solar_faq",
  "extra_costs",
  "validity_timeline",
  "project_steps",
  "support_maintenance",
  "pdf_attachment",
];
const TIPOS_TEXTO_SIMPLES: TipoBloco[] = ["about_company", "simulation_assumptions", "long_term_generation", "commercial_conditions", "custom_content"];

/**
 * Blocos de preço não fazem sentido quando a proposta é "sem preço", e blocos
 * de conteúdo configurável (institucional, garantias, anexos etc.) sem
 * conteúdo cadastrado nem dado padrão não entram no PDF — melhor omitir do
 * que mostrar uma seção vazia ou um aviso "sem conteúdo" pro cliente final.
 */
function blocoTemConteudo(tipo: TipoBloco, dados: DadosSistemaProposta, config: unknown) {
  if ((tipo === "investment_main" || tipo === "payment_options") && dados.modoPreco === "sem_preco") return false;
  if (TIPOS_LISTA_SIMPLES.includes(tipo)) return itensDoConfig(config) !== null;
  if (TIPOS_TEXTO_SIMPLES.includes(tipo)) return campoTexto(config, "texto") !== "";
  if (tipo === "scope_inclusions_exclusions") {
    const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
    return itensDoConfig({ itens: cfg.incluido }) !== null || itensDoConfig({ itens: cfg.excluido }) !== null;
  }
  if (tipo === "consumption_chart") return numerosDoConfig(config, "valores") !== null;
  if (tipo === "generation_vs_consumption") return numerosDoConfig(config, "valoresConsumo") !== null;
  if (tipo === "equipment_table") return dados.componentes.length > 0;
  if (tipo === "installation_layout") return campoTexto(config, "imagemUrl") !== "" || campoTexto(config, "texto") !== "";
  if (tipo === "cashflow_payback") return campoTexto(config, "texto") !== "" || dados.paybackMeses != null;
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
    .filter((b) => b.ativo && b.tipo !== "cover" && definicaoDoBloco(b.tipo)?.implementado && blocoTemConteudo(b.tipo, dados, b.config))
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
