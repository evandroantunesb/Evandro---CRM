import { describe, expect, it } from "vitest";
import { resolverConsumo } from "@/lib/consumo-estimado";

describe("consumo informado ou estimado pela fatura", () => {
  it("usa kWh informado e descarta a tarifa efetiva, mesmo com conta preenchida", () => {
    expect(resolverConsumo(510, 400, 0.95)).toEqual({ origem: "informado", kwh: 510, tarifaEfetiva: null });
  });

  it("arredonda a conta e a tarifa como o banco antes de estimar kWh", () => {
    expect(resolverConsumo(null, 450.005, 0.95005)).toEqual({ origem: "estimado", kwh: 473.65, tarifaEfetiva: 0.9501 });
  });

  it("não converte só pela conta: falta tarifa efetiva separada da tarifa base", () => {
    expect(resolverConsumo(null, 450, null)).toEqual({ origem: "ausente", kwh: null, tarifaEfetiva: null });
  });
});
