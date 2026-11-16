import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
let gravadas: { cor_primaria: string | null; cor_destaque: string | null } | null = null;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sessao", () => ({ exigirPapel: async () => ({ atual: { empresaId: "e1", membroId: "m1" } }) }));
vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: gravadas }) }) }),
      upsert: async (...a: unknown[]) => {
        upsert(...a);
        return { error: null };
      },
    }),
  }),
}));

import { salvarIdentidadeProposta } from "@/lib/acoes/proposta-identidade";

// Barra clara demais para o texto do menu: ilegível (ver validarMarca).
const ILEGIVEL = "#FFFFFF";

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("salvarIdentidadeProposta: cores ilegíveis", () => {
  beforeEach(() => {
    upsert.mockClear();
    gravadas = null;
  });

  it("recusa cor ilegível nova", async () => {
    const r = await salvarIdentidadeProposta({ ok: false, mensagem: "" }, form({ cor_primaria: ILEGIVEL }));
    expect(r?.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("combinação antiga ilegível, sem mudar, não impede salvar o nome", async () => {
    gravadas = { cor_primaria: ILEGIVEL, cor_destaque: null };
    const r = await salvarIdentidadeProposta({ ok: false, mensagem: "" }, form({ nome_exibicao: "Sol Novo", cor_primaria: ILEGIVEL.toLowerCase(), cor_destaque: "" }));
    expect(r?.ok).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("trocar a cor antiga por outra ilegível continua recusado", async () => {
    gravadas = { cor_primaria: ILEGIVEL, cor_destaque: null };
    const r = await salvarIdentidadeProposta({ ok: false, mensagem: "" }, form({ cor_primaria: "#FEFEFE" }));
    expect(r?.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});
