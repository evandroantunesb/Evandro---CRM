/**
 * Economia na proposta emitida (proposta completa, PR 3; decisões do Evandro em 25/11/2026). Puro + geração do PDF,
 * dados fictícios. Números do exemplo: negócio de R$ 20.000 com payback de 71 meses (ano 6) e troca do inversor de
 * R$ 3.000 no ano 12, conferido na ficha da PR 2b-2.
 */
import { describe, expect, it } from "vitest";
import { METODO_GD2_PISO_V2 } from "@/lib/calculadora";
import { METODO_GD2_PISO_V1 } from "@/lib/fio-b-gd2";
import {
  avisoDaEconomia,
  economiaDoModelo,
  horizonteDoBloco,
  paybackDepoisDoHorizonte,
  saldoNoHorizonte,
  situacaoDaEconomia,
  textoPremissasEconomia,
  TEXTO_ECONOMIA_FORA,
  type CalculoParaEconomia,
  type EconomiaEmitida,
} from "@/lib/propostas/economia-emissao";
import { gerarPdfPropostaSimples } from "@/lib/propostas/emissao-simples-pdf";
import { ANOS_FIO_B_PROPOSTA, fraseParcelaEconomia } from "@/lib/propostas/textos-economia";
import {
  economiaDaEmissao,
  esquemaDadosEmissaoSimples,
  fioBDaEmissao,
  montarDadosEmissaoSimples,
  parcelaEconomiaDaEmissao,
  RODAPE_COM_ECONOMIA,
  RODAPE_SIMPLES_SEM_GERACAO,
  type EntradaEmissaoSimples,
} from "@/lib/propostas/proposta-simples";

const ECONOMIA = [3211, 3244, 3302, 3432, 3589, 3753, 3924, 4104, 4291, 4487, 4691, 4905, 5128, 5362, 5606, 5861, 6128, 6406, 6698, 7002, 7320, 7652, 7999, 8362, 8741];
const SALDO = [-16789, -13546, -10243, -6811, -3222, 531, 4455, 8559, 12850, 17336, 22028, 23933, 29061, 34423, 40029, 45890, 52018, 58425, 65122, 72124, 79444, 87095, 95094, 103456, 112197];

const anosSalvos = (comSaldo = true) =>
  ECONOMIA.map((economia, i) => ({
    ano: i + 1,
    anoCivilInicio: 2026 + i,
    geracaoKwh: 3564,
    contaSemSolar: 0,
    contaComSolar: 0,
    economia,
    trocaInversor: i === 11 ? 3000 : 0,
    saldoAcumulado: comSaldo ? SALDO[i]! : null,
  }));

const CALCULO: CalculoParaEconomia = {
  estado_financeiro: "completo",
  metodo_calculo: METODO_GD2_PISO_V2,
  conta_sem_solar: 523.39,
  conta_com_solar: 248.97,
  economia_mensal: 274.42,
  economia_primeiro_ano: 3211,
  payback_meses: 71,
  kit_preco: 20000,
  autoconsumo_fracao: 0.3,
  icms: 0.19,
  pis_cofins: 0.0763,
  projecao: { premissas: { reajusteAnual: 0.05, perdaPrimeiroAno: 0.01, perdaAnual: 0.004, anoTrocaInversor: 12 }, anos: anosSalvos() },
};

const bloco = (tipo: string, ativo = true, config: unknown = {}) => ({ tipo, ativo, config });
const MODELO_COMPLETO = [bloco("before_after_bill"), bloco("savings_summary"), bloco("cashflow_payback", true, { anos: 25 })];

const economiaDe = (blocos = MODELO_COMPLETO, calculo: CalculoParaEconomia = CALCULO): EconomiaEmitida => {
  const s = situacaoDaEconomia(economiaDoModelo(blocos), calculo, true);
  if (!s.entra) throw new Error(s.motivo);
  return s.economia;
};

describe("horizonteDoBloco", () => {
  it("5, 10, 15, 20 ou 25 (número ou texto); fora disso, o padrão de 25", () => {
    for (const n of [5, 10, 15, 20, 25]) {
      expect(horizonteDoBloco({ anos: n })).toBe(n);
      expect(horizonteDoBloco({ anos: String(n) })).toBe(n);
    }
    for (const c of [null, {}, { anos: 7 }, { anos: 30 }, { anos: "abc" }, "25", []]) expect(horizonteDoBloco(c)).toBe(25);
  });
});

describe("economiaDoModelo", () => {
  it("lê os blocos ATIVOS de economia e o horizonte do bloco de retorno (mesmo desligado)", () => {
    expect(economiaDoModelo(MODELO_COMPLETO)).toEqual({ blocos: { conta: true, resumo: true, retorno: true }, horizonteAnos: 25, algum: true });
    expect(economiaDoModelo([bloco("savings_summary", false), bloco("cashflow_payback", false, { anos: 10 })])).toEqual({
      blocos: { conta: false, resumo: false, retorno: false },
      horizonteAnos: 10,
      algum: false,
    });
    expect(economiaDoModelo(null).algum).toBe(false);
  });
});

describe("situacaoDaEconomia", () => {
  const modelo = economiaDoModelo(MODELO_COMPLETO);

  it("sem bloco de economia, sem cálculo, método anterior ou cálculo desatualizado: a proposta sai SEM economia", () => {
    expect(situacaoDaEconomia(economiaDoModelo([bloco("investment_main")]), CALCULO, true)).toEqual({ entra: false, motivo: "modelo_sem_blocos" });
    expect(situacaoDaEconomia(modelo, null, true)).toEqual({ entra: false, motivo: "sem_calculo" });
    expect(situacaoDaEconomia(modelo, { ...CALCULO, estado_financeiro: "incompleto" }, true)).toEqual({ entra: false, motivo: "sem_calculo" });
    expect(situacaoDaEconomia(modelo, { ...CALCULO, metodo_calculo: METODO_GD2_PISO_V1 }, true)).toEqual({ entra: false, motivo: "metodo_anterior" });
    expect(situacaoDaEconomia(modelo, CALCULO, false)).toEqual({ entra: false, motivo: "desatualizado" });
    expect(situacaoDaEconomia(modelo, { ...CALCULO, projecao: null }, true)).toEqual({ entra: false, motivo: "dados_incompletos" });
    expect(situacaoDaEconomia(modelo, { ...CALCULO, icms: null }, true)).toEqual({ entra: false, motivo: "dados_incompletos" });
  });

  it("monta a economia do cálculo: conta, economia, payback e os 25 anos", () => {
    const e = economiaDe();
    expect(e).toMatchObject({
      horizonteAnos: 25,
      contaSemSolar: 523.39,
      contaComSolar: 248.97,
      economiaMensal: 274.42,
      economiaPrimeiroAno: 3211,
      paybackMeses: 71,
      investimento: 20000,
      premissas: { autoconsumo: 0.3, icms: 0.19, pisCofins: 0.0763, reajusteAnual: 0.05, anoTrocaInversor: 12 },
    });
    expect(e.anos).toHaveLength(25);
    expect(e.economiaNoHorizonte).toBe(ECONOMIA.reduce((a, b) => a + b, 0));
    expect(saldoNoHorizonte(e)).toBe(112197);
  });

  it("o modelo com 10 anos guarda só os 10 primeiros: total e saldo do ano 10", () => {
    const e = economiaDe([...MODELO_COMPLETO.slice(0, 2), bloco("cashflow_payback", true, { anos: 10 })]);
    expect(e.anos.map((a) => a.ano)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(e.economiaNoHorizonte).toBe(ECONOMIA.slice(0, 10).reduce((a, b) => a + b, 0));
    expect(saldoNoHorizonte(e)).toBe(17336);
    expect(paybackDepoisDoHorizonte(e)).toBe(false);
    // A troca do inversor (ano 12) fica fora do período: não entra nas premissas mostradas.
    expect(textoPremissasEconomia(e)).not.toMatch(/troca do inversor/);
  });

  it("modelo com 5 anos e payback no ano 6: o retorno continua, e a proposta avisa que é depois do período", () => {
    const e = economiaDe([bloco("cashflow_payback", true, { anos: 5 })]);
    expect(e.paybackMeses).toBe(71);
    expect(paybackDepoisDoHorizonte(e)).toBe(true);
    expect(saldoNoHorizonte(e)).toBe(-3222);
  });

  it("sem payback (inversor sem preço): economia entra, retorno e saldo ficam nulos", () => {
    const e = economiaDe(MODELO_COMPLETO, { ...CALCULO, payback_meses: null, projecao: { premissas: {}, anos: anosSalvos(false) } });
    expect(e.paybackMeses).toBeNull();
    expect(saldoNoHorizonte(e)).toBeNull();
    expect(paybackDepoisDoHorizonte(e)).toBe(false);
  });

  it("premissas: autoconsumo, tributos, reajuste, perda, Fio B e a troca no ano 12 quando ela está no período", () => {
    expect(textoPremissasEconomia(economiaDe())).toBe(
      "Premissas: autoconsumo de 30%, ICMS 19% e PIS/Cofins 7,63%, reajuste da tarifa de 5% ao ano, perda dos módulos de 1% no 1º ano e 0,4% ao ano depois, Fio B de 60% (2026) a 100% (a partir de 2029), troca do inversor no ano 12 pelo preço de hoje. Bandeiras tarifárias e iluminação pública ficam fora.",
    );
  });
});

describe("avisoDaEconomia (tela de emissão)", () => {
  it("diz se entra e com quantos anos, ou o porquê de ficar fora; falha de leitura nunca vale como vigente", () => {
    expect(avisoDaEconomia(MODELO_COMPLETO, { ok: true, calculo: CALCULO, vigencia: { vigente: true } })).toEqual({ entra: true, horizonteAnos: 25, texto: null });
    expect(avisoDaEconomia(MODELO_COMPLETO, { ok: true, calculo: CALCULO, vigencia: { vigente: false } })).toEqual({
      entra: false,
      horizonteAnos: null,
      texto: TEXTO_ECONOMIA_FORA.desatualizado,
    });
    expect(avisoDaEconomia(MODELO_COMPLETO, { ok: false })).toMatchObject({ entra: false, texto: TEXTO_ECONOMIA_FORA.sem_calculo });
    expect(avisoDaEconomia(MODELO_COMPLETO, null)).toMatchObject({ entra: false });
  });
});

const ENTRADA: EntradaEmissaoSimples = {
  contatoNome: "Maria Souza",
  contatoEndereco: "Rua A, 10",
  valorNegocio: 20000,
  consumoMedioKwhNegocio: 500,
  componentes: [
    { tipo: "modulo", descricao: "Módulo 600 W", quantidade: 5, potencia_w: 600 },
    { tipo: "inversor", descricao: "Inversor 3 kW", quantidade: 1, potencia_w: 3000 },
  ],
  produtividadeConfirmada: null,
  validadeAte: "2026-12-30",
  condicoes: {
    entrada: { aVista: { desconto: "0" }, parcelado: null, financiamento: null, personalizado: null, observacao: "" },
    regras: { personalizadoAtivo: true, taxas: { cartao: [], boleto: [] }, limiteDesconto: 0, descontoAprovado: 0 },
  },
  conteudo: { incluso: null, exclusos: null, garantias: null, etapas: null, posVenda: null, institucional: null },
  identidade: { nomeExibicao: "Solar Teste", corPrimaria: "#0F0F10", corDestaque: "#D4AF37", whatsapp: "45999990000" },
  versao: 1,
  emitidaEm: "2026-11-25T12:00:00.000Z",
  hoje: "2026-11-25",
};

describe("emissão com economia (esquema 7)", () => {
  it("congela a economia e troca o rodapé pelo aviso das estimativas; sem economia, o rodapé de antes", () => {
    const com = montarDadosEmissaoSimples({ ...ENTRADA, economia: economiaDe() });
    const sem = montarDadosEmissaoSimples(ENTRADA);
    if (!com.ok || !sem.ok) throw new Error("montagem");
    expect(com.dados).toMatchObject({ esquema: 9, rodape: RODAPE_COM_ECONOMIA, economia: { horizonteAnos: 25, paybackMeses: 71 } });
    expect(sem.dados).toMatchObject({ esquema: 9, rodape: RODAPE_SIMPLES_SEM_GERACAO, economia: null });
    // Rodapé trocado na leitura não passa.
    expect(esquemaDadosEmissaoSimples.safeParse({ ...com.dados, rodape: RODAPE_SIMPLES_SEM_GERACAO }).success).toBe(false);
    expect(esquemaDadosEmissaoSimples.safeParse({ ...sem.dados, rodape: RODAPE_COM_ECONOMIA }).success).toBe(false);
  });

  it("emissões do esquema 6 (sem economia) continuam legíveis", () => {
    const sem = montarDadosEmissaoSimples(ENTRADA);
    if (!sem.ok) throw new Error("montagem");
    const v6 = { ...sem.dados, esquema: 6 } as Record<string, unknown>;
    delete v6.economia;
    expect(esquemaDadosEmissaoSimples.safeParse(v6).success).toBe(true);
  });

  it("o PDF gera com 25 anos, 5 anos (retorno depois do período), sem retorno e só com o bloco de retorno", async () => {
    const casos = [
      economiaDe(),
      economiaDe([bloco("before_after_bill"), bloco("savings_summary"), bloco("cashflow_payback", true, { anos: 5 })]),
      economiaDe(MODELO_COMPLETO, { ...CALCULO, payback_meses: null, projecao: { premissas: {}, anos: anosSalvos(false) } }),
      economiaDe([bloco("cashflow_payback", true, { anos: 15 })]),
    ];
    for (const economia of casos) {
      const m = montarDadosEmissaoSimples({ ...ENTRADA, economia });
      if (!m.ok) throw new Error(m.pendencias.join(" "));
      const pdf = await gerarPdfPropostaSimples(m.dados, { logoUrl: null, fotoCapaUrl: null });
      expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    }
  });
});

describe("esquema 9: Fio B e parcela × economia congelados (textos aprovados em 26/11/2026)", () => {
  const COM_FINANCIAMENTO: EntradaEmissaoSimples = {
    ...ENTRADA,
    condicoes: {
      ...ENTRADA.condicoes,
      entrada: {
        ...ENTRADA.condicoes.entrada!,
        financiamento: {
          instituicao: "Sicredi",
          entrada: "5.000,00",
          carenciaDias: 90,
          modo: "manual",
          taxaMensal: "",
          opcoes: [
            { parcelas: "60", valorParcela: "598,00" },
            { parcelas: "48", valorParcela: "560,00" },
          ],
        },
      },
    },
  };

  it("com economia: Fio B do ano da emissão e a frase da menor parcela, já prontos", () => {
    const economia = economiaDe();
    const m = montarDadosEmissaoSimples({ ...COM_FINANCIAMENTO, economia });
    if (!m.ok) throw new Error(m.pendencias.join(" "));
    expect(m.dados.esquema).toBe(9);
    expect(fioBDaEmissao(m.dados)).toEqual({ anoEmissao: 2026, anos: [...ANOS_FIO_B_PROPOSTA] });
    expect(parcelaEconomiaDaEmissao(m.dados)).toBe(fraseParcelaEconomia(m.dados.comercial.condicoesPagamento, economia!.economiaMensal));
    expect(parcelaEconomiaDaEmissao(m.dados)).toMatch(/48x, com entrada de R\$\s5\.000,00/);
  });

  it("com economia e sem financiamento: Fio B sim, frase não", () => {
    const m = montarDadosEmissaoSimples({ ...ENTRADA, economia: economiaDe() });
    if (!m.ok) throw new Error(m.pendencias.join(" "));
    expect(fioBDaEmissao(m.dados)).not.toBeNull();
    expect(parcelaEconomiaDaEmissao(m.dados)).toBeNull();
  });

  it("sem economia: nenhum dos dois (mesmo com financiamento)", () => {
    const m = montarDadosEmissaoSimples(COM_FINANCIAMENTO);
    if (!m.ok) throw new Error(m.pendencias.join(" "));
    expect(m.dados).toMatchObject({ esquema: 9, textosEconomia: null });
  });

  it("leitura recusa os textos sem economia (e economia sem os textos); o texto gravado vale como foi emitido", () => {
    const com = montarDadosEmissaoSimples({ ...COM_FINANCIAMENTO, economia: economiaDe() });
    const sem = montarDadosEmissaoSimples(COM_FINANCIAMENTO);
    if (!com.ok || !sem.ok) throw new Error("montagem");
    expect(esquemaDadosEmissaoSimples.safeParse({ ...sem.dados, textosEconomia: com.dados.textosEconomia }).success).toBe(false);
    expect(esquemaDadosEmissaoSimples.safeParse({ ...com.dados, textosEconomia: null }).success).toBe(false);
    // Uma emissão com outro texto continua legível (o texto não é recalculado na leitura).
    const outroTexto = { ...com.dados, textosEconomia: { ...com.dados.textosEconomia!, parcelaEconomia: "Texto de uma versão anterior." } };
    expect(esquemaDadosEmissaoSimples.safeParse(outroTexto).success).toBe(true);
  });

  it("esquema 8 continua legível e sem os textos novos", () => {
    const com = montarDadosEmissaoSimples({ ...COM_FINANCIAMENTO, economia: economiaDe() });
    if (!com.ok) throw new Error("montagem");
    const v8 = { ...com.dados, esquema: 8 } as Record<string, unknown>;
    delete v8.textosEconomia;
    const lida = esquemaDadosEmissaoSimples.safeParse(v8);
    expect(lida.success).toBe(true);
    expect(fioBDaEmissao(lida.data!)).toBeNull();
    expect(parcelaEconomiaDaEmissao(lida.data!)).toBeNull();
    expect(economiaDaEmissao(lida.data!)).not.toBeNull();
  });

  it("o PDF gera com as duas seções", async () => {
    const m = montarDadosEmissaoSimples({ ...COM_FINANCIAMENTO, economia: economiaDe() });
    if (!m.ok) throw new Error(m.pendencias.join(" "));
    const pdf = await gerarPdfPropostaSimples(m.dados, { logoUrl: null, fotoCapaUrl: null });
    expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
