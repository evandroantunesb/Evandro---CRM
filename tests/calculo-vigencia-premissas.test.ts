/**
 * Vigência do método v2 (proposta completa, PR 2b-2; decisão do Evandro em 25/11/2026): mudar o autoconsumo do negócio
 * ou os tributos da empresa deixa o cálculo salvo desatualizado (`premissas`), como já acontece com consumo e preço.
 * O motivo é só financeiro: o contrato o ignora. A linha v1 não tem essas premissas e não é comparada. Dados fictícios.
 *
 * A linha `completo` também confere a regra tarifária contra o contexto de hoje; sem contexto ela cai em
 * `nao_comprovado`. Aqui só interessa a presença ou ausência de `premissas`.
 */
import { describe, expect, it } from "vitest";
import { METODO_GD2_PISO_V2 } from "@/lib/calculadora";
import { METODO_GD2_PISO_V1 } from "@/lib/fio-b-gd2";
import {
  avaliarVigencia,
  mensagemDeRecusa,
  motivosDaAcao,
  textoDoMotivo,
  type CalculoParaVigencia,
  type EstadoAtualParaVigencia,
} from "@/lib/calculo-vigencia";

const V2: CalculoParaVigencia = {
  kit_id: null,
  kit_nome: "Kit personalizado · 5,5 kWp (Módulo 550 W)",
  kit_potencia_kwp: 5.5,
  kit_preco: 25000,
  tipo_ligacao: "bifasico",
  consumo_medio_kwh: 450,
  valor_fatura_medio: 400,
  percentual_fio_b: 0.45,
  produtividade_kwh_kwp_mes: 120,
  disponibilidade_kwh: 50,
  estado_financeiro: "completo",
  metodo_calculo: METODO_GD2_PISO_V2,
  autoconsumo_fracao: 0.3,
  icms: 0.19,
  pis_cofins: 0.0763,
};

function atual(sobrescrever: Partial<EstadoAtualParaVigencia> = {}, tributos = { icms: 0.19, pis_cofins: 0.0763 }): EstadoAtualParaVigencia {
  return {
    componentes: [
      { tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 },
      { tipo: "inversor", descricao: "Inversor 5 kW", potencia_w: 5000, quantidade: 1, ordem: 1 },
    ],
    valorNegocio: 25000,
    consumoMedioKwhNegocio: 450,
    valorContaEnergiaNegocio: 400,
    autoconsumoNegocio: null,
    parametros: {
      produtividade_kwh_kwp_mes: 120,
      percentual_fio_b: 0.45,
      disponibilidade_mono_kwh: 30,
      disponibilidade_bi_kwh: 50,
      disponibilidade_tri_kwh: 100,
      ...tributos,
    },
    ...sobrescrever,
  };
}

const motivos = (c: CalculoParaVigencia, a: EstadoAtualParaVigencia) => avaliarVigencia(c, a).motivos;

describe("avaliarVigencia: premissas do método v2", () => {
  it("autoconsumo nulo no negócio vale 30%: bate com a linha gravada com 30%", () => {
    expect(motivos(V2, atual())).not.toContain("premissas");
  });

  it("autoconsumo informado igual ao gravado (na escala do banco) não muda nada", () => {
    expect(motivos({ ...V2, autoconsumo_fracao: 0.45 }, atual({ autoconsumoNegocio: 0.45 }))).not.toContain("premissas");
    expect(motivos({ ...V2, autoconsumo_fracao: 0.45 }, atual({ autoconsumoNegocio: 0.45001 }))).not.toContain("premissas");
  });

  it("mudar o autoconsumo do negócio deixa o cálculo desatualizado", () => {
    expect(motivos(V2, atual({ autoconsumoNegocio: 0.5 }))).toContain("premissas");
    expect(motivos(V2, atual({ autoconsumoNegocio: 0 }))).toContain("premissas");
  });

  it("mudar o ICMS ou o PIS/Cofins da empresa deixa o cálculo desatualizado", () => {
    expect(motivos(V2, atual({}, { icms: 0.18, pis_cofins: 0.0763 }))).toContain("premissas");
    expect(motivos(V2, atual({}, { icms: 0.19, pis_cofins: 0.0812 }))).toContain("premissas");
  });

  it("sem ler o autoconsumo ou os tributos de hoje não há como comprovar: nao_comprovado, nunca vigente", () => {
    const semAutoconsumo = atual();
    delete semAutoconsumo.autoconsumoNegocio;
    expect(motivos(V2, semAutoconsumo)).toContain("nao_comprovado");
    expect(motivos(V2, atual({}, { icms: null as unknown as number, pis_cofins: 0.0763 }))).toContain("nao_comprovado");
  });

  it("a linha v1 não tem essas premissas: autoconsumo e tributos não são comparados", () => {
    const v1: CalculoParaVigencia = { ...V2, metodo_calculo: METODO_GD2_PISO_V1, autoconsumo_fracao: null, icms: null, pis_cofins: null };
    expect(motivos(v1, atual({ autoconsumoNegocio: 0.5 }, { icms: 0.12, pis_cofins: 0.05 }))).not.toContain("premissas");
  });

  it("é só financeiro: bloqueia proposta e preço, não o contrato", () => {
    expect(motivosDaAcao(["premissas"], "proposta")).toEqual(["premissas"]);
    expect(motivosDaAcao(["premissas"], "preco")).toEqual(["premissas"]);
    expect(motivosDaAcao(["premissas"], "contrato")).toEqual([]);
  });

  it("a recusa diz o que mudou e pede para recalcular o kit", () => {
    expect(textoDoMotivo("premissas")).toBe("o autoconsumo do negócio ou os tributos da empresa mudaram depois do último cálculo");
    expect(mensagemDeRecusa(["premissas"], "proposta")).toBe(
      "O autoconsumo do negócio ou os tributos da empresa mudaram depois do último cálculo. Recalcule o kit antes de gerar a proposta.",
    );
  });
});
