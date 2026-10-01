/** Status técnico do catálogo, preview da importação CSV e campos de formulário sem NaN (Evandro, 2026-10-01). */
import { describe, expect, it } from "vitest";
import { analisarCsv, linhasParaObjetos } from "@/lib/csv";
import {
  camposTecnicosFaltantesEquipamento,
  gerarModeloCsv,
  linhaCsvParaEquipamento,
  participaDoMotor,
  prepararPreviewImportacao,
  statusTecnicoExibido,
  statusTecnicoResultante,
} from "@/lib/equipamentos";
import { numeroParaCampo } from "@/lib/formatacao";

const MODULO_COMPLETO = { voc_v: 48.96, vmp_v: 40.74, isc_a: 16.12, imp_a: 15.22, coef_temp_voc_pct_c: -0.25 };
const INVERSOR_COMPLETO = {
  tensao_max_dc_v: 1100,
  mppt_min_v: 160,
  mppt_max_v: 1000,
  corrente_max_entrada_a: 12.5,
  quantidade_mppt: 2,
};

describe("camposTecnicosFaltantesEquipamento", () => {
  it("módulo completo não tem faltantes", () => {
    expect(camposTecnicosFaltantesEquipamento("modulo", MODULO_COMPLETO)).toEqual([]);
  });

  it("aponta só os campos do próprio tipo, com os mesmos rótulos do motor", () => {
    expect(camposTecnicosFaltantesEquipamento("modulo", { ...MODULO_COMPLETO, voc_v: null })).toEqual(["Voc (V)"]);
    expect(camposTecnicosFaltantesEquipamento("inversor", { ...INVERSOR_COMPLETO, quantidade_mppt: undefined })).toEqual([
      "Quantidade de MPPTs",
    ]);
  });
});

describe("statusTecnicoResultante", () => {
  it("deriva completo/incompleto dos dados", () => {
    expect(statusTecnicoResultante("incompleto", true)).toBe("completo");
    expect(statusTecnicoResultante("completo", false)).toBe("incompleto");
  });

  it("mantém escolha manual com dados completos", () => {
    expect(statusTecnicoResultante("verificado", true)).toBe("verificado");
    expect(statusTecnicoResultante("em_revisao", true)).toBe("em_revisao");
  });

  it("verificado/em revisão sem dados completos volta pra incompleto", () => {
    expect(statusTecnicoResultante("verificado", false)).toBe("incompleto");
    expect(statusTecnicoResultante("em_revisao", false)).toBe("incompleto");
  });

  it("descontinuado vale sempre", () => {
    expect(statusTecnicoResultante("descontinuado", false)).toBe("descontinuado");
    expect(statusTecnicoResultante("descontinuado", true)).toBe("descontinuado");
  });
});

describe("participaDoMotor", () => {
  it("incompleto, em revisão e descontinuado ficam fora do motor automático", () => {
    expect(participaDoMotor("incompleto")).toBe(false);
    expect(participaDoMotor("em_revisao")).toBe(false);
    expect(participaDoMotor("descontinuado")).toBe(false);
  });

  it("completo e verificado participam", () => {
    expect(participaDoMotor("completo")).toBe(true);
    expect(participaDoMotor("verificado")).toBe(true);
  });

  it("banco sem a coluna (undefined) mantém o comportamento anterior", () => {
    expect(participaDoMotor(undefined)).toBe(true);
  });
});

describe("statusTecnicoExibido", () => {
  it("usa o status gravado quando existe", () => {
    expect(statusTecnicoExibido("modulo", { ...MODULO_COMPLETO, status_tecnico: "verificado" })).toBe("verificado");
  });

  it("sem coluna no banco, calcula pelos dados", () => {
    expect(statusTecnicoExibido("modulo", MODULO_COMPLETO)).toBe("completo");
    expect(statusTecnicoExibido("inversor", {})).toBe("incompleto");
  });
});

describe("gerarModeloCsv", () => {
  it("gera um modelo que a própria importação aceita, uma linha de cada tipo", () => {
    const linhas = linhasParaObjetos(analisarCsv(gerarModeloCsv()));
    expect(linhas).toHaveLength(2);
    const [modulo, inversor] = linhas.map(linhaCsvParaEquipamento);
    expect(modulo.ok && modulo.valores.tipo).toBe("modulo");
    expect(inversor.ok && inversor.valores.tipo).toBe("inversor");
    const preview = prepararPreviewImportacao(linhas, []);
    expect(preview.avisos).toEqual([]);
    expect(preview.validas.map((v) => v.statusTecnico)).toEqual(["completo", "completo"]);
  });
});

describe("prepararPreviewImportacao", () => {
  const cabecalho = "tipo,fabricante,modelo,potencia_wp,voc_v,vmp_v,isc_a,imp_a,coef_temp_voc_pct_c,coluna_extra";
  const csv = [
    cabecalho,
    "modulo,Gokin,GK-620,620,48.96,40.74,16.12,15.22,-0.25,x",
    "modulo,Gokin,GK-600,600,,,,,,",
    "bateria,Gokin,B1,1000,,,,,,",
    "modulo,Gokin,GK-620,625,48.96,40.74,16.12,15.22,-0.25,",
  ].join("\n");
  const linhas = linhasParaObjetos(analisarCsv(csv));

  it("separa válidas, erros e duplicados (vale a última ocorrência)", () => {
    const preview = prepararPreviewImportacao(linhas, []);
    expect(preview.totalLinhas).toBe(4);
    expect(preview.erros).toEqual([{ linha: 4, erro: expect.stringContaining("tipo inválido") }]);
    expect(preview.duplicados).toEqual([{ linha: 5, repeteLinha: 2, descricao: "Gokin GK-620" }]);
    expect(preview.validas.map((v) => [v.linha, v.modelo, v.potenciaW])).toEqual([
      [3, "GK-600", 600],
      [5, "GK-620", 625],
    ]);
  });

  it("marca incompletos com os campos faltantes", () => {
    const preview = prepararPreviewImportacao(linhas, []);
    const gk600 = preview.validas.find((v) => v.modelo === "GK-600")!;
    expect(gk600.statusTecnico).toBe("incompleto");
    expect(gk600.faltantes).toContain("Voc (V)");
  });

  it("avisa colunas não reconhecidas", () => {
    const preview = prepararPreviewImportacao(linhas, []);
    expect(preview.avisos.some((a) => a.includes("coluna_extra"))).toBe(true);
  });

  it("avisa colunas técnicas ausentes no cabeçalho", () => {
    const semVoc = linhasParaObjetos(analisarCsv("tipo,fabricante,modelo,potencia_wp\nmodulo,A,B,500"));
    const preview = prepararPreviewImportacao(semVoc, []);
    expect(preview.avisos.some((a) => a.includes("voc_v"))).toBe(true);
    expect(preview.validas[0].statusTecnico).toBe("incompleto");
  });

  it("identifica atualização de existente e preserva status manual", () => {
    const preview = prepararPreviewImportacao(linhas, [
      { tipo: "modulo", fabricante: "Gokin", modelo: "GK-620", status_tecnico: "verificado" },
    ]);
    const gk620 = preview.validas.find((v) => v.modelo === "GK-620")!;
    expect(gk620.acao).toBe("atualiza");
    expect(gk620.statusTecnico).toBe("verificado");
    expect(preview.validas.find((v) => v.modelo === "GK-600")!.acao).toBe("novo");
  });
});

describe("numeroParaCampo", () => {
  it("nunca devolve NaN/undefined/null", () => {
    expect(numeroParaCampo(undefined)).toBe("");
    expect(numeroParaCampo(null)).toBe("");
    expect(numeroParaCampo(Number.NaN)).toBe("");
  });

  it("usa o padrão quando o valor falta", () => {
    expect(numeroParaCampo(undefined, { padrao: 0.2, escala: 100 })).toBe("20");
    expect(numeroParaCampo(undefined, { padrao: 0 })).toBe("0");
  });

  it("formata em BR e arredonda lixo de ponto flutuante", () => {
    expect(numeroParaCampo(0.29, { escala: 100 })).toBe("29");
    expect(numeroParaCampo(4.5)).toBe("4,5");
    expect(numeroParaCampo("120.5")).toBe("120,5");
  });
});
