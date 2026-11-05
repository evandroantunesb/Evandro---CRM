/**
 * Financeiro da obra, sem banco: situação de cada conta a fornecedor (selo do desenho), totais do cartão, anexo aceito
 * e a regra nova do semáforo (pagamento vencido deixa a obra amarela, sem passar por cima do vermelho).
 */
import { describe, expect, it } from "vitest";
import { caminhoFinanceiro, diasEntre, problemaAnexoFinanceiro, resumoContas, situacaoConta, type ContaPagarVM } from "@/lib/obras/financeiro-regras";
import { semaforoObra, type PrazosObra } from "@/lib/obras/semaforo";

const HOJE = "2026-11-09";
const conta = (c: Partial<ContaPagarVM>): ContaPagarVM => ({
  id: "c",
  fornecedor: "Distribuidora Solar Sul",
  categoria: "equipamentos",
  descricao: null,
  valor: 100,
  vencimento: HOJE,
  situacao: "a_pagar",
  pagoEm: null,
  comprovanteNome: null,
  comprovanteUrl: null,
  nfNome: null,
  nfUrl: null,
  motivo: null,
  ...c,
});

describe("situação da conta", () => {
  it("segue o desenho: pago, vencido, a vencer, encerrada", () => {
    expect(situacaoConta(conta({ situacao: "paga", pagoEm: "2026-10-18" }), HOJE)).toEqual({ rotulo: "Pago 18/10", tom: "pago" });
    expect(situacaoConta(conta({ vencimento: "2026-11-08" }), HOJE)).toEqual({ rotulo: "Vencido há 1 dia", tom: "vencido" });
    expect(situacaoConta(conta({ vencimento: "2026-11-01" }), HOJE).rotulo).toBe("Vencido há 8 dias");
    expect(situacaoConta(conta({}), HOJE).rotulo).toBe("A pagar · vence hoje");
    expect(situacaoConta(conta({ vencimento: "2026-11-12" }), HOJE).rotulo).toBe("A pagar · em 3 dias");
    expect(situacaoConta(conta({ situacao: "cancelada" }), HOJE).tom).toBe("encerrado");
    expect(situacaoConta(conta({ situacao: "estornada" }), HOJE).rotulo).toBe("Estornada");
  });

  it("dias corridos atravessam a virada do mês", () => {
    expect(diasEntre("2026-10-31", "2026-11-01")).toBe(1);
  });
});

describe("totais do cartão", () => {
  it("contam só a pagar e pagas; vencidas e NF pendente à parte", () => {
    const r = resumoContas(
      [
        conta({ situacao: "paga", valor: 18_400, nfNome: "nf.pdf" }),
        conta({ situacao: "paga", valor: 2_150.5 }),
        conta({ valor: 380, vencimento: "2026-11-08" }),
        conta({ valor: 1_800, vencimento: "2026-11-12" }),
        conta({ situacao: "cancelada", valor: 999 }),
        conta({ situacao: "estornada", valor: 777 }),
      ],
      HOJE,
    );
    expect(r).toEqual({ total: 4, pagas: 2, pago: 20_550.5, aPagar: 2_180, vencidas: 1, nfPendentes: 1 });
  });
});

describe("anexos", () => {
  it("foto, PDF ou XML até 10 MB, na pasta empresa/obra/tipo", () => {
    expect(problemaAnexoFinanceiro({ nome: "nf.xml", tamanho: 10, tipoMime: "text/xml" })).toBeNull();
    expect(problemaAnexoFinanceiro({ nome: "x.zip", tamanho: 10, tipoMime: "application/zip" })).toContain("foto");
    expect(problemaAnexoFinanceiro({ nome: "g.pdf", tamanho: 11 * 1024 * 1024, tipoMime: "application/pdf" })).toContain("10 MB");
    expect(caminhoFinanceiro("e", "o", "cliente", "Nota Fiscal.pdf")).toMatch(/^e\/o\/cliente\/[0-9a-f-]{36}-/);
  });
});

describe("semáforo com pagamento vencido", () => {
  const PRAZOS: PrazosObra = {
    etapaAtual: "instalacao",
    entregaContratada: "2026-12-10",
    entregaPrevista: "2026-12-10",
    atrasoEntrega: 0,
    maiorAtraso: 0,
    maiorAtrasoEtapa: null,
    venceEm: 10,
    venceEtapa: "instalacao",
    progresso: 60,
    etapasConcluidas: [],
    concluidaEm: null,
  };

  it("deixa a obra amarela com o motivo; sem conta vencida, nada muda", () => {
    expect(semaforoObra({ prazos: PRAZOS, custos: null, margemProjetadaPct: 20, contasVencidas: 1 })).toEqual({ cor: "amarela", motivo: "1 pagamento vencido" });
    expect(semaforoObra({ prazos: PRAZOS, custos: null, margemProjetadaPct: 20, contasVencidas: 2 }).motivo).toBe("2 pagamentos vencidos");
    expect(semaforoObra({ prazos: PRAZOS, custos: null, margemProjetadaPct: 20 })).toEqual({ cor: "verde", motivo: null });
  });

  it("não passa por cima do vermelho", () => {
    expect(semaforoObra({ prazos: { ...PRAZOS, atrasoEntrega: 6 }, custos: null, margemProjetadaPct: 20, contasVencidas: 3 }).cor).toBe("vermelha");
    expect(semaforoObra({ prazos: PRAZOS, custos: null, margemProjetadaPct: -1, contasVencidas: 3 }).cor).toBe("vermelha");
  });
});
