/**
 * Visão consolidada de Venda (/propostas-contratos): situação da proposta, status de
 * pagamento derivado (espelho de `status_pagamento_contrato`), última movimentação e
 * filtros/atalhos. Funções puras — não precisa de banco.
 */
import { describe, expect, it } from "vitest";
import { filtrarLinhasVenda, maisRecente, situacaoProposta, statusPagamento, type LinhaVenda } from "@/lib/venda";

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

  it("atalhos", () => {
    expect(ids({ atalho: "proposta_nunca_aberta" })).toEqual(["a"]);
    expect(ids({ atalho: "aguardando_assinatura" })).toEqual(["b"]);
    expect(ids({ atalho: "assinado_sem_pagamento" })).toEqual(["c", "d"]);
    expect(ids({ atalho: "pago_nao_ganho" })).toEqual(["e"]);
  });
});
