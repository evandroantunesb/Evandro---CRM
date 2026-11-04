/**
 * Forecast: chance base das etapas (`20261117100000_forecast_chance_etapa.sql`). Empresa nova nasce com o funil
 * padrão já com a chance pelo nome; etapa nova recebe o padrão quando a chance não vem; etapa que fecha o negócio
 * fica sem chance; a faixa é 0 a 100.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { servico, sufixo } from "./ajuda";

let empresa: string;
let funil: string;

beforeAll(async () => {
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Forecast chance ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
});

async function novaEtapa(nome: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await servico
    .from("etapas")
    .insert({ empresa_id: empresa, funil_id: funil, nome, ordem: 50, ...extra })
    .select("chance_fechamento")
    .single();
  if (error) throw error;
  return data.chance_fechamento;
}

describe("etapas.chance_fechamento", () => {
  it("funil padrão de empresa nova nasce com a chance pelo nome", async () => {
    const { data } = await servico.from("etapas").select("nome, chance_fechamento").eq("funil_id", funil).order("ordem");
    expect(data).toEqual([
      { nome: "Novo lead", chance_fechamento: 10 },
      { nome: "Contato feito", chance_fechamento: 20 },
      { nome: "Visita agendada", chance_fechamento: 40 },
      { nome: "Proposta enviada", chance_fechamento: 60 },
    ]);
  });

  it("etapa nova: padrão pelo nome, marcada como negociação 80, outro nome sem chance", async () => {
    expect(await novaEtapa("Em negociação")).toBe(80);
    expect(await novaEtapa("Aguardando cliente", { marca_negociacao: true })).toBe(80);
    expect(await novaEtapa("Qualificação")).toBe(20);
    expect(await novaEtapa("Financiamento")).toBeNull();
  });

  it("chance informada vale; etapa que fecha o negócio fica sem chance", async () => {
    expect(await novaEtapa("Proposta revisada", { chance_fechamento: 55 })).toBe(55);
    expect(await novaEtapa("Proposta aceita", { fecha_como: "ganho" })).toBeNull();
  });

  it("fora de 0 a 100 é recusado", async () => {
    const { error } = await servico.from("etapas").insert({ empresa_id: empresa, funil_id: funil, nome: "Inválida", ordem: 60, chance_fechamento: 101 });
    expect(error?.message).toMatch(/etapas_chance_fechamento_faixa/);
  });
});
