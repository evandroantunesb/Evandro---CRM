import { describe, expect, it } from "vitest";
import { lerDadosEmpresa } from "@/lib/dados-empresa";
import { urlFaixa } from "@/lib/tela-entrada";

describe("lerDadosEmpresa (passo 1 do assistente)", () => {
  it("limpa máscara do CNPJ e do WhatsApp; vazio vira nulo", () => {
    expect(lerDadosEmpresa({ nome: " Solar Campinas ", cnpj: "12.345.678/0001-90", whatsapp: "(19) 99876-5432" })).toEqual({
      ok: true,
      dados: { nome: "Solar Campinas", cnpj: "12345678000190", whatsapp: "19998765432" },
    });
    expect(lerDadosEmpresa({ nome: "", cnpj: "", whatsapp: "" })).toEqual({ ok: true, dados: { nome: null, cnpj: null, whatsapp: null } });
  });

  it("recusa CNPJ e WhatsApp de tamanho errado", () => {
    expect(lerDadosEmpresa({ nome: "X", cnpj: "123", whatsapp: "" })).toEqual({ ok: false, mensagem: "O CNPJ tem 14 dígitos." });
    expect(lerDadosEmpresa({ nome: "X", cnpj: "", whatsapp: "99" })).toEqual({ ok: false, mensagem: "WhatsApp: informe DDD e número (10 a 13 dígitos)." });
  });
});

describe("urlFaixa", () => {
  const publica = (c: string) => `p:${c}`;
  it("a mesma da tela de entrada, a própria, ou nada (paisagem do Raion)", () => {
    expect(urlFaixa({ imagem_caminho: "e/a.jpg", faixa_caminho: "e/b.jpg", faixa_usa_entrada: true }, publica)).toBe("p:e/a.jpg");
    expect(urlFaixa({ imagem_caminho: "e/a.jpg", faixa_caminho: "e/b.jpg", faixa_usa_entrada: false }, publica)).toBe("p:e/b.jpg");
    expect(urlFaixa({ imagem_caminho: null, faixa_caminho: null, faixa_usa_entrada: true }, publica)).toBeNull();
    expect(urlFaixa({ imagem_caminho: "e/a.jpg", faixa_caminho: null, faixa_usa_entrada: false }, publica)).toBeNull();
    expect(urlFaixa(null, publica)).toBeNull();
  });
});
