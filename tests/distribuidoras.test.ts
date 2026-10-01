/**
 * Resolução de distribuidora por município (Etapa 1 do wizard — pedido do
 * Evandro em 2026-09-30; arquitetura da Fase 2 fechada em 2026-10-01).
 *
 * Todas as siglas/CNPJs/nomes de distribuidora usados neste arquivo são
 * FIXTURES DE TESTE (prefixo `FIXTURE_TESTE_`) — não representam nenhuma
 * distribuidora real. `src/lib/distribuidoras.ts` nunca hardcoda nome de
 * distribuidora real; isso é dado carregado via `importarMunicipiosDistribuidoras`.
 */
import { describe, expect, it, vi } from "vitest";
import { buscarTarifaHomologada } from "@/lib/aneel";
import {
  linhaCsvParaMunicipioDistribuidora,
  normalizarTexto,
  registrarEscolhaDistribuidora,
  resolverDistribuidora,
  type DistribuidoraCandidata,
} from "@/lib/distribuidoras";

const FIXTURE_TESTE_CODIGO_IBGE = "9999999";

const FIXTURE_TESTE_DISTRIBUIDORA_A: DistribuidoraCandidata = {
  codigoIbge: FIXTURE_TESTE_CODIGO_IBGE,
  siglaDistribuidora: "FIXTURE_TESTE_DIST-A",
  cnpjDistribuidora: "11.111.111/0001-11",
};
const FIXTURE_TESTE_DISTRIBUIDORA_B: DistribuidoraCandidata = {
  codigoIbge: FIXTURE_TESTE_CODIGO_IBGE,
  siglaDistribuidora: "FIXTURE_TESTE_DIST-B",
  cnpjDistribuidora: "22.222.222/0001-22",
};

describe("normalizarTexto", () => {
  it("remove acentos, espaços nas pontas e padroniza maiúsculas", () => {
    expect(normalizarTexto("  São Paulo  ")).toBe("SAO PAULO");
    expect(normalizarTexto("Contagem")).toBe("CONTAGEM");
    expect(normalizarTexto("sp")).toBe("SP");
  });

  it("string vazia ou só espaço vira string vazia", () => {
    expect(normalizarTexto("   ")).toBe("");
    expect(normalizarTexto("")).toBe("");
  });
});

describe("resolverDistribuidora", () => {
  // Cenário 3: município sem nenhuma correspondência -> "não encontrada", sem erro.
  it("nenhuma candidata: não encontrada", () => {
    expect(resolverDistribuidora([])).toEqual({ tipo: "nao_encontrada" });
  });

  // Cenário 1: município com uma distribuidora -> resolução automática.
  it("uma candidata: única, preenche automático", () => {
    expect(resolverDistribuidora([FIXTURE_TESTE_DISTRIBUIDORA_A])).toEqual({
      tipo: "unica",
      distribuidora: FIXTURE_TESTE_DISTRIBUIDORA_A,
    });
  });

  // Cenário 2: município com múltiplas distribuidoras -> ambígua, com a lista de opções.
  it("mais de uma candidata: ambígua, devolve a lista pra seleção manual", () => {
    expect(resolverDistribuidora([FIXTURE_TESTE_DISTRIBUIDORA_A, FIXTURE_TESTE_DISTRIBUIDORA_B])).toEqual({
      tipo: "ambigua",
      distribuidoras: [FIXTURE_TESTE_DISTRIBUIDORA_A, FIXTURE_TESTE_DISTRIBUIDORA_B],
    });
  });
});

describe("registrarEscolhaDistribuidora", () => {
  // Cenário 4: seleção manual aceita/registrada pela função responsável.
  it("resolução ambígua + escolha manual: usa a escolha, origem 'manual'", () => {
    const resolucao = resolverDistribuidora([FIXTURE_TESTE_DISTRIBUIDORA_A, FIXTURE_TESTE_DISTRIBUIDORA_B]);
    const campos = registrarEscolhaDistribuidora(resolucao, {
      siglaDistribuidora: FIXTURE_TESTE_DISTRIBUIDORA_B.siglaDistribuidora,
    });
    expect(campos).toEqual({
      siglaDistribuidora: "FIXTURE_TESTE_DIST-B",
      nomeDistribuidora: "FIXTURE_TESTE_DIST-B",
      origemDistribuidora: "manual",
    });
  });

  it("resolução não encontrada + escolha manual: também aceita a escolha", () => {
    const resolucao = resolverDistribuidora([]);
    const campos = registrarEscolhaDistribuidora(resolucao, { siglaDistribuidora: "FIXTURE_TESTE_DIST-C" });
    expect(campos.origemDistribuidora).toBe("manual");
    expect(campos.siglaDistribuidora).toBe("FIXTURE_TESTE_DIST-C");
  });

  it("resolução única sem escolha manual: usa a automática, origem 'municipio'", () => {
    const resolucao = resolverDistribuidora([FIXTURE_TESTE_DISTRIBUIDORA_A]);
    expect(registrarEscolhaDistribuidora(resolucao)).toEqual({
      siglaDistribuidora: "FIXTURE_TESTE_DIST-A",
      nomeDistribuidora: "FIXTURE_TESTE_DIST-A",
      origemDistribuidora: "municipio",
    });
  });

  it("não encontrada e sem escolha manual: nenhum campo preenchido", () => {
    expect(registrarEscolhaDistribuidora(resolverDistribuidora([]))).toEqual({
      siglaDistribuidora: null,
      nomeDistribuidora: null,
      origemDistribuidora: null,
    });
  });
});

describe("linhaCsvParaMunicipioDistribuidora", () => {
  it("linha válida: normaliza uf em maiúscula e usa 'aneel' como fonte padrão", () => {
    const resultado = linhaCsvParaMunicipioDistribuidora({
      codigo_ibge: FIXTURE_TESTE_CODIGO_IBGE,
      municipio: "Cidade Fixture Teste",
      uf: "sp",
      distribuidora_sigla: "FIXTURE_TESTE_DIST-A",
      distribuidora_cnpj: "11.111.111/0001-11",
      data_referencia: "2026-01-01",
    });
    expect(resultado).toEqual({
      ok: true,
      valores: {
        codigoIbge: FIXTURE_TESTE_CODIGO_IBGE,
        municipio: "Cidade Fixture Teste",
        uf: "SP",
        distribuidoraSigla: "FIXTURE_TESTE_DIST-A",
        distribuidoraCnpj: "11.111.111/0001-11",
        fonte: "aneel",
        dataReferencia: "2026-01-01",
      },
    });
  });

  it("codigo_ibge fora do padrão de 7 dígitos: erro", () => {
    const resultado = linhaCsvParaMunicipioDistribuidora({
      codigo_ibge: "123",
      municipio: "Cidade Fixture Teste",
      uf: "SP",
      distribuidora_sigla: "FIXTURE_TESTE_DIST-A",
    });
    expect(resultado.ok).toBe(false);
  });

  it("distribuidora_sigla ausente: erro", () => {
    const resultado = linhaCsvParaMunicipioDistribuidora({
      codigo_ibge: FIXTURE_TESTE_CODIGO_IBGE,
      municipio: "Cidade Fixture Teste",
      uf: "SP",
      distribuidora_sigla: "",
    });
    expect(resultado.ok).toBe(false);
  });
});

/** Mesmo mock de fetch de `tests/aneel.test.ts`, sem rede de verdade. */
function respostaJson(corpo: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(corpo) } as Response);
}

function registroTarifaValido(overrides: Record<string, string> = {}) {
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const anoQueVem = new Date(hoje.getFullYear() + 1, 0, 1).toISOString().slice(0, 10);
  return {
    DscREH: "FIXTURE_TESTE_REH 1/2026",
    DscBaseTarifaria: "Tarifa de Aplicação",
    DscSubGrupo: "B1",
    DscModalidadeTarifaria: "Convencional",
    DscClasse: "Residencial",
    DscSubClasse: "Residencial",
    NomPostoTarifario: "Não se aplica",
    DscUnidadeTerciaria: "R$/kWh",
    DatInicioVigencia: ontem,
    DatFimVigencia: anoQueVem,
    VlrTUSD: "0,30",
    VlrTE: "0,20",
    ...overrides,
  };
}

describe("distribuidora resolvida + tarifa ANEEL (fetch mockado)", () => {
  // Cenário 5: distribuidora encontrada (única) + tarifa ANEEL encontrada.
  it("distribuidora única + tarifa ANEEL encontrada: usa a sigla resolvida pra buscar a tarifa", async () => {
    const resolucao = resolverDistribuidora([FIXTURE_TESTE_DISTRIBUIDORA_A]);
    expect(resolucao.tipo).toBe("unica");
    if (resolucao.tipo !== "unica") throw new Error("esperava única");

    const fetchMock = vi.fn(() => respostaJson({ success: true, result: { records: [registroTarifaValido()] } }));
    const tarifa = await buscarTarifaHomologada(resolucao.distribuidora.siglaDistribuidora, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent("FIXTURE_TESTE_DIST-A")));
    expect(tarifa?.tarifaFinalKwh).toBeCloseTo(0.5);
  });

  // Cenário 6: distribuidora encontrada, mas tarifa ANEEL não encontrada (sem vigência aplicável).
  it("distribuidora única + tarifa ANEEL não encontrada: devolve null, sem travar o fluxo", async () => {
    const resolucao = resolverDistribuidora([FIXTURE_TESTE_DISTRIBUIDORA_A]);
    expect(resolucao.tipo).toBe("unica");
    if (resolucao.tipo !== "unica") throw new Error("esperava única");

    const fetchMock = vi.fn(() => respostaJson({ success: true, result: { records: [] } }));
    const tarifa = await buscarTarifaHomologada(resolucao.distribuidora.siglaDistribuidora, fetchMock);

    expect(tarifa).toBeNull();
  });
});
