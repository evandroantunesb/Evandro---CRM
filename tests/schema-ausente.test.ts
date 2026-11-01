/**
 * Fallback de schema ausente (PR #188): só "objeto novo inexistente" é tolerado; qualquer outro erro
 * continua estourando e o pagamento do Pro não é afetado. Sem banco: cliente Supabase simulado.
 */
import { describe, expect, it, vi } from "vitest";
import { funcaoAusente, tabelaAusente } from "@/lib/schema-ausente";
import { carregarLinhasVenda } from "@/lib/venda";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { fichaInteira } from "./fonte-ficha";

describe("reconhecimento de schema ausente", () => {
  it("tabela: códigos 42P01/PGRST205 citando a tabela esperada", () => {
    expect(tabelaAusente({ code: "42P01", message: 'relation "public.registros_pagamento" does not exist' }, "registros_pagamento")).toBe(true);
    expect(tabelaAusente({ code: "PGRST205", message: "Could not find the table 'public.registros_pagamento' in the schema cache" }, "registros_pagamento")).toBe(true);
  });
  it("tabela: outro objeto, outro código ou erro vazio não contam", () => {
    expect(tabelaAusente({ code: "42P01", message: 'relation "public.outra" does not exist' }, "registros_pagamento")).toBe(false);
    expect(tabelaAusente({ code: "42501", message: "permission denied for table registros_pagamento" }, "registros_pagamento")).toBe(false);
    expect(tabelaAusente({ code: "57014", message: "registros_pagamento timeout" }, "registros_pagamento")).toBe(false);
    expect(tabelaAusente(null, "registros_pagamento")).toBe(false);
  });
  it("função: 42883/PGRST202 citando a função; permissão negada não conta", () => {
    const f = "situacao_registro_pagamento";
    expect(funcaoAusente({ code: "42883", message: `function public.${f}(uuid) does not exist` }, f)).toBe(true);
    expect(funcaoAusente({ code: "PGRST202", message: `Could not find the function public.${f}(p_negocio_id) in the schema cache` }, f)).toBe(true);
    expect(funcaoAusente({ code: "42501", message: `permission denied for function ${f}` }, f)).toBe(false);
    expect(funcaoAusente({ code: "42883", message: "function public.outra(uuid) does not exist" }, f)).toBe(false);
  });
});

type Resposta = { data: unknown[] | null; error: { code: string; message: string } | null };

/** Cliente simulado: cada tabela devolve a resposta combinada; filtros são ignorados. */
function clienteSimulado(respostas: Record<string, Resposta>) {
  const consulta = (tabela: string) => {
    const r = respostas[tabela] ?? { data: [], error: null };
    const c: Record<string, unknown> = { then: (ok: (v: Resposta) => unknown) => Promise.resolve(r).then(ok) };
    for (const m of ["select", "eq", "in"]) c[m] = () => c;
    return c;
  };
  return { from: vi.fn(consulta) } as unknown as SupabaseServidor;
}

const base: Record<string, Resposta> = {
  propostas: { data: [{ id: "p1", negocio_id: "n1", updated_at: "2026-10-01T10:00:00Z" }], error: null },
  contratos: { data: [{ id: "c1", negocio_id: "n1", status: "assinado", updated_at: "2026-10-02T10:00:00Z" }], error: null },
  negocios: {
    data: [{ id: "n1", numero: 1, titulo: "Casa", valor: 1000, status: "ganho", responsavel_id: null, updated_at: "2026-10-03T10:00:00Z", contatos: { nome: "Ana" } }],
    error: null,
  },
  propostas_aberturas: { data: [], error: null },
  confirmacoes_pagamento: { data: [{ contrato_id: "c1", confirmado_em: "2026-10-04T10:00:00Z", estornado_em: null }], error: null },
  registros_pagamento: { data: [], error: null },
};

describe("carregarLinhasVenda com schema indisponível", () => {
  it("sem a tabela nova: não quebra, sinaliza e mantém o pagamento do Pro", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = clienteSimulado({
      ...base,
      registros_pagamento: { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.registros_pagamento' in the schema cache" } },
    });
    const { linhas, registroManualIndisponivel } = await carregarLinhasVenda(supabase, "e1");
    expect(registroManualIndisponivel).toBe(true);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].pagamento).toBe("confirmado");
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("registros_pagamento"));
    aviso.mockRestore();
  });

  it("com a migration: leitura normal, sem sinalização", async () => {
    const { linhas, registroManualIndisponivel } = await carregarLinhasVenda(clienteSimulado(base), "e1");
    expect(registroManualIndisponivel).toBe(false);
    expect(linhas[0].pagamento).toBe("confirmado");
  });

  it("erro real (permissão) na tabela nova continua estourando", async () => {
    const supabase = clienteSimulado({
      ...base,
      registros_pagamento: { data: null, error: { code: "42501", message: "permission denied for table registros_pagamento" } },
    });
    await expect(carregarLinhasVenda(supabase, "e1")).rejects.toMatchObject({ code: "42501" });
  });

  it("falha em outra tabela nunca é tratada como schema ausente", async () => {
    const supabase = clienteSimulado({
      ...base,
      confirmacoes_pagamento: { data: null, error: { code: "42P01", message: 'relation "public.confirmacoes_pagamento" does not exist' } },
    });
    await expect(carregarLinhasVenda(supabase, "e1")).rejects.toMatchObject({ code: "42P01" });
  });
});

describe("ficha do negócio e lista: sem vazamento para o SDR", () => {
  it("a lista continua exigindo PROPOSTA_E_CONTRATO e a ficha só consulta o registro para quem vê contrato/pagamento", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const lista = readFileSync(join(__dirname, "..", "src/app/(app)/propostas-contratos/page.tsx"), "utf8");
    const ficha = fichaInteira();
    expect(lista).toContain("exigirPapel(...PROPOSTA_E_CONTRATO)");
    expect(ficha).toMatch(/veContratoEPagamento\s*\n?\s*\? await Promise\.all/);
    expect(ficha).toContain("if (!ausente) throw res.error");
  });
});
