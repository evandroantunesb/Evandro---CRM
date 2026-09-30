/** Tarifa homologada (fase 4): testado com fetch mockado, sem rede de verdade. */
import { describe, expect, it, vi } from "vitest";
import { buscarTarifaHomologada } from "@/lib/aneel";

function respostaJson(corpo: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(corpo) } as Response);
}

const HOJE = new Date();
const ONTEM = new Date(HOJE.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const AMANHA_ANO_QUE_VEM = new Date(HOJE.getFullYear() + 1, 0, 1).toISOString().slice(0, 10);

/** Registro que passa em todos os filtros por padrão — cada teste sobrescreve só o que quer variar. */
function registroValido(overrides: Record<string, string> = {}) {
  return {
    DscREH: "REH 3.456/2026",
    DscBaseTarifaria: "Tarifa de Aplicação",
    DscSubGrupo: "B1",
    DscModalidadeTarifaria: "Convencional",
    DscClasse: "Residencial",
    DscSubClasse: "Residencial",
    NomPostoTarifario: "Não se aplica",
    DscUnidadeTerciaria: "R$/kWh",
    DatInicioVigencia: ONTEM,
    DatFimVigencia: AMANHA_ANO_QUE_VEM,
    VlrTUSD: "0,45",
    VlrTE: "0,38",
    ...overrides,
  };
}

describe("buscarTarifaHomologada", () => {
  it("soma TUSD + TE do registro que bate com todos os filtros", async () => {
    const fetchMock = vi.fn(() => respostaJson({ success: true, result: { records: [registroValido()] } }));
    const tarifa = await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock);
    expect(tarifa?.vlrTusd).toBeCloseTo(0.45);
    expect(tarifa?.vlrTe).toBeCloseTo(0.38);
    expect(tarifa?.tarifaFinalKwh).toBeCloseTo(0.83);
    expect(tarifa?.resolucaoHomologatoria).toBe("REH 3.456/2026");
  });

  it("converte pra R$/kWh quando a unidade do dataset é R$/MWh", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({
        success: true,
        result: { records: [registroValido({ DscUnidadeTerciaria: "R$/MWh", VlrTUSD: "450", VlrTE: "380" })] },
      }),
    );
    const tarifa = await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock);
    expect(tarifa?.tarifaFinalKwh).toBeCloseTo(0.83);
  });

  it("exige modalidade exatamente 'Convencional' — não pega 'SCEE - CONVENCIONAL'", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({
        success: true,
        result: { records: [registroValido({ DscModalidadeTarifaria: "SCEE - CONVENCIONAL" })] },
      }),
    );
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });

  it("exige base tarifária 'Tarifa de Aplicação'", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({ success: true, result: { records: [registroValido({ DscBaseTarifaria: "Tarifa de Fornecimento" })] } }),
    );
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });

  it("exige classe e subclasse Residencial", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({ success: true, result: { records: [registroValido({ DscClasse: "Comercial" })] } }),
    );
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });

  it("exige posto tarifário 'Não se aplica'", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({ success: true, result: { records: [registroValido({ NomPostoTarifario: "Ponta" })] } }),
    );
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });

  it("ignora registro fora da vigência (fim no passado)", async () => {
    const fimPassado = new Date(HOJE.getTime() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fetchMock = vi.fn(() =>
      respostaJson({
        success: true,
        result: { records: [registroValido({ DatInicioVigencia: "2020-01-01", DatFimVigencia: fimPassado })] },
      }),
    );
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });

  it("ignora registro que ainda não começou a vigorar", async () => {
    const inicioFuturo = new Date(HOJE.getFullYear() + 5, 0, 1).toISOString().slice(0, 10);
    const fetchMock = vi.fn(() => respostaJson({ success: true, result: { records: [registroValido({ DatInicioVigencia: inicioFuturo })] } }));
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });

  it("sem DatFimVigencia (tarifa ainda em aberto) conta como vigente", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({ success: true, result: { records: [registroValido({ DatFimVigencia: "" })] } }),
    );
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).not.toBeNull();
  });

  it("com mais de um candidato vigente, usa o de vigência mais recente", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({
        success: true,
        result: {
          records: [
            registroValido({ DatInicioVigencia: ONTEM, VlrTUSD: "0,40", VlrTE: "0,30" }),
            registroValido({ DatInicioVigencia: "2020-01-01", VlrTUSD: "0,10", VlrTE: "0,10" }),
          ],
        },
      }),
    );
    const tarifa = await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock);
    expect(tarifa?.tarifaFinalKwh).toBeCloseTo(0.7);
  });

  it("retorna null pra sigla vazia, sem chamar a API", async () => {
    const fetchMock = vi.fn();
    expect(await buscarTarifaHomologada("   ", fetchMock)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retorna null quando a resposta não é ok", async () => {
    const fetchMock = vi.fn(() => respostaJson({}, false));
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });

  it("retorna null quando não há registros", async () => {
    const fetchMock = vi.fn(() => respostaJson({ success: true, result: { records: [] } }));
    expect(await buscarTarifaHomologada("DISTRIBUIDORA-INEXISTENTE", fetchMock)).toBeNull();
  });

  it("retorna null quando o fetch lança erro de rede, sem propagar a exceção", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("rede indisponível")));
    expect(await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock)).toBeNull();
  });
});
