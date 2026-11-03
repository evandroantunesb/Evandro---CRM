/**
 * Estimativa financeira incompleta persistida (migration 20261023200000): regras do banco para `estado_financeiro`.
 *  - incompleto: os seis números financeiros e o payback NULOS, pendências em array não vazio, sem método;
 *  - legado: números presentes, sem método nem pendências (default de toda linha anterior);
 *  - completo: números presentes, `metodo_calculo` e o retrato da regra obrigatórios (ver calculo-gd2-db.test.ts).
 * Ausência nunca vira zero: incompleto com qualquer número financeiro (inclusive 0) é recusado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { servico, sufixo } from "./ajuda";

let empresa: string;
let negocio: string;

const FINANCEIRO = { kwh_faturado: 100, kwh_compensado: 500, custo_fio_b: 60, conta_sem_solar: 570, conta_com_solar: 140, economia_mensal: 430 };
const NULOS = { kwh_faturado: null, kwh_compensado: null, custo_fio_b: null, conta_sem_solar: null, conta_com_solar: null, economia_mensal: null };
const PENDENCIAS = [{ codigo: "formula_nao_validada", mensagem: "A regra de cálculo da economia ainda não foi validada." }];

/** Entradas e resultado técnico (5,5 kWp × 120 = 660 kWh/mês); a parte financeira vem de cada caso. */
const tecnico = () => ({
  empresa_id: empresa,
  negocio_id: negocio,
  kit_nome: "Kit personalizado · 5,5 kWp",
  kit_potencia_kwp: 5.5,
  kit_preco: 25000,
  tipo_ligacao: "trifasico" as const,
  consumo_medio_kwh: 600,
  tarifa_kwh: 0.95,
  produtividade_kwh_kwp_mes: 120,
  percentual_fio_b: 0.45,
  disponibilidade_kwh: 100,
  geracao_estimada_kwh_mes: 660,
});

async function inserir(extra: Record<string, unknown>) {
  const { error } = await servico.from("calculos_solares").insert({ ...tecnico(), ...extra });
  if (!error) await servico.from("calculos_solares").delete().eq("negocio_id", negocio);
  return error;
}

beforeAll(async () => {
  const { data: e } = await servico.from("empresas").insert({ nome: `Estimativa incompleta ${sufixo}` }).select("id").single();
  empresa = e!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente estimativa", telefone: "44 90000-0002" }).select("id").single();
  const { data: n } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Estimativa incompleta", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id })
    .select("id")
    .single();
  negocio = n!.id;
  // O banco só aceita cálculo em negócio com kit.
  const { error } = await servico
    .from("kit_componentes")
    .insert({ empresa_id: empresa, negocio_id: negocio, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });
  if (error) throw error;
});

describe("calculos_solares.estado_financeiro", () => {
  it("linha sem estado (como as anteriores à migration) nasce legada e exige os números", async () => {
    const { data, error } = await servico.from("calculos_solares").insert({ ...tecnico(), ...FINANCEIRO }).select("estado_financeiro, metodo_calculo, pendencias").single();
    expect(error).toBeNull();
    expect(data).toEqual({ estado_financeiro: "legado", metodo_calculo: null, pendencias: null });
    await servico.from("calculos_solares").delete().eq("negocio_id", negocio);
    expect((await inserir({ ...NULOS }))?.code).toBe("23514"); // legado sem números
    expect((await inserir({ ...FINANCEIRO, metodo_calculo: "x" }))?.code).toBe("23514"); // legado com método
    expect((await inserir({ ...FINANCEIRO, pendencias: PENDENCIAS }))?.code).toBe("23514"); // legado com pendências
  });

  it("incompleto: aceito só com todos os financeiros e o payback nulos e com pendências", async () => {
    expect(await inserir({ estado_financeiro: "incompleto", ...NULOS, payback_meses: null, pendencias: PENDENCIAS })).toBeNull();
    for (const campo of Object.keys(FINANCEIRO) as (keyof typeof FINANCEIRO)[]) {
      for (const valor of [FINANCEIRO[campo], 0]) {
        const erro = await inserir({ estado_financeiro: "incompleto", ...NULOS, [campo]: valor, pendencias: PENDENCIAS });
        expect(erro?.code, `${campo} = ${valor}`).toBe("23514");
      }
    }
    expect((await inserir({ estado_financeiro: "incompleto", ...NULOS, payback_meses: 0, pendencias: PENDENCIAS }))?.code).toBe("23514");
    expect((await inserir({ estado_financeiro: "incompleto", ...NULOS, pendencias: null }))?.code).toBe("23514");
    expect((await inserir({ estado_financeiro: "incompleto", ...NULOS, pendencias: [] }))?.code).toBe("23514");
    expect((await inserir({ estado_financeiro: "incompleto", ...NULOS, pendencias: { codigo: "x" } }))?.code).toBe("23514");
    expect((await inserir({ estado_financeiro: "incompleto", ...NULOS, pendencias: PENDENCIAS, metodo_calculo: "x" }))?.code).toBe("23514");
  });

  it("completo: exige números e método; números + método sem o retrato da regra também é recusado (ver calculo-gd2-db)", async () => {
    expect((await inserir({ estado_financeiro: "completo", ...FINANCEIRO }))?.code).toBe("23514");
    expect((await inserir({ estado_financeiro: "completo", ...FINANCEIRO, metodo_calculo: "   " }))?.code).toBe("23514");
    expect((await inserir({ estado_financeiro: "completo", ...NULOS, metodo_calculo: "metodo_teste" }))?.code).toBe("23514");
    expect((await inserir({ estado_financeiro: "completo", ...FINANCEIRO, metodo_calculo: "metodo_teste", pendencias: PENDENCIAS }))?.code).toBe("23514");
    // Desde 20261023210000 o completo exige também o retrato (data, tarifa e base, Fio B, percentual, vigência...).
    expect((await inserir({ estado_financeiro: "completo", ...FINANCEIRO, metodo_calculo: "metodo_teste" }))?.code).toBe("23514");
  });

  it("estado desconhecido é recusado; passar de incompleto a legado exige os números", async () => {
    expect((await inserir({ estado_financeiro: "outro", ...FINANCEIRO }))?.code).toBe("23514");
    const { error } = await servico.from("calculos_solares").insert({ ...tecnico(), estado_financeiro: "incompleto", ...NULOS, pendencias: PENDENCIAS });
    expect(error).toBeNull();
    const semNumeros = await servico.from("calculos_solares").update({ estado_financeiro: "legado", pendencias: null }).eq("negocio_id", negocio);
    expect(semNumeros.error?.code).toBe("23514");
    const { data } = await servico.from("calculos_solares").select("estado_financeiro").eq("negocio_id", negocio).single();
    expect(data).toEqual({ estado_financeiro: "incompleto" });
    await servico.from("calculos_solares").delete().eq("negocio_id", negocio);
  });
});
