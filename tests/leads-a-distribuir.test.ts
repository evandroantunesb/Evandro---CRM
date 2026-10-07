/**
 * Fila "Leads a distribuir" (PR 2 da reorganização de navegação): o seletor oferece os mesmos
 * papéis que o rodízio sugere (vendedor e SDR), pré-seleciona o sugerido quando ainda é
 * candidato e nunca cai sozinho no primeiro vendedor; o sininho separa a fila das demais
 * pendências. Funções puras — não precisa de banco.
 */
import { describe, expect, it } from "vitest";
import type { MembroResumo } from "@/lib/crm";
import { candidatosDistribuicao, responsavelPadrao } from "@/lib/distribuicao-leads";
import { linksPendencias } from "@/lib/pendencias";

const membro = (id: string, papel: string, ativo = true): MembroResumo => ({ id, nome: id, papel, ativo });

const membros = [
  membro("vendedor-1", "vendedor"),
  membro("sdr-1", "sdr"),
  membro("vendedor-inativo", "vendedor", false),
  membro("sdr-inativo", "sdr", false),
  membro("gestor-1", "gestor"),
  membro("admin-1", "admin"),
];

describe("candidatosDistribuicao", () => {
  const candidatos = candidatosDistribuicao(membros).map((m) => m.id);

  it("inclui SDR ativo", () => {
    expect(candidatos).toContain("sdr-1");
  });

  it("mantém vendedor ativo disponível", () => {
    expect(candidatos).toContain("vendedor-1");
  });

  it("deixa de fora papéis que não são vendedor/SDR e membros inativos", () => {
    expect(candidatos).toEqual(["vendedor-1", "sdr-1"]);
  });
});

describe("responsavelPadrao", () => {
  const candidatos = candidatosDistribuicao(membros);

  it("pré-seleciona o SDR sugerido pelo rodízio", () => {
    expect(responsavelPadrao(candidatos, "sdr-1")).toBe("sdr-1");
  });

  it("pré-seleciona o vendedor sugerido", () => {
    expect(responsavelPadrao(candidatos, "vendedor-1")).toBe("vendedor-1");
  });

  it("sugerido que deixou de ser candidato não vira o primeiro vendedor: exige escolha", () => {
    expect(responsavelPadrao(candidatos, "sdr-inativo")).toBe("");
    expect(responsavelPadrao(candidatos, "gestor-1")).toBe("");
  });
});

describe("linksPendencias (sininho)", () => {
  it("admin/gestor: separa leads a distribuir (/leads-a-distribuir) das demais pendências (/painel)", () => {
    for (const papel of ["admin", "gestor"]) {
      expect(linksPendencias(papel, { leadsADistribuir: 3, demais: 2 })).toEqual([
        { href: "/leads-a-distribuir", texto: "3 leads a distribuir" },
        { href: "/painel", texto: "2 pendências" },
      ]);
    }
  });

  it("admin/gestor: só a fila quando não há outras pendências", () => {
    expect(linksPendencias("gestor", { leadsADistribuir: 1, demais: 0 })).toEqual([
      { href: "/leads-a-distribuir", texto: "1 lead a distribuir" },
    ]);
  });

  it("admin/gestor: sem nada pendente mantém o link de sempre para o Painel", () => {
    expect(linksPendencias("admin", { leadsADistribuir: 0, demais: 0 })).toEqual([{ href: "/painel", texto: "Nenhuma pendência" }]);
    expect(linksPendencias("admin", { leadsADistribuir: 0, demais: 1 })).toEqual([{ href: "/painel", texto: "1 pendência" }]);
  });

  it("vendedor/SDR: comportamento atual, tudo para /inicio e sem fila", () => {
    for (const papel of ["vendedor", "sdr"]) {
      expect(linksPendencias(papel, { leadsADistribuir: 0, demais: 4 })).toEqual([{ href: "/inicio", texto: "4 pendências" }]);
      expect(linksPendencias(papel, { leadsADistribuir: 0, demais: 0 })).toEqual([{ href: "/inicio", texto: "Nenhuma pendência" }]);
    }
  });
});
