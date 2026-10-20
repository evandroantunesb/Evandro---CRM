// Assistente de novo negócio: conta em R$ pede tarifa na Etapa 1, kit manual antes do valor, sem "kit pronto"
// ilustrativo, tipo de ligação sempre editável, produtividade só nos detalhes e aviso de compatibilidade acessível.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { consumoDaEtapa1, consumoDoCalculoEhEstimado, consumoParaCriacao, estimarConsumoPelaConta } from "@/lib/consumo-estimado";
import { estadoSalvoDoKit } from "@/lib/kit-formulario";

const formulario = readFileSync("src/app/(app)/negocios/novo/formulario.tsx", "utf8").replace(/\r\n/g, "\n");
const trecho = (de: string, ate: string) => {
  const i = formulario.indexOf(de);
  expect(i, de).toBeGreaterThan(-1);
  const j = formulario.indexOf(ate, i + de.length);
  expect(j, ate).toBeGreaterThan(-1);
  return formulario.slice(i, j);
};

describe("novo negócio: tarifa e consumo estimado", () => {
  it("a tarifa só é exigida na Etapa 1 quando há valor da conta e não há consumo em kWh", () => {
    expect(formulario).toContain("const precisaTarifaNaEtapa1 = consumoDireto == null && faturaInformada != null;");
    const etapa1 = trecho("{/* Etapa 1 — Cliente e consumo */}", "{/* Etapa 2 — Sistema recomendado */}");
    expect(etapa1).toMatch(/\{precisaTarifaNaEtapa1 && \(\s*<div[^>]*>\s*<Campo\s+id=\{ID_TARIFA_EFETIVA_ETAPA_1\}/);
    const problema = trecho("function problemaDaEtapa(", "function mostrarProblema(");
    expect(problema).toContain("precisaTarifaNaEtapa1 && tarifaEfetivaInformada == null");
    expect(problema).toContain("Informe a tarifa efetiva estimada (R$/kWh)");
  });

  it("o consumo convertido aparece como estimado, com a tarifa usada", () => {
    const resumo = trecho("Resumo do sistema</legend>", "Detalhes do cálculo");
    expect(resumo).toContain('Consumo mensal{consumoConvertido ? " (estimado)" : ""}');
    expect(resumo).toContain("Tarifa efetiva (consumo)");
    expect(resumo).toContain("o consumo foi informado em kWh");
    // Consumo em kWh informado direto prevalece sobre o valor da conta (regra em `consumoDaEtapa1`, testada abaixo).
    expect(formulario).toContain("consumoDaEtapa1({ consumoKwh: consumoDireto, valorConta: faturaInformada");
  });
});

describe("novo negócio: Etapa 2", () => {
  it("o kit manual vem antes do valor do negócio", () => {
    const etapa2 = trecho("{/* Etapa 2 — Sistema recomendado */}", "{/* Etapa 3 — Dados técnicos e complementares */}");
    expect(etapa2.indexOf("Montar kit manualmente")).toBeGreaterThan(-1);
    expect(etapa2.indexOf("Montar kit manualmente")).toBeLessThan(etapa2.indexOf("Valor do negócio (R$)"));
    expect(etapa2.indexOf("<EditorComponentesKit")).toBeLessThan(etapa2.indexOf("Valor do negócio (R$)"));
  });

  it("não há busca de kits prontos: nada é apresentado como kit pronto nem se afirma que falta kit", () => {
    expect(formulario).not.toContain("Kit recomendado");
    expect(formulario).not.toContain("a definir (sem catálogo");
    expect(formulario).toContain("O assistente não consulta kits prontos nem catálogo de equipamentos");
    expect(formulario).toContain("isso não indica se existe ou não um kit para ela");
    expect(formulario).not.toMatch(/não (há|existe|temos) kit/i);
    // Nada de economia no resumo da Etapa 2 antes de haver kit e cálculo real.
    const referencia = trecho("Dimensionamento de referência (estimativa)", "Detalhes do cálculo");
    expect(referencia).not.toMatch(/economia|payback|Geração/i);
  });

  it("a produtividade sai do resumo e fica nos detalhes do cálculo", () => {
    const resumo = trecho("Resumo do sistema</legend>", "<details");
    expect(resumo).not.toContain("Produtividade");
    expect(resumo).not.toContain("kWh/kWp");
    const detalhes = trecho("<details", "</details>");
    expect(detalhes).toContain("Detalhes do cálculo");
    expect(detalhes).toContain("Produtividade (premissa)");
  });

  it("o aviso de compatibilidade é um botão nativo (clique, toque, teclado), compacto e sem afirmar validação", () => {
    const aviso = trecho("function AvisoCompatibilidade()", "/** A escolha fica no input");
    expect(aviso).toContain('role="status"');
    expect(aviso).toMatch(/<button\s+type="button"\s+aria-expanded=\{aberto\}/);
    expect(aviso).toContain("aria-controls={idDetalhe}");
    expect(aviso).toContain('e.key === "Escape"');
    expect(aviso).toContain("Compatibilidade técnica não verificada");
    expect(aviso).toContain("hidden={!aberto}");
    expect(formulario).toContain("<AvisoCompatibilidade />");
  });
});

describe("novo negócio: Etapa 3", () => {
  it("tipo de ligação (e tarifa) ficam editáveis com ou sem kit", () => {
    const ligacao = trecho('rotulo="Tipo de ligação"', "</Selecao>");
    expect(ligacao).not.toContain("disabled");
    const tarifa = trecho('rotulo="Tarifa base (TE + TUSD) (R$/kWh)"', "/>");
    expect(tarifa).not.toContain("disabled");
    expect(formulario).not.toContain("disabled={!componentes.length}");
  });
});

describe("novo negócio: tarifa efetiva (Etapa 1) separada da tarifa base (Etapa 3)", () => {
  it("o consumo da Etapa 1 só conhece a tarifa efetiva: a tarifa base não é entrada", () => {
    // 650 ÷ 0,95 = 684,21 kWh, sempre o mesmo, seja qual for a tarifa financeira.
    expect(estimarConsumoPelaConta(650, 0.95)).toBe(684.21);
    expect(consumoDaEtapa1({ consumoKwh: null, valorConta: 650, tarifaEfetiva: 0.95 })).toEqual({
      origem: "estimado",
      kwh: 684.21,
      valorConta: 650,
      tarifaEfetiva: 0.95,
    });
    // kWh informado direto vence a conta e dispensa tarifa; sem nada, não há consumo.
    expect(consumoDaEtapa1({ consumoKwh: 780, valorConta: 650, tarifaEfetiva: 0.95 })).toEqual({ origem: "informado", kwh: 780 });
    expect(consumoDaEtapa1({ consumoKwh: 780, valorConta: null, tarifaEfetiva: null })).toEqual({ origem: "informado", kwh: 780 });
    expect(consumoDaEtapa1({ consumoKwh: null, valorConta: 650, tarifaEfetiva: null })).toBeNull();
    expect(consumoDaEtapa1({ consumoKwh: null, valorConta: null, tarifaEfetiva: 0.95 })).toBeNull();
    expect(estimarConsumoPelaConta(650, 0)).toBeNull();
  });

  it("dois estados distintos, sem rótulo compartilhado: mexer na tarifa base não toca o consumo estimado", () => {
    expect(formulario).toContain('const [tarifaEfetivaKwh, setTarifaEfetivaKwh] = useState("");');
    expect(formulario).toContain('const [tarifaKwh, setTarifaKwh] = useState("");');
    // Etapa 1 escreve só a efetiva; Etapa 3 escreve só a base.
    const etapa1 = trecho("{/* Etapa 1 — Cliente e consumo */}", "{/* Etapa 2 — Sistema recomendado */}");
    expect(etapa1).toContain("onChange={(e) => setTarifaEfetivaKwh(e.target.value)}");
    expect(etapa1).not.toContain("setTarifaKwh(");
    const etapa3 = formulario.slice(formulario.indexOf("{/* Etapa 3 — Dados técnicos e complementares */}"));
    expect(etapa3).toContain("onChange={(e) => setTarifaKwh(e.target.value)}");
    expect(etapa3).not.toContain("setTarifaEfetivaKwh(");
    expect(etapa3).toContain("Alterá-los não muda o consumo estimado nem o dimensionamento.");
    // Rótulos próprios.
    expect(formulario).toContain('rotulo="Tarifa efetiva estimada (R$/kWh)*"');
    expect(formulario).toContain('rotulo="Tarifa base (TE + TUSD) (R$/kWh)"');
    expect(formulario).not.toContain("Tarifa ANEEL");
  });

  it("consumo e dimensionamento dependem só da efetiva; a prévia financeira usa o consumo da Etapa 1 e a base", () => {
    const consumo = trecho("const consumoEtapa1 = useMemo(", "const consumoMedioEstimado");
    expect(consumo).toContain("tarifaEfetiva: tarifaEfetivaInformada");
    expect(consumo).not.toMatch(/tarifaKwh|tarifaBase/);
    const sistema = trecho("const sistemaRecomendado = useMemo(", "const sugerirQuantidadeModulo");
    expect(sistema).toContain("consumoMedioEstimado");
    expect(sistema).not.toMatch(/tarifaKwh|tarifaEfetiva/);
    const previa = trecho("const previa = useMemo(", "Envio sem o reset");
    expect(previa).toContain("const tarifaBase = numero(tarifaKwh);");
    expect(previa).toContain("consumoMedioKwh: consumoMedioEstimado,");
    expect(previa).not.toContain("tarifaEfetiva");
  });

  it("o que é enviado: a base vai como tarifa_kwh; a efetiva vai como tarifa_efetiva_kwh só quando o consumo foi estimado; nunca um consumo estimado", () => {
    expect(formulario).toContain('<input type="hidden" name="tarifa_kwh" value={tarifaKwh} />');
    expect(formulario).toContain('<input type="hidden" name="tarifa_efetiva_kwh" value={tarifaEfetivaKwh} />');
    expect(formulario).toContain('consumoEtapa1?.origem === "estimado" && <input type="hidden" name="tarifa_efetiva_kwh"');
    // O servidor recalcula; o navegador não manda o consumo estimado.
    expect(formulario).not.toContain("consumo_estimado_kwh");
    expect(formulario).not.toMatch(/name="tarifa_kwh" value=\{tarifaEfetiva/);
    // O consumo informado do negócio continua sendo só o digitado em kWh.
    expect(formulario).toContain('<input type="hidden" name="consumo_medio_kwh" value={consumoMedioKwh} />');
  });
});

describe("servidor: consumo recalculado a partir da tarifa efetiva", () => {
  const servidor = readFileSync("src/lib/negocios-gravacao.ts", "utf8").replace(/\r\n/g, "\n");

  it("a criação recalcula o consumo (kWh informado, ou conta ÷ efetiva) e não aceita consumo estimado do navegador", () => {
    expect(servidor).toContain("tarifa_efetiva_kwh: numeroBrOpcional,");
    expect(servidor).not.toContain("consumo_estimado_kwh");
    expect(servidor).toContain("consumoParaCriacao({ consumoKwh: d.consumo_medio_kwh, valorConta: d.valor_fatura_medio, tarifaEfetiva: d.tarifa_efetiva_kwh })");
    expect(servidor).toContain("consumoMedioKwh: consumo.kwh,");
    // O negócio guarda só o kWh digitado; a tarifa efetiva não é gravada.
    expect(servidor).toContain("consumo_medio_kwh: d.consumo_medio_kwh,");
    expect(servidor).not.toMatch(/tarifa_efetiva_kwh:\s*d\./);
  });

  it("conta sem tarifa efetiva não cai na tarifa base: o cálculo não é feito", () => {
    expect(consumoParaCriacao({ consumoKwh: null, valorConta: 650, tarifaEfetiva: null })).toEqual({ ok: false, motivo: "falta_tarifa_efetiva" });
    expect(consumoParaCriacao({ consumoKwh: null, valorConta: 650, tarifaEfetiva: 0 })).toEqual({ ok: false, motivo: "falta_tarifa_efetiva" });
    expect(consumoParaCriacao({ consumoKwh: null, valorConta: null, tarifaEfetiva: 0.95 })).toEqual({ ok: false, motivo: "sem_consumo" });
  });

  it("estima do valor da conta e da efetiva (a mesma função da tela); kWh informado vence", () => {
    expect(consumoParaCriacao({ consumoKwh: null, valorConta: 650, tarifaEfetiva: 0.95 })).toEqual({ ok: true, kwh: 684.21, origem: "estimado" });
    expect(consumoParaCriacao({ consumoKwh: 780, valorConta: 650, tarifaEfetiva: 0.95 })).toEqual({ ok: true, kwh: 780, origem: "informado" });
    // Tela e servidor chegam ao mesmo número.
    expect(consumoDaEtapa1({ consumoKwh: null, valorConta: 650, tarifaEfetiva: 0.95 })?.kwh).toBe(684.21);
  });
});

describe("reabrir: consumo estimado x consumo informado", () => {
  it("consumo do cálculo vindo da fatura (negócio sem kWh informado) é tratado como estimado", () => {
    expect(consumoDoCalculoEhEstimado({ consumoNegocioKwh: null, valorFaturaCalculo: 650 })).toBe(true);
    // kWh informado no cadastro do negócio: não é estimado.
    expect(consumoDoCalculoEhEstimado({ consumoNegocioKwh: 780, valorFaturaCalculo: 650 })).toBe(false);
    expect(consumoDoCalculoEhEstimado({ consumoNegocioKwh: 780, valorFaturaCalculo: null })).toBe(false);
    expect(consumoDoCalculoEhEstimado({ consumoNegocioKwh: null, valorFaturaCalculo: null })).toBe(false);
  });

  it("a ficha e o formulário do kit mostram 'estimado' e não 'informado em kWh'", () => {
    const kit = readFileSync("src/app/(app)/negocios/[id]/kit-personalizado.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(kit).toContain('consumoEstimado ? "Consumo médio (estimado pela fatura)" : "Consumo médio"');
    expect(kit).toContain("não foi informado em kWh");
    expect(kit).toContain("Este consumo foi estimado a partir do valor da fatura; não foi informado em kWh pelo cliente.");
    const pagina = readFileSync("src/app/(app)/negocios/[id]/page.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(pagina).toContain("consumoDoCalculoEhEstimado({ consumoNegocioKwh: negocio.consumo_medio_kwh, valorFaturaCalculo: calculo.valor_fatura_medio })");
  });

  it("kit salvo sem cálculo (sem tarifa base): a estimativa NÃO volta ao reabrir — só a fatura fica", () => {
    // Negócio criado com valor da conta, tarifa efetiva e kit, mas sem tarifa base: nada além de
    // `negocios.valor_conta_energia` é gravado, então a tarifa efetiva e o consumo estimado se perdem.
    const estado = estadoSalvoDoKit({
      componentesSalvos: [{ tipo: "modulo", descricao: "Módulo 620 W", potenciaW: 620, quantidade: 10 }],
      calculo: null,
      estruturaTelhado: null,
      consumoMedioKwhPadrao: null,
      valorFaturaMedioPadrao: 650,
    });
    expect(estado.consumoMedioKwh).toBe("");
    expect(estado.valorFaturaMedio).toBe("650");
    expect(estado.tarifaKwh).toBe("");
  });
});
