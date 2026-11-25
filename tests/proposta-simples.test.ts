import { describe, expect, it } from "vitest";
import { MAX_PARCELAS } from "@/lib/condicoes-pagamento";
import { LIMITES_CONDICOES, MENSAGEM_NENHUMA_CONDICAO } from "@/lib/condicoes-pagamento-proposta";
import { linkSolicitarNovaProposta } from "@/lib/propostas/emissao-preservada";
import { gerarPdfPropostaSimples } from "@/lib/propostas/emissao-simples-pdf";
import {
  LIMITES_SIMPLES,
  RODAPE_SIMPLES,
  RODAPE_SIMPLES_SEM_GERACAO,
  coberturaDoConsumo,
  extrairConteudoDoModelo,
  hashDosDados,
  jsonCanonico,
  lerDadosDaEmissao,
  mensalDaEmissao,
  linhasCondicoesPagamento,
  linkWhatsappDaProposta,
  montarDadosEmissaoSimples,
  opcoesDePagamento,
  produtividadeConfirmada,
  sistemaDoKit,
  textoCondicoesComerciais,
  textoPremissaGeracao,
  type EntradaEmissaoSimples,
} from "@/lib/propostas/proposta-simples";

const L = LIMITES_SIMPLES;
const CONFIRMADA = { valor: 120, em: "2026-10-20T12:00:00.000Z", fonte: "Relatório de geração real das usinas da região", responsavel: "Eng. Ana Prado (CREA 12345)" };
const SEM_IMAGENS = { logoUrl: null, fotoCapaUrl: null };
/** Texto de exatamente `n` caracteres, em palavras (quebra de linha realista, ao contrário de uma palavra gigante). */
const palavras = (n: number) => "Palavra comprida de exemplo ".repeat(Math.ceil(n / 5)).slice(0, n).trim().padEnd(n, "z");
const SEM_CONTEUDO = { incluso: null, exclusos: null, garantias: null, etapas: null, posVenda: null, institucional: null };
const REGRAS = { personalizadoAtivo: true, taxas: { cartao: [], boleto: [] }, limiteDesconto: 0, descontoAprovado: 0 };
const CONDICOES: EntradaEmissaoSimples["condicoes"] = {
  entrada: { aVista: { desconto: "0" }, parcelado: null, financiamento: null, personalizado: null, observacao: "50% na assinatura e 50% na instalação" },
  regras: REGRAS,
};
/** Todas as modalidades no máximo: 24 parcelas, 3 financiamentos, 4 partes com observação e a observação no limite. */
const PIOR_CASO_CONDICOES: EntradaEmissaoSimples["condicoes"] = {
  entrada: {
    aVista: { desconto: "5,5" },
    parcelado: { meio: "cartao", parcelas: Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1), repassarTaxas: true },
    financiamento: {
      instituicao: palavras(LIMITES_CONDICOES.instituicao),
      opcoes: Array.from({ length: LIMITES_CONDICOES.opcoesFinanciamento }, () => ({ entrada: "12.345,67", parcelas: "84", valorParcela: "1.234,56", carenciaDias: 150 })),
    },
    personalizado: {
      partes: Array.from({ length: LIMITES_CONDICOES.partesPersonalizado }, () => ({
        valor: "6.125,00",
        forma: "transferencia",
        momento: "entrega_material",
        data: "",
        observacao: palavras(LIMITES_CONDICOES.observacaoParte),
      })),
    },
    observacao: palavras(LIMITES_CONDICOES.observacao),
  },
  regras: {
    ...REGRAS,
    limiteDesconto: 10,
    taxas: { cartao: Array.from({ length: MAX_PARCELAS }, (_, i) => ({ parcelas: i + 1, taxa: 12.34 })), boleto: [] },
  },
};

function entrada(sobrescrever: Partial<EntradaEmissaoSimples> = {}): EntradaEmissaoSimples {
  return {
    contatoNome: "Maria Souza",
    contatoEndereco: "Rua A, 10 · Cascavel · PR",
    valorNegocio: 24500,
    consumoMedioKwhNegocio: 450,
    componentes: [
      { tipo: "modulo", descricao: "Módulo 540 W", quantidade: 10, potencia_w: 540 },
      { tipo: "inversor", descricao: "Inversor 5 kW", quantidade: 1, potencia_w: null },
    ],
    produtividadeConfirmada: CONFIRMADA,
    validadeAte: "2026-11-30",
    condicoes: CONDICOES,
    conteudo: {
      incluso: ["Projeto e homologação", "Instalação"],
      exclusos: ["Obra civil no telhado"],
      garantias: ["Módulos: 12 anos de produto"],
      etapas: [{ titulo: "Fechamento", prazo: null, descricao: "Assinatura" }],
      posVenda: null,
      institucional: null,
    },
    identidade: { nomeExibicao: "Solar Teste", corPrimaria: "#0F0F10", corDestaque: "#D4AF37", whatsapp: "45999990000" },
    versao: 1,
    emitidaEm: "2026-10-22T12:00:00.000Z",
    hoje: "2026-10-22",
    ...sobrescrever,
  };
}

function dadosValidos(sobrescrever: Partial<EntradaEmissaoSimples> = {}) {
  const r = montarDadosEmissaoSimples(entrada(sobrescrever));
  if (!r.ok) throw new Error(r.pendencias.join(" "));
  return r.dados;
}

describe("origem de potência e geração (sem cálculo salvo)", () => {
  it("potência = soma dos módulos do kit emitido; geração = potência × produtividade CONFIRMADA da empresa", () => {
    // 10 × 540 W = 5,4 kWp; × 120 kWh/kWp/mês = 648 kWh/mês
    const s = sistemaDoKit(entrada().componentes, CONFIRMADA)!;
    expect(s.potenciaKwp).toBe(5.4);
    expect(s.geracao).toEqual({ kwhMes: 648, produtividadeKwhKwpMes: 120, confirmadaEm: CONFIRMADA.em, fonte: CONFIRMADA.fonte, responsavel: CONFIRMADA.responsavel });
    expect(s.modulos).toEqual({ quantidade: 10, potenciaW: 540 });
    const dados = dadosValidos();
    expect(dados.sistema.potenciaKwp).toBe(5.4);
    expect(dados.sistema.geracao?.kwhMes).toBe(648);
  });

  it("a geração usa a escala do banco (2 casas) como o motor", () => {
    // 7 × 545 W = 3,815 kWp -> 3,82 kWp (2 casas); × 131,33 = 501,6806 -> 501,68
    const s = sistemaDoKit([{ tipo: "modulo", descricao: "M", quantidade: 7, potencia_w: 545 }], { ...CONFIRMADA, valor: 131.33 })!;
    expect(s.potenciaKwp).toBe(3.82);
    expect(s.geracao?.kwhMes).toBe(501.68);
  });

  it("muda junto com o kit: outro kit, outra potência e geração", () => {
    const dobro = dadosValidos({ componentes: [{ tipo: "modulo", descricao: "Módulo 540 W", quantidade: 20, potencia_w: 540 }] });
    expect(dobro.sistema.potenciaKwp).toBe(10.8);
    expect(dobro.sistema.geracao?.kwhMes).toBe(1296);
  });

  it("módulos de potências diferentes: a quantidade soma e a potência por módulo não é afirmada", () => {
    const s = sistemaDoKit(
      [
        { tipo: "modulo", descricao: "A", quantidade: 4, potencia_w: 540 },
        { tipo: "modulo", descricao: "B", quantidade: 2, potencia_w: 550 },
      ],
      CONFIRMADA,
    )!;
    expect(s.modulos).toEqual({ quantidade: 6, potenciaW: null });
  });

  it("sem módulo com potência não há número: recusa em vez de completar", () => {
    const so = [{ tipo: "inversor", descricao: "I", quantidade: 1, potencia_w: 5000 }];
    expect(sistemaDoKit(so, CONFIRMADA)).toBeNull();
    expect(montarDadosEmissaoSimples(entrada({ componentes: so })).ok).toBe(false);
  });

  it("não há tipo de ligação nem dado do cálculo salvo nos dados congelados", () => {
    expect(jsonCanonico(dadosValidos())).not.toMatch(/ligacao|tarifa|calculo/i);
  });
});

describe("produtividade confirmada: sem confirmação, sem o número de geração", () => {
  const par = (sobrescrever: Record<string, unknown> = {}) => ({
    produtividade_kwh_kwp_mes: 120,
    produtividade_confirmada_valor: 120 as number | null,
    produtividade_confirmada_em: "2026-10-20T12:00:00.000Z" as string | null,
    produtividade_confirmada_fonte: CONFIRMADA.fonte as string | null,
    produtividade_confirmada_responsavel: CONFIRMADA.responsavel as string | null,
    ...sobrescrever,
  });

  it("só vale com o valor confirmado IGUAL ao valor atual", () => {
    expect(produtividadeConfirmada(par())).toEqual(CONFIRMADA);
    expect(produtividadeConfirmada(par({ produtividade_kwh_kwp_mes: 130 }))).toBeNull();
    expect(produtividadeConfirmada(par({ produtividade_confirmada_valor: null, produtividade_confirmada_em: null }))).toBeNull();
    expect(produtividadeConfirmada(null)).toBeNull();
  });

  it("exige valor, fonte E responsável: sem um deles a confirmação não vale", () => {
    expect(produtividadeConfirmada(par({ produtividade_confirmada_fonte: null }))).toBeNull();
    expect(produtividadeConfirmada(par({ produtividade_confirmada_fonte: "curta" }))).toBeNull();
    expect(produtividadeConfirmada(par({ produtividade_confirmada_responsavel: null }))).toBeNull();
    expect(produtividadeConfirmada(par({ produtividade_confirmada_responsavel: "  " }))).toBeNull();
  });

  it("o padrão de fábrica NUNCA vale sozinho (valor 120 sem confirmação)", () => {
    expect(produtividadeConfirmada(par({ produtividade_confirmada_valor: null, produtividade_confirmada_em: null }))).toBeNull();
  });

  it("sem confirmação a proposta é emitida SEM geração (potência, consumo e preço continuam)", () => {
    const dados = dadosValidos({ produtividadeConfirmada: null });
    expect(dados.sistema.geracao).toBeNull();
    expect(dados.sistema.potenciaKwp).toBe(5.4);
    expect(dados.preco.valor).toBe(24500);
    expect(jsonCanonico(dados)).not.toMatch(/produtividade|kwhMes/);
    expect(textoPremissaGeracao(dados)).toBe("");
  });

  it("com confirmação, a premissa cita a potência, a produtividade e a data da confirmação", () => {
    const texto = textoPremissaGeracao(dadosValidos());
    expect(texto).toContain("5,4 kWp");
    expect(texto).toContain("120 kWh por kWp");
    expect(texto).toContain("confirmado pela empresa em 20/10/2026");
    expect(texto).toContain(`fonte: ${CONFIRMADA.fonte}`);
    expect(texto).toContain(`responsável pela validação: ${CONFIRMADA.responsavel}`);
    expect(texto).toMatch(/sem simulação de engenharia/);
  });
});

describe("preço do negócio", () => {
  it("congela o valor atual do negócio, sem cálculo financeiro nem recálculo", () => {
    expect(dadosValidos({ valorNegocio: 31890.5 }).preco.valor).toBe(31890.5);
  });
});

describe("conteúdo confirmado pela empresa", () => {
  const blocos = [
    { tipo: "scope_inclusions_exclusions", ativo: true, config: { incluido: ["  Projeto  ", "", "Instalação"], excluido: ["Obra civil"] } },
    { tipo: "warranties", ativo: true, config: { itens: ["Módulos 12 anos"] } },
    { tipo: "commercial_conditions", ativo: true, config: { texto: "  Entrada de 50%  " } },
    { tipo: "project_steps", ativo: true, config: { itens: ["Fechamento | 1 dia | Assinatura", "Instalação", " | só prazo"] } },
  ];

  it("extrai só o que a empresa escreveu em blocos ativos", () => {
    expect(extrairConteudoDoModelo(blocos)).toEqual({
      condicoes: "Entrada de 50%",
      incluso: ["Projeto", "Instalação"],
      exclusos: ["Obra civil"],
      garantias: ["Módulos 12 anos"],
      etapas: [
        { titulo: "Fechamento", prazo: "1 dia", descricao: "Assinatura" },
        { titulo: "Instalação", prazo: null, descricao: null },
      ],
      posVenda: null,
      institucional: null,
    });
  });

  it("lê o pós-venda e os blocos institucionais ativos, só o que a empresa escreveu", () => {
    const c = extrairConteudoDoModelo([
      { tipo: "support_maintenance", ativo: true, config: { itens: ["Monitoramento pelo aplicativo", " "] } },
      { tipo: "about_company", ativo: true, config: { texto: "  Somos do oeste do Paraná.  " } },
      { tipo: "company_numbers", ativo: true, config: { itens: ["projetos instalados | 350+", "sem valor |", "| sem rótulo"] } },
      { tipo: "portfolio", ativo: true, config: { itens: ["Residência em Cascavel | 8,2 kWp", "Mercado em Toledo"] } },
      { tipo: "testimonials", ativo: true, config: { itens: ["Maria | Atendimento rápido.", "Sem depoimento"] } },
      { tipo: "team_and_certifications", ativo: true, config: { itens: ["Ana Prado | CREA 12345 | Engenheira", "Carlos"] } },
    ]);
    expect(c.posVenda).toEqual(["Monitoramento pelo aplicativo"]);
    expect(c.institucional).toEqual({
      sobre: "Somos do oeste do Paraná.",
      numeros: [{ rotulo: "projetos instalados", valor: "350+" }],
      projetos: [
        { titulo: "Residência em Cascavel", descricao: "8,2 kWp" },
        { titulo: "Mercado em Toledo", descricao: null },
      ],
      depoimentos: [{ nome: "Maria", texto: "Atendimento rápido." }],
      equipe: [
        { nome: "Ana Prado", registro: "CREA 12345", texto: "Engenheira" },
        { nome: "Carlos", registro: null, texto: null },
      ],
    });
  });

  it("blocos institucionais inativos, vazios ou com o texto padrão não abrem a página 'Sobre a empresa'", () => {
    const c = extrairConteudoDoModelo([
      { tipo: "about_company", ativo: false, config: { texto: "Texto de um bloco desligado" } },
      { tipo: "company_numbers", ativo: true, config: {} },
      { tipo: "testimonials", ativo: true, config: { itens: ["só o nome"] } },
      { tipo: "support_maintenance", ativo: false, config: { itens: ["X"] } },
    ]);
    expect(c.institucional).toBeNull();
    expect(c.posVenda).toBeNull();
  });

  it("usa 'O que está incluso' quando não há bloco de inclusões e exclusões", () => {
    expect(extrairConteudoDoModelo([{ tipo: "included_services", ativo: true, config: { itens: ["X"] } }]).incluso).toEqual(["X"]);
  });

  it("bloco inativo, sem itens ou ausente não vira conteúdo (nada de texto padrão)", () => {
    expect(extrairConteudoDoModelo([{ tipo: "included_services", ativo: false, config: { itens: ["X"] } }]).incluso).toBeNull();
    expect(extrairConteudoDoModelo([{ tipo: "warranties", ativo: true, config: {} }]).garantias).toBeNull();
    expect(extrairConteudoDoModelo([{ tipo: "warranties", ativo: true, config: { itens: ["", "  "] } }]).garantias).toBeNull();
    expect(extrairConteudoDoModelo(null)).toEqual({ condicoes: "", incluso: null, exclusos: null, garantias: null, etapas: null, posVenda: null, institucional: null });
  });

  it("sem conteúdo confirmado, nada de Incluso, Garantias ou Etapas nos dados", () => {
    const d = dadosValidos({ conteudo: SEM_CONTEUDO });
    expect(d.comercial).toMatchObject({ incluso: null, exclusos: null, garantias: null, etapas: null });
    expect(jsonCanonico(d)).not.toMatch(/Suporte no período de garantia|conforme fabricante/);
  });
});

describe("rodapé e textos aprovados", () => {
  it("o PDF e os dados nunca citam GD II nem Fio B", () => {
    const dados = dadosValidos();
    const textos = [RODAPE_SIMPLES, textoCondicoesComerciais(dados), textoPremissaGeracao(dados), jsonCanonico(dados)].join("\n");
    expect(textos).not.toMatch(/GD\s*II|Fio\s*B/i);
  });

  it("usa o rodapé aprovado quando a proposta TEM geração", () => {
    expect(RODAPE_SIMPLES).toBe("Esta proposta apresenta o sistema e sua geração estimada. Não inclui estimativa de economia ou prazo de retorno.");
    expect(dadosValidos().rodape).toBe(RODAPE_SIMPLES);
  });

  it("sem geração usa a variante que não promete o número (e só ela)", () => {
    const sem = dadosValidos({ produtividadeConfirmada: null });
    expect(sem.rodape).toBe(RODAPE_SIMPLES_SEM_GERACAO);
    expect(RODAPE_SIMPLES_SEM_GERACAO).not.toMatch(/geração estimada/);
    expect(RODAPE_SIMPLES_SEM_GERACAO).not.toMatch(/GD\s*II|Fio\s*B/i);
    // o rodapé tem que acompanhar a geração: combinação trocada é recusada ao ler
    const trocado = { ...sem, rodape: RODAPE_SIMPLES };
    expect(lerDadosDaEmissao(trocado, hashDosDados(trocado))).toEqual({ ok: false });
    const trocado2 = { ...dadosValidos(), rodape: RODAPE_SIMPLES_SEM_GERACAO };
    expect(lerDadosDaEmissao(trocado2, hashDosDados(trocado2))).toEqual({ ok: false });
  });
});

describe("montarDadosEmissaoSimples", () => {
  it("sem economia informada, monta os dados congelados sem economia, payback, contas nem Fio B", () => {
    const dados = dadosValidos();
    expect(dados.preco.valor).toBe(24500);
    expect(dados.sistema.consumoMedioKwh).toBe(450);
    expect(dados.esquema === 8 && dados.economia).toBeNull();
    const resto = { ...dados } as Record<string, unknown>;
    delete resto.economia;
    expect(jsonCanonico(resto)).not.toMatch(/"(economia|payback|conta|fio)/i);
  });

  it("exige a validade informada pelo vendedor: sem padrão", () => {
    for (const validadeAte of [null, ""]) {
      const r = montarDadosEmissaoSimples(entrada({ validadeAte }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.pendencias).toContain("Informe até quando a proposta é válida.");
    }
  });

  it("recusa validade passada ou inexistente, aceita hoje", () => {
    expect(montarDadosEmissaoSimples(entrada({ validadeAte: "2026-10-21" })).ok).toBe(false);
    expect(montarDadosEmissaoSimples(entrada({ validadeAte: "2026-02-30" })).ok).toBe(false);
    expect(montarDadosEmissaoSimples(entrada({ validadeAte: "2026-10-22" })).ok).toBe(true);
  });

  it("recusa dado ausente em vez de completar com zero ou padrão", () => {
    const casos: Partial<EntradaEmissaoSimples>[] = [
      { contatoNome: null },
      { valorNegocio: null },
      { valorNegocio: 0 },
      { consumoMedioKwhNegocio: null },
      { consumoMedioKwhNegocio: 0 },
      { componentes: [] },
    ];
    for (const c of casos) expect(montarDadosEmissaoSimples(entrada(c)).ok, JSON.stringify(c)).toBe(false);
  });

  it("condição de pagamento é OBRIGATÓRIA: nenhuma modalidade marcada ou envio malformado não congela a proposta", () => {
    const nenhuma = { aVista: null, parcelado: null, financiamento: null, personalizado: null, observacao: "Só texto" };
    for (const e of [null, nenhuma]) {
      const r = montarDadosEmissaoSimples(entrada({ condicoes: { entrada: e, regras: REGRAS } }));
      expect(r.ok, JSON.stringify(e)).toBe(false);
      if (!r.ok) expect(r.pendencias).toContain(MENSAGEM_NENHUMA_CONDICAO);
    }
  });

  it("emissão nova grava o esquema 8, com as condições por modalidade e a observação", () => {
    const dados = dadosValidos();
    expect(dados.esquema).toBe(8);
    expect(dados.comercial.condicoesPagamento).toEqual({
      aVista: { descontoPercentual: 0, valor: 24500 },
      parcelado: null,
      financiamento: null,
      personalizado: null,
      observacao: "50% na assinatura e 50% na instalação",
    });
    expect(textoCondicoesComerciais(dados)).toContain("Condições de pagamento: À vista: R$ 24.500,00\n50% na assinatura e 50% na instalação");
  });

  it("grava o pós-venda e o conteúdo institucional do modelo; sem eles, os campos ficam nulos", () => {
    const institucional = { sobre: "Somos do oeste do Paraná.", numeros: null, projetos: null, depoimentos: null, equipe: [{ nome: "Ana Prado", registro: "CREA 12345", texto: null }] };
    const com = dadosValidos({ conteudo: { ...SEM_CONTEUDO, posVenda: ["Monitoramento"], institucional } });
    expect(com.comercial.posVenda).toEqual(["Monitoramento"]);
    expect(com.institucional).toEqual(institucional);
    const sem = dadosValidos({ conteudo: SEM_CONTEUDO });
    expect(sem.comercial.posVenda).toBeNull();
    expect(sem.institucional).toBeNull();
  });

  it("propostas já emitidas no esquema 5 continuam legíveis", () => {
    // O que uma emissão do esquema 5 gravava: sem o institucional e sem o pós-venda.
    const antiga: Record<string, unknown> = structuredClone(dadosValidos());
    delete antiga.institucional;
    delete (antiga.comercial as Record<string, unknown>).posVenda;
    antiga.esquema = 5;
    const lida = lerDadosDaEmissao(antiga, hashDosDados(antiga));
    expect(lida.ok).toBe(true);
    if (lida.ok) {
      expect(lida.dados.esquema).toBe(5);
      expect(linhasCondicoesPagamento(lida.dados)[0]).toMatch(/^À vista: R\$\s24\.500,00$/);
    }
  });

  it("propostas já emitidas no esquema 4 (texto livre) continuam legíveis, uma opção por linha", () => {
    expect(opcoesDePagamento("À vista por Pix\n• Financiamento bancário\r\n- Cartão em até 12x\n\n")).toEqual([
      "À vista por Pix",
      "Financiamento bancário",
      "Cartão em até 12x",
    ]);
    const antiga = { ...dadosValidos(), esquema: 4, comercial: { ...dadosValidos().comercial, condicoesPagamento: "À vista por Pix\nCartão em até 12x" } };
    const lida = lerDadosDaEmissao(antiga, hashDosDados(antiga));
    expect(lida.ok).toBe(true);
    if (lida.ok) {
      expect(linhasCondicoesPagamento(lida.dados)).toEqual(["À vista por Pix", "Cartão em até 12x"]);
      expect(textoCondicoesComerciais(lida.dados)).toContain("Condições de pagamento: À vista por Pix\nCartão em até 12x");
    }
    // Esquema 5 com texto livre (ou 4 com condições estruturadas) não passa.
    const misturada = { ...antiga, esquema: 5 };
    expect(lerDadosDaEmissao(misturada, hashDosDados(misturada))).toEqual({ ok: false });
  });
});

const CURVA = [5.9, 5.7, 5.3, 4.6, 3.8, 3.4, 3.6, 4.5, 4.7, 5.4, 6, 6.1];
const CONSUMO_12 = [520, 500, 480, 430, 400, 400, 410, 420, 430, 450, 480, 500];

describe("geração e consumo mês a mês (esquema 8)", () => {
  it("com curva e consumo dos 12 meses: congela a geração repartida e o consumo informado", () => {
    const dados = dadosValidos({ curvaGeracao: CURVA, consumoMensalKwhNegocio: CONSUMO_12 });
    expect(dados.esquema).toBe(8);
    const mensal = mensalDaEmissao(dados)!;
    expect(mensal.consumoOrigem).toBe("informado");
    expect(mensal.consumoKwh).toEqual(CONSUMO_12);
    expect(mensal.geracaoKwh.reduce((a, b) => a + b, 0)).toBe(Math.round(dados.sistema.geracao!.kwhMes * 12));
  });

  it("sem os 12 meses: o consumo do gráfico é a média do negócio", () => {
    const mensal = mensalDaEmissao(dadosValidos({ curvaGeracao: CURVA, consumoMensalKwhNegocio: null }))!;
    expect(mensal.consumoOrigem).toBe("media");
    expect(mensal.consumoKwh).toEqual(Array(12).fill(450));
  });

  it("sem curva ou sem produtividade confirmada: emite sem o gráfico, sem pendência nova", () => {
    expect(mensalDaEmissao(dadosValidos({ curvaGeracao: null, consumoMensalKwhNegocio: CONSUMO_12 }))).toBeNull();
    expect(mensalDaEmissao(dadosValidos({ curvaGeracao: CURVA, produtividadeConfirmada: null }))).toBeNull();
  });

  it("ao ler, recusa gráfico sem geração ou com soma diferente do ano", () => {
    const dados = dadosValidos({ curvaGeracao: CURVA });
    const semGeracao = { ...dadosValidos({ produtividadeConfirmada: null }), mensal: dados.esquema === 8 ? dados.mensal : null };
    expect(lerDadosDaEmissao(semGeracao, hashDosDados(semGeracao))).toEqual({ ok: false });
    const soma = JSON.parse(JSON.stringify(dados));
    soma.mensal.geracaoKwh[0] += 1;
    expect(lerDadosDaEmissao(soma, hashDosDados(soma))).toEqual({ ok: false });
  });

  it("emissões gravadas no esquema 7 continuam legíveis", () => {
    const v7 = JSON.parse(JSON.stringify(dadosValidos()));
    v7.esquema = 7;
    delete v7.mensal;
    expect(lerDadosDaEmissao(v7, hashDosDados(v7))).toEqual({ ok: true, dados: v7 });
    expect(mensalDaEmissao(v7)).toBeNull();
  });

  it("mudar a curva ou o consumo depois não muda os dados já montados", () => {
    const curva = [...CURVA];
    const consumo = [...CONSUMO_12];
    const dados = dadosValidos({ curvaGeracao: curva, consumoMensalKwhNegocio: consumo });
    const antes = JSON.stringify(mensalDaEmissao(dados));
    curva[0] = 99;
    consumo[0] = 1;
    expect(JSON.stringify(mensalDaEmissao(dados))).toBe(antes);
  });
});

describe("integridade dos dados gravados", () => {
  it("o hash não depende da ordem das chaves nem de passar pelo jsonb", () => {
    const dados = dadosValidos();
    const inverter = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(inverter)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, inverter(x)]))
          : v;
    const reordenado = inverter(dados);
    expect(jsonCanonico(reordenado)).toBe(jsonCanonico(dados));
    expect(hashDosDados(reordenado)).toBe(hashDosDados(dados));
    expect(hashDosDados(JSON.parse(JSON.stringify(dados)))).toBe(hashDosDados(dados));
  });

  it("lê dados íntegros e recusa dado alterado depois da emissão", () => {
    const dados = dadosValidos();
    const hash = hashDosDados(dados);
    expect(lerDadosDaEmissao(JSON.parse(JSON.stringify(dados)), hash)).toEqual({ ok: true, dados });
    const adulterado = JSON.parse(JSON.stringify(dados));
    adulterado.preco.valor = 1;
    expect(lerDadosDaEmissao(adulterado, hash)).toEqual({ ok: false });
  });

  it("recusa formato inesperado mesmo com hash coerente", () => {
    const estranho = { esquema: 4, preco: { valor: -5 } };
    expect(lerDadosDaEmissao(estranho, hashDosDados(estranho))).toEqual({ ok: false });
  });

  it("alterar kit, consumo ou preço do negócio depois não muda os dados já montados", () => {
    const e = entrada();
    const antes = montarDadosEmissaoSimples(e);
    e.valorNegocio = 99999;
    e.consumoMedioKwhNegocio = 1;
    e.componentes[0]!.descricao = "OUTRO";
    if (!antes.ok) throw new Error("falhou");
    expect(antes.dados.preco.valor).toBe(24500);
    expect(antes.dados.sistema.consumoMedioKwh).toBe(450);
    expect(antes.dados.sistema.componentes[0]!.descricao).toBe("Módulo 540 W");
  });
});

describe("limites que seguram cada página A4", () => {
  const item = palavras(L.textoItem);

  it("recusa, com orientação, o que passa do limite em vez de truncar o texto da empresa", () => {
    const casos: Partial<EntradaEmissaoSimples>[] = [
      { conteudo: { ...SEM_CONTEUDO, incluso: Array.from({ length: L.incluso + 1 }, () => "a") } },
      { conteudo: { ...SEM_CONTEUDO, exclusos: Array.from({ length: L.exclusos + 1 }, () => "a") } },
      { conteudo: { ...SEM_CONTEUDO, garantias: Array.from({ length: L.garantias + 1 }, () => "a") } },
      { conteudo: { ...SEM_CONTEUDO, incluso: [item + "y"] } },
      { conteudo: { ...SEM_CONTEUDO, etapas: Array.from({ length: L.etapas + 1 }, () => ({ titulo: "t", prazo: null, descricao: null })) } },
      { conteudo: { ...SEM_CONTEUDO, etapas: [{ titulo: "t".repeat(L.etapaTitulo + 1), prazo: null, descricao: null }] } },
      { componentes: Array.from({ length: L.componentes + 1 }, () => ({ tipo: "modulo", descricao: "M", quantidade: 1, potencia_w: 540 })) },
      { componentes: [{ tipo: "modulo", descricao: palavras(L.descricaoComponente + 1), quantidade: 1, potencia_w: 540 }] },
      { contatoNome: "n".repeat(L.clienteNome + 1) },
      { contatoEndereco: "e".repeat(L.clienteEndereco + 1) },
      { conteudo: { ...SEM_CONTEUDO, posVenda: Array.from({ length: L.posVenda + 1 }, () => "a") } },
      { conteudo: { ...SEM_CONTEUDO, institucional: { ...institucionalNoLimite(), sobre: palavras(L.sobreTexto + 1) } } },
      { conteudo: { ...SEM_CONTEUDO, institucional: { ...institucionalNoLimite(), numeros: Array.from({ length: L.numeros + 1 }, () => ({ rotulo: "a", valor: "1" })) } } },
      { conteudo: { ...SEM_CONTEUDO, institucional: { ...institucionalNoLimite(), projetos: [{ titulo: "t".repeat(L.projetoTitulo + 1), descricao: null }] } } },
      { conteudo: { ...SEM_CONTEUDO, institucional: { ...institucionalNoLimite(), depoimentos: [{ nome: "n", texto: palavras(L.depoimentoTexto + 1) }] } } },
      { conteudo: { ...SEM_CONTEUDO, institucional: { ...institucionalNoLimite(), equipe: Array.from({ length: L.equipe + 1 }, () => ({ nome: "n", registro: null, texto: null })) } } },
      { condicoes: { entrada: { ...CONDICOES.entrada!, observacao: "y".repeat(LIMITES_CONDICOES.observacao + 1) }, regras: REGRAS } },
    ];
    for (const c of casos) expect(montarDadosEmissaoSimples(entrada(c)).ok, JSON.stringify(c).slice(0, 70)).toBe(false);
  });

  it("aceita exatamente o limite", () => {
    const r = montarDadosEmissaoSimples(
      entrada({
        conteudo: {
          incluso: Array.from({ length: L.incluso }, () => item),
          exclusos: Array.from({ length: L.exclusos }, () => item),
          garantias: Array.from({ length: L.garantias }, () => item),
          etapas: Array.from({ length: L.etapas }, () => ({ titulo: palavras(L.etapaTitulo), prazo: palavras(L.etapaPrazo), descricao: palavras(L.etapaDescricao) })),
          posVenda: Array.from({ length: L.posVenda }, () => item),
          institucional: institucionalNoLimite(),
        },
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("cobertura e QR do WhatsApp", () => {
  it("cobertura = geração ÷ consumo, inteira; sem geração confirmada, nula", () => {
    // 648 kWh/mês ÷ 450 kWh = 144%
    expect(coberturaDoConsumo(dadosValidos())).toBe(144);
    expect(coberturaDoConsumo(dadosValidos({ produtividadeConfirmada: null }))).toBeNull();
  });

  it("o QR leva ao WhatsApp da empresa com a mensagem da proposta; número inválido = sem QR", () => {
    const comNumero = (whatsapp: string) => linkWhatsappDaProposta(dadosValidos({ identidade: { ...entrada().identidade, whatsapp } }));
    const esperado = `https://wa.me/5545999990000?text=${encodeURIComponent("Olá! Quero falar sobre a proposta nº 1 de Maria Souza.")}`;
    expect(comNumero("45999990000")).toBe(esperado);
    expect(comNumero("(45) 99999-0000")).toBe(esperado);
    expect(comNumero("+55 45 99999-0000")).toBe(esperado);
    expect(comNumero("4533334444")).toBe(`https://wa.me/554533334444?text=${encodeURIComponent("Olá! Quero falar sobre a proposta nº 1 de Maria Souza.")}`);
    expect(comNumero("")).toBeNull();
    expect(comNumero("99990000")).toBeNull();
    expect(comNumero("0800 123 4567")).toBeNull();
  });
});

describe("PDF da proposta simples", () => {
  const paginasDe = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1").match(/\/Type \/Page(?!s)/g)?.length ?? 0;

  it("gera um PDF válido de 3 páginas A4 (capa e o miolo em fluxo contínuo)", async () => {
    const pdf = await gerarPdfPropostaSimples(dadosValidos(), SEM_IMAGENS);
    expect(Buffer.from(pdf).toString("latin1").startsWith("%PDF")).toBe(true);
    expect(paginasDe(pdf)).toBe(3);
  });

  it("sem conteúdo confirmado e sem geração confirmada, a proposta encurta para 2 páginas, sem folha vazia", async () => {
    const dados = dadosValidos({ conteudo: SEM_CONTEUDO, produtividadeConfirmada: null });
    expect(paginasDe(await gerarPdfPropostaSimples(dados, SEM_IMAGENS))).toBe(2);
  });

  it("desligar seções no modelo nunca aumenta a proposta: o miolo corre em fluxo contínuo", async () => {
    const tudo = conteudoNoLimite();
    const paginas = async (conteudo: EntradaEmissaoSimples["conteudo"]) => paginasDe(await gerarPdfPropostaSimples(dadosValidos({ conteudo }), SEM_IMAGENS));
    const cheia = await paginas(tudo);
    const semInstitucional = await paginas({ ...tudo, institucional: null });
    const semNada = await paginas(SEM_CONTEUDO);
    expect(semInstitucional).toBeLessThanOrEqual(cheia);
    expect(semNada).toBeLessThanOrEqual(semInstitucional);
    expect(semNada).toBe(2);
  });

  const piorCaso = (condicoes: EntradaEmissaoSimples["condicoes"], conteudo: EntradaEmissaoSimples["conteudo"] = conteudoNoLimite()) =>
    dadosValidos({
      componentes: [
        { tipo: "modulo", descricao: palavras(L.descricaoComponente), quantidade: 24, potencia_w: 585 },
        ...Array.from({ length: L.componentes - 1 }, () => ({ tipo: "outro", descricao: palavras(L.descricaoComponente), quantidade: 1, potencia_w: null })),
      ],
      conteudo,
      condicoes,
      contatoNome: palavras(L.clienteNome),
      contatoEndereco: palavras(L.clienteEndereco),
    });

  it("um texto institucional curto entra no fluxo logo depois da capa, sem abrir folha própria", async () => {
    const institucional = { sobre: "Somos do oeste do Paraná.", numeros: null, projetos: null, depoimentos: null, equipe: null };
    expect(paginasDe(await gerarPdfPropostaSimples(dadosValidos({ conteudo: { ...SEM_CONTEUDO, institucional } }), SEM_IMAGENS))).toBe(2);
  });

  it("no pior caso do modelo, com à vista e a observação no limite (o antigo texto livre), cada página cabe na sua folha (4 páginas)", async () => {
    const condicoes = { entrada: { ...CONDICOES.entrada!, aVista: { desconto: "0" }, observacao: palavras(LIMITES_CONDICOES.observacao) }, regras: REGRAS };
    expect(paginasDe(await gerarPdfPropostaSimples(piorCaso(condicoes), SEM_IMAGENS))).toBe(4);
  });

  it("com todas as modalidades no limite e o modelo sem conteúdo, continua em 3 páginas", async () => {
    expect(paginasDe(await gerarPdfPropostaSimples(piorCaso(PIOR_CASO_CONDICOES, SEM_CONTEUDO), SEM_IMAGENS))).toBe(3);
  });

  it("com todas as modalidades e o modelo no limite, a oferta continua na folha seguinte, sem cortar nada (5 páginas)", async () => {
    expect(paginasDe(await gerarPdfPropostaSimples(piorCaso(PIOR_CASO_CONDICOES), SEM_IMAGENS))).toBe(5);
  });
});

function conteudoNoLimite(): EntradaEmissaoSimples["conteudo"] {
  const item = palavras(L.textoItem);
  return {
    incluso: Array.from({ length: L.incluso }, () => item),
    exclusos: Array.from({ length: L.exclusos }, () => item),
    garantias: Array.from({ length: L.garantias }, () => item),
    etapas: Array.from({ length: L.etapas }, () => ({ titulo: palavras(L.etapaTitulo), prazo: palavras(L.etapaPrazo), descricao: palavras(L.etapaDescricao) })),
    posVenda: Array.from({ length: L.posVenda }, () => item),
    institucional: institucionalNoLimite(),
  };
}

/** Todos os blocos institucionais com o máximo de itens e de texto. */
function institucionalNoLimite(): NonNullable<EntradaEmissaoSimples["conteudo"]["institucional"]> {
  return {
    sobre: palavras(L.sobreTexto),
    numeros: Array.from({ length: L.numeros }, () => ({ rotulo: palavras(L.numeroRotulo), valor: palavras(L.numeroValor) })),
    projetos: Array.from({ length: L.projetos }, () => ({ titulo: palavras(L.projetoTitulo), descricao: palavras(L.projetoDescricao) })),
    depoimentos: Array.from({ length: L.depoimentos }, () => ({ nome: palavras(L.depoimentoNome), texto: palavras(L.depoimentoTexto) })),
    equipe: Array.from({ length: L.equipe }, () => ({ nome: palavras(L.equipeNome), registro: palavras(L.equipeRegistro), texto: palavras(L.equipeTexto) })),
  };
}

describe("link antigo: solicitar nova proposta", () => {
  it("monta o link do WhatsApp da empresa com o nome do cliente", () => {
    const link = linkSolicitarNovaProposta("(45) 99999-0000", "Maria");
    expect(link).toMatch(/^https:\/\/wa\.me\/5545999990000\?text=/);
    expect(decodeURIComponent(link!.split("text=")[1]!)).toContain("Maria");
  });

  it("sem número válido não há link (a página manda falar com o vendedor)", () => {
    expect(linkSolicitarNovaProposta(null, "Maria")).toBeNull();
    expect(linkSolicitarNovaProposta("123", "Maria")).toBeNull();
  });
});
