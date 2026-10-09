/**
 * B1a: envio (handoff.created) e devolução (handoff.devolvido) não pontuam. O catálogo da tela
 * não os oferece para regra nova, a ação de criar regra recusa no servidor, e a lista da
 * interface é a mesma que o motor ignora no banco.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVENTOS_GAMIFICACAO,
  EVENTOS_GAMIFICACAO_SELECIONAVEIS,
  EVENTOS_NAO_PONTUAVEIS,
  eventoAceitaRegraNova,
  eventoNaoPontuavel,
} from "@/lib/gamificacao";

const fonte = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), "utf-8");

describe("catálogo de eventos (B1a)", () => {
  it("envio e devolução continuam no catálogo (compatibilidade), mas não pontuam", () => {
    for (const tipo of ["handoff.created", "handoff.devolvido"]) {
      expect(EVENTOS_GAMIFICACAO.some((e) => e.tipo === tipo), tipo).toBe(true);
      expect(eventoNaoPontuavel(tipo), tipo).toBe(true);
      expect(eventoAceitaRegraNova(tipo), tipo).toBe(false);
      expect(EVENTOS_GAMIFICACAO_SELECIONAVEIS.some((e) => e.tipo === tipo), tipo).toBe(false);
    }
  });

  it("aceite, venda e contrato do SDR continuam disponíveis para regra nova", () => {
    for (const tipo of ["oportunidade_aceita", "handoff.won", "handoff.contrato_assinado"]) {
      expect(eventoAceitaRegraNova(tipo), tipo).toBe(true);
      expect(eventoNaoPontuavel(tipo), tipo).toBe(false);
    }
  });

  it("a lista da interface é exatamente a que o motor ignora (migration da B1a)", () => {
    const sql = fonte("supabase", "migrations", "20261010100000_handoff_pontuacao_aceite.sql");
    const trecho = sql.match(/if new\.tipo = any \(array\[([\s\S]*?)\]\) then/);
    expect(trecho).not.toBeNull();
    const doMotor = [...trecho![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(doMotor).toEqual([...EVENTOS_NAO_PONTUAVEIS].sort());
  });

  it("a ação de criar regra recusa evento não pontuável no servidor; editar regra antiga continua possível", () => {
    const acoes = fonte("src", "app", "(app)", "gamificacao", "administracao", "_compartilhado", "actions.ts");
    const criar = acoes.slice(acoes.indexOf("export async function criarRegra"), acoes.indexOf("export async function editarRegra"));
    const editar = acoes.slice(acoes.indexOf("export async function editarRegra"));
    expect(criar).toContain("if (!eventoAceitaRegraNova(dados.data.eventoTipo))");
    expect(editar).not.toContain("eventoAceitaRegraNova");
  });
});
