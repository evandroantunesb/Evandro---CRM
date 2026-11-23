import { describe, expect, it } from "vitest";
import { decimalAneel, extrairTarifas, nomesAceitos, PERDIDO as P, sqlCarga } from "../scripts/aneel/tarifas-regra.mjs";
import { normalizarNome } from "@/lib/tarifa-gd";

const N = "Não se aplica";
const APLICACAO = "Tarifa de Aplicação";

let proximoId = 1;
function linha(agente: string, inicio: string, fim: string, detalhe: "SCEE" | typeof N, componente: string, valor: string, extra: Record<string, string> = {}) {
  return {
    _id: proximoId++,
    DscResolucaoHomologatoria: "RESOLUÇÃO HOMOLOGATÓRIA Nº 3.592, DE 23 DE JUNHO DE 2026",
    SigNomeAgente: agente,
    NumCPFCNPJ: "04368898000106",
    DatInicioVigencia: inicio,
    DatFimVigencia: fim,
    DscBaseTarifaria: APLICACAO,
    DscSubGrupoTarifario: "B1",
    DscModalidadeTarifaria: "Convencional",
    DscClasseConsumidor: "Residencial",
    DscSubClasseConsumidor: "Residencial",
    DscDetalheConsumidor: detalhe,
    DscPostoTarifario: N,
    DscUnidade: "R$/MWh",
    SigNomeAgenteAcessante: N,
    DscComponenteTarifario: componente,
    VlrComponenteTarifario: valor,
    ...extra,
  };
}

/** As seis linhas de uma distribuidora/vigência (TE, TUSD e Fio B, nos detalhes "Não se aplica" e SCEE). */
function grupo(agente: string, inicio: string, fim: string, te: string, tusd: string, fioB: string) {
  return [
    linha(agente, inicio, fim, N, "TE", te),
    linha(agente, inicio, fim, N, "TUSD", tusd),
    linha(agente, inicio, fim, N, "TUSD_FioB", fioB),
    linha(agente, inicio, fim, "SCEE", "TE", "30,199999999999999"),
    linha(agente, inicio, fim, "SCEE", "TUSD", tusd),
    linha(agente, inicio, fim, "SCEE", "TUSD_FioB", fioB),
  ];
}

describe("decimalAneel", () => {
  it("tira o ruído de ponto flutuante arredondando em 9 casas, sem passar por Number", () => {
    expect(decimalAneel("310,85000000000002")).toBe("310.85");
    expect(decimalAneel("214,53560037400001")).toBe("214.535600374");
    expect(decimalAneel("30,199999999999999")).toBe("30.2");
    expect(decimalAneel("457,17000000000002")).toBe("457.17");
    expect(decimalAneel("100")).toBe("100");
    expect(decimalAneel("-28,02")).toBe("-28.02");
  });
});

describe("extrairTarifas", () => {
  it("Copel sai com os mesmos valores da migration 20261023210000", () => {
    const linhas = grupo("COPEL-DIS", "2026-06-24", "2027-06-23", "310,85000000000002", "457,17000000000002", "214,53560037400001");
    const { tarifas, recusadas } = extrairTarifas(linhas);
    expect(recusadas).toEqual([]);
    expect(tarifas).toHaveLength(1);
    expect(tarifas[0]).toMatchObject({
      distribuidora: "COPEL-DIS",
      cnpj: "04368898000106",
      ato: "REH 3.592/2026",
      vigenciaInicio: "2026-06-24",
      vigenciaFim: "2027-06-23",
      teRsMwh: "310.85",
      tusdRsMwh: "457.17",
      fioBRsMwh: "214.535600374",
    });
    expect(tarifas[0].fonteLinhas.TE).toEqual([linhas[0]._id]);
    expect(tarifas[0].fonteLinhas.TUSD).toEqual([linhas[1]._id]);
    expect(tarifas[0].fonteLinhas.TUSD_FioB_SCEE).toEqual([linhas[2]._id, linhas[5]._id]);
  });

  it("linhas duplicadas (mesmo conteúdo, _id diferente) contam uma vez e guardam os dois _id", () => {
    const linhas = grupo("CELESC", "2026-08-22", "2027-08-21", "300", "400", "200");
    const copia = { ...linhas[0], _id: 9999 };
    const { tarifas } = extrairTarifas([...linhas, copia]);
    expect(tarifas).toHaveLength(1);
    expect(tarifas[0].fonteLinhas.TE).toEqual([linhas[0]._id, 9999]);
  });

  it("ignora linhas fora da regra (outra base, detalhe, posto, unidade ou acessante)", () => {
    const linhas = grupo("CELESC", "2026-08-22", "2027-08-21", "300", "400", "200");
    const ruido = [
      linha("CELESC", "2026-08-22", "2027-08-21", N, "TE", "1", { DscBaseTarifaria: "CVA" }),
      linha("CELESC", "2026-08-22", "2027-08-21", N, "TE", "2", { DscBaseTarifaria: "Base Econômica" }),
      linha("CELESC", "2026-08-22", "2027-08-21", N, "TE", "3", { DscUnidade: "R$/kWh" }),
      linha("CELESC", "2026-08-22", "2027-08-21", N, "TE", "4", { DscPostoTarifario: "Ponta" }),
      linha("CELESC", "2026-08-22", "2027-08-21", N, "TE", "5", { DscModalidadeTarifaria: "Branca" }),
    ];
    const { tarifas, recusadas } = extrairTarifas([...linhas, ...ruido]);
    expect(recusadas).toEqual([]);
    expect(tarifas[0].teRsMwh).toBe("300");
  });

  it("sem a linha SCEE do Fio B a distribuidora é recusada", () => {
    const linhas = grupo("CELESC", "2026-08-22", "2027-08-21", "300", "400", "200").filter(
      (l) => !(l.DscDetalheConsumidor === "SCEE" && l.DscComponenteTarifario === "TUSD_FioB"),
    );
    const { tarifas, recusadas } = extrairTarifas(linhas);
    expect(tarifas).toEqual([]);
    expect(recusadas).toEqual([{ distribuidora: "CELESC", vigenciaInicio: "2026-08-22", motivo: "sem_fio_b_scee" }]);
  });

  it("componente sem linha recusa (ex.: sem TE)", () => {
    const linhas = grupo("CELESC", "2026-08-22", "2027-08-21", "300", "400", "200").filter((l) => !(l.DscDetalheConsumidor === N && l.DscComponenteTarifario === "TE"));
    expect(extrairTarifas(linhas).recusadas[0].motivo).toBe("sem_te");
  });

  it("valores diferentes do mesmo componente na mesma vigência recusam", () => {
    const linhas = [...grupo("CELESC", "2026-08-22", "2027-08-21", "300", "400", "200"), linha("CELESC", "2026-08-22", "2027-08-21", N, "TE", "301")];
    const r = extrairTarifas(linhas);
    expect(r.tarifas).toEqual([]);
    expect(r.recusadas[0].motivo).toBe("valores_divergentes");
  });

  it("Fio B diferente entre SCEE e 'Não se aplica' recusa", () => {
    const linhas = grupo("CELESC", "2026-08-22", "2027-08-21", "300", "400", "200").map((l) =>
      l.DscDetalheConsumidor === N && l.DscComponenteTarifario === "TUSD_FioB" ? { ...l, VlrComponenteTarifario: "201" } : l,
    );
    expect(extrairTarifas(linhas).recusadas[0].motivo).toBe("fio_b_divergente");
  });

  it("valor não positivo recusa", () => {
    const linhas = grupo("CELESC", "2026-08-22", "2027-08-21", "0", "400", "200");
    expect(extrairTarifas(linhas).recusadas[0].motivo).toBe("valor_nao_positivo");
  });

  it("duas vigências da mesma distribuidora saem como duas tarifas", () => {
    const linhas = [
      ...grupo("ENEL CE", "2026-04-22", "2026-08-25", "260,99000000000001", "488,77999999999997", "283,714420722"),
      ...grupo("ENEL CE", "2026-08-26", "2027-04-21", "213,25999999999999", "488,49000000000001", "283,714420722"),
    ];
    const { tarifas } = extrairTarifas(linhas);
    expect(tarifas.map((t) => [t.vigenciaInicio, t.teRsMwh])).toEqual([
      ["2026-04-22", "260.99"],
      ["2026-08-26", "213.26"],
    ]);
  });

  it("vigências sobrepostas da mesma distribuidora recusam as duas", () => {
    const linhas = [...grupo("ETO", "2026-07-04", "2026-09-30", "322", "683", "441"), ...grupo("ETO", "2026-08-26", "2027-07-03", "309", "683", "441")];
    const r = extrairTarifas(linhas);
    expect(r.tarifas).toEqual([]);
    expect(r.recusadas.map((x) => x.motivo)).toEqual(["vigencias_sobrepostas", "vigencias_sobrepostas"]);
  });

  it("nome com acento entra como está; corrompido ou 'Não Informado' é recusado", () => {
    const linhas = [
      ...grupo("CERMISSÕES", "2026-08-22", "2027-08-21", "300", "400", "200"),
      ...grupo("Âmbar Roraima", "2026-01-25", "2027-01-24", "300", "400", "200"),
      ...grupo(`Cera${P}${P}`, "2026-08-22", "2027-08-21", "300", "400", "200"),
      ...grupo("Não Informado", "2026-07-30", "2027-07-29", "300", "400", "200"),
    ];
    const { tarifas, recusadas } = extrairTarifas(linhas);
    expect(tarifas.map((t) => t.distribuidora).sort()).toEqual(["CERMISSÕES", "Âmbar Roraima"]);
    expect(recusadas.map((r) => [r.distribuidora, r.motivo]).sort()).toEqual([
      [`Cera${P}${P}`, "nome_corrompido"],
      ["Não Informado", "nome_nao_informado"],
    ]);
  });

  it("aceita a base e o detalhe com acento perdido (U+FFFD) do arquivo antigo da Copel", () => {
    const antigas = grupo("COPEL-DIS", "2026-06-24", "2027-06-23", "310,85000000000002", "457,17000000000002", "214,53560037400001").map((l) => ({
      ...l,
      DscBaseTarifaria: `Tarifa de Aplica${P}${P}o`,
      DscDetalheConsumidor: l.DscDetalheConsumidor === "SCEE" ? "SCEE" : `N${P}o se aplica`,
      DscPostoTarifario: `N${P}o se aplica`,
      SigNomeAgenteAcessante: `N${P}o se aplica`,
    }));
    expect(extrairTarifas(antigas).tarifas[0]?.teRsMwh).toBe("310.85");
  });
});

describe("nomesAceitos", () => {
  it("formas normalizadas da sigla; apelido curto só quando único", () => {
    const m = nomesAceitos(["ENEL CE", "ENEL RJ", "CEMIG-D", "CPFL-PAULISTA", "CPFL Santa Cruz"]);
    expect(m.get("CEMIG-D")).toEqual(expect.arrayContaining(["cemig-d", "cemig d", "cemig"]));
    expect(m.get("ENEL CE")).toEqual(expect.arrayContaining(["enel ce", "enel-ce"]));
    expect([...m.values()].flat()).not.toContain("enel");
    expect([...m.values()].flat()).not.toContain("cpfl");
  });

  it("nenhum nome em duas distribuidoras, nem nos reservados (Copel)", () => {
    const m = nomesAceitos(["COPEL-DIS", "ENEL CE", "ENEL RJ", "EQUATORIAL AL", "EQUATORIAL GO"], { reservados: ["copel", "copel-dis"] });
    const todos = [...m.values()].flat();
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos).not.toContain("copel");
  });

  it("usa a mesma normalização do app (normalizarNome)", () => {
    const m = nomesAceitos(["Neoenergia Brasília", "Âmbar Roraima"]);
    for (const nomes of m.values()) for (const n of nomes) expect(normalizarNome(n)).toBe(n);
    expect(m.get("Âmbar Roraima")).toContain("ambar roraima");
  });
});

describe("sqlCarga", () => {
  it("gera um insert com fonte, nomes e a pendência da Tabela 4", () => {
    const { tarifas } = extrairTarifas(grupo("CELESC", "2026-08-22", "2027-08-21", "300", "400", "200"));
    const sql = sqlCarga(tarifas, new Map([["CELESC", ["celesc"]]]), {
      recursoId: "e8717aa8-2521-453f-bf16-fbb9a16eea39",
      extraidaEm: "2026-11-23T10:00:00-03:00",
      sha256: "a".repeat(64),
    });
    expect(sql).toContain("insert into public.tarifas_gd_aneel");
    expect(sql).toContain("'CELESC', array['celesc']");
    expect(sql).toContain("300, 400, 200, date '2026-08-22', date '2027-08-21'");
    expect(sql).toContain("array['tabela4_nao_conferida']");
    expect(sql).toContain("'sem_tributos'");
  });

  it("escapa aspas simples", () => {
    const { tarifas } = extrairTarifas(grupo("D'OESTE", "2026-08-22", "2027-08-21", "300", "400", "200"));
    expect(sqlCarga(tarifas, new Map([["D'OESTE", ["d'oeste"]]]), { recursoId: "x", extraidaEm: "2026-11-23T10:00:00-03:00", sha256: "a".repeat(64) })).toContain("'D''OESTE'");
  });
});
