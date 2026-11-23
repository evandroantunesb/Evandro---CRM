/**
 * Tarifas ANEEL de todas as distribuidoras (migration 20261219100000, item 6 entrega 1). A carga é gerada por
 * scripts/aneel/gerar-tarifas.mjs (fonte em .aurora/fontes/aneel-componentes-2026-b1-todas.json).
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { COLUNAS_TARIFA_GD, ENQUADRAMENTO_P0, resolverTarifa, tarifaGdDaLinha, type TarifaGd } from "@/lib/tarifa-gd";
import { criarUsuario, servico } from "./ajuda";

type Fonte = { carregadas: { distribuidora: string; vigencia_inicio: string }[] };
const fonte: Fonte = JSON.parse(readFileSync(".aurora/fontes/aneel-componentes-2026-b1-todas.json", "utf8"));

let tarifas: TarifaGd[];
let linhas: { distribuidora: string; nomes_aceitos: string[]; pendencias_fonte: string[]; base_tributaria: string }[];

beforeAll(async () => {
  const { data, error } = await servico.from("tarifas_gd_aneel").select(COLUNAS_TARIFA_GD);
  if (error) throw error;
  tarifas = data.map(tarifaGdDaLinha);
  linhas = data;
});

describe("tarifas_gd_aneel com todas as distribuidoras", () => {
  it("carrega todas as distribuidoras/vigências da fonte, além da Copel", () => {
    expect(new Set(tarifas.map((t) => t.distribuidora)).size).toBe(new Set(fonte.carregadas.map((c) => c.distribuidora)).size + 1);
    for (const c of fonte.carregadas) expect(tarifas.some((t) => t.distribuidora === c.distribuidora && t.vigenciaInicio === c.vigencia_inicio)).toBe(true);
  });

  it("a linha da Copel continua a mesma", () => {
    const copel = tarifas.filter((t) => t.distribuidora === "COPEL-DIS");
    expect(copel).toHaveLength(1);
    expect(copel[0]).toMatchObject({ ato: "REH 3.592/2026", teRsMwh: 310.85, tusdRsMwh: 457.17, fioBRsMwh: 214.535600374, vigenciaInicio: "2026-06-24" });
  });

  it("nenhum nome aceito casa com duas distribuidoras", () => {
    const dono = new Map<string, string>();
    for (const l of linhas)
      for (const n of l.nomes_aceitos) {
        expect(dono.get(n) ?? l.distribuidora, `nome "${n}"`).toBe(l.distribuidora);
        dono.set(n, l.distribuidora);
      }
  });

  it("linhas novas: sem tributos e com a pendência da Tabela 4", () => {
    for (const l of linhas.filter((x) => x.distribuidora !== "COPEL-DIS")) {
      expect(l.base_tributaria).toBe("sem_tributos");
      expect(l.pendencias_fonte).toEqual(["tabela4_nao_conferida"]);
    }
  });

  it("distribuidora informada por texto livre casa com a tarifa oficial vigente", () => {
    const r = resolverTarifa(tarifas, "Cemig", ENQUADRAMENTO_P0, "2026-12-01");
    expect(r.situacao).toBe("ok");
    expect(r.situacao === "ok" && r.tarifa.distribuidora).toBe("CEMIG-D");
    // Duas vigências no ano: escolhe pela data.
    const antes = resolverTarifa(tarifas, "ENEL CE", ENQUADRAMENTO_P0, "2026-05-01");
    const depois = resolverTarifa(tarifas, "enel-ce", ENQUADRAMENTO_P0, "2026-12-01");
    expect(antes.situacao === "ok" && antes.tarifa.vigenciaInicio).toBe("2026-04-22");
    expect(depois.situacao === "ok" && depois.tarifa.vigenciaInicio).toBe("2026-08-26");
    // Apelido ambíguo não casa com ninguém.
    expect(resolverTarifa(tarifas, "Enel", ENQUADRAMENTO_P0, "2026-12-01").situacao).toBe("sem_tarifa");
  });

  it("usuário do app continua só lendo", async () => {
    const { cliente } = await criarUsuario("tarifas-leitura");
    const { data } = await cliente.from("tarifas_gd_aneel").select("id").limit(1);
    expect(data?.length).toBe(1);
    const { error } = await cliente.from("tarifas_gd_aneel").update({ te_rs_mwh: 1 }).eq("distribuidora", "CEMIG-D");
    expect(error).not.toBeNull();
  });
});
