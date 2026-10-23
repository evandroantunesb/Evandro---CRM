/**
 * Imagens da identidade na emissão (src/lib/propostas/imagens-emissao.ts): logo configurado que falha recusa a
 * emissão; foto ausente ou com falha usa o fallback definido (capa sem imagem), e o PDF segue com 3 páginas.
 * Arquivo de OUTRA empresa (ou caminho que sobe de diretório) nunca é lido.
 */
import { describe, expect, it } from "vitest";
import { gerarPdfPropostaSimples } from "@/lib/propostas/emissao-simples-pdf";
import { caminhoDaEmpresa, MENSAGEM_LOGO_FALHOU, prepararImagensDaEmissao, type BaixarImagem } from "@/lib/propostas/imagens-emissao";
import { dataBrSaoPaulo, montarDadosEmissaoSimples, type EntradaEmissaoSimples } from "@/lib/propostas/proposta-simples";

const EMP = "11111111-1111-1111-1111-111111111111";
const OUTRA = "22222222-2222-2222-2222-222222222222";
const LOGO = `${EMP}/logo.png`;
const FOTO = `${EMP}/foto.jpg`;

// PNG 1×1 válido e um JPEG mínimo (só o cabeçalho importa para o tipo; o PDF real usa o PNG).
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ/PNgAAAABJRU5ErkJggg==", "base64"),
);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Uint8Array.from(Buffer.from("RIFF....WEBPVP8 ", "latin1"));
const SVG = Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8"));

const arquivos = (mapa: Record<string, Uint8Array | null | "erro">): BaixarImagem => async (caminho) => {
  const v = mapa[caminho];
  if (v === "erro") throw new Error("rede");
  return v ?? null;
};

describe("logo configurado", () => {
  it("carrega PNG e JPEG como data URI", async () => {
    const r = await prepararImagensDaEmissao(arquivos({ [LOGO]: PNG, [FOTO]: JPEG }), { logo: LOGO, foto: FOTO }, EMP);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.imagens.logoUrl).toMatch(/^data:image\/png;base64,/);
      expect(r.imagens.fotoCapaUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(r.fotoUsouFallback).toBe(false);
    }
  });

  it("RECUSA a emissão quando o logo configurado não carrega (ausente, vazio, erro de rede ou formato sem suporte)", async () => {
    for (const falha of [null, new Uint8Array(0), "erro", WEBP, SVG] as const) {
      const r = await prepararImagensDaEmissao(arquivos({ [LOGO]: falha }), { logo: LOGO, foto: null }, EMP);
      expect(r, String(falha)).toEqual({ ok: false, mensagem: MENSAGEM_LOGO_FALHOU });
    }
  });

  it("sem logo configurado a proposta segue (o nome da empresa faz o papel)", async () => {
    const r = await prepararImagensDaEmissao(arquivos({}), { logo: null, foto: null }, EMP);
    expect(r).toMatchObject({ ok: true, imagens: { logoUrl: null, fotoCapaUrl: null }, fotoUsouFallback: true });
  });
});

describe("foto da capa: fallback definido", () => {
  it("foto ausente, com falha ou em formato sem suporte usa o fallback (nunca recusa)", async () => {
    for (const foto of [null, FOTO]) {
      for (const falha of [null, "erro", WEBP] as const) {
        const r = await prepararImagensDaEmissao(arquivos({ [LOGO]: PNG, [FOTO]: falha }), { logo: LOGO, foto }, EMP);
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.imagens.fotoCapaUrl).toBeNull();
          expect(r.fotoUsouFallback).toBe(true);
          expect(r.imagens.logoUrl).not.toBeNull();
        }
      }
    }
  });

  it("o PDF com logo e SEM foto (fallback) tem 3 páginas, e o PDF com logo e foto também", async () => {
    const entrada: EntradaEmissaoSimples = {
      contatoNome: "Maria Souza",
      contatoEndereco: "Rua A, 10",
      valorNegocio: 24500,
      consumoMedioKwhNegocio: 450,
      componentes: [
        { tipo: "modulo", descricao: "Módulo 540 W", quantidade: 10, potencia_w: 540 },
        { tipo: "inversor", descricao: "Inversor 5 kW", quantidade: 1, potencia_w: null },
      ],
      produtividadeConfirmada: null,
      validadeAte: "2026-11-30",
      condicoesPagamento: "À vista por Pix\nCartão em até 12x",
      conteudo: { incluso: null, exclusos: null, garantias: null, etapas: null },
      identidade: { nomeExibicao: "Solar Teste", corPrimaria: "#0E2A47", corDestaque: "#F2A900", whatsapp: "45999990000" },
      versao: 1,
      emitidaEm: "2026-10-22T12:00:00.000Z",
      hoje: "2026-10-22",
    };
    const m = montarDadosEmissaoSimples(entrada);
    if (!m.ok) throw new Error(m.pendencias.join(" "));
    const logoUrl = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
    const paginas = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1").match(/\/Type \/Page(?!s)/g)?.length ?? 0;
    expect(paginas(await gerarPdfPropostaSimples(m.dados, { logoUrl, fotoCapaUrl: null }))).toBe(3);
    expect(paginas(await gerarPdfPropostaSimples(m.dados, { logoUrl, fotoCapaUrl: logoUrl }))).toBe(3);
  });
});

describe("objeto de outra empresa nunca entra no PDF", () => {
  it("só caminhos da pasta da própria empresa e sem subir de diretório", () => {
    expect(caminhoDaEmpresa(`${EMP}/logo.png`, EMP)).toBe(true);
    expect(caminhoDaEmpresa(`${EMP}/marca/logo.png`, EMP)).toBe(true);
    expect(caminhoDaEmpresa(`${OUTRA}/logo.png`, EMP)).toBe(false);
    expect(caminhoDaEmpresa(`${EMP}/../${OUTRA}/logo.png`, EMP)).toBe(false);
    expect(caminhoDaEmpresa(`${EMP}//logo.png`, EMP)).toBe(false);
    expect(caminhoDaEmpresa(`${EMP}/`, EMP)).toBe(false);
    expect(caminhoDaEmpresa("logo.png", EMP)).toBe(false);
  });

  it("logo apontando para a pasta de outra empresa recusa a emissão e o arquivo nem é lido", async () => {
    const lidos: string[] = [];
    const baixar: BaixarImagem = async (c) => {
      lidos.push(c);
      return PNG;
    };
    const alheio = `${OUTRA}/logo.png`;
    expect(await prepararImagensDaEmissao(baixar, { logo: alheio, foto: null }, EMP)).toEqual({ ok: false, mensagem: MENSAGEM_LOGO_FALHOU });
    // foto alheia: fallback, sem ler o arquivo
    const r = await prepararImagensDaEmissao(baixar, { logo: LOGO, foto: alheio }, EMP);
    expect(r).toMatchObject({ ok: true, fotoUsouFallback: true });
    expect(lidos).toEqual([LOGO]);
  });
});

describe("data da confirmação no calendário de São Paulo", () => {
  it("21h30 em Brasília não vira o dia seguinte", () => {
    expect(dataBrSaoPaulo("2026-10-21T00:30:00.000Z")).toBe("20/10/2026");
    expect(dataBrSaoPaulo("2026-10-20T12:00:00.000Z")).toBe("20/10/2026");
  });
});
