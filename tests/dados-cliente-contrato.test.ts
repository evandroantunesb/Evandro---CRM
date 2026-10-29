/**
 * Regra pura dos dados do cliente exigidos pelo contrato (mesma da função de banco `pendencias_contrato_contato`),
 * validação de CPF/CNPJ e as partes do endereço ao completar um contato existente.
 */
import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  cpfValido,
  formatarDocumento,
  mensagemPendenciasContrato,
  pendenciasDadosContrato,
  type DadosClienteContrato,
} from "@/lib/dados-cliente-contrato";
import { montarDadosContrato } from "@/lib/contrato";
import { completarContato } from "@/lib/negocio-dados";

const completo: DadosClienteContrato = {
  tipo: "pf",
  nome: "Maria da Silva",
  documento: "529.982.247-25",
  rg: "12.345.678-9",
  data_nascimento: "1980-05-10",
  email: "maria@exemplo.test",
  telefone: "(45) 90000-0000",
  cep: "85810000",
  logradouro: "Rua das Flores",
  numero: "100",
  bairro: "Centro",
  cidade: "Cascavel",
};

describe("pendências para o contrato", () => {
  it("pessoa física completa: nada pendente", () => {
    expect(pendenciasDadosContrato(completo)).toEqual([]);
  });

  it("pessoa física vazia: os 11 campos, na ordem do formulário", () => {
    const vazio = Object.fromEntries(Object.keys(completo).map((k) => [k, null])) as DadosClienteContrato;
    expect(pendenciasDadosContrato({ ...vazio, tipo: "pf" })).toEqual([
      "nome completo",
      "CPF",
      "RG",
      "data de nascimento",
      "e-mail",
      "telefone",
      "CEP",
      "rua",
      "número",
      "bairro",
      "cidade",
    ]);
  });

  it("pessoa jurídica: sem RG e nascimento; documento vira CNPJ", () => {
    expect(pendenciasDadosContrato({ ...completo, tipo: "pj", rg: null, data_nascimento: null })).toEqual([]);
    expect(pendenciasDadosContrato({ ...completo, tipo: "pj", documento: " " })).toEqual(["CNPJ"]);
  });

  it("espaço em branco conta como vazio; sem contato, pede os dados do cliente", () => {
    expect(pendenciasDadosContrato({ ...completo, numero: "  ", bairro: "" })).toEqual(["número", "bairro"]);
    expect(pendenciasDadosContrato(null)).toEqual(["dados do cliente"]);
  });

  it("mensagem igual à do banco", () => {
    expect(mensagemPendenciasContrato(["RG", "CEP"])).toBe("Para gerar o contrato, preencha os dados do cliente: RG, CEP.");
  });
});

describe("CPF e CNPJ", () => {
  it("dígitos verificadores, com ou sem pontuação", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("1234")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000180")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });

  it("formata CPF e CNPJ; outro tamanho volta como veio", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarDocumento(" 123 ")).toBe("123");
  });
});

describe("contrato com os campos novos", () => {
  it("RG, nascimento (dd/mm/aaaa) e inscrição estadual entram no modelo", () => {
    const d = montarDadosContrato({
      empresa: { nome: "Empresa", cnpj: "00" },
      negocio: { titulo: "T", numero: 1, valor: 1000, unidade_consumidora: null, qualif_distribuidora: null, consumo_medio_kwh: null },
      contato: {
        nome: "Maria",
        documento: "529.982.247-25",
        endereco: null,
        cidade: null,
        uf: null,
        email: null,
        telefone: null,
        telefone2: null,
        rg: "12.345.678-9",
        data_nascimento: "1980-05-10",
        inscricao_estadual: null,
      },
      calculo: null,
      itensKit: [],
      vendedorNome: null,
      agora: new Date("2026-10-29T12:00:00Z"),
      formatarMoeda: String,
    });
    expect(d.cliente_rg).toBe("12.345.678-9");
    expect(d.cliente_data_nascimento).toBe("10/05/1980");
    expect(d.cliente_inscricao_estadual).toBe("");
  });
});

describe("completar contato existente com as partes do endereço", () => {
  const digitado = { endereco: "Rua A, 10", cidade: "Cascavel", uf: "PR", cep: "85810000", logradouro: "Rua A", numero: "10", bairro: "Centro" };

  it("endereço vazio: completa a linha e as partes juntas", () => {
    expect(completarContato({ endereco: null, cidade: null, uf: null }, digitado).alteracoes).toEqual(digitado);
  });

  it("endereço já salvo: as partes não entram (nunca ficam diferentes da linha salva)", () => {
    const r = completarContato({ endereco: "Rua B, 20", cidade: "Cascavel", uf: "PR" }, digitado);
    expect(r.alteracoes).toEqual({});
    expect(r.divergentes).toEqual(["endereco"]);
  });
});
