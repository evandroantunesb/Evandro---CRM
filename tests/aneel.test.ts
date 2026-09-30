/** Tarifa homologada (fase 4): testado com fetch mockado, sem rede de verdade. */
import { describe, expect, it, vi } from "vitest";
import { buscarTarifaHomologada, tarifaTotalKwh } from "@/lib/aneel";

function respostaJson(corpo: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(corpo) } as Response);
}

function registro(overrides: Record<string, string> = {}) {
  return {
    DscSubGrupo: "B1",
    DscModalidadeTarifaria: "Convencional",
    DatInicioVigencia: "2026-06-01",
    DatFimVigencia: "",
    VlrTUSD: "0,45",
    VlrTE: "0,38",
    ...overrides,
  };
}

describe("buscarTarifaHomologada", () => {
  it("soma TUSD + TE do registro convencional mais recente", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({
        success: true,
        result: {
          records: [
            registro({ DatInicioVigencia: "2025-01-01", VlrTUSD: "0,40", VlrTE: "0,30" }),
            registro({ DatInicioVigencia: "2026-06-01", VlrTUSD: "0,45", VlrTE: "0,38" }),
          ],
        },
      }),
    );
    const tarifa = await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock);
    expect(tarifa?.vlrTusd).toBeCloseTo(0.45);
    expect(tarifa?.vlrTe).toBeCloseTo(0.38);
    expect(tarifa && tarifaTotalKwh(tarifa)).toBeCloseTo(0.83);
  });

  it("ignora modalidades não-convencionais quando há uma convencional", async () => {
    const fetchMock = vi.fn(() =>
      respostaJson({
        success: true,
        result: {
          records: [
            registro({ DscModalidadeTarifaria: "Branca", VlrTUSD: "0,90", VlrTE: "0,70" }),
            registro({ DscModalidadeTarifaria: "Convencional", VlrTUSD: "0,45", VlrTE: "0,38" }),
          ],
        },
      }),
    );
    const tarifa = await buscarTarifaHomologada("CPFL-PAULISTA", fetchMock);
    expect(tarifa?.vlrTusd).toBeCloseTo(0.45);
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
