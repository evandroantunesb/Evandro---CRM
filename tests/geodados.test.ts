/** Geocoding + produtividade regional real (fase 2): testado com fetch mockado, sem rede de verdade. */
import { describe, expect, it, vi } from "vitest";
import { arredondarCoordenadas, buscarProdutividadeRegional, geocodificarEndereco } from "@/lib/geodados";

function respostaJson(corpo: unknown, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(corpo) } as Response);
}

describe("geocodificarEndereco", () => {
  it("retorna lat/lon do primeiro resultado do Nominatim", async () => {
    const fetchMock = vi.fn(() => respostaJson([{ lat: "-23.5505", lon: "-46.6333" }]));
    const resultado = await geocodificarEndereco("Av. Paulista, São Paulo", fetchMock);
    expect(resultado).toEqual({
      ok: true,
      coordenadas: { lat: -23.5505, lon: -46.6333 },
      diagnostico: expect.objectContaining({ provider: "geocoding", status: "ok" }),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falha pra endereço vazio, sem chamar a API", async () => {
    const fetchMock = vi.fn();
    const resultado = await geocodificarEndereco("   ", fetchMock);
    expect(resultado.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha com GEOCODING_NOT_FOUND quando a API não encontra nada", async () => {
    const fetchMock = vi.fn(() => respostaJson([]));
    const resultado = await geocodificarEndereco("endereço inexistente", fetchMock);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.diagnostico.reasonCode).toBe("GEOCODING_NOT_FOUND");
  });

  it("falha com GEOCODING_HTTP_ERROR (com httpStatus) quando a resposta não é ok", async () => {
    const fetchMock = vi.fn(() => respostaJson([], false, 503));
    const resultado = await geocodificarEndereco("qualquer coisa", fetchMock);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.diagnostico.reasonCode).toBe("GEOCODING_HTTP_ERROR");
      expect(resultado.diagnostico.httpStatus).toBe(503);
    }
  });

  it("falha com GEOCODING_TIMEOUT quando o fetch estoura o prazo (AbortError)", async () => {
    const erroAbort = new DOMException("The operation was aborted.", "AbortError");
    const fetchMock = vi.fn(() => Promise.reject(erroAbort));
    const resultado = await geocodificarEndereco("qualquer coisa", fetchMock);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.diagnostico.reasonCode).toBe("GEOCODING_TIMEOUT");
  });
});

describe("buscarProdutividadeRegional", () => {
  it("usa o PVGIS quando disponível (E_y anual dividido por 12)", async () => {
    const fetchMock = vi.fn(() => respostaJson({ outputs: { totals: { fixed: { E_y: 1440 } } } }));
    const resultado = await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.produtividadeKwhKwpMes).toBe(120);
      expect(resultado.fonte).toBe("pvgis");
      expect(resultado.diagnosticos).toEqual([expect.objectContaining({ provider: "pvgis", status: "ok" })]);
    }
  });

  it("cai pro NASA quando o PVGIS falha, e registra as duas tentativas no diagnóstico", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(await respostaJson({}, false, 400))
      .mockResolvedValueOnce(await respostaJson({ properties: { parameter: { ALLSKY_SFC_SW_DWN: { ANN: 5 } } } }));
    const resultado = await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.fonte).toBe("nasa");
      // 5 kWh/m²/dia * 30,44 dias * 0,78 de performance ratio ≈ 118,7
      expect(resultado.produtividadeKwhKwpMes).toBeCloseTo(118.72, 1);
      expect(resultado.diagnosticos).toHaveLength(2);
      expect(resultado.diagnosticos[0]).toMatchObject({ provider: "pvgis", status: "falhou", reasonCode: "PVGIS_UNAVAILABLE_FOR_LOCATION" });
      expect(resultado.diagnosticos[1]).toMatchObject({ provider: "nasa", status: "ok" });
    }
  });

  it("falha com os dois diagnósticos quando nenhuma fonte responde", async () => {
    const fetchMock = vi.fn(() => respostaJson({}, false, 500));
    const resultado = await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.diagnosticos).toHaveLength(2);
      expect(resultado.diagnosticos[0]).toMatchObject({ provider: "pvgis", reasonCode: "PVGIS_HTTP_ERROR", httpStatus: 500 });
      expect(resultado.diagnosticos[1]).toMatchObject({ provider: "nasa", reasonCode: "NASA_HTTP_ERROR", httpStatus: 500 });
    }
  });

  it("falha sem propagar a exceção quando o fetch lança erro de rede", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("rede indisponível")));
    const resultado = await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.diagnosticos[0].reasonCode).toBe("PVGIS_HTTP_ERROR");
      expect(resultado.diagnosticos[1].reasonCode).toBe("NASA_HTTP_ERROR");
    }
  });
});

describe("arredondarCoordenadas", () => {
  it("arredonda pra 2 casas decimais", () => {
    expect(arredondarCoordenadas({ lat: -23.55048, lon: -46.63315 })).toEqual({ lat: -23.55, lon: -46.63 });
  });
});
