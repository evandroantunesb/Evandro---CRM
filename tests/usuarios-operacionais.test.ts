import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exigirPapel: vi.fn(),
  criarUsuarioDireto: vi.fn(),
  criarClienteServidor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/sessao", () => ({ exigirPapel: mocks.exigirPapel }));
vi.mock("@/lib/convites", () => ({ criarUsuarioDireto: mocks.criarUsuarioDireto }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: mocks.criarClienteServidor }));

import { atualizarMembro, convidarMembro, salvarSetoresMembro } from "@/app/(app)/configuracoes/usuarios/actions";

const membroId = "36f9b3b0-f944-421a-9d2d-750c3284c109";
const empresaId = "37f9b3b0-f944-421a-9d2d-750c3284c109";
const formularioSetores = () => {
  const f = new FormData();
  f.set("membroId", membroId);
  f.set("compras", "sem_acesso");
  f.set("engenharia", "sem_acesso");
  f.set("operacional", "executar");
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigirPapel.mockResolvedValue({ atual: { empresaId } });
});

describe("cadastro de operação", () => {
  it("não inclui operação na distribuição ou gamificação mesmo com campos forjados", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: membroId }, error: null });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.criarClienteServidor.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }), rpc });
    mocks.criarUsuarioDireto.mockResolvedValue({ userId: membroId, novo: false });
    const f = new FormData();
    for (const [campo, valor] of Object.entries({ nome: "Pessoa", email: "pessoa@example.test", papel: "operacao", tipo_vendedor: "interno", perfil_gamificacao: "closer", recebe_leads: "on", compras: "coordenar", engenharia: "sem_acesso", operacional: "executar" })) f.set(campo, valor);
    expect((await convidarMembro(null, f))?.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ papel: "operacao", perfil_gamificacao: null, recebe_leads: false, empresa_id: empresaId }));
    expect(rpc).toHaveBeenCalledWith("definir_setores_membro", {
      p_membro_id: membroId,
      p_setores: [{ setor: "compras", capacidade: "coordenar" }, { setor: "operacional", capacidade: "executar" }],
    });
  });

  it("recusa setores inválidos antes de criar a conta", async () => {
    const f = new FormData();
    for (const [campo, valor] of Object.entries({ nome: "Pessoa", email: "pessoa@example.test", papel: "operacao", tipo_vendedor: "interno", compras: "administrar", engenharia: "sem_acesso", operacional: "executar" })) f.set(campo, valor);
    expect((await convidarMembro(null, f))?.ok).toBe(false);
    expect(mocks.criarUsuarioDireto).not.toHaveBeenCalled();
  });

  it("informa que a conta foi criada quando a gravação dos setores falha", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: membroId }, error: null });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const rpc = vi.fn().mockResolvedValue({ error: { message: "falha no banco", hint: "mensagem_usuario" } });
    mocks.criarClienteServidor.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }), rpc });
    mocks.criarUsuarioDireto.mockResolvedValue({ userId: membroId, novo: true });
    const f = new FormData();
    for (const [campo, valor] of Object.entries({ nome: "Pessoa", email: "pessoa@example.test", papel: "operacao", tipo_vendedor: "interno", compras: "sem_acesso", engenharia: "sem_acesso", operacional: "executar", senha: "temporaria123" })) f.set(campo, valor);
    const resultado = await convidarMembro(null, f);
    expect(resultado).toEqual(expect.objectContaining({ ok: false, mensagem: expect.stringContaining("Os setores não foram salvos") }));
    expect(resultado?.mensagem).toContain("Usuário criado");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/configuracoes/usuarios");
  });

  it("ao editar operação, também descarta perfil e distribuição informados indevidamente", async () => {
    const eq = vi.fn().mockReturnThis();
    eq.mockReturnValueOnce({ eq }).mockResolvedValueOnce({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.criarClienteServidor.mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) });
    const f = new FormData();
    for (const [campo, valor] of Object.entries({ membroId, papel: "operacao", tipo_vendedor: "interno", perfil_gamificacao: "closer", recebe_leads: "on", status: "ativo" })) f.set(campo, valor);
    expect((await atualizarMembro(null, f))?.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ perfil_gamificacao: null, recebe_leads: false, tipo_vendedor: null }));
    expect(eq).toHaveBeenCalledWith("empresa_id", empresaId);
  });

  it("atribui setores somente ao membro alterado para Operação", async () => {
    const eq = vi.fn().mockReturnThis();
    eq.mockReturnValueOnce({ eq }).mockResolvedValueOnce({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.criarClienteServidor.mockResolvedValue({ from: vi.fn().mockReturnValue({ update }), rpc });
    const f = new FormData();
    for (const [campo, valor] of Object.entries({ membroId, papel: "operacao", tipo_vendedor: "interno", status: "ativo", compras: "sem_acesso", engenharia: "coordenar", operacional: "executar" })) f.set(campo, valor);
    expect((await atualizarMembro(null, f))?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("definir_setores_membro", {
      p_membro_id: membroId,
      p_setores: [{ setor: "engenharia", capacidade: "coordenar" }, { setor: "operacional", capacidade: "executar" }],
    });
  });
});

describe("configuração de setores", () => {
  function cliente(membro: unknown, erro: unknown = null, erroRpc: unknown = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: membro, error: erro });
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnValue({ eq, maybeSingle });
    eq.mockReturnValue({ eq, maybeSingle });
    const rpc = vi.fn().mockResolvedValue({ error: erroRpc });
    mocks.criarClienteServidor.mockResolvedValue({ from: vi.fn().mockReturnValue({ select }), rpc });
    return { eq, rpc };
  }

  it("exige admin e envia à RPC somente os setores selecionados", async () => {
    const { eq, rpc } = cliente({ id: membroId });
    expect((await salvarSetoresMembro(null, formularioSetores()))?.ok).toBe(true);
    expect(mocks.exigirPapel).toHaveBeenCalledWith("admin");
    expect(eq).toHaveBeenCalledWith("empresa_id", empresaId);
    expect(rpc).toHaveBeenCalledWith("definir_setores_membro", {
      p_membro_id: membroId,
      p_setores: [{ setor: "operacional", capacidade: "executar" }],
    });
  });

  it("permite que a mesma pessoa atue em Engenharia, Compras e Operacional com capacidades distintas", async () => {
    const { rpc } = cliente({ id: membroId });
    const f = formularioSetores();
    f.set("compras", "coordenar");
    f.set("engenharia", "executar");
    expect((await salvarSetoresMembro(null, f))?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("definir_setores_membro", {
      p_membro_id: membroId,
      p_setores: [
        { setor: "compras", capacidade: "coordenar" },
        { setor: "engenharia", capacidade: "executar" },
        { setor: "operacional", capacidade: "executar" },
      ],
    });
  });

  it("não grava um membro fora da empresa atual nem oculta erro de leitura", async () => {
    const { rpc } = cliente(null, { message: "falha" });
    expect((await salvarSetoresMembro(null, formularioSetores()))?.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa capacidade inválida antes de consultar ou gravar", async () => {
    const f = formularioSetores();
    f.set("compras", "administrar");
    expect((await salvarSetoresMembro(null, f))?.ok).toBe(false);
    expect(mocks.criarClienteServidor).not.toHaveBeenCalled();
  });

  it("apresenta erro de usuário rejeitado pelo banco e não informa sucesso", async () => {
    cliente({ id: membroId }, null, { message: "O colaborador precisa estar ativo.", hint: "mensagem_usuario" });
    expect(await salvarSetoresMembro(null, formularioSetores())).toEqual({ ok: false, mensagem: "O colaborador precisa estar ativo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
