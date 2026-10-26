import type { CSSProperties } from "react";
import {
  CATALOGO_ELETROPOSTO,
  MODELOS_ELETROPOSTO,
  PREMISSAS_ELETROPOSTO,
  cenarioMensal,
  margemPorKwh,
  paybackMeses,
  receitaEcossistemaMensal,
  type ModeloEletroposto,
} from "@/lib/eletroposto";

export type DadosPropostaEletroposto = {
  numero: string;
  /** ISO da data da proposta (a validade conta daqui). */
  emitidaEm: string;
  modelos: ModeloEletroposto[];
  /** Preços congelados no registro (nunca somados). */
  precos: Partial<Record<ModeloEletroposto, number>>;
  cliente: { nome: string; endereco: string | null; telefone: string | null };
  empresa: { nome: string };
  consultor: { nome: string | null; whatsapp: string | null };
};

const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = (v: number) => v.toLocaleString("pt-BR");
const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const NOTA_ILUSTRATIVA =
  "Consumo, receita, resultado e retorno são cenários ilustrativos da apresentação IBS, não projeções personalizadas nem garantia de resultado. Sujeito à avaliação técnica, contratual e da concessionária.";

const ITENS_INCLUSOS: { item: string; inclui: Record<ModeloEletroposto, boolean> }[] = [
  { item: "Carregador instalado, software e pagamento", inclui: { basic: true, full: true, screen: true } },
  { item: "Assistência, peças e Pacote Fidelidade", inclui: { basic: true, full: true, screen: true } },
  { item: "Projeto, ART e trâmites na concessionária", inclui: { basic: false, full: true, screen: true } },
  { item: "Padrão de entrada de energia homologado", inclui: { basic: false, full: true, screen: true } },
  { item: "Comissionamento, ativação e treinamento de operação", inclui: { basic: true, full: true, screen: true } },
  { item: "Tela de mídia, com apoio da agência IBS", inclui: { basic: false, full: false, screen: true } },
  { item: "Energia compartilhada e comissão em usinas", inclui: { basic: false, full: false, screen: true } },
];

const FAIXAS_FIDELIDADE = ["Até 19.999 kWh", "De 20.000 a 49.999 kWh", "De 50.000 a 199.999 kWh", "A partir de 200.000 kWh"];

const ESPECIFICACOES = [
  { rotulo: "Potência", valor: `${PREMISSAS_ELETROPOSTO.potenciaKw} kW`, sub: "2 módulos de 40 kW" },
  { rotulo: "Pontos de recarga", valor: `${PREMISSAS_ELETROPOSTO.pontosRecarga} pontos`, sub: "Corrente contínua" },
  { rotulo: "Entrada", valor: "380/400 Vca", sub: "Trifásico, 129 A por fase" },
  { rotulo: "Saída", valor: "200 a 1000 Vcc", sub: "Corrente de até 200 A" },
  { rotulo: "Eficiência", valor: "95% ou mais", sub: "Fator de potência de 0,99" },
  { rotulo: "Proteção", valor: "IP54 e IK10", sub: "Uso interno e externo" },
  { rotulo: "Operação", valor: "-25 °C a +50 °C", sub: "Altitude de até 2000 m" },
  { rotulo: "Dimensões e peso", valor: "1500×700×430 mm", sub: "Peso de 166 kg" },
];

/** Lista em português: "a", "a e b", "a, b e c". */
function lista(itens: string[]) {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

function Cabecalho({ dados }: { dados: DadosPropostaEletroposto }) {
  return (
    <>
      <div className="page-top-bar" />
      <header className="page-header">
        <div className="page-header-brand">
          <span>{dados.empresa.nome}</span>
        </div>
        <div className="page-header-tag">Eletroposto · {dados.cliente.nome}</div>
      </header>
    </>
  );
}

function Rodape({ dados, pagina }: { dados: DadosPropostaEletroposto; pagina: number }) {
  return (
    <>
      <div className="nota-ilustrativa">{NOTA_ILUSTRATIVA}</div>
      <footer className="page-footer">
        <div>{dados.empresa.nome}</div>
        <div>{pagina} / 4</div>
      </footer>
    </>
  );
}

/**
 * As 4 páginas da proposta de eletroposto (modelo IBS): capa, simulação comercial, resumo técnico e
 * investimento. Com um modelo, ele é o destaque; com vários, a proposta é comparativa: preços lado a lado
 * (nunca somados), retorno por modelo e só as colunas escolhidas na tabela do que cada um inclui.
 */
export function DocumentoEletroposto({ dados }: { dados: DadosPropostaEletroposto }) {
  const modelos = MODELOS_ELETROPOSTO.filter((m) => dados.modelos.includes(m));
  const comparativo = modelos.length > 1;
  const unico = comparativo ? null : modelos[0];
  const preco = (m: ModeloEletroposto) => dados.precos[m] ?? CATALOGO_ELETROPOSTO[m].preco;
  const nome = (m: ModeloEletroposto) => CATALOGO_ELETROPOSTO[m].nome;

  const p = PREMISSAS_ELETROPOSTO;
  const cenario = cenarioMensal();
  const retornos = modelos.map((m) => ({ modelo: m, meses: paybackMeses(m, preco(m)) }));
  const mesesValidos = retornos.map((r) => r.meses).filter((m): m is number => m != null);
  const paybackTexto = !mesesValidos.length
    ? "n/d"
    : Math.min(...mesesValidos) === Math.max(...mesesValidos)
      ? String(mesesValidos[0])
      : `${Math.min(...mesesValidos)}–${Math.max(...mesesValidos)}`;
  const comEcossistema = modelos.includes("screen");
  const temBasic = modelos.includes("basic");
  const temFull = modelos.some((m) => m !== "basic");
  const destaque = unico ? nome(unico) : "Comparativo de modelos";

  const emitida = new Date(dados.emitidaEm);
  const validade = new Date(emitida.getTime() + p.validadeDias * 86_400_000);

  const alturaCusto = Math.max(8, Math.round((100 * cenario.custo) / cenario.faturamento));
  const alturaResultado = Math.max(8, Math.round((100 * Math.max(cenario.resultado, 0)) / cenario.faturamento));
  const whatsappDigitos = dados.consultor.whatsapp?.replace(/\D/g, "") ?? "";

  return (
    <div className="preview-stage">
      {/* ==================== PÁGINA 1 CAPA ==================== */}
      <section className="a4-page cover-page">
        <div className="cover-gold-bar" />
        {/* eslint-disable-next-line @next/next/no-img-element -- capa impressa em A4: sem otimização do next/image */}
        <img className="cover-bg-img" src="/eletroposto/capa.jpg" alt="Eletroposto com carregador e dois veículos elétricos ao entardecer" />
        <div className="cover-scrim" />
        <div className="cover-content">
          <header className="cover-top">
            <div className="brand-title">{dados.empresa.nome}</div>
            <div className="cover-meta">
              <div>
                Proposta <strong>#{dados.numero}</strong>
              </div>
              <div>
                Emissão <strong>{dataBr(emitida)}</strong> · Validade <strong>{p.validadeDias} dias</strong>
              </div>
            </div>
          </header>

          <div className="cover-bottom-block">
            <div className="cover-accent-dash" />
            <div className="cover-kicker">Proposta Comercial · {destaque}</div>
            <h1 className="cover-client">{dados.cliente.nome}</h1>
            <div className="cover-address">
              {dados.cliente.endereco && <div className="cover-id-line">{dados.cliente.endereco}</div>}
              {dados.cliente.telefone && <div className="cover-id-line">WhatsApp: {dados.cliente.telefone}</div>}
            </div>
            <div className="cover-divider" />
            <div className="cover-metrics-grid">
              <div className="cover-metric-card destaque">
                <div className="metric-label">Faturamento médio por mês</div>
                <div className="metric-value">{brl0(cenario.faturamento)}</div>
                <div className="metric-sub">Cenário realista, com {numero(cenario.recargas)} recargas por mês</div>
              </div>
              <div className="cover-metric-card">
                <div className="metric-label">Potência do carregador</div>
                <div className="metric-value acento">{p.potenciaKw} kW</div>
                <div className="metric-sub">{p.pontosRecarga} pontos de recarga</div>
              </div>
              <div className="cover-metric-card">
                <div className="metric-label">Tempo para se pagar</div>
                <div className="metric-value">~{paybackTexto} meses</div>
                <div className="metric-sub">
                  {unico ? nome(unico) : "Conforme o modelo"}, com {p.descontoPct}% de desconto na energia
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="nota-ilustrativa">{NOTA_ILUSTRATIVA}</div>
      </section>

      {/* ==================== PÁGINA 2 FATURAMENTO, RETORNO E PACOTE FIDELIDADE ==================== */}
      <section className="a4-page">
        <Cabecalho dados={dados} />
        <div className="page-body">
          <div className="clean-card">
            <h2 className="card-heading">Faturamento médio no cenário realista</h2>
            <div className="bill-comparison">
              <div className="bars-stage">
                <div className="bar-col">
                  <div className="bar-v fat" style={{ height: 100 }} />
                  <div className="bar-caption">Faturamento</div>
                  <div className="bar-amount">{brl0(cenario.faturamento)}</div>
                </div>
                <div className="bar-col">
                  <div className="bar-v custo" style={{ height: alturaCusto }} />
                  <div className="bar-caption">Energia e rede</div>
                  <div className="bar-amount">{brl0(cenario.custo)}</div>
                </div>
                <div className="bar-col">
                  <div className="bar-v res" style={{ height: alturaResultado }} />
                  <div className="bar-caption">Resultado</div>
                  <div className="bar-amount acento">{brl0(cenario.resultado)}</div>
                </div>
              </div>

              <div className="savings-highlight">
                <div className="savings-small">Resultado mensal estimado</div>
                <div className="savings-big">{brl0(cenario.resultado)}/mês</div>
                <div className="savings-year">{brl0(cenario.resultado * 12)} em 12 meses</div>
                <div className="savings-note">
                  ⚡ Com esse resultado,{" "}
                  {lista(
                    retornos.map((r) => (
                      `o ${nome(r.modelo)} se paga em cerca de ${r.meses == null ? "n/d" : `${r.meses} meses`}`
                    )),
                  )}
                  .
                  {comEcossistema && (
                    <span className="eco-note">
                      No IBS Full Screen, o retorno considera ainda {brl0(receitaEcossistemaMensal("screen"))} por mês de receitas da tela e do
                      ecossistema IBS, uma estimativa.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="system-grid-4" style={{ marginTop: 14 }}>
              <div className="sys-pill">
                <div className="sys-pill-label">Potência</div>
                <div className="sys-pill-value">{p.potenciaKw} kW</div>
                <div className="sys-pill-sub">Carregador de recarga rápida</div>
              </div>
              <div className="sys-pill">
                <div className="sys-pill-label">Pontos de recarga</div>
                <div className="sys-pill-value">{p.pontosRecarga} pontos</div>
                <div className="sys-pill-sub">No mapa do aplicativo de recarga</div>
              </div>
              <div className="sys-pill">
                <div className="sys-pill-label">Recargas por mês</div>
                <div className="sys-pill-value">{numero(cenario.recargas)}</div>
                <div className="sys-pill-sub">Média de {p.kwhPorRecarga} kWh por recarga</div>
              </div>
              <div className="sys-pill">
                <div className="sys-pill-label">Energia vendida</div>
                <div className="sys-pill-value">{numero(p.kwhMes)} kWh</div>
                <div className="sys-pill-sub">A {brl2(p.vendaKwh)} por kWh ao motorista</div>
              </div>
            </div>
            <div className="fine">
              Retorno calculado {unico ? `para o ${nome(unico)}` : "para cada modelo"}, com {p.descontoPct}% de desconto na energia, venda ao
              motorista a {brl2(p.vendaKwh)} por kWh e tarifa de referência de {brl2(p.tarifaKwh)} por kWh. Os resultados já descontam o custo
              da energia e o uso da rede. {comEcossistema && "No IBS Full Screen, o retorno soma as receitas estimadas da tela e do ecossistema IBS. "}O
              volume de recargas é um cenário de demanda e não constitui garantia de faturamento.
            </div>
          </div>

          <div className="clean-card">
            <h2 className="card-heading">Pacote Fidelidade IBS, energia mais barata para o seu carregador</h2>
            <p className="card-lead">
              Exclusivo para quem compra carregadores IBS. Quanto mais energia você contrata, maior o desconto na tarifa da concessionária e maior
              a sua margem em cada kWh vendido.
            </p>
            <div className="tier-grid">
              {p.faixasFidelidade.map((desconto, i) => (
                <div key={desconto} className={`tier${desconto === p.descontoPct ? " active" : ""}`}>
                  <div className="tier-range">{FAIXAS_FIDELIDADE[i]}</div>
                  <div className="tier-disc">{desconto}%</div>
                  <div className="tier-sub">
                    de desconto na tarifa
                    <br />
                    Margem <strong>{brl2(margemPorKwh(desconto))}</strong>/kWh
                  </div>
                </div>
              ))}
            </div>
            <div className="fine">
              Modelos de aquisição com pacote de créditos feito na compra do produto podem levar o desconto a até 50%. Consulte a nossa equipe. A
              margem por kWh varia conforme a concessionária e a localidade do ponto.
            </div>
          </div>
        </div>
        <Rodape dados={dados} pagina={2} />
      </section>

      {/* ==================== PÁGINA 3 EQUIPAMENTO, GARANTIA E ESCOPO ==================== */}
      <section className="a4-page">
        <Cabecalho dados={dados} />
        <div className="page-body">
          <div className="clean-card">
            <h2 className="card-heading">Resumo técnico do carregador</h2>
            <div className="tech-version">
              Carregador de <strong>{p.potenciaKw} kW</strong>, disponível <strong>sem tela</strong> no IBS Basic e no IBS Full, e{" "}
              <strong>com tela de mídia</strong> no IBS Full Screen.
            </div>
            <div className="tech-specs">
              {ESPECIFICACOES.map((e) => (
                <div key={e.rotulo} className="sys-pill">
                  <div className="sys-pill-label">{e.rotulo}</div>
                  <div className="sys-pill-value">{e.valor}</div>
                  <div className="sys-pill-sub">{e.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="clean-card">
            <h2 className="card-heading">Garantia e assistência técnica</h2>
            <div className="warr-grid">
              <div className="warr-card">
                <div className="equip-name">Carregador IBS de {p.potenciaKw} kW</div>
                <div className="equip-desc">Homologado, com peças de reposição.</div>
                <div className="equip-warranty">Conforme contrato</div>
              </div>
              <div className="warr-card">
                <div className="equip-name">Suporte remoto 24/7</div>
                <div className="equip-desc">Assistência técnica ao carregador e ao software.</div>
                <div className="equip-warranty">Incluído</div>
              </div>
              <div className="warr-card">
                <div className="equip-name">Software e pagamento</div>
                <div className="equip-desc">Gestão e cobrança pelo aplicativo de recarga.</div>
                <div className="equip-warranty">Incluído</div>
              </div>
            </div>
          </div>

          <div className="clean-card">
            <h2 className="card-heading">O que cada produto inclui</h2>
            <div className="ptable" style={{ "--colunas": modelos.length } as CSSProperties}>
              <div className="pt-row pt-head">
                <div className="pt-cell">Item</div>
                {modelos.map((m) => (
                  <div key={m} className={`pt-cell pt-prod-cell${m === unico ? " featured" : ""}`}>
                    <div className="pt-prod">{nome(m)}</div>
                    <div className="pt-sub">{CATALOGO_ELETROPOSTO[m].tag}</div>
                  </div>
                ))}
              </div>
              {ITENS_INCLUSOS.map((linha) => (
                <div key={linha.item} className="pt-row">
                  <div className="pt-cell">{linha.item}</div>
                  {modelos.map((m) => (
                    <div key={m} className={`pt-cell mark${m === unico ? " featured" : ""}`}>
                      {linha.inclui[m] ? (
                        <span className="ck" aria-label="Incluído">
                          ✓
                        </span>
                      ) : (
                        <span className="xx" aria-label="Não incluído">
                          ✕
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="scope-box-out">
              <div className="scope-title-out">✕ O que não está incluso</div>
              <ul className="scope-list">
                <li>
                  • <strong>Obras civis de grande porte.</strong> As obras relacionadas à instalação do produto estão incluídas.
                </li>
                {temBasic && (
                  <li>
                    • <strong>No IBS Basic,</strong> projeto, trâmites com a concessionária e obras de rede e de padrão de entrada ficam por conta do
                    cliente, quando necessários.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
        <Rodape dados={dados} pagina={3} />
      </section>

      {/* ==================== PÁGINA 4 INVESTIMENTO, PAGAMENTO E PRÓXIMOS PASSOS ==================== */}
      <section className="a4-page">
        <Cabecalho dados={dados} />
        <div className="page-body">
          <div className="clean-card">
            <h2 className="card-heading">{comparativo ? "Comparativo de investimento · escolha uma opção" : "Investimento à vista"}</h2>
            {unico ? (
              <div className="dark-investment-card">
                <div>
                  <div className="inv-kicker">Valor à vista, {nome(unico)}</div>
                  <div className="inv-total-value">{brl0(preco(unico))}</div>
                </div>
                <div className="inv-badge-right">
                  PIX ou transferência
                  <br />
                  <span>{CATALOGO_ELETROPOSTO[unico].tag}</span>
                </div>
              </div>
            ) : (
              <div className="comparativo">
                <table>
                  <tbody>
                    {modelos.map((m) => (
                      <tr key={m}>
                        <td>
                          {nome(m)} · {CATALOGO_ELETROPOSTO[m].tag}
                        </td>
                        <td>{brl0(preco(m))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <small>
                  Valores à vista, por PIX ou transferência. Os valores são alternativas individuais, não um pacote somado. Condições sujeitas a
                  confirmação comercial e técnica.
                </small>
              </div>
            )}
            {temFull && (
              <div className="fine" style={{ marginTop: 12 }}>
                Prazo de até 60 dias para todo o processo nos produtos Full, contados após o pagamento. Quando houver caminho crítico na
                concessionária, o prazo pode chegar a 90 dias. A IBS protocola logo após a assinatura e acompanha cada etapa.
              </div>
            )}
          </div>

          <div className="clean-card">
            <h2 className="card-heading">Mesa de financiamento IBS</h2>
            <div className="payment-grid">
              <div className="pay-option-box">
                <div className="pay-option-title">🏦 Financiamento IBS</div>
                <div className="pay-option-sub">
                  Plataformas parceiras <strong>BV, Santander e Sol Agora</strong>, com uma consulta só para várias instituições.
                </div>
                <div className="inst-row">
                  <span>Em até 72x</span>
                  <strong>Consulte taxas e condições</strong>
                </div>
              </div>
              <div className="pay-option-box">
                <div className="pay-option-title">💳 Super Parcelamento IBS no cartão</div>
                <div className="pay-option-sub">
                  Cartões <strong>Visa e Mastercard</strong>, pelo limite do cartão e sem contrato de financiamento.
                </div>
                <div className="inst-row">
                  <span>Em até 21x</span>
                  <strong>Consulte taxas e condições</strong>
                </div>
              </div>
            </div>
            <div className="fine" style={{ marginTop: 12 }}>
              Taxas e prazos sujeitos à análise de crédito e às condições de cada instituição na data da contratação.
            </div>
          </div>

          <div className="clean-card" style={{ padding: "14px 18px" }}>
            <div className="steps-row">
              {[
                { titulo: "Escolha do produto", desc: "Basic, Full ou Full Screen. A IBS avalia o melhor modelo de negócio para você." },
                { titulo: "Avaliação técnica do ponto", desc: "A IBS confere a carga disponível e o posicionamento do carregador." },
                { titulo: "Contrato", desc: "Investimento, Pacote Fidelidade e adesão ao ecossistema IBS." },
                { titulo: "Instalação e ativação", desc: "Montagem, publicação no aplicativo e início do faturamento." },
              ].map((s, i) => (
                <div key={s.titulo} className="step-item">
                  <span className="step-num">Passo {i + 1}</span>
                  <div className="step-title">{s.titulo}</div>
                  <div className="step-desc">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="dark-cta-card">
            <div>
              <div className="cta-title">A IBS vai além de ofertar um produto, entrega solução</div>
              <div className="cta-sub">Do projeto à operação, a IBS está ao seu lado para construir o melhor modelo de negócio para o seu ponto.</div>
              <div className="cta-contact">
                {dados.consultor.nome && (
                  <>
                    <strong>{dados.consultor.nome}</strong> ·{" "}
                  </>
                )}
                {whatsappDigitos.length >= 10 ? (
                  <>
                    WhatsApp{" "}
                    <a className="cta-whats" href={`https://wa.me/${whatsappDigitos.startsWith("55") ? whatsappDigitos : `55${whatsappDigitos}`}`}>
                      {dados.consultor.whatsapp}
                    </a>{" "}
                    ·{" "}
                  </>
                ) : (
                  !dados.consultor.nome && <>Fale com o seu consultor IBS · </>
                )}
                ibs.eco.br
              </div>
            </div>
            <div className="cta-validade">
              Proposta válida até <strong>{dataBr(validade)}</strong>
            </div>
          </div>

          <div className="fine" style={{ marginTop: 0 }}>
            Documento comercial. As projeções de retorno são estimativas baseadas nas informações desta proposta e não constituem garantia de
            rentabilidade. Condições sujeitas à análise técnica do ponto e à aprovação da concessionária.
          </div>
        </div>
        <Rodape dados={dados} pagina={4} />
      </section>
    </div>
  );
}
