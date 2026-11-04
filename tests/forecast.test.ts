import { describe, expect, it } from "vitest";
import {
  categoriaDaChance,
  chanceAjustada,
  classificar,
  mesCurto,
  mesesDoForecast,
  metaNoMes,
  montarForecast,
  type NegocioForecastEntrada,
} from "@/lib/forecast";

const base: NegocioForecastEntrada = {
  id: "n1",
  numero: 1,
  titulo: "Residencial 10 kWp",
  contatoNome: "Cliente",
  etapaNome: "Proposta enviada",
  chanceBase: 60,
  temperatura: "morno",
  risco: null,
  valor: 50_000,
  fechamentoPrevisto: "2026-11-01",
  parado: false,
  responsavelId: "m1",
};
const neg = (p: Partial<NegocioForecastEntrada>): NegocioForecastEntrada => ({ ...base, ...p });

describe("chance e categoria", () => {
  it("temperatura soma ou tira 10 pontos, sem sair de 0 a 100", () => {
    expect(chanceAjustada(60, "quente")).toBe(70);
    expect(chanceAjustada(60, "frio")).toBe(50);
    expect(chanceAjustada(60, null)).toBe(60);
    expect(chanceAjustada(95, "quente")).toBe(100);
    expect(chanceAjustada(5, "frio")).toBe(0);
  });

  it("categorias nas fronteiras do desenho", () => {
    expect(categoriaDaChance(70)).toBe("compromisso");
    expect(categoriaDaChance(69)).toBe("provavel");
    expect(categoriaDaChance(40)).toBe("provavel");
    expect(categoriaDaChance(39)).toBe("possivel");
    expect(categoriaDaChance(20)).toBe("possivel");
    expect(categoriaDaChance(19)).toBeNull();
  });
});

describe("classificar", () => {
  const mes = "2026-11-01";
  it("entra com chance, valor e mês previsto; ponderado = valor × chance", () => {
    const c = classificar(neg({ temperatura: "quente" }), mes);
    expect(c).toMatchObject({ tipo: "dentro", negocio: { chance: 70, categoria: "compromisso", ponderado: 35_000 } });
  });

  it("fora do forecast pelo primeiro motivo, nesta ordem", () => {
    const motivo = (p: Partial<NegocioForecastEntrada>) => {
      const c = classificar(neg(p), mes);
      return c.tipo === "fora" ? c.negocio.motivo : c.tipo;
    };
    expect(motivo({ fechamentoPrevisto: null, valor: null, parado: true })).toBe("sem_data");
    expect(motivo({ fechamentoPrevisto: "2026-10-01" })).toBe("data_passada");
    expect(motivo({ valor: null, parado: true })).toBe("sem_valor");
    expect(motivo({ valor: 0 })).toBe("sem_valor");
    expect(motivo({ parado: true, chanceBase: null })).toBe("parado");
    expect(motivo({ chanceBase: null })).toBe("etapa_sem_chance");
  });

  it("chance abaixo de 20% não entra e não é problema de dado", () => {
    expect(classificar(neg({ chanceBase: 20, temperatura: "frio" }), mes)).toEqual({ tipo: "abaixo" });
  });
});

describe("meta do mês", () => {
  it("meta mensal entra inteira; trimestral pela fração de dias", () => {
    expect(metaNoMes({ membroId: "m1", valorAlvo: 100, periodoInicio: "2026-11-01", periodoFim: "2026-11-30" }, "2026-11-01")).toBe(100);
    // Outubro a dezembro: 92 dias, 30 em novembro.
    expect(metaNoMes({ membroId: "m1", valorAlvo: 92_000, periodoInicio: "2026-10-01", periodoFim: "2026-12-31" }, "2026-11-01")).toBeCloseTo(30_000);
    expect(metaNoMes({ membroId: "m1", valorAlvo: 100, periodoInicio: "2026-12-01", periodoFim: "2026-12-31" }, "2026-11-01")).toBe(0);
  });
});

describe("montarForecast", () => {
  it("três meses a partir do atual, virando o ano", () => {
    expect(mesesDoForecast("2026-11-04")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(mesCurto("2027-01-01")).toBe("jan/27");
  });

  it("soma por mês e categoria, ordena pela chance e separa o que está fora", () => {
    const vm = montarForecast(
      [
        neg({ id: "a", numero: 1, chanceBase: 80, valor: 100_000 }),
        neg({ id: "b", numero: 2, chanceBase: 40, valor: 50_000, responsavelId: "m2" }),
        neg({ id: "c", numero: 3, chanceBase: 20, valor: 10_000, fechamentoPrevisto: "2026-12-01" }),
        neg({ id: "d", numero: 4, fechamentoPrevisto: "2027-02-01" }), // além dos três meses
        neg({ id: "e", numero: 5, valor: null }),
        neg({ id: "f", numero: 6, chanceBase: 10 }),
      ],
      [{ membroId: "m1", valorAlvo: 200_000, periodoInicio: "2026-11-01", periodoFim: "2026-11-30" }],
      "2026-11-04",
    );
    expect(vm.negocios.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(vm.fora.map((n) => [n.id, n.motivo])).toEqual([["e", "sem_valor"]]);
    const [nov, dez] = vm.meses;
    expect(nov.categorias.compromisso).toEqual({ valor: 100_000, quantidade: 1 });
    expect(nov.categorias.provavel).toEqual({ valor: 50_000, quantidade: 1 });
    expect(nov.total).toBe(150_000);
    expect(nov.ponderado).toBe(80_000 + 20_000);
    expect(nov.meta).toBe(200_000);
    expect(dez.categorias.possivel.valor).toBe(10_000);
    expect(vm.porVendedor("2026-11-01")).toEqual([
      { membroId: "m1", ponderado: 80_000, meta: 200_000 },
      { membroId: "m2", ponderado: 20_000, meta: 0 },
    ]);
  });
});
