import { beforeEach, describe, expect, it, vi } from "vitest";
import { outrosSetores, perfilDoMembro, setoresParaSalvar } from "@/lib/perfis-usuario";

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

import { atualizarMembro, convidarMembro } from "@/app/(app)/configuracoes/usuarios/actions";

const membroId = "36f9b3b0-f944-421a-9d2d-750c3284c109";
const empresaId = "37f9b3b0-f944-421a-9d2d-750c3284c109";

const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [campo, valor] of Object.entries(campos)) f.set(campo, valor);
  return f;
};
const pessoaNova = { nome: "Pessoa", email: "pessoa@example.test" };

/** Cliente falso do cadastro: insert → select → single. */
function clienteCadastro(erroRpc: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: { id: membroId }, error: null });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  const rpc = vi.fn().mockResolvedValue({ error: erroRpc });
  mocks.criarClienteServidor.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }), rpc });
  return { insert, rpc };
}

/** Cliente falso da edição: update → eq → eq → select (linhas encontradas na empresa atual). */
function clienteEdicao({ linhas = [{ id: membroId }], erroRpc = null as unknown, abertos = 0 } = {}) {
  const eq = vi.fn();
  const select = vi.fn().mockResolvedValue({ data: linhas, error: null });
  eq.mockReturnValueOnce({ eq }).mockReturnValueOnce({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const rpc = vi.fn().mockResolvedValue({ error: erroRpc });
  const contagem = { eq: vi.fn(), is: vi.fn().mockResolvedValue({ count: abertos }) };
  contagem.eq.mockReturnValue(contagem);
  const from = vi.fn((tabela: string) => (tabela === "negocios" ? { select: vi.fn().mockReturnValue(contagem) } : { update }));
  mocks.criarClienteServidor.mockResolvedValue({ from, rpc });
  return { update, eq, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigirPapel.mockResolvedValue({ atual: { empresaId } });
});

describe("perfil único (puro)", () => {
  it("o perfil da Operação é o setor principal; sem marca, o que coordena e depois a ordem dos setores", () => {
    expect(perfilDoMembro("vendedor", [])).toBe("vendedor");
    expect(perfilDoMembro("operacao", [])).toBeNull();
    const setores = [
      { setor: "compras", capacidade: "executar", principal: false },
      { setor: "administrativo", capacidade: "coordenar", principal: false },
    ];
    expect(perfilDoMembro("operacao", setores)).toBe("administrativo");
    expect(perfilDoMembro("operacao", [{ ...setores[0], principal: true }, setores[1]])).toBe("compras");
    expect(
      perfilDoMembro("operacao", [
        { setor: "operacional", capacidade: "executar", principal: false },
        { setor: "engenharia", capacidade: "executar", principal: false },
      ]),
    ).toBe("engenharia");
  });

  it("outros setores saem sem o do perfil, na ordem dos setores", () => {
    const setores = [
      { setor: "administrativo", capacidade: "coordenar", principal: true },
      { setor: "compras", capacidade: "executar", principal: false },
    ];
    expect(outrosSetores("administrativo", setores)).toEqual([{ setor: "compras", capacidade: "executar" }]);
  });

  it("a lista salva marca o setor do perfil como principal e ignora o perfil repetido em 'outros'", () => {
    expect(setoresParaSalvar("administrativo", "coordenar", { compras: "executar", engenharia: "sem_acesso", administrativo: "executar" })).toEqual([
      { setor: "compras", capacidade: "executar" },
      { setor: "administrativo", capacidade: "coordenar", principal: true },
    ]);
  });
});

describe("convidar pessoa", () => {
  it("Operação: fora da distribuição e do ranking mesmo com campos forjados; setores com o principal", async () => {
    const { insert, rpc } = clienteCadastro();
    mocks.criarUsuarioDireto.mockResolvedValue({ userId: membroId, novo: false });
    const f = formulario({
      ...pessoaNova,
      perfil: "operacional",
      capacidade: "executar",
      outro_compras: "coordenar",
      tipo_vendedor: "interno",
      perfil_gamificacao: "closer",
      recebe_leads: "on",
    });
    expect((await convidarMembro(null, f))?.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ papel: "operacao", tipo_vendedor: null, perfil_gamificacao: null, recebe_leads: false, empresa_id: empresaId }),
    );
    expect(rpc).toHaveBeenCalledWith("definir_setores_membro", {
      p_membro_id: membroId,
      p_setores: [
        { setor: "compras", capacidade: "coordenar" },
        { setor: "operacional", capacidade: "executar", principal: true },
      ],
    });
  });

  it("Vendedor: tipo, ranking e leads; sem setores", async () => {
    const { insert, rpc } = clienteCadastro();
    mocks.criarUsuarioDireto.mockResolvedValue({ userId: membroId, novo: false });
    const f = formulario({ ...pessoaNova, perfil: "vendedor", tipo_vendedor: "representante", perfil_gamificacao: "closer", recebe_leads: "on", outro_compras: "coordenar" });
    expect((await convidarMembro(null, f))?.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ papel: "vendedor", tipo_vendedor: "representante", perfil_gamificacao: "closer", recebe_leads: true }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa atuação inválida, setor sem capacidade ou perfil desconhecido antes de criar a conta", async () => {
    expect((await convidarMembro(null, formulario({ ...pessoaNova, perfil: "engenharia", capacidade: "executar", outro_compras: "administrar" })))?.ok).toBe(false);
    expect((await convidarMembro(null, formulario({ ...pessoaNova, perfil: "engenharia" })))?.ok).toBe(false);
    expect((await convidarMembro(null, formulario({ ...pessoaNova, perfil: "operacao" })))?.ok).toBe(false);
    expect(mocks.criarUsuarioDireto).not.toHaveBeenCalled();
  });

  it("informa que a conta foi criada quando a gravação dos setores falha", async () => {
    clienteCadastro({ message: "falha no banco", hint: "mensagem_usuario" });
    mocks.criarUsuarioDireto.mockResolvedValue({ userId: membroId, novo: true });
    const resultado = await convidarMembro(null, formulario({ ...pessoaNova, perfil: "operacional", capacidade: "executar", senha: "temporaria123" }));
    expect(resultado).toEqual(expect.objectContaining({ ok: false, mensagem: expect.stringContaining("Os setores não foram salvos") }));
    expect(resultado?.mensagem).toContain("Usuário criado");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/configuracoes/usuarios");
  });
});

describe("editar pessoa", () => {
  it("exige admin; Operação descarta ranking e leads e grava os setores com o principal", async () => {
    const { update, eq, rpc } = clienteEdicao();
    const f = formulario({ membroId, status: "ativo", perfil: "administrativo", capacidade: "coordenar", outro_compras: "executar", perfil_gamificacao: "closer", recebe_leads: "on" });
    expect((await atualizarMembro(null, f))?.ok).toBe(true);
    expect(mocks.exigirPapel).toHaveBeenCalledWith("admin");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ papel: "operacao", perfil_gamificacao: null, recebe_leads: false, tipo_vendedor: null, status: "ativo" }));
    expect(eq).toHaveBeenCalledWith("empresa_id", empresaId);
    expect(rpc).toHaveBeenCalledWith("definir_setores_membro", {
      p_membro_id: membroId,
      p_setores: [
        { setor: "compras", capacidade: "executar" },
        { setor: "administrativo", capacidade: "coordenar", principal: true },
      ],
    });
  });

  it("Gestor: só o ranking; 'Recebe leads' não é tocado e não há setores", async () => {
    const { update, rpc } = clienteEdicao();
    expect((await atualizarMembro(null, formulario({ membroId, status: "ativo", perfil: "gestor", perfil_gamificacao: "" })))?.ok).toBe(true);
    expect(update.mock.calls[0][0]).toEqual({ papel: "gestor", tipo_vendedor: null, perfil_gamificacao: null, status: "ativo" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Operação inativa não grava setores (o banco os retira)", async () => {
    const { rpc } = clienteEdicao();
    expect((await atualizarMembro(null, formulario({ membroId, status: "inativo", perfil: "compras", capacidade: "executar" })))?.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pessoa fora da empresa atual: nada de setores", async () => {
    const { rpc } = clienteEdicao({ linhas: [] });
    expect((await atualizarMembro(null, formulario({ membroId, status: "ativo", perfil: "compras", capacidade: "executar" })))?.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("apresenta o erro do banco nos setores e não informa sucesso", async () => {
    clienteEdicao({ erroRpc: { message: "O colaborador precisa estar ativo.", hint: "mensagem_usuario" } });
    const r = await atualizarMembro(null, formulario({ membroId, status: "ativo", perfil: "compras", capacidade: "executar" }));
    expect(r).toEqual({ ok: false, mensagem: "Perfil salvo, mas os setores não: O colaborador precisa estar ativo." });
  });

  it("desligar quem tem negócio aberto passa pela transferência de carteira", async () => {
    const { update } = clienteEdicao({ abertos: 2 });
    const r = await atualizarMembro(null, formulario({ membroId, status: "desligado", perfil: "vendedor", tipo_vendedor: "interno" }));
    expect(r?.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
