/** Geocoding + produtividade regional real (fase 2): testado com fetch mockado, sem rede de verdade. */
import { describe, expect, it, vi } from "vitest";
import { arredondarCoordenadas, buscarProdutividadeRegional, geocodificarEndereco } from "@/lib/geodados";

function respostaJson(corpo: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(corpo) } as Response);
}

describe("geocodificarEndereco", () => {
  it("retorna lat/lon do primeiro resultado do Nominatim", async () => {
    const fetchMock = vi.fn(() => respostaJson([{ lat: "-23.5505", lon: "-46.6333" }]));
    const coordenadas = await geocodificarEndereco("Av. Paulista, São Paulo", fetchMock);
    expect(coordenadas).toEqual({ lat: -23.5505, lon: -46.6333 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retorna null pra endereço vazio, sem chamar a API", async () => {
    const fetchMock = vi.fn();
    expect(await geocodificarEndereco("   ", fetchMock)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retorna null quando a API não encontra nada", async () => {
    const fetchMock = vi.fn(() => respostaJson([]));
    expect(await geocodificarEndereco("endereço inexistente", fetchMock)).toBeNull();
  });

  it("retorna null quando a resposta não é ok", async () => {
    const fetchMock = vi.fn(() => respostaJson([], false));
    expect(await geocodificarEndereco("qualquer coisa", fetchMock)).toBeNull();
  });
});

describe("buscarProdutividadeRegional", () => {
  it("usa o PVGIS quando disponível (E_y anual dividido por 12)", async () => {
    const fetchMock = vi.fn(() => respostaJson({ outputs: { totals: { fixed: { E_y: 1440 } } } }));
    const resultado = await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock);
    expect(resultado).toEqual({ produtividadeKwhKwpMes: 120, fonte: "pvgis" });
  });

  it("cai pro NASA quando o PVGIS falha", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(await respostaJson({}, false))
      .mockResolvedValueOnce(await respostaJson({ properties: { parameter: { ALLSKY_SFC_SW_DWN: { ANN: 5 } } } }));
    const resultado = await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock);
    expect(resultado?.fonte).toBe("nasa");
    // 5 kWh/m²/dia * 30,44 dias * 0,78 de performance ratio ≈ 118,7
    expect(resultado?.produtividadeKwhKwpMes).toBeCloseTo(118.72, 1);
  });

  it("retorna null quando nenhuma fonte responde", async () => {
    const fetchMock = vi.fn(() => respostaJson({}, false));
    expect(await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock)).toBeNull();
  });

  it("retorna null quando o fetch lança erro de rede, sem propagar a exceção", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("rede indisponível")));
    expect(await buscarProdutividadeRegional({ lat: -23.55, lon: -46.63 }, fetchMock)).toBeNull();
  });
});

describe("arredondarCoordenadas", () => {
  it("arredonda pra 2 casas decimais", () => {
    expect(arredondarCoordenadas({ lat: -23.55048, lon: -46.63315 })).toEqual({ lat: -23.55, lon: -46.63 });
  });
});
