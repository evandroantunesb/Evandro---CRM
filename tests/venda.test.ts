/**
 * Visão consolidada de Venda (/propostas-contratos): situação da proposta, status de
 * pagamento derivado (espelho de `status_pagamento_contrato`), última movimentação e
 * filtros/atalhos. Funções puras — não precisa de banco.
 */
import { describe, expect, it } from "vitest";
import {
  ATALHOS_POR_VISAO,
  filtrarLinhasVenda,
  filtrosDaVisao,
  linhasDaVisao,
  linhasVisiveis,
  maisRecente,
  responsaveisPermitidos,
  situacaoProposta,
  statusPagamento,
  type LinhaVenda,
} from "@/lib/venda";

const linha = (parcial: Partial<LinhaVenda>): LinhaVenda => ({
  negocioId: "n",
  numero: 1,
  titulo: "Sistema 5 kWp",
  clienteNome: "Cliente",
  responsavelId: "m1",
  valor: 20000,
  negocio: "aberto",
  proposta: "aberta",
  propostaUltimaAbertura: null,
  propostaAberturas: 0,
  contrato: "nao_gerado",
  pagamento: null,
  ultimaMovimentacao: "2026-10-01T00:00:00+00:00",
  ...parcial,
});

describe("situacaoProposta", () => {
  it("distingue não gerada, gerada sem abertura e aberta", () => {
    expect(situacaoProposta(false, 0)).toBe("nao_gerada");
    expect(situacaoProposta(true, 0)).toBe("nunca_aberta");
    expect(situacaoProposta(true, 3)).toBe("aberta");
  });
});

describe("statusPagamento (espelho de status_pagamento_contrato)", () => {
  const confirmada = { confirmado_em: "2026-10-02T00:00:00Z", estornado_em: null };
  const estornada = { confirmado_em: "2026-10-02T00:00:00Z", estornado_em: "2026-10-03T00:00:00Z" };

  it("sem contrato assinado e sem confirmação: sem status", () => {
    expect(statusPagamento(null, [])).toBeNull();
    expect(statusPagamento("aguardando_assinatura", [])).toBeNull();
  });
  it("assinado sem confirmação: pendente", () => {
    expect(statusPagamento("assinado", [])).toBe("pendente");
  });
  it("confirmação ativa: confirmado (mesmo com estorno anterior)", () => {
    expect(statusPagamento("assinado", [confirmada])).toBe("confirmado");
    expect(statusPagamento("assinado", [estornada, confirmada])).toBe("confirmado");
  });
  it("só confirmações estornadas: estornado", () => {
    expect(statusPagamento("assinado", [estornada])).toBe("estornado");
  });
});

describe("maisRecente", () => {
  it("pega a data mais recente e ignora vazias", () => {
    expect(maisRecente([null, "2026-10-01T10:00:00+00:00", undefined, "2026-10-03T08:00:00+00:00", "2026-10-02T00:00:00+00:00"])).toBe(
      "2026-10-03T08:00:00+00:00",
    );
  });
});

describe("filtrarLinhasVenda", () => {
  const linhas = [
    linha({ negocioId: "a", numero: 10, clienteNome: "Ana Souza", proposta: "nunca_aberta" }),
    linha({ negocioId: "b", numero: 11, clienteNome: "Bruno Lima", contrato: "aguardando_assinatura", responsavelId: "m2" }),
    linha({ negocioId: "c", numero: 12, clienteNome: "Carla Dias", contrato: "assinado", pagamento: "pendente" }),
    linha({ negocioId: "d", numero: 13, clienteNome: "Davi Rocha", contrato: "assinado", pagamento: "estornado" }),
    linha({ negocioId: "e", numero: 14, clienteNome: "Eva Nunes", contrato: "assinado", pagamento: "confirmado" }),
    linha({ negocioId: "f", numero: 15, clienteNome: "Fábio Reis", contrato: "assinado", pagamento: "confirmado", negocio: "ganho" }),
  ];
  const ids = (f: Parameters<typeof filtrarLinhasVenda>[1]) => filtrarLinhasVenda(linhas, f).map((l) => l.negocioId);

  it("busca por nome do cliente ou nº (com ou sem #)", () => {
    expect(ids({ busca: "souza" })).toEqual(["a"]);
    expect(ids({ busca: "12" })).toEqual(["c"]);
    expect(ids({ busca: "#13" })).toEqual(["d"]);
  });

  it("filtra por contrato, pagamento e negócio", () => {
    expect(ids({ contrato: "aguardando_assinatura" })).toEqual(["b"]);
    expect(ids({ pagamento: "confirmado" })).toEqual(["e", "f"]);
    expect(ids({ pagamento: "sem" })).toEqual(["a", "b"]);
    expect(ids({ negocio: "ganho" })).toEqual(["f"]);
  });

  it("filtra por responsáveis (responsável/equipe)", () => {
    expect(ids({ responsaveis: new Set(["m2"]) })).toEqual(["b"]);
  });

  it("equipe e responsável são cumulativos", () => {
    const equipe = new Set(["m2", "m3"]);
    // só equipe: membros da equipe
    expect(ids({ responsaveis: responsaveisPermitidos(undefined, equipe) })).toEqual(["b"]);
    // só responsável
    expect(ids({ responsaveis: responsaveisPermitidos("m1", undefined) })).toEqual(["a", "c", "d", "e", "f"]);
    // equipe + responsável que pertence à equipe
    expect(ids({ responsaveis: responsaveisPermitidos("m2", equipe) })).toEqual(["b"]);
    // equipe + responsável fora da equipe: nenhum resultado
    expect(ids({ responsaveis: responsaveisPermitidos("m1", equipe) })).toEqual([]);
    // nenhum dos dois: todos
    expect(responsaveisPermitidos(undefined, undefined)).toBeUndefined();
    expect(ids({ responsaveis: responsaveisPermitidos(undefined, undefined) })).toHaveLength(6);
  });

  it("atalhos", () => {
    expect(ids({ atalho: "proposta_nunca_aberta" })).toEqual(["a"]);
    expect(ids({ atalho: "aguardando_assinatura" })).toEqual(["b"]);
    expect(ids({ atalho: "assinado_sem_pagamento" })).toEqual(["c", "d"]);
    expect(ids({ atalho: "pago_nao_ganho" })).toEqual(["e"]);
  });
});

describe("visões Propostas / Contratos", () => {
  const linhas = [
    linha({ negocioId: "p1", numero: 20, clienteNome: "Só proposta", proposta: "nunca_aberta" }),
    linha({ negocioId: "p2", numero: 21, clienteNome: "Proposta aberta", proposta: "aberta", negocio: "perdido" }),
    linha({ negocioId: "c1", numero: 22, clienteNome: "Só contrato", proposta: "nao_gerada", contrato: "aguardando_assinatura" }),
    linha({ negocioId: "pc", numero: 23, clienteNome: "Os dois", proposta: "aberta", contrato: "assinado", pagamento: "confirmado" }),
  ];
  const ids = (ls: LinhaVenda[]) => ls.map((l) => l.negocioId);

  it("Propostas lista negócios com proposta gerada; Contratos, com contrato gerado", () => {
    expect(ids(linhasDaVisao(linhas, "propostas"))).toEqual(["p1", "p2", "pc"]);
    expect(ids(linhasDaVisao(linhas, "contratos"))).toEqual(["c1", "pc"]);
  });

  it("cada guia tem seus atalhos", () => {
    expect(ATALHOS_POR_VISAO.propostas).toEqual(["proposta_nunca_aberta"]);
    expect(ATALHOS_POR_VISAO.contratos).toEqual(["aguardando_assinatura", "assinado_sem_pagamento", "pago_nao_ganho"]);
  });

  it("guia Propostas ignora filtros de contrato/pagamento e atalhos de contrato", () => {
    const f = filtrosDaVisao("propostas", { busca: "x", contrato: "assinado", pagamento: "confirmado", negocio: "aberto", atalho: "pago_nao_ganho" });
    expect(f).toEqual({ busca: "x", negocio: "aberto", responsaveis: undefined, atalho: undefined });
    expect(ids(linhasVisiveis(linhas, "propostas", { contrato: "assinado" }))).toEqual(["p1", "p2", "pc"]);
    expect(ids(linhasVisiveis(linhas, "propostas", { atalho: "proposta_nunca_aberta" }))).toEqual(["p1"]);
    expect(ids(linhasVisiveis(linhas, "propostas", { negocio: "perdido" }))).toEqual(["p2"]);
  });

  it("guia Contratos aplica contrato, pagamento e negócio; ignora atalho de proposta", () => {
    expect(ids(linhasVisiveis(linhas, "contratos", { contrato: "aguardando_assinatura" }))).toEqual(["c1"]);
    expect(ids(linhasVisiveis(linhas, "contratos", { pagamento: "confirmado" }))).toEqual(["pc"]);
    expect(ids(linhasVisiveis(linhas, "contratos", { atalho: "proposta_nunca_aberta" }))).toEqual(["c1", "pc"]);
    expect(ids(linhasVisiveis(linhas, "contratos", { atalho: "pago_nao_ganho" }))).toEqual(["pc"]);
  });

  it("responsável/equipe valem nas duas guias", () => {
    const outro = [...linhas, linha({ negocioId: "m9", proposta: "aberta", contrato: "rascunho", responsavelId: "m9" })];
    const so = responsaveisPermitidos("m9", undefined);
    expect(ids(linhasVisiveis(outro, "propostas", { responsaveis: so }))).toEqual(["m9"]);
    expect(ids(linhasVisiveis(outro, "contratos", { responsaveis: so }))).toEqual(["m9"]);
  });
});
