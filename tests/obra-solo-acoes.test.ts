import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  criarClienteServidor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/sessao", () => ({ exigirPapel: mocks.exigirPapel }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: mocks.criarClienteServidor }));

import { apagarFotoEtapa, etapaNaoSeAplica, gerarNovoLink, marcarEtapa, registrarFotoEtapa } from "@/lib/acoes/obra-solo";

const obraId = "36f9b3b0-f944-421a-9d2d-750c3284c109";
const fotoId = "46f9b3b0-f944-421a-9d2d-750c3284c109";

function cliente({ rpc = { data: null as unknown, error: null as unknown }, remocao = { error: null as unknown } } = {}) {
  const remove = vi.fn().mockResolvedValue(remocao);
  const c = {
    rpc: vi.fn().mockResolvedValue(rpc),
    storage: { from: vi.fn().mockReturnValue({ remove }) },
  };
  mocks.criarClienteServidor.mockResolvedValue(c);
  return { ...c, remove };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigirPapel.mockResolvedValue({ atual: { empresaId: "e1", papel: "admin" } });
});

describe("ações da obra do Solo", () => {
  it("papel não admin é recusado antes da RPC", async () => {
    mocks.exigirPapel.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const c = cliente();
    await expect(marcarEtapa(obraId, "instalacao", true, null)).rejects.toThrow();
    expect(mocks.exigirPapel).toHaveBeenCalledWith("admin");
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("marcarEtapa passa p_feita e a data", async () => {
    const c = cliente();
    expect(await marcarEtapa(obraId, "instalacao", true, "2026-11-10")).toMatchObject({ ok: true });
    expect(c.rpc).toHaveBeenCalledWith("marcar_etapa_obra", { p_obra_id: obraId, p_etapa: "instalacao", p_feita: true, p_data: "2026-11-10" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/obras/${obraId}`);
  });

  it("entrada inválida não chega ao banco", async () => {
    const c = cliente();
    expect(await marcarEtapa("nao-e-uuid", "instalacao", true, null)).toMatchObject({ ok: false });
    expect(await marcarEtapa(obraId, "telhado" as never, true, null)).toMatchObject({ ok: false });
    expect(await marcarEtapa(obraId, "instalacao", true, "10/11/2026")).toMatchObject({ ok: false });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("etapaNaoSeAplica recusa motivo vazio antes da RPC", async () => {
    const c = cliente();
    expect(await etapaNaoSeAplica(obraId, "vistoria", "   ")).toEqual({ ok: false, mensagem: "Informe o motivo." });
    expect(c.rpc).not.toHaveBeenCalled();
    expect(await etapaNaoSeAplica(obraId, "vistoria", null)).toMatchObject({ ok: true });
    expect(c.rpc).toHaveBeenCalledWith("etapa_nao_se_aplica_obra", { p_obra_id: obraId, p_etapa: "vistoria", p_motivo: null });
  });

  it("registrarFotoEtapa só aceita caminho da pasta da obra e da etapa", async () => {
    const c = cliente({ rpc: { data: fotoId, error: null } });
    expect(await registrarFotoEtapa(obraId, "instalacao", `outra/${obraId}/instalacao/a.webp`)).toMatchObject({ ok: false });
    expect(c.rpc).not.toHaveBeenCalled();
    expect(await registrarFotoEtapa(obraId, "instalacao", `e1/${obraId}/instalacao/a.webp`)).toMatchObject({ ok: true });
  });

  it("apagarFotoEtapa apaga o arquivo do Storage com o caminho devolvido pela RPC", async () => {
    const caminho = `e1/${obraId}/instalacao/a.webp`;
    const c = cliente({ rpc: { data: caminho, error: null } });
    expect(await apagarFotoEtapa(obraId, fotoId)).toMatchObject({ ok: true });
    expect(c.rpc).toHaveBeenCalledWith("apagar_foto_etapa_obra", { p_foto_id: fotoId });
    expect(c.storage.from).toHaveBeenCalledWith("obra-fotos");
    expect(c.remove).toHaveBeenCalledWith([caminho]);
  });

  it("erro da RPC vira mensagem do usuário", async () => {
    cliente({ rpc: { data: null, error: { message: "Esta etapa não pode ser desmarcada.", hint: "mensagem_usuario" } } });
    expect(await marcarEtapa(obraId, "contrato", false, null)).toEqual({ ok: false, mensagem: "Esta etapa não pode ser desmarcada." });
    cliente({ rpc: { data: null, error: { message: "erro interno", hint: null } } });
    expect(await marcarEtapa(obraId, "contrato", false, null)).toEqual({ ok: false, mensagem: "Não foi possível salvar a etapa." });
  });

  it("gerarNovoLink devolve o link novo", async () => {
    cliente({ rpc: { data: "token-novo", error: null } });
    const r = await gerarNovoLink(obraId);
    expect(r).toMatchObject({ ok: true });
    expect(r?.ok && "link" in r ? r.link : "").toMatch(/\/obra\/token-novo$/);
  });
});
