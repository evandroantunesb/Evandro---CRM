/**
 * Tela Financeiro (A2b), sem banco: abas por perfil, indicadores do topo, prazo de cada conta, busca e quando a nota
 * fiscal do cliente fica pendente.
 */
import { describe, expect, it } from "vitest";
import {
  abaEscolhida,
  abasVisiveis,
  acessoFinanceiro,
  filtrarPorBusca,
  kpisFinanceiro,
  nfClientePendente,
  prazoConta,
  rotuloObra,
} from "@/lib/financeiro/regras";

const HOJE = "2026-11-09";

describe("acesso e abas", () => {
  it("admin e gestor veem as quatro abas", () => {
    for (const papel of ["admin", "gestor"]) {
      const acesso = acessoFinanceiro({ papel, atuaNoAdministrativo: false, confirmaPagamento: false });
      expect(abasVisiveis(acesso)).toEqual(["a-pagar", "confirmar", "notas", "pagos"]);
    }
  });

  it("Operação no Administrativo vê as quatro abas", () => {
    const acesso = acessoFinanceiro({ papel: "operacao", atuaNoAdministrativo: true, confirmaPagamento: true });
    expect(abasVisiveis(acesso)).toEqual(["a-pagar", "confirmar", "notas", "pagos"]);
  });

  it("Operação só no Operacional vê só Pagamentos a confirmar", () => {
    const acesso = acessoFinanceiro({ papel: "operacao", atuaNoAdministrativo: false, confirmaPagamento: true });
    expect(acesso).toEqual({ completo: false, confirmar: true });
    expect(abasVisiveis(acesso)).toEqual(["confirmar"]);
  });

  it("Operação sem os dois setores e os papéis comerciais não veem nada", () => {
    expect(abasVisiveis(acessoFinanceiro({ papel: "operacao", atuaNoAdministrativo: false, confirmaPagamento: false }))).toEqual([]);
    for (const papel of ["vendedor", "sdr", null]) {
      expect(abasVisiveis(acessoFinanceiro({ papel, atuaNoAdministrativo: true, confirmaPagamento: true }))).toEqual([]);
    }
  });

  it("a aba da URL só vale se a pessoa a vê", () => {
    expect(abaEscolhida("pagos", ["a-pagar", "confirmar", "notas", "pagos"])).toBe("pagos");
    expect(abaEscolhida("pagos", ["confirmar"])).toBe("confirmar");
    expect(abaEscolhida(undefined, ["a-pagar", "confirmar"])).toBe("a-pagar");
    expect(abaEscolhida("x", [])).toBeNull();
  });
});

describe("indicadores", () => {
  const conta = (vencimento: string, valor: number) => ({ situacao: "a_pagar" as const, vencimento, valor });

  it("separa vencidas das que vencem nos próximos 7 dias (hoje incluso)", () => {
    const k = kpisFinanceiro({
      abertas: [conta("2026-11-08", 380), conta("2026-11-09", 100), conta("2026-11-11", 2900), conta("2026-11-16", 760), conta("2026-11-17", 2100)],
      hoje: HOJE,
      aConfirmar: 2,
      nfFornecedor: 2,
      nfCliente: 1,
    });
    expect(k.vencidos).toEqual({ valor: 380, quantidade: 1 });
    expect(k.proximos).toEqual({ valor: 3760, quantidade: 3 });
    expect(k.aConfirmar).toBe(2);
    expect(k.notas).toEqual({ total: 3, fornecedor: 2, cliente: 1 });
  });

  it("soma sem erro de centavos e ignora o que não está a pagar", () => {
    const k = kpisFinanceiro({
      abertas: [conta("2026-11-10", 0.1), conta("2026-11-10", 0.2), { situacao: "paga", vencimento: "2026-11-10", valor: 999 }],
      hoje: HOJE,
      aConfirmar: 0,
      nfFornecedor: 0,
      nfCliente: 0,
    });
    expect(k.proximos).toEqual({ valor: 0.3, quantidade: 2 });
  });
});

describe("prazo da conta", () => {
  it("segue o desenho", () => {
    expect(prazoConta("2026-11-08", HOJE)).toEqual({ rotulo: "Vencido há 1 dia", vencido: true });
    expect(prazoConta("2026-11-01", HOJE)).toEqual({ rotulo: "Vencido há 8 dias", vencido: true });
    expect(prazoConta(HOJE, HOJE)).toEqual({ rotulo: "Vence hoje", vencido: false });
    expect(prazoConta("2026-11-10", HOJE)).toEqual({ rotulo: "Em 1 dia", vencido: false });
    expect(prazoConta("2026-11-22", HOJE)).toEqual({ rotulo: "Em 13 dias", vencido: false });
  });
});

describe("busca", () => {
  const itens = [
    { fornecedor: "Transportadora Rápida", descricao: "Frete", clienteNome: "Marcos Pereira", obraNumero: 998 },
    { fornecedor: "Copel", descricao: null, clienteNome: "Paulo Souza", obraNumero: 1058 },
    { clienteNome: "Ana Lima", obraNumero: 1051 },
  ];

  it("acha por fornecedor, cliente ou número da obra, sem acento nem caixa", () => {
    expect(filtrarPorBusca(itens, "rapida")).toEqual([itens[0]]);
    expect(filtrarPorBusca(itens, "PAULO")).toEqual([itens[1]]);
    expect(filtrarPorBusca(itens, "#1051")).toEqual([itens[2]]);
    expect(filtrarPorBusca(itens, "frete")).toEqual([itens[0]]);
  });

  it("sem termo devolve tudo", () => {
    expect(filtrarPorBusca(itens, "  ")).toHaveLength(3);
  });
});

describe("nota fiscal do cliente pendente", () => {
  it("só com o marco pendente, a instalação concluída e a obra não cancelada", () => {
    const base = { situacaoObra: "em_andamento" as const, statusOperacional: "instalacao_concluida", statusMarco: "pendente" };
    expect(nfClientePendente(base)).toBe(true);
    expect(nfClientePendente({ ...base, statusOperacional: "concluido" })).toBe(true);
    expect(nfClientePendente({ ...base, statusOperacional: "em_instalacao" })).toBe(false);
    expect(nfClientePendente({ ...base, statusOperacional: null })).toBe(false);
    expect(nfClientePendente({ ...base, statusMarco: "concluido" })).toBe(false);
    expect(nfClientePendente({ ...base, statusMarco: "nao_se_aplica" })).toBe(false);
    expect(nfClientePendente({ ...base, situacaoObra: "cancelada" })).toBe(false);
  });
});

describe("rótulo da obra", () => {
  it("cliente e número; sem a obra, o que houver", () => {
    expect(rotuloObra({ clienteNome: "Marcos Pereira", obraNumero: 998 })).toBe("Marcos Pereira · #998");
    expect(rotuloObra({ clienteNome: null, obraNumero: 998 })).toBe("#998");
    expect(rotuloObra({ clienteNome: null, obraNumero: null })).toBe("Obra");
  });
});
