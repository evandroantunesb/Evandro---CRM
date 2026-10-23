/**
 * Vigência do cálculo solar salvo (puro, sem banco). Contrato: .aurora/contratos/m2-p0-calculo-vigencia.md.
 * Regra vigente (M2-B8, escopo congelado): TODA linha existente é LEGADA (fórmula antiga, não validada), então
 * `vigente` é SEMPRE falso e `legado` é sempre o primeiro motivo; o que continua comparável (kit, preço, consumo,
 * parâmetros) aparece como motivos adicionais; `naoVerificavel` (tarifa, ligação, Fio B, enquadramento) está SEMPRE
 * presente e nunca vira "atual". Dados fictícios.
 *
 * Esperados derivados à mão (Wp = quantidade x potência_w; kWp = Wp / 1000):
 *   10 x 550 W = 5500 Wp = 5,5 kWp        11 x 550 W = 6050 Wp = 6,05 kWp      10 x 600 W = 6000 Wp = 6 kWp
 *   4 x 550 + 6 x 400 = 2200 + 2400 = 4600 Wp = 4,6 kWp
 *   1 x 1234 W = 1,234 kWp -> 1,23 (2 casas)      1 x 1236 W = 1,236 kWp -> 1,24
 *   3 x 333 W = 999 Wp = 0,999 kWp -> 1
 * Escala: 5,504 -> 5,5 (mesmo kit que 5,5); 5,495 -> 5,5 (meio para longe de zero); 5,494 -> 5,49; 5,505 -> 5,51.
 * Parâmetros: produtividade 2 casas (120,004 -> 120; 120,005 -> 120,01); percentual do Fio B 3 casas (0,4504 -> 0,45).
 */
import { describe, expect, it } from "vitest";
import {
  avaliarVigencia,
  calculoDesatualizado,
  calculoEhLegado,
  ENTRADAS_NAO_VERIFICAVEIS,
  MENSAGEM_CALCULO_DESATUALIZADO,
  MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO,
  MENSAGEM_PRECO_CALCULO_DESATUALIZADO,
  MENSAGEM_PRECO_CALCULO_INCOMPLETO,
  MENSAGEM_PRECO_CALCULO_LEGADO,
  MENSAGEM_PROPOSTA_CALCULO_INCOMPLETO,
  MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO,
  mensagemDeRecusa,
  motivosDaAcao,
  potenciaDoKitKwp,
  textoDoMotivo,
  type AcaoBloqueada,
  type CalculoParaVigencia,
  type ComponenteKitAtual,
  type ComponenteKitVigencia,
  type EstadoAtualParaVigencia,
  type MotivoDesatualizacao,
  type ParametrosAtuais,
} from "@/lib/calculo-vigencia";
import type { ContextoEstimativa, TarifaGd } from "@/lib/tarifa-gd";

const modulo = (quantidade: number, potencia_w: number | null = 550): ComponenteKitVigencia => ({ tipo: "modulo", potencia_w, quantidade });
const inversor = (quantidade = 1, potencia_w: number | null = 5000): ComponenteKitVigencia => ({ tipo: "inversor", potencia_w, quantidade });

const KIT_5_5 = [modulo(10), inversor()];

describe("potenciaDoKitKwp", () => {
  it("soma só módulos: quantidade x potência / 1000", () => {
    expect(potenciaDoKitKwp([modulo(10)])).toBe(5.5);
    expect(potenciaDoKitKwp([modulo(4, 550), modulo(6, 400)])).toBe(4.6);
  });

  it("sem componentes a potência é 0", () => {
    expect(potenciaDoKitKwp([])).toBe(0);
  });

  it("itens que não são módulo (inversor, bateria, outro) não contam", () => {
    expect(potenciaDoKitKwp([inversor(2, 5000)])).toBe(0);
    expect(potenciaDoKitKwp([modulo(10), inversor(3, 5000), { tipo: "bateria", potencia_w: 10000, quantidade: 2 }, { tipo: "outro", potencia_w: 999, quantidade: 4 }])).toBe(5.5);
  });

  it("módulo sem potência (null) não conta", () => {
    expect(potenciaDoKitKwp([modulo(10, null)])).toBe(0);
    expect(potenciaDoKitKwp([modulo(10, null), modulo(4, 550)])).toBe(2.2);
  });

  it("normaliza para 2 casas (meio para longe de zero)", () => {
    expect(potenciaDoKitKwp([modulo(1, 1234)])).toBe(1.23);
    expect(potenciaDoKitKwp([modulo(1, 1236)])).toBe(1.24);
    expect(potenciaDoKitKwp([modulo(3, 333)])).toBe(1);
  });

  it("é determinística e não altera a entrada", () => {
    const entrada = [modulo(10), inversor()];
    const antes = structuredClone(entrada);
    const a = potenciaDoKitKwp(entrada);
    const b = potenciaDoKitKwp(entrada);
    expect(a).toBe(5.5);
    expect(b).toBe(a);
    expect(entrada).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Fixture coerente: o cálculo (linha legada) e o estado atual batem em TUDO que é comparável.
// ---------------------------------------------------------------------------------------------------------------
const NOME_KIT_5_5 = "Kit personalizado · 5,5 kWp (Módulo 550 W)";

const PARAMETROS: ParametrosAtuais = {
  produtividade_kwh_kwp_mes: 120,
  percentual_fio_b: 0.45,
  disponibilidade_mono_kwh: 30,
  disponibilidade_bi_kwh: 50,
  disponibilidade_tri_kwh: 100,
};

const CALCULO: CalculoParaVigencia = {
  kit_id: null,
  kit_nome: NOME_KIT_5_5,
  kit_potencia_kwp: 5.5,
  kit_preco: 25000,
  tipo_ligacao: "bifasico",
  consumo_medio_kwh: 450,
  valor_fatura_medio: 400,
  percentual_fio_b: 0.45,
  produtividade_kwh_kwp_mes: 120,
  disponibilidade_kwh: 50,
};

const ITENS_5_5: ComponenteKitAtual[] = [
  { tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 },
  { tipo: "inversor", descricao: "Inversor 5 kW", potencia_w: 5000, quantidade: 1, ordem: 1 },
];

function atual(sobrescrever: Partial<EstadoAtualParaVigencia> = {}): EstadoAtualParaVigencia {
  return {
    componentes: ITENS_5_5,
    valorNegocio: 25000,
    consumoMedioKwhNegocio: 450,
    valorContaEnergiaNegocio: 400,
    parametros: PARAMETROS,
    ...sobrescrever,
  };
}

const modulos = (quantidade: number, potencia_w = 550, descricao = "Módulo 550 W"): ComponenteKitAtual => ({ tipo: "modulo", descricao, potencia_w, quantidade, ordem: 0 });

describe("avaliarVigencia: linha existente é SEMPRE legada", () => {
  it("tudo o que é comparável bate: ainda assim NÃO é vigente, e o único motivo é 'legado'", () => {
    const v = avaliarVigencia(CALCULO, atual());
    expect(v.vigente).toBe(false);
    expect(v.motivos).toEqual(["legado"]);
  });

  it("calculoEhLegado é verdadeiro para qualquer linha (sem coluna de método)", () => {
    expect(calculoEhLegado(CALCULO)).toBe(true);
    expect(calculoEhLegado({})).toBe(true);
    expect(calculoEhLegado(undefined)).toBe(true);
    expect(calculoEhLegado(null)).toBe(true);
  });

  it("naoVerificavel está SEMPRE presente, na ordem do contrato, com ou sem divergências", () => {
    const esperado = ["tarifa", "tipo_ligacao", "fio_b", "enquadramento"];
    expect(avaliarVigencia(CALCULO, atual()).naoVerificavel).toEqual(esperado);
    expect(avaliarVigencia(CALCULO, atual({ valorNegocio: 1, consumoMedioKwhNegocio: 1, parametros: null })).naoVerificavel).toEqual(esperado);
    expect([...ENTRADAS_NAO_VERIFICAVEIS]).toEqual(esperado);
  });

  it("naoVerificavel é uma cópia: alterar o retorno não contamina a próxima avaliação", () => {
    const v = avaliarVigencia(CALCULO, atual());
    v.naoVerificavel.length = 0;
    expect(avaliarVigencia(CALCULO, atual()).naoVerificavel).toHaveLength(4);
    expect(ENTRADAS_NAO_VERIFICAVEIS).toHaveLength(4);
  });

  it("nunca 'vigente' mesmo com a tarifa do cálculo qualquer: a tarifa não tem fonte e não é comparada", () => {
    const v1 = avaliarVigencia({ ...CALCULO }, atual());
    const v2 = avaliarVigencia({ ...CALCULO, tipo_ligacao: "bifasico" }, atual());
    expect(v1).toEqual(v2);
    expect(v1.vigente).toBe(false);
  });

  it("é determinística e não altera as entradas", () => {
    const c = { ...CALCULO };
    const a = atual();
    const antes = structuredClone({ c, a });
    expect(avaliarVigencia(c, a)).toEqual(avaliarVigencia(c, a));
    expect({ c, a }).toEqual(antes);
  });
});

describe("avaliarVigencia: motivos que continuam comparáveis", () => {
  const motivos = (c: CalculoParaVigencia, a: EstadoAtualParaVigencia) => avaliarVigencia(c, a).motivos;
  const semLegado = (c: CalculoParaVigencia, a: EstadoAtualParaVigencia) => motivos(c, a).filter((m) => m !== "legado");

  describe("kit personalizado: potência E composição", () => {
    it("mudar a quantidade de módulos (11 x 550 = 6,05 kWp contra 5,5): kit", () => {
      expect(semLegado(CALCULO, atual({ componentes: [modulos(11), ITENS_5_5[1]] }))).toEqual(["kit"]);
    });

    it("mudar a potência do módulo (10 x 600 = 6 kWp contra 5,5): kit", () => {
      expect(semLegado(CALCULO, atual({ componentes: [modulos(10, 600), ITENS_5_5[1]] }))).toEqual(["kit"]);
    });

    it("remover módulos ou esvaziar o kit: kit", () => {
      expect(semLegado(CALCULO, atual({ componentes: [ITENS_5_5[1]] }))).toEqual(["kit"]);
      expect(semLegado(CALCULO, atual({ componentes: [] }))).toEqual(["kit"]);
    });

    it("mesma potência, descrição do primeiro módulo diferente (nome do kit mudou): kit", () => {
      expect(semLegado(CALCULO, atual({ componentes: [modulos(10, 550, "Módulo OUTRO 550 W"), ITENS_5_5[1]] }))).toEqual(["kit"]);
    });

    it("inversor, bateria ou 'outro' mudando não conta (só módulos e o nome)", () => {
      const inv = (quantidade: number, potencia_w: number, ordem: number): ComponenteKitAtual => ({ tipo: "inversor", descricao: "Inversor", potencia_w, quantidade, ordem });
      expect(semLegado(CALCULO, atual({ componentes: [ITENS_5_5[0], inv(4, 8000, 1)] }))).toEqual([]);
      expect(semLegado(CALCULO, atual({ componentes: [ITENS_5_5[0]] }))).toEqual([]);
    });

    it("a ordem das linhas é a de `ordem`, não a do array", () => {
      const m: ComponenteKitAtual = { ...ITENS_5_5[0], ordem: 0 };
      const i: ComponenteKitAtual = { ...ITENS_5_5[1], ordem: 1 };
      expect(semLegado(CALCULO, atual({ componentes: [i, m] }))).toEqual([]);
    });

    // Antes (calculoDesatualizado só pela potência): 5,504 e 5,495 viram 5,5 na escala da coluna => vigente.
    it("diferença abaixo de 0,005 kWp (escala de 2 casas): sem o motivo kit", () => {
      expect(semLegado({ ...CALCULO, kit_potencia_kwp: 5.504 }, atual())).toEqual([]);
      expect(semLegado({ ...CALCULO, kit_potencia_kwp: 5.495 }, atual())).toEqual([]);
    });

    it("diferença a partir de 0,005 kWp depois de arredondar: kit", () => {
      expect(semLegado({ ...CALCULO, kit_potencia_kwp: 5.505 }, atual())).toEqual(["kit"]); // 5,51
      expect(semLegado({ ...CALCULO, kit_potencia_kwp: 5.494 }, atual())).toEqual(["kit"]); // 5,49
      expect(semLegado({ ...CALCULO, kit_potencia_kwp: 5.49 }, atual())).toEqual(["kit"]);
      expect(semLegado({ ...CALCULO, kit_potencia_kwp: 5.51 }, atual())).toEqual(["kit"]);
    });

    // Limitação do contrato (não é comportamento desejado): troca por módulos de mesma potência total E mesmo nome.
    it("limitação: 20 x 275 W (mesma potência total e mesma descrição) não é detectada", () => {
      expect(semLegado(CALCULO, atual({ componentes: [modulos(20, 275), ITENS_5_5[1]] }))).toEqual([]);
    });
  });

  describe("kit de catálogo (kit_id)", () => {
    const calc = { ...CALCULO, kit_id: "kit-1", kit_nome: "Kit Catálogo A" };
    const cat = (sobrescrever: Partial<{ id: string; nome: string; potencia_kwp: number }> = {}) => ({
      id: "kit-1",
      nome: "Kit Catálogo A",
      potencia_kwp: 5.5,
      ...sobrescrever,
    });

    it("registro igual: sem o motivo kit (os itens do negócio não são consultados)", () => {
      expect(semLegado(calc, atual({ kitCatalogo: cat(), componentes: [] }))).toEqual([]);
    });
    it("nome ou potência do registro diferente: kit", () => {
      expect(semLegado(calc, atual({ kitCatalogo: cat({ nome: "Kit Catálogo B" }) }))).toEqual(["kit"]);
      expect(semLegado(calc, atual({ kitCatalogo: cat({ potencia_kwp: 6 }) }))).toEqual(["kit"]);
    });
    it("registro não lido ou de outro id: não_comprovado, nunca vigente", () => {
      expect(semLegado(calc, atual({ kitCatalogo: null }))).toEqual(["nao_comprovado"]);
      expect(semLegado(calc, atual({ kitCatalogo: undefined }))).toEqual(["nao_comprovado"]);
      expect(semLegado(calc, atual({ kitCatalogo: cat({ id: "kit-2" }) }))).toEqual(["nao_comprovado"]);
    });
  });

  describe("preço, consumo, fatura", () => {
    it("valor do negócio diferente do preço do cálculo: preco (comparação em centavos)", () => {
      expect(semLegado(CALCULO, atual({ valorNegocio: 26000 }))).toEqual(["preco"]);
      expect(semLegado(CALCULO, atual({ valorNegocio: 24999.99 }))).toEqual(["preco"]);
      expect(semLegado(CALCULO, atual({ valorNegocio: null }))).toEqual(["preco"]);
      expect(semLegado({ ...CALCULO, kit_preco: 0.3 }, atual({ valorNegocio: 0.1 + 0.2 }))).toEqual([]);
    });

    it("consumo do negócio diferente do calculado: consumo (na escala de 2 casas)", () => {
      expect(semLegado(CALCULO, atual({ consumoMedioKwhNegocio: 451 }))).toEqual(["consumo"]);
      expect(semLegado(CALCULO, atual({ consumoMedioKwhNegocio: 450.004 }))).toEqual([]);
      expect(semLegado(CALCULO, atual({ consumoMedioKwhNegocio: 450.005 }))).toEqual(["consumo"]);
    });

    it("fatura do negócio diferente da calculada: consumo", () => {
      expect(semLegado(CALCULO, atual({ valorContaEnergiaNegocio: 410 }))).toEqual(["consumo"]);
    });

    it("negócio com fatura e cálculo sem fatura: consumo (mudou)", () => {
      expect(semLegado({ ...CALCULO, valor_fatura_medio: null }, atual({ valorContaEnergiaNegocio: 400 }))).toEqual(["consumo"]);
    });

    it("negócio e cálculo sem fatura: nada a comparar", () => {
      expect(semLegado({ ...CALCULO, valor_fatura_medio: null }, atual({ valorContaEnergiaNegocio: null }))).toEqual([]);
    });

    it("negócio sem consumo (nunca salvo, ou salvo sem consumo): não_comprovado (o cálculo não se compara a si mesmo)", () => {
      expect(semLegado(CALCULO, atual({ consumoMedioKwhNegocio: null }))).toEqual(["nao_comprovado"]);
    });

    it("negócio sem fatura com cálculo que a tem: não_comprovado", () => {
      expect(semLegado(CALCULO, atual({ valorContaEnergiaNegocio: null }))).toEqual(["nao_comprovado"]);
    });
  });

  describe("parâmetros da empresa", () => {
    const comParametros = (p: Partial<ParametrosAtuais>) => atual({ parametros: { ...PARAMETROS, ...p } });

    it("produtividade diferente: parametros (afeta a geração)", () => {
      expect(semLegado(CALCULO, comParametros({ produtividade_kwh_kwp_mes: 125 }))).toEqual(["parametros"]);
    });
    it("produtividade na escala de 2 casas: 120,004 igual; 120,005 diferente", () => {
      expect(semLegado(CALCULO, comParametros({ produtividade_kwh_kwp_mes: 120.004 }))).toEqual([]);
      expect(semLegado(CALCULO, comParametros({ produtividade_kwh_kwp_mes: 120.005 }))).toEqual(["parametros"]);
    });
    it("percentual do Fio B diferente: parametros_financeiros (não 'parametros')", () => {
      expect(semLegado(CALCULO, comParametros({ percentual_fio_b: 0.5 }))).toEqual(["parametros_financeiros"]);
    });
    it("percentual na escala de 3 casas: 0,4504 igual; 0,4505 diferente", () => {
      expect(semLegado(CALCULO, comParametros({ percentual_fio_b: 0.4504 }))).toEqual([]);
      expect(semLegado(CALCULO, comParametros({ percentual_fio_b: 0.4505 }))).toEqual(["parametros_financeiros"]);
    });
    it("disponibilidade do tipo de ligação do cálculo (bifásico) diferente: parametros_financeiros; a de outro tipo não conta", () => {
      expect(semLegado(CALCULO, comParametros({ disponibilidade_bi_kwh: 60 }))).toEqual(["parametros_financeiros"]);
      expect(semLegado(CALCULO, comParametros({ disponibilidade_mono_kwh: 99, disponibilidade_tri_kwh: 99 }))).toEqual([]);
    });
    it("parâmetros inexistentes: não_comprovado", () => {
      expect(semLegado(CALCULO, atual({ parametros: null }))).toEqual(["nao_comprovado"]);
    });
    it("tipo de ligação desconhecido no cálculo: não_comprovado", () => {
      expect(semLegado({ ...CALCULO, tipo_ligacao: "desconhecido" }, atual())).toEqual(["nao_comprovado"]);
    });
  });

  it("todos os motivos juntos saem na ordem de relevância, sem repetição", () => {
    const m = motivos(
      { ...CALCULO, kit_potencia_kwp: 9 },
      atual({
        valorNegocio: 1,
        consumoMedioKwhNegocio: 1,
        valorContaEnergiaNegocio: null,
        parametros: { ...PARAMETROS, produtividade_kwh_kwp_mes: 99, percentual_fio_b: 0.1 },
      }),
    );
    expect(m).toEqual(["legado", "kit", "consumo", "parametros", "parametros_financeiros", "preco", "nao_comprovado"]);
  });
});

describe("motivosDaAcao (guardas por ação)", () => {
  const TODOS: MotivoDesatualizacao[] = ["legado", "kit", "consumo", "parametros", "parametros_financeiros", "preco", "nao_comprovado"];

  it("proposta: todos os motivos bloqueiam (inclui legado)", () => {
    expect(motivosDaAcao(TODOS, "proposta")).toEqual(TODOS);
    expect(motivosDaAcao(["legado"], "proposta")).toEqual(["legado"]);
  });

  it("preço: todos exceto o próprio 'preco' (legado bloqueia)", () => {
    expect(motivosDaAcao(TODOS, "preco")).toEqual(["legado", "kit", "consumo", "parametros", "parametros_financeiros", "nao_comprovado"]);
    expect(motivosDaAcao(["legado"], "preco")).toEqual(["legado"]);
    expect(motivosDaAcao(["preco"], "preco")).toEqual([]);
  });

  it("contrato: só o que o afeta (kit, consumo, parametros, preco, nao_comprovado); ignora legado e parametros_financeiros", () => {
    expect(motivosDaAcao(TODOS, "contrato")).toEqual(["kit", "consumo", "parametros", "preco", "nao_comprovado"]);
    expect(motivosDaAcao(["legado"], "contrato")).toEqual([]);
    expect(motivosDaAcao(["legado", "parametros_financeiros"], "contrato")).toEqual([]);
  });

  it("linha legada que bate com o estado atual: proposta e preço bloqueados, contrato liberado", () => {
    const m = avaliarVigencia(CALCULO, atual()).motivos;
    expect(motivosDaAcao(m, "proposta")).toEqual(["legado"]);
    expect(motivosDaAcao(m, "preco")).toEqual(["legado"]);
    expect(motivosDaAcao(m, "contrato")).toEqual([]);
  });

  it("linha legada com o kit alterado: o contrato continua bloqueado (por kit)", () => {
    const m = avaliarVigencia(CALCULO, atual({ componentes: [modulos(11), ITENS_5_5[1]] })).motivos;
    expect(motivosDaAcao(m, "contrato")).toEqual(["kit"]);
  });

  it("linha legada com preço divergente: o contrato lista 'preco' (a guarda própria de preço, em contratos-geracao, é quem a ignora para legado)", () => {
    const m = avaliarVigencia(CALCULO, atual({ valorNegocio: 30000 })).motivos;
    expect(motivosDaAcao(m, "contrato")).toEqual(["preco"]);
    expect(motivosDaAcao(m, "preco")).toEqual(["legado"]);
  });

  it("é pura: não altera a lista recebida", () => {
    const m = [...TODOS];
    motivosDaAcao(m, "contrato");
    motivosDaAcao(m, "preco");
    expect(m).toEqual(TODOS);
  });
});

describe("calculoDesatualizado (compatibilidade): nunca vigente para linha existente", () => {
  it("sem cálculo: desatualizado", () => {
    expect(calculoDesatualizado(null, { componentes: KIT_5_5 })).toBe(true);
    expect(calculoDesatualizado(undefined, { componentes: KIT_5_5 })).toBe(true);
  });

  it("recorte de colunas só com a potência do kit, mesmo igual ao kit atual: true (legado), sem comparar", () => {
    expect(calculoDesatualizado({ kit_potencia_kwp: 5.5 }, { componentes: KIT_5_5 })).toBe(true);
    expect(calculoDesatualizado({ kit_potencia_kwp: 5.5 }, { componentes: [modulo(11), inversor()] })).toBe(true);
    expect(calculoDesatualizado({ kit_potencia_kwp: 5.5 }, { componentes: [] })).toBe(true);
  });

  it("linha completa e estado atual completo, tudo igual: ainda true", () => {
    expect(calculoDesatualizado(CALCULO, atual())).toBe(true);
  });

  it("é determinística e não altera os objetos", () => {
    const calculo = { kit_potencia_kwp: 5.5 };
    const a = { componentes: [modulo(11)] };
    const antes = structuredClone({ calculo, a });
    expect([1, 2, 3].map(() => calculoDesatualizado(calculo, a))).toEqual([true, true, true]);
    expect({ calculo, a }).toEqual(antes);
  });
});

describe("mensagens de recusa", () => {
  it("textos exatos do contrato (a interface e as ações dependem deles)", () => {
    expect(MENSAGEM_CALCULO_DESATUALIZADO).toBe("Último cálculo — desatualizado: o kit mudou depois dele. Complete os dados para recalcular.");
    expect(MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO).toBe("O kit mudou depois do último cálculo. Complete os dados e recalcule antes de gerar a proposta.");
    expect(MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO).toBe("O kit mudou depois do último cálculo. Recalcule antes de gerar o contrato.");
    expect(MENSAGEM_PRECO_CALCULO_DESATUALIZADO).toBe("O kit mudou depois do último cálculo: recalcule o kit antes de atualizar o preço.");
    expect(MENSAGEM_PRECO_CALCULO_LEGADO).toBe(
      "O cálculo salvo foi feito pela fórmula antiga, que não foi validada: o preço não pode ser atualizado nele. Recalcule o kit.",
    );
  });

  it("legado + proposta: com a regra aceita, o caminho é recalcular o kit", () => {
    expect(mensagemDeRecusa(["legado"], "proposta")).toBe(
      "O último cálculo foi feito pela fórmula antiga, que não foi validada. Recalcule o kit antes de gerar a proposta.",
    );
  });

  it("incompleta + proposta / preço: constantes próprias (completar os dados e recalcular)", () => {
    expect(mensagemDeRecusa(["incompleta"], "proposta")).toBe(MENSAGEM_PROPOSTA_CALCULO_INCOMPLETO);
    expect(mensagemDeRecusa(["incompleta", "kit"], "preco")).toBe(MENSAGEM_PRECO_CALCULO_INCOMPLETO);
  });

  it("desatualizado por entradas (R6.2) e regra tarifária: frase do motivo + recalcular", () => {
    expect(mensagemDeRecusa(["desatualizado_por_entradas"], "proposta")).toBe(
      "As entradas mudaram depois do último cálculo e ainda não há resultado novo. Recalcule o kit antes de gerar a proposta.",
    );
    expect(mensagemDeRecusa(["regra_tarifaria"], "preco")).toBe(
      "A tarifa oficial vigente, o percentual legal do Fio B ou o enquadramento mudaram depois do último cálculo. Recalcule o kit antes de atualizar o preço.",
    );
  });

  it("legado + preço: a constante do legado", () => {
    expect(mensagemDeRecusa(["legado"], "preco")).toBe(MENSAGEM_PRECO_CALCULO_LEGADO);
    expect(mensagemDeRecusa(["legado", "kit", "preco"], "preco")).toBe(MENSAGEM_PRECO_CALCULO_LEGADO);
  });

  it("legado + contrato: frase do motivo (na prática o contrato filtra o legado antes)", () => {
    expect(mensagemDeRecusa(["legado"], "contrato")).toBe("O último cálculo foi feito pela fórmula antiga, que não foi validada. Recalcule o kit antes de gerar o contrato.");
  });

  it("motivo principal = o de maior relevância: legado vence kit", () => {
    expect(mensagemDeRecusa(["kit", "legado"], "preco")).toBe(MENSAGEM_PRECO_CALCULO_LEGADO);
  });

  it.each<[AcaoBloqueada, string]>([
    ["proposta", MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO],
    ["contrato", MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO],
    ["preco", MENSAGEM_PRECO_CALCULO_DESATUALIZADO],
  ])("kit (sem legado) + %s: a constante da ação", (acao, constante) => {
    expect(mensagemDeRecusa(["kit", "consumo"], acao)).toBe(constante);
  });

  it("consumo, parâmetros, preço e não comprovado: frase do motivo + caminho", () => {
    expect(mensagemDeRecusa(["consumo"], "contrato")).toBe("O consumo ou a fatura mudou depois do último cálculo. Recalcule o kit antes de gerar o contrato.");
    expect(mensagemDeRecusa(["parametros"], "proposta")).toBe(
      "Os parâmetros da calculadora da empresa mudaram depois do último cálculo. Recalcule o kit antes de gerar a proposta.",
    );
    expect(mensagemDeRecusa(["preco"], "contrato")).toBe(
      "O valor do negócio mudou depois do último cálculo. Use “Atualizar preço no cálculo” antes de gerar o contrato.",
    );
    expect(mensagemDeRecusa(["nao_comprovado"], "proposta")).toBe(
      "Não foi possível comprovar que o último cálculo está atualizado. Recalcule o kit antes de gerar a proposta.",
    );
  });

  it("sem motivos: cai em não comprovado (nunca uma mensagem vazia)", () => {
    expect(mensagemDeRecusa([], "proposta")).toBe(
      "Não foi possível comprovar que o último cálculo está atualizado. Recalcule o kit antes de gerar a proposta.",
    );
  });

  it("textoDoMotivo: frase curta de cada motivo", () => {
    expect(textoDoMotivo("legado")).toBe("o último cálculo foi feito pela fórmula antiga, que não foi validada");
    expect(textoDoMotivo("kit")).toBe("o kit mudou depois do último cálculo");
    expect(textoDoMotivo("parametros_financeiros")).toBe("os parâmetros financeiros da calculadora mudaram depois do último cálculo");
  });
});

describe("linha completa (regra aceita): vigente enquanto a regra tarifária e as entradas não mudam", () => {
  const COPEL: TarifaGd = {
    id: "tarifa-copel",
    distribuidora: "COPEL-DIS",
    nomesAceitos: ["copel"],
    ato: "REH 3.592/2026",
    subgrupo: "B1",
    subclasse: "residencial",
    modalidade: "convencional",
    baseTributaria: "sem_tributos",
    teRsMwh: 310.85,
    tusdRsMwh: 457.17,
    fioBRsMwh: 214.535600374,
    vigenciaInicio: "2026-06-24",
    vigenciaFim: "2027-06-23",
    pendenciasFonte: ["tabela4_nao_conferida"],
  };
  const ctx = (o: Partial<ContextoEstimativa> = {}): ContextoEstimativa => ({
    dataReferencia: "2026-10-22",
    tipoCliente: "residencial",
    distribuidoraInformada: "Copel",
    tarifas: [COPEL],
    ...o,
  });
  const COMPLETO: CalculoParaVigencia = {
    ...CALCULO,
    estado_financeiro: "completo",
    enquadramento: "B1/residencial/convencional/GD_II",
    tarifa_gd_id: "tarifa-copel",
    percentual_legal_fio_b: 0.6,
    financeiro_desatualizado_em: null,
  };

  it("mesmas entradas e mesma regra: vigente; tarifa e ligação continuam não verificáveis", () => {
    expect(avaliarVigencia(COMPLETO, atual({ contexto: ctx() }))).toEqual({ vigente: true, motivos: [], naoVerificavel: ["tarifa", "tipo_ligacao"] });
    expect(calculoDesatualizado(COMPLETO, atual({ contexto: ctx() }))).toBe(false);
  });

  it("percentual e disponibilidade da EMPRESA não contam; o piso é o do art. 291 pela ligação", () => {
    const params = { ...PARAMETROS, percentual_fio_b: 0.99, disponibilidade_bi_kwh: 7 };
    expect(avaliarVigencia(COMPLETO, atual({ parametros: params, contexto: ctx() })).vigente).toBe(true);
    expect(avaliarVigencia({ ...COMPLETO, disponibilidade_kwh: 30 }, atual({ contexto: ctx() })).motivos).toEqual(["parametros_financeiros"]);
  });

  it("virada 2026 → 2027 (60% → 75%): regra_tarifaria, mesmo com a mesma linha da REH", () => {
    expect(avaliarVigencia(COMPLETO, atual({ contexto: ctx({ dataReferencia: "2026-12-31" }) })).vigente).toBe(true);
    expect(avaliarVigencia(COMPLETO, atual({ contexto: ctx({ dataReferencia: "2027-01-01" }) })).motivos).toEqual(["regra_tarifaria"]);
  });

  it("fim da vigência da REH (24/06/2027): regra_tarifaria, nunca reaproveita a componente", () => {
    const c2027 = { ...COMPLETO, percentual_legal_fio_b: 0.75 };
    expect(avaliarVigencia(c2027, atual({ contexto: ctx({ dataReferencia: "2027-06-23" }) })).vigente).toBe(true);
    expect(avaliarVigencia(c2027, atual({ contexto: ctx({ dataReferencia: "2027-06-24" }) })).motivos).toEqual(["regra_tarifaria"]);
  });

  it("qualificação mudou (tipo de cliente ou distribuidora): regra_tarifaria", () => {
    expect(avaliarVigencia(COMPLETO, atual({ contexto: ctx({ tipoCliente: "comercial" }) })).motivos).toEqual(["regra_tarifaria"]);
    expect(avaliarVigencia(COMPLETO, atual({ contexto: ctx({ distribuidoraInformada: "Cemig" }) })).motivos).toEqual(["regra_tarifaria"]);
  });

  it("sem contexto lido: não comprovado (nunca vigente)", () => {
    expect(avaliarVigencia(COMPLETO, atual()).motivos).toEqual(["nao_comprovado"]);
  });

  it("R6.2: marca de desatualização bloqueia proposta e preço, e o contrato a ignora", () => {
    const marcado = { ...COMPLETO, financeiro_desatualizado_em: "2026-10-22T12:00:00Z" };
    const v = avaliarVigencia(marcado, atual({ contexto: ctx() }));
    expect(v.motivos).toEqual(["desatualizado_por_entradas"]);
    expect(motivosDaAcao(v.motivos, "proposta")).toEqual(["desatualizado_por_entradas"]);
    expect(motivosDaAcao(v.motivos, "preco")).toEqual(["desatualizado_por_entradas"]);
    expect(motivosDaAcao(v.motivos, "contrato")).toEqual([]);
    expect(calculoDesatualizado(marcado, { componentes: ITENS_5_5 })).toBe(true);
  });

  it("contrato ignora regra_tarifaria (só financeira); kit e consumo continuam valendo para ele", () => {
    expect(motivosDaAcao(["regra_tarifaria", "kit", "consumo"], "contrato")).toEqual(["kit", "consumo"]);
  });

  it("preço: só o próprio `preco` sai da lista (\"bloquear preço\" = recusar a ação de sincronizar, nunca editar o valor)", () => {
    expect(motivosDaAcao(["preco"], "preco")).toEqual([]);
    const v = avaliarVigencia(COMPLETO, atual({ valorNegocio: 30000, contexto: ctx() }));
    expect(v.motivos).toEqual(["preco"]);
    expect(motivosDaAcao(v.motivos, "preco")).toEqual([]);
  });
});
