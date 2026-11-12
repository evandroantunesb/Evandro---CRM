import { describe, expect, it } from "vitest";
import { TELAS_OPCIONAIS, TELAS_PADRAO, areaLigada, avisoTelas, lerDesligadas, lerSetoresDesligados, telasDaEmpresa } from "@/lib/telas-empresa";

const pro = (desligadas: string[] = [], eletropostoLiberado = true, setoresDesligados: string[] = []) =>
  telasDaEmpresa({ produto: "pro", desligadas, setoresDesligados, eletropostoLiberado });

describe("telas da empresa", () => {
  it("PRO sem nada desligado e Eletroposto liberado: as sete telas, a Engenharia e as áreas do PRO", () => {
    const t = pro();
    expect(TELAS_OPCIONAIS.every((tela) => areaLigada(t, tela))).toBe(true);
    expect(areaLigada(t, "pro")).toBe(true);
    expect(areaLigada(t, "engenharia")).toBe(true);
  });

  it("Eletroposto só com a liberação do super-admin", () => {
    expect(areaLigada(pro([], false), "eletroposto")).toBe(false);
    expect(areaLigada(pro(["eletroposto"], true), "eletroposto")).toBe(false);
  });

  it("as desligadas somem; as outras continuam; valor desconhecido é ignorado", () => {
    const t = pro(["forecast", "gamificacao", "xyz"]);
    expect(areaLigada(t, "forecast")).toBe(false);
    expect(areaLigada(t, "gamificacao")).toBe(false);
    expect(areaLigada(t, "obras")).toBe(true);
    expect(t.ligadas.size).toBe(5);
  });

  it("Solo: nenhuma tela opcional nem área do PRO, mesmo com tudo liberado", () => {
    const t = telasDaEmpresa({ produto: "solo", desligadas: [], setoresDesligados: [], eletropostoLiberado: true });
    expect(t.solo).toBe(true);
    expect(t.ligadas.size).toBe(0);
    expect(areaLigada(t, "pro")).toBe(false);
    expect(areaLigada(t, "engenharia")).toBe(false);
    expect(t.setoresDesligados.size).toBe(0);
  });

  it("Engenharia não é tela opcional", () => {
    expect((TELAS_OPCIONAIS as readonly string[]).includes("engenharia")).toBe(false);
  });

  it("PRO com Engenharia desligada: área engenharia desligada, obras ligada", () => {
    const t = pro([], true, ["engenharia"]);
    expect(areaLigada(t, "engenharia")).toBe(false);
    expect(areaLigada(t, "obras")).toBe(true);
    expect([...t.setoresDesligados]).toEqual(["engenharia"]);
  });

  it("PRO com só o Administrativo desligado: a área engenharia continua", () => {
    expect(areaLigada(pro([], true, ["administrativo"]), "engenharia")).toBe(true);
  });

  it("padrão (leitura falhou): PRO com tudo ligado, menos o Eletroposto", () => {
    expect(TELAS_PADRAO.solo).toBe(false);
    expect(areaLigada(TELAS_PADRAO, "obras")).toBe(true);
    expect(areaLigada(TELAS_PADRAO, "eletroposto")).toBe(false);
  });
});

describe("avisoTelas", () => {
  it("Captura ligada sem Leads a distribuir: os leads ficam na fila sem ninguém para aprovar", () => {
    expect(avisoTelas(["captura", "obras"])).toBe(
      "Com a Captura de leads ligada e Leads a distribuir desligada, os leads que chegam pelo formulário ficam na fila sem ninguém para aprovar.",
    );
    expect(avisoTelas(["captura", "leads"])).toBeNull();
    expect(avisoTelas(["obras"])).toBeNull();
  });
});

describe("lerDesligadas", () => {
  it("aceita a lista das chaves conhecidas, sem repetir", () => {
    expect(lerDesligadas('["forecast","obras","forecast"]')).toEqual(["forecast", "obras"]);
    expect(lerDesligadas("[]")).toEqual([]);
  });

  it("recusa chave desconhecida e texto que não é lista", () => {
    expect(lerDesligadas('["financeiro"]')).toBeNull();
    expect(lerDesligadas("nada")).toBeNull();
    expect(lerDesligadas('{"a":1}')).toBeNull();
  });

  it("recusa \"engenharia\" (agora é setor)", () => {
    expect(lerDesligadas('["engenharia"]')).toBeNull();
  });
});

describe("lerSetoresDesligados", () => {
  it("aceita Engenharia e Administrativo, sem repetir", () => {
    expect(lerSetoresDesligados('["administrativo"]')).toEqual(["administrativo"]);
    expect(lerSetoresDesligados('["engenharia","administrativo","engenharia"]')).toEqual(["engenharia", "administrativo"]);
    expect(lerSetoresDesligados("[]")).toEqual([]);
  });

  it("recusa Compras, Operacional e texto inválido", () => {
    expect(lerSetoresDesligados('["compras"]')).toBeNull();
    expect(lerSetoresDesligados('["operacional"]')).toBeNull();
    expect(lerSetoresDesligados("nada")).toBeNull();
    expect(lerSetoresDesligados('{"a":1}')).toBeNull();
  });
});
