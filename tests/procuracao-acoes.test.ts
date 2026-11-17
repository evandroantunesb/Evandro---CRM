/** Salvar o modelo de procuração: só o admin, só campos conhecidos (como o modelo de contrato), em modelos_procuracao. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  criarClienteServidor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/sessao", () => ({ exigirPapel: mocks.exigirPapel }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: mocks.criarClienteServidor }));

import { salvarModeloProcuracao } from "@/lib/acoes/procuracao";

function cliente() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  mocks.criarClienteServidor.mockResolvedValue({ from });
  return { from, upsert };
}

const enviar = (conteudo: string) => {
  const f = new FormData();
  f.set("conteudo", conteudo);
  return salvarModeloProcuracao(null, f);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigirPapel.mockResolvedValue({ atual: { empresaId: "e1", membroId: "m1", papel: "admin" } });
});

describe("salvarModeloProcuracao", () => {
  it("vendedor: recusado por exigirPapel, sem gravar", async () => {
    mocks.exigirPapel.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const c = cliente();
    await expect(enviar("OUTORGANTE: {{cliente_nome}}")).rejects.toThrow();
    expect(mocks.exigirPapel).toHaveBeenCalledWith("admin");
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it("campo desconhecido {{cpf}}: recusa com a mensagem do contrato", async () => {
    const c = cliente();
    expect(await enviar("CPF {{cpf}}")).toEqual({
      ok: false,
      mensagem: "Campos desconhecidos no modelo: {{cpf}}. Use só os campos da lista.",
    });
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it("texto válido: upsert em modelos_procuracao com o autor", async () => {
    const c = cliente();
    expect(await enviar("OUTORGANTE: {{cliente_nome}}, UC {{negocio_uc}}")).toEqual({ ok: true, mensagem: "Modelo salvo." });
    expect(c.from).toHaveBeenCalledWith("modelos_procuracao");
    expect(c.upsert).toHaveBeenCalledWith({ empresa_id: "e1", conteudo: "OUTORGANTE: {{cliente_nome}}, UC {{negocio_uc}}", atualizado_por: "m1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/configuracoes/procuracao");
  });
});
