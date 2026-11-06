import { describe, expect, it } from "vitest";
import { clienteFaturamento, enderecoCompleto } from "@/lib/compras/faturamento";
import { documentosExigidos, mensagemPendenciasDocumentos, pendenciasDocumentosContrato } from "@/lib/documentos-cliente";

describe("documentos do cliente para o contrato", () => {
  it("CPF: documento com foto e comprovante; CNPJ: cartão CNPJ e comprovante", () => {
    expect(documentosExigidos("pf")).toEqual(["documento_foto", "comprovante_residencia"]);
    expect(documentosExigidos(null)).toEqual(["documento_foto", "comprovante_residencia"]);
    expect(documentosExigidos("pj")).toEqual(["cartao_cnpj", "comprovante_residencia"]);
  });

  it("pendências na mesma ordem e com o mesmo texto do banco", () => {
    expect(pendenciasDocumentosContrato([], "pf")).toEqual(["documento com foto", "comprovante de residência (fatura de energia)"]);
    expect(pendenciasDocumentosContrato(["cnh"], "pj")).toEqual(["cartão CNPJ", "comprovante de residência (fatura de energia)"]);
    expect(pendenciasDocumentosContrato(["cartao_cnpj", "fatura_gerador", "geral"], "pj")).toEqual([]);
    expect(mensagemPendenciasDocumentos(["cartão CNPJ"])).toBe("Para gerar o contrato, anexe os documentos do cliente: cartão CNPJ.");
  });
});

describe("endereço do faturamento", () => {
  it("monta a linha pelos campos do cadastro; sem eles, usa o texto antigo", () => {
    expect(
      enderecoCompleto({ logradouro: "Rua das Acácias", numero: "210", complemento: null, bairro: "Jardim Europa", cidade: "Valinhos", uf: "SP", cep: "13270000", endereco: null }),
    ).toBe("Rua das Acácias, 210 · Jardim Europa · Valinhos/SP · CEP 13270-000");
    expect(enderecoCompleto({ logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, cep: null, endereco: "Rua X, 1" })).toBe("Rua X, 1");
  });

  it("cliente empresa e nome de reserva", () => {
    const c = clienteFaturamento({
      nome: " ",
      tipo: "pj",
      documento: "11.222.333/0001-81",
      inscricao_estadual: "123",
      rg: null,
      data_nascimento: null,
      email: null,
      telefone: null,
      cep: null,
      logradouro: null,
      numero: null,
      bairro: null,
      complemento: null,
      cidade: null,
      uf: null,
      endereco: null,
    });
    expect(c).toMatchObject({ nome: "Cliente", pj: true, documento: "11.222.333/0001-81", endereco: null });
    expect(clienteFaturamento(null)).toBeNull();
  });
});
