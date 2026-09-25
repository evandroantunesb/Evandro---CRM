/** Catálogo técnico (OpenSolar): mapeia a resposta real da API pro formato usado no kit. */
import { describe, expect, it, vi, afterEach } from "vitest";
import { buscarModulosCatalogo } from "@/lib/opensolar";

// Amostra real de GET /api/orgs/:org_id/component_module_activations/?fieldset=list (2026-09-25).
const AMOSTRA_MODULOS = [
  {
    org: "https://api.opensolar.com/api/orgs/250772/",
    module: "https://api.opensolar.com/api/component_modules/49544/",
    module_id: 49544,
    manufacturer: 22,
    manufacturer_name: "Panasonic",
    cost: 0.0,
    data: JSON.stringify({
      code: "VBHN325SA16",
      technology: "Mono-c-Si",
      kw_stc: 0.325,
      voc: 69.6,
      imp: 5.65,
      isc: 6.03,
      manufacturer_name: "Panasonic",
    }),
    code: "VBHN325SA16",
    id: 1555772,
    url: "https://api.opensolar.com/api/orgs/250772/component_module_activations/1555772/",
  },
  {
    org: "https://api.opensolar.com/api/orgs/250772/",
    module: "https://api.opensolar.com/api/component_modules/59117/",
    module_id: 59117,
    manufacturer: 27,
    manufacturer_name: "SunPower",
    cost: 0.0,
    data: JSON.stringify({ code: "SPR-P3-370-BLK-E3-AC", kw_stc: 0.37, voc: 42.6 }),
    code: "SPR-P3-370-BLK-E3-AC",
    id: 1555771,
    url: "https://api.opensolar.com/api/orgs/250772/component_module_activations/1555771/",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buscarModulosCatalogo", () => {
  it("mapeia fabricante, código e potência (kw_stc convertido pra watts)", async () => {
    vi.stubEnv("OPENSOLAR_API_TOKEN", "token-teste");
    vi.stubEnv("OPENSOLAR_ORG_ID", "250772");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(AMOSTRA_MODULOS), { status: 200 })),
    );

    const r = await buscarModulosCatalogo("panasonic");
    expect(r).toEqual([{ id: 1555772, descricao: "Panasonic VBHN325SA16", potenciaW: 325 }]);
  });

  it("sem termo, devolve todos os módulos ativados", async () => {
    vi.stubEnv("OPENSOLAR_API_TOKEN", "token-teste");
    vi.stubEnv("OPENSOLAR_ORG_ID", "250772");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(AMOSTRA_MODULOS), { status: 200 })),
    );

    const r = await buscarModulosCatalogo("");
    expect(r.map((c) => c.descricao)).toEqual(["Panasonic VBHN325SA16", "SunPower SPR-P3-370-BLK-E3-AC"]);
  });

  it("sem credenciais configuradas, devolve lista vazia (sem quebrar o formulário)", async () => {
    vi.stubEnv("OPENSOLAR_API_TOKEN", "");
    vi.stubEnv("OPENSOLAR_ORG_ID", "");
    const chamouFetch = vi.fn();
    vi.stubGlobal("fetch", chamouFetch);

    const r = await buscarModulosCatalogo("panasonic");
    expect(r).toEqual([]);
    expect(chamouFetch).not.toHaveBeenCalled();
  });

  it("se a API responder erro, devolve lista vazia em vez de lançar exceção", async () => {
    vi.stubEnv("OPENSOLAR_API_TOKEN", "token-teste");
    vi.stubEnv("OPENSOLAR_ORG_ID", "250772");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erro", { status: 500 })),
    );

    const r = await buscarModulosCatalogo("panasonic");
    expect(r).toEqual([]);
  });
});
