import { describe, expect, it } from "vitest";
import {
  FRASE_PADRAO_ENTRADA,
  IMAGEM_PADRAO_ENTRADA,
  TELA_ENTRADA_PADRAO,
  TEXTO_PADRAO_ENTRADA,
  caminhoImagemEntradaValido,
  empresaIdValido,
  escolherEmpresaLembrada,
  montarCaminhoImagemEntrada,
  montarTelaEntrada,
  normalizarTextoEntrada,
} from "@/lib/tela-entrada";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ARQUIVO = "33333333-3333-4333-8333-333333333333";
const url = (c: string) => `https://storage/${c}`;

describe("tela de entrada: empresa lembrada no aparelho", () => {
  it("mantém a empresa já escolhida se a pessoa ainda participa dela", () => {
    expect(escolherEmpresaLembrada(B, [A, B])).toBe(B);
  });
  it("sem escolha válida, fica a primeira (mesma regra da empresa em uso no app)", () => {
    expect(escolherEmpresaLembrada(undefined, [A, B])).toBe(A);
    expect(escolherEmpresaLembrada("outra", [A, B])).toBe(A);
  });
  it("sem empresa ativa, não lembra nada", () => {
    expect(escolherEmpresaLembrada(A, [])).toBeNull();
  });
  it("só aceita uuid do cookie antes de consultar o banco", () => {
    expect(empresaIdValido(A)).toBe(true);
    expect(empresaIdValido("")).toBe(false);
    expect(empresaIdValido(undefined)).toBe(false);
    expect(empresaIdValido("1' or '1'='1")).toBe(false);
  });
});

describe("tela de entrada: montagem com o padrão do Raion", () => {
  it("sem personalização, tudo no padrão", () => {
    expect(montarTelaEntrada(null, url)).toEqual(TELA_ENTRADA_PADRAO);
  });
  it("campo vazio fica no padrão; imagem vira endereço público", () => {
    const tela = montarTelaEntrada({ frase: "Energia que transforma.", texto: null, imagem_caminho: `${A}/${ARQUIVO}.webp` }, url);
    expect(tela).toEqual({
      frase: "Energia que transforma.",
      texto: TEXTO_PADRAO_ENTRADA,
      imagem: `https://storage/${A}/${ARQUIVO}.webp`,
      imagemPersonalizada: true,
    });
  });
  it("sem imagem, fica a paisagem do Raion", () => {
    const tela = montarTelaEntrada({ frase: null, texto: "Texto", imagem_caminho: null }, url);
    expect(tela.imagem).toBe(IMAGEM_PADRAO_ENTRADA);
    expect(tela.imagemPersonalizada).toBe(false);
    expect(tela.frase).toBe(FRASE_PADRAO_ENTRADA);
  });
});

describe("tela de entrada: textos e caminho da imagem", () => {
  it("tira espaços repetidos e das pontas; vazio volta ao padrão", () => {
    expect(normalizarTextoEntrada("  Sol   que  rende  ")).toBe("Sol que rende");
    expect(normalizarTextoEntrada("   ")).toBeNull();
    expect(normalizarTextoEntrada(null)).toBeNull();
  });
  it("caminho fica direto na pasta da empresa", () => {
    const caminho = montarCaminhoImagemEntrada(A, "webp", ARQUIVO);
    expect(caminho).toBe(`${A}/${ARQUIVO}.webp`);
    expect(caminhoImagemEntradaValido(A, caminho)).toBe(true);
  });
  it("recusa pasta de outra empresa, subpasta, '..' e extensão que não é imagem", () => {
    expect(caminhoImagemEntradaValido(A, `${B}/${ARQUIVO}.webp`)).toBe(false);
    expect(caminhoImagemEntradaValido(A, `${A}/x/${ARQUIVO}.webp`)).toBe(false);
    expect(caminhoImagemEntradaValido(A, `${A}/../${B}/${ARQUIVO}.webp`)).toBe(false);
    expect(caminhoImagemEntradaValido(A, `${A}/${ARQUIVO}.svg`)).toBe(false);
  });
});
