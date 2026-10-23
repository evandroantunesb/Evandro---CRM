import { describe, expect, it } from "vitest";
import { linkSolicitarNovaProposta } from "@/lib/propostas/emissao-preservada";
import { gerarPdfPropostaSimples } from "@/lib/propostas/emissao-simples-pdf";
import {
  LIMITES_SIMPLES,
  MENSAGEM_CONDICOES_OBRIGATORIAS,
  RODAPE_SIMPLES,
  RODAPE_SIMPLES_SEM_GERACAO,
  extrairConteudoDoModelo,
  hashDosDados,
  jsonCanonico,
  lerDadosDaEmissao,
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
const SEM_CONTEUDO = { incluso: null, exclusos: null, garantias: null, etapas: null };

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
    condicoesPagamento: "50% na assinatura e 50% na instalação",
    conteudo: {
      incluso: ["Projeto e homologação", "Instalação"],
      exclusos: ["Obra civil no telhado"],
      garantias: ["Módulos: 12 anos de produto"],
      etapas: [{ titulo: "Fechamento", prazo: null, descricao: "Assinatura" }],
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
    });
  });

  it("usa 'O que está incluso' quando não há bloco de inclusões e exclusões", () => {
    expect(extrairConteudoDoModelo([{ tipo: "included_services", ativo: true, config: { itens: ["X"] } }]).incluso).toEqual(["X"]);
  });

  it("bloco inativo, sem itens ou ausente não vira conteúdo (nada de texto padrão)", () => {
    expect(extrairConteudoDoModelo([{ tipo: "included_services", ativo: false, config: { itens: ["X"] } }]).incluso).toBeNull();
    expect(extrairConteudoDoModelo([{ tipo: "warranties", ativo: true, config: {} }]).garantias).toBeNull();
    expect(extrairConteudoDoModelo([{ tipo: "warranties", ativo: true, config: { itens: ["", "  "] } }]).garantias).toBeNull();
    expect(extrairConteudoDoModelo(null)).toEqual({ condicoes: "", incluso: null, exclusos: null, garantias: null, etapas: null });
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
  it("monta os dados congelados sem economia, payback, contas nem Fio B", () => {
    const dados = dadosValidos();
    expect(dados.preco.valor).toBe(24500);
    expect(dados.sistema.consumoMedioKwh).toBe(450);
    expect(jsonCanonico(dados)).not.toMatch(/"(economia|payback|conta|fio)/i);
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

  it("condição de pagamento é OBRIGATÓRIA: vazia, só espaços ou só marcadores não congela a proposta", () => {
    for (const vazio of [null, "", "   ", "\n\n", " • \n - "]) {
      const r = montarDadosEmissaoSimples(entrada({ condicoesPagamento: vazio }));
      expect(r.ok, JSON.stringify(vazio)).toBe(false);
      if (!r.ok) expect(r.pendencias).toContain(MENSAGEM_CONDICOES_OBRIGATORIAS);
    }
  });

  it("uma opção por linha: marcadores saem e cada linha vira um item", () => {
    expect(opcoesDePagamento("À vista por Pix\n• Financiamento bancário\r\n- Cartão em até 12x\n\n")).toEqual([
      "À vista por Pix",
      "Financiamento bancário",
      "Cartão em até 12x",
    ]);
    const dados = dadosValidos({ condicoesPagamento: "À vista por Pix\nCartão em até 12x" });
    expect(textoCondicoesComerciais(dados)).toContain("Condições de pagamento: À vista por Pix\nCartão em até 12x");
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

describe("limites que seguram a proposta em 3 páginas", () => {
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
      { condicoesPagamento: "y".repeat(L.condicoes + 1) },
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
        },
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("PDF da proposta simples", () => {
  const paginasDe = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1").match(/\/Type \/Page(?!s)/g)?.length ?? 0;

  it("gera um PDF válido de exatamente 3 páginas A4 (capa, sistema, oferta)", async () => {
    const pdf = await gerarPdfPropostaSimples(dadosValidos(), SEM_IMAGENS);
    expect(Buffer.from(pdf).toString("latin1").startsWith("%PDF")).toBe(true);
    expect(paginasDe(pdf)).toBe(3);
  });

  it("sem conteúdo confirmado e sem geração confirmada continua em 3 páginas", async () => {
    const dados = dadosValidos({ conteudo: SEM_CONTEUDO, produtividadeConfirmada: null });
    expect(paginasDe(await gerarPdfPropostaSimples(dados, SEM_IMAGENS))).toBe(3);
  });

  it("no pior caso dentro dos limites continua em 3 páginas", async () => {
    const item = palavras(L.textoItem);
    const dados = dadosValidos({
      componentes: [
        { tipo: "modulo", descricao: palavras(L.descricaoComponente), quantidade: 24, potencia_w: 585 },
        ...Array.from({ length: L.componentes - 1 }, () => ({ tipo: "outro", descricao: palavras(L.descricaoComponente), quantidade: 1, potencia_w: null })),
      ],
      conteudo: {
        incluso: Array.from({ length: L.incluso }, () => item),
        exclusos: Array.from({ length: L.exclusos }, () => item),
        garantias: Array.from({ length: L.garantias }, () => item),
        etapas: Array.from({ length: L.etapas }, () => ({ titulo: palavras(L.etapaTitulo), prazo: palavras(L.etapaPrazo), descricao: palavras(L.etapaDescricao) })),
      },
      condicoesPagamento: palavras(L.condicoes),
      contatoNome: palavras(L.clienteNome),
      contatoEndereco: palavras(L.clienteEndereco),
    });
    expect(paginasDe(await gerarPdfPropostaSimples(dados, SEM_IMAGENS))).toBe(3);
  });
});

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
