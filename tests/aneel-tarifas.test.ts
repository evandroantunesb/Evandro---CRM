// Parser e validador dos dados abertos de tarifas da ANEEL (M2-1). Só amostras SINTÉTICAS: distribuidoras,
// CNPJs e valores fictícios no formato real publicado (aspas, ";", vírgula decimal, ",00", "-,51").
// Nenhuma base da ANEEL é copiada para o repositório.
import { describe, expect, it } from "vitest";
import {
  CABECALHOS,
  cnpjValido,
  compararComAprovado,
  dataValida,
  ESCOPO_B2_RURAL,
  ESCOPO_INICIAL,
  lerArquivoAneel,
  lerNumeroAneel,
  separarLinha,
  verificarCobertura,
  verificarIntegridadeArquivo,
  type RegistroTarifario,
} from "@/lib/aneel/tarifas";

/** CNPJ fictício com dígitos verificadores válidos, a partir de 12 dígitos. */
function cnpjFicticio(base12: string) {
  const dv = (base: string, pesos: number[]) => {
    const resto = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
}
const CNPJ_A = cnpjFicticio("900000000001");
const CNPJ_B = cnpjFicticio("900000000002");

const q = (campos: string[]) => campos.map((c) => `"${c.replace(/"/g, '""')}"`).join(";");
const CAB_TARIFAS = q([...CABECALHOS.tarifas]);
const CAB_COMPONENTES = q([...CABECALHOS.componentes]);

type Linha = Partial<{
  agente: string; cnpj: string; res: string; ini: string; fim: string; base: string; sub: string; mod: string;
  classe: string; subclasse: string; detalhe: string; posto: string; unidade: string; tusd: string; te: string;
  comp: string; valor: string;
}>;

function linhaTarifa(l: Linha = {}) {
  return q([
    "2026-10-16", l.res ?? "RESOLUÇÃO HOMOLOGATÓRIA FICTÍCIA Nº 1", l.agente ?? "DISTRIBUIDORA FICTÍCIA A", l.cnpj ?? CNPJ_A,
    l.ini ?? "2026-06-24", l.fim ?? "2027-06-23", l.base ?? "Tarifa de Aplicação", l.sub ?? "B1", l.mod ?? "Convencional",
    l.classe ?? "Residencial", l.subclasse ?? "Residencial", l.detalhe ?? "Não se aplica", l.posto ?? "Não se aplica",
    l.unidade ?? "MWh", "Não se aplica", l.tusd ?? "450,00", l.te ?? "300,00",
  ]);
}

function linhaComponente(l: Linha = {}) {
  return q([
    "2026-10-13", l.res ?? "RESOLUÇÃO HOMOLOGATÓRIA FICTÍCIA Nº 1", l.agente ?? "DISTRIBUIDORA FICTÍCIA A", l.cnpj ?? CNPJ_A,
    l.ini ?? "2026-06-24", l.fim ?? "2027-06-23", l.base ?? "Tarifa de Aplicação", l.sub ?? "B1", l.mod ?? "Convencional",
    l.classe ?? "Residencial", l.subclasse ?? "Residencial", l.detalhe ?? "Não se aplica", l.posto ?? "Não se aplica",
    l.unidade ?? "R$/MWh", "Não se aplica", l.comp ?? "TUSD_FioB", l.valor ?? "200,529254993",
  ]);
}

const portao = (r: { portoes: { id: string; ok: boolean; detalhes: string[] }[] }, id: string) => r.portoes.find((p) => p.id === id)!;

describe("primitivas", () => {
  it("separa campos com aspas, aspas dobradas e campo sem aspas; recusa aspas abertas", () => {
    expect(separarLinha('"a";"b;c";"d""e"')).toEqual(["a", "b;c", 'd"e']);
    expect(separarLinha('"a";b;"c"')).toEqual(["a", "b", "c"]);
    expect(separarLinha('"a";"b')).toBeNull();
    expect(separarLinha('"a"x;"b"')).toBeNull();
  });

  it("lê números no formato da ANEEL, inclusive sem parte inteira e negativos", () => {
    expect(lerNumeroAneel(",00")).toBe(0);
    expect(lerNumeroAneel(",51")).toBe(0.51);
    expect(lerNumeroAneel("-,51")).toBe(-0.51);
    expect(lerNumeroAneel("-7,53")).toBe(-7.53);
    expect(lerNumeroAneel("338,17000000000002")).toBeCloseTo(338.17, 10);
    expect(lerNumeroAneel("457")).toBe(457);
    for (const invalido of ["", "-", ",", "1.234,56", "1,2,3", "12 3", "abc", "1e3", "0x10"]) expect(lerNumeroAneel(invalido)).toBeNull();
  });

  it("valida CNPJ pelos dígitos verificadores", () => {
    expect(cnpjValido(CNPJ_A)).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(false); // a base publica só dígitos
  });

  it("aceita só datas de calendário válidas", () => {
    expect(dataValida("2026-06-24")).toBe(true);
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("24/06/2026")).toBe(false);
  });

  it("integridade: tamanho igual ao Content-Length e última linha completa", () => {
    expect(verificarIntegridadeArquivo({ bytesRecebidos: 100, contentLength: 100, terminaComQuebraDeLinha: true }).ok).toBe(true);
    // Caso real desta preparação: download cortado (37,8 MB de 353 MB) parecia um arquivo válido.
    const cortado = verificarIntegridadeArquivo({ bytesRecebidos: 37_829_977, contentLength: 353_053_791, terminaComQuebraDeLinha: false });
    expect(cortado.ok).toBe(false);
    expect(cortado.detalhes.join(" ")).toContain("incompleto");
    expect(verificarIntegridadeArquivo({ bytesRecebidos: 10, contentLength: null, terminaComQuebraDeLinha: true }).ok).toBe(false);
  });
});

describe("leitura do conjunto de tarifas (TE e TUSD)", () => {
  it("normaliza o escopo inicial e converte R$/MWh para R$/kWh", () => {
    const r = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ te: "310,85", tusd: "457,17" }), ""]);
    expect(r.valida).toBe(true);
    expect(r.registros).toHaveLength(2);
    const te = r.registros.find((x) => x.componente === "TE")!;
    expect(te).toMatchObject({ escopo: "B1_RESIDENCIAL_CONVENCIONAL", cnpj: CNPJ_A, valorMwh: 310.85, valorKwh: 0.31085 });
    expect(r.registros.find((x) => x.componente === "TUSD")!.valorKwh).toBe(0.45717);
  });

  it("B3 entra pelo texto real da ANEEL (classe e subclasse 'Não se aplica')", () => {
    const r = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ sub: "B3", classe: "Não se aplica", subclasse: "Não se aplica" })]);
    expect(r.registros.map((x) => x.escopo)).toEqual(["B3_DEMAIS_CLASSES_CONVENCIONAL", "B3_DEMAIS_CLASSES_CONVENCIONAL"]);
  });

  it("fica fora do escopo, sem interpretar: SCEE, Branca, pré-pagamento, tarifa social, Base Econômica, CVA e B2 (desligado)", () => {
    const r = lerArquivoAneel("tarifas", [
      CAB_TARIFAS,
      linhaTarifa({ detalhe: "SCEE", te: "30,20" }),
      linhaTarifa({ mod: "Branca", posto: "Ponta" }),
      linhaTarifa({ mod: "Convencional pré-pagamento" }),
      linhaTarifa({ subclasse: "Residencial Tarifa Social – faixa 01" }),
      linhaTarifa({ base: "Base Econômica" }),
      linhaTarifa({ base: "CVA", te: "-,51" }),
      linhaTarifa({ sub: "B2", classe: "Rural", subclasse: "Não se aplica" }),
    ]);
    expect(r.valida).toBe(true);
    expect(r.registros).toHaveLength(0);
    expect(r.contagens).toMatchObject({ scceIgnoradas: 1, foraDoEscopo: 6 });
  });

  it("B2 rural só entra quando o escopo for ligado explicitamente", () => {
    const linhas = [CAB_TARIFAS, linhaTarifa({ sub: "B2", classe: "Rural", subclasse: "Não se aplica" })];
    expect(lerArquivoAneel("tarifas", linhas).registros).toHaveLength(0);
    expect(lerArquivoAneel("tarifas", linhas, [...ESCOPO_INICIAL, ESCOPO_B2_RURAL]).registros).toHaveLength(2);
  });

  it("aceita BOM e CRLF sem mudar o conteúdo", () => {
    const r = lerArquivoAneel("tarifas", [`﻿${CAB_TARIFAS}\r`, `${linhaTarifa()}\r`]);
    expect(r.valida).toBe(true);
    expect(r.registros).toHaveLength(2);
  });

  it("duplicatas idênticas são unificadas e contadas; valores conflitantes reprovam", () => {
    const iguais = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa(), linhaTarifa(), linhaTarifa()]);
    expect(iguais.valida).toBe(true);
    expect(iguais.registros).toHaveLength(2);
    expect(iguais.contagens.duplicadasIdenticas).toBe(4); // 2 linhas repetidas × (TE + TUSD)

    const conflito = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ te: "300,00" }), linhaTarifa({ te: "301,00" })]);
    expect(conflito.valida).toBe(false);
    expect(portao(conflito, "duplicidades").detalhes[0]).toContain("conflitantes");
  });
});

describe("portões que reprovam a carga", () => {
  it("cabeçalho diferente (coluna renomeada ou nova) reprova sem interpretar nada", () => {
    const renomeado = CAB_TARIFAS.replace("VlrTE", "VlrTarifaEnergia");
    const r = lerArquivoAneel("tarifas", [renomeado, linhaTarifa()]);
    expect(r.valida).toBe(false);
    expect(portao(r, "cabecalho").ok).toBe(false);
    expect(r.registros).toHaveLength(0);
    expect(lerArquivoAneel("tarifas", []).valida).toBe(false); // arquivo vazio
  });

  it("linha cortada (aspas abertas) ou com colunas a mais/menos reprova a estrutura", () => {
    const cortada = linhaTarifa().slice(0, 60);
    const r = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa(), cortada, `${linhaTarifa()};"extra"`]);
    expect(r.valida).toBe(false);
    expect(portao(r, "estrutura").detalhes).toHaveLength(2);
  });

  it("CNPJ inválido reprova", () => {
    const r = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ cnpj: "12345678000100" })]);
    expect(portao(r, "cnpj").ok).toBe(false);
  });

  it("unidade inesperada reprova (energia é MWh no conjunto de tarifas e R$/MWh no de componentes)", () => {
    expect(portao(lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ unidade: "kW" })]), "unidades").ok).toBe(false);
    expect(portao(lerArquivoAneel("componentes", [CAB_COMPONENTES, linhaComponente({ unidade: "R$/kWh" })]), "unidades").ok).toBe(false);
  });

  it("valor ilegível ou negativo em tarifa de aplicação reprova; nunca vira zero", () => {
    const r = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ te: "1.234,56", tusd: "-7,53" })]);
    expect(r.valida).toBe(false);
    expect(portao(r, "valores").detalhes).toHaveLength(2);
    expect(r.registros).toHaveLength(0);
  });

  it("vigência inválida, invertida ou sobreposta reprova", () => {
    expect(portao(lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ ini: "2026-13-01" })]), "vigencia").ok).toBe(false);
    expect(portao(lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ ini: "2027-01-01", fim: "2026-01-01" })]), "vigencia").ok).toBe(false);
    const sobreposta = lerArquivoAneel("tarifas", [
      CAB_TARIFAS,
      linhaTarifa({ ini: "2025-06-24", fim: "2026-06-23" }),
      linhaTarifa({ ini: "2026-06-01", fim: "2027-05-31", te: "320,00" }),
    ]);
    expect(portao(sobreposta, "vigencia").detalhes.join(" ")).toContain("sobrepostas");
    // Vigências consecutivas (fim de uma, início da outra no dia seguinte) são normais.
    const consecutivas = lerArquivoAneel("tarifas", [
      CAB_TARIFAS,
      linhaTarifa({ ini: "2025-06-24", fim: "2026-06-23" }),
      linhaTarifa({ ini: "2026-06-24", fim: "2027-06-23", te: "320,00" }),
    ]);
    expect(consecutivas.valida).toBe(true);
  });
});

describe("conjunto de componentes (Fio B)", () => {
  it("lê TUSD_FioB e ignora componentes fora do catálogo", () => {
    const r = lerArquivoAneel("componentes", [
      CAB_COMPONENTES,
      linhaComponente({ comp: "TUSD_FioB", valor: "214,53560037400001" }),
      linhaComponente({ comp: "TUSD_PeD", valor: "3,10" }),
      linhaComponente({ comp: "TE", valor: "310,85" }),
    ]);
    expect(r.valida).toBe(true);
    expect(r.registros.map((x) => x.componente).sort()).toEqual(["TE", "TUSD_FioB"]);
    expect(r.registros.find((x) => x.componente === "TUSD_FioB")!.valorKwh).toBeCloseTo(0.214535600374, 9);
  });
});

describe("cobertura e consistência entre os dois conjuntos", () => {
  const hoje = "2026-10-16";
  const tarifas = lerArquivoAneel("tarifas", [
    CAB_TARIFAS,
    linhaTarifa({ te: "310,85", tusd: "457,17" }),
    linhaTarifa({ agente: "DISTRIBUIDORA FICTÍCIA B", cnpj: CNPJ_B, te: "290,20", tusd: "449,25" }),
  ]).registros;

  it("aponta distribuidora sem Fio B utilizável, em vez de inventar valor", () => {
    const componentes = lerArquivoAneel("componentes", [
      CAB_COMPONENTES,
      linhaComponente({ comp: "TUSD_FioB", valor: "214,53" }),
      linhaComponente({ agente: "DISTRIBUIDORA FICTÍCIA B", cnpj: CNPJ_B, comp: "TUSD_FioB", valor: ",00" }),
    ]).registros;
    const { cobertura } = verificarCobertura(tarifas, componentes, hoje);
    expect(cobertura.ok).toBe(false);
    expect(cobertura.detalhes).toEqual(["DISTRIBUIDORA FICTÍCIA B B1_RESIDENCIAL_CONVENCIONAL: sem TUSD Fio B utilizável (exigirá valor manual justificado)"]);
  });

  it("TE/TUSD diferentes entre os conjuntos reprovam a consistência", () => {
    const componentes = lerArquivoAneel("componentes", [
      CAB_COMPONENTES,
      linhaComponente({ comp: "TUSD_FioB", valor: "214,53" }),
      linhaComponente({ comp: "TE", valor: "310,85" }),
      linhaComponente({ agente: "DISTRIBUIDORA FICTÍCIA B", cnpj: CNPJ_B, comp: "TUSD_FioB", valor: "200,52" }),
      linhaComponente({ agente: "DISTRIBUIDORA FICTÍCIA B", cnpj: CNPJ_B, comp: "TE", valor: "295,00" }),
    ]).registros;
    const { cobertura, consistencia } = verificarCobertura(tarifas, componentes, hoje);
    expect(cobertura.ok).toBe(true);
    expect(consistencia.detalhes).toEqual(["DISTRIBUIDORA FICTÍCIA B B1_RESIDENCIAL_CONVENCIONAL TE: 290.2 (tarifas) × 295 (componentes)"]);
  });

  it("vigência que não cobre a data de referência não conta como coberta", () => {
    const antigas = lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ ini: "2024-06-24", fim: "2025-06-23" })]).registros;
    const { cobertura } = verificarCobertura(antigas, [], hoje);
    expect(cobertura.ok).toBe(true); // nada vigente: nada a cobrir (a falta aparece na lista de agentes sem vigência)
  });
});

describe("comparação com o catálogo aprovado", () => {
  const base = (te: string, ini = "2026-06-24", fim = "2027-06-23") =>
    lerArquivoAneel("tarifas", [CAB_TARIFAS, linhaTarifa({ te, ini, fim })]).registros;

  it("reajuste normal: só vigências novas entram, sem regressão", () => {
    const aprovado = base("300,00", "2025-06-24", "2026-06-23");
    const novo = [...aprovado, ...base("320,00")];
    const { diferencas, regressoes } = compararComAprovado(aprovado, novo);
    expect(regressoes.ok).toBe(true);
    expect(diferencas.novas).toHaveLength(2);
  });

  it("vigência publicada alterada, removida ou zerada reprova (exige revisão humana)", () => {
    const aprovado = base("300,00");
    expect(compararComAprovado(aprovado, base("305,00")).regressoes.ok).toBe(false);
    expect(compararComAprovado(aprovado, []).diferencas.removidas).toHaveLength(2);
    const zerado: RegistroTarifario[] = aprovado.map((r) => (r.componente === "TE" ? { ...r, valorMwh: 0, valorKwh: 0 } : r));
    const { diferencas, regressoes } = compararComAprovado(aprovado, zerado);
    expect(diferencas.zeradas).toHaveLength(1);
    expect(regressoes.ok).toBe(false);
  });
});
