import { expect, test, type Page } from "@playwright/test";
import { clienteDe, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Permissões em duas camadas:
 *  1. Interface: o que cada papel vê (controles escondidos para quem não pode).
 *  2. Banco (Supabase LOCAL): a RPC chamada direto com a sessão de cada papel — esconder botão
 *     não é barreira; quem recusa é o banco.
 * Usa as obras o11/o12 (estado inicial) para não interferir nas capturas.
 */

// A base só existe depois do global-setup: lida no beforeAll, nunca no carregamento do arquivo.
let usuarios: BaseFicticia["usuarios"];
let obras: BaseFicticia["obras"];
let obrasB: BaseFicticia["obrasB"];
let senha: string;
test.beforeAll(() => {
  ({ usuarios, obras, obrasB, senha } = lerBase());
});
/** Os painéis do modo Gestão ("Atualizar <setor>"). */
const GESTAO = /Atualizar (Compras|Engenharia|Operacional)/;
const cartao = (page: Page, titulo: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: titulo, exact: true }) }).last();

test.describe("permissões na interface", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const papel of ["gestor", "vendedor"] as const) {
    test(`${papel}: lê a obra, sem nenhum controle de escrita`, async ({ page }) => {
      await entrarComo(page, usuarios[papel], senha);
      await page.goto(`/obras/${obras.o01}`);
      await expect(page.getByRole("heading", { name: "Família Almeida (fictícia)" })).toBeVisible();
      await expect(page.getByText(GESTAO)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Salvar|Atribuir|Encerrar|Marcar como parado/ })).toHaveCount(0);
    });
  }

  test("SDR: sem nenhum controle de escrita (e sem obra fora do seu acesso)", async ({ page }) => {
    await entrarComo(page, usuarios.sdr, senha);
    await page.goto("/obras");
    await expect(page.getByText(GESTAO)).toHaveCount(0);
    const resposta = await page.goto(`/obras/${obras.o01}`);
    if (resposta?.status() === 200) {
      await expect(page.getByText(GESTAO)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Salvar|Atribuir|Encerrar/ })).toHaveCount(0);
    } else {
      expect(resposta?.status()).toBe(404);
    }
  });

  test("coordenador de Engenharia: só o próprio setor, com participantes; sem marcos", async ({ page }) => {
    await entrarComo(page, usuarios.coordEng, senha);
    await page.goto(`/obras/${obras.o12}`);
    await expect(cartao(page, "Engenharia").getByText("Atualizar Engenharia")).toBeVisible();
    await expect(page.getByText("Atualizar Compras")).toHaveCount(0);
    await expect(page.getByText("Atualizar Operacional")).toHaveCount(0);
    await expect(cartao(page, "Marcos").getByRole("button", { name: "Salvar" })).toHaveCount(0);
    await cartao(page, "Engenharia").getByText("Atualizar Engenharia").click();
    await expect(cartao(page, "Engenharia").getByRole("button", { name: "Adicionar participante" })).toBeVisible();
  });

  test("executor do Operacional: só o setor em que participa, sem gerir participantes; marcos liberados", async ({ page }) => {
    await entrarComo(page, usuarios.execOp, senha);
    // o01: participa do Operacional como apoio.
    await page.goto(`/obras/${obras.o01}`);
    const op = cartao(page, "Operacional");
    await op.getByText("Atualizar Operacional").click();
    await expect(op.getByLabel("Status de Operacional")).toBeVisible();
    await expect(op.getByRole("button", { name: "Adicionar participante" })).toHaveCount(0);
    await expect(page.getByText("Atualizar Engenharia")).toHaveCount(0);
    await expect(page.getByText("Atualizar Compras")).toHaveCount(0);
    await expect(cartao(page, "Marcos").getByRole("button", { name: "Salvar" }).first()).toBeVisible();
  });

  test("obra pausada: só participantes; obra cancelada: nada", async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto(`/obras/${obras.o07}`);
    await expect(page.getByText(/Obra pausada: status/)).toBeVisible();
    const eng = cartao(page, "Engenharia");
    await eng.getByText("Atualizar Engenharia").click();
    await expect(eng.getByRole("button", { name: "Adicionar participante" })).toBeVisible();
    await expect(eng.getByLabel("Status de Engenharia")).toHaveCount(0);
    await expect(eng.getByRole("button", { name: "Marcar como parado" })).toHaveCount(0);
    await expect(cartao(page, "Marcos").getByRole("button", { name: "Salvar" })).toHaveCount(0);

    await page.goto(`/obras/${obras.o08}`);
    await expect(page.getByText("Obra cancelada: não aceita alterações.")).toBeVisible();
    await expect(page.getByText(GESTAO)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Salvar|Atribuir|Encerrar/ })).toHaveCount(0);
  });
});

test.describe("permissões reais no banco local (RPC direta)", () => {
  const recusada = (r: { error: { code?: string; message: string } | null }) => {
    expect(r.error, "a RPC deveria ter recusado").not.toBeNull();
  };
  const aceita = (r: { error: { message: string } | null }) => expect(r.error?.message ?? null).toBeNull();

  test("admin: altera os 3 setores operacionais", async () => {
    const admin = await clienteDe(usuarios.admin, senha);
    for (const [setor, status] of [
      ["compras", "cotando"],
      ["engenharia", "projeto_em_elaboracao"],
      ["operacional", "liberada_agendamento"],
    ] as const) {
      aceita(await admin.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o12, p_setor: setor, p_status: status }));
    }
  });

  test("coordenador: só o setor que coordena", async () => {
    const coord = await clienteDe(usuarios.coordEng, senha);
    aceita(await coord.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o12, p_setor: "engenharia", p_status: "aprovado" }));
    recusada(await coord.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o12, p_setor: "compras", p_status: "pedido_realizado" }));
    recusada(await coord.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o12, p_setor: "operacional", p_status: "agendada" }));
    recusada(await coord.rpc("atualizar_marco_obra", { p_obra_id: obras.o12, p_marco: "nf_cliente", p_status: "concluido" }));
    // Atribui no próprio setor; nunca a si mesmo.
    aceita(
      await coord.rpc("atribuir_participante_obra", {
        p_obra_id: obras.o12,
        p_membro_id: usuarios.apoioEng.membroId,
        p_setor: "engenharia",
        p_funcao: "apoio",
      }),
    );
    recusada(
      await coord.rpc("atribuir_participante_obra", { p_obra_id: obras.o12, p_membro_id: usuarios.coordEng.membroId, p_setor: "engenharia", p_funcao: "apoio" }),
    );
  });

  test("executor: só onde participa; não gere participantes", async () => {
    const exec = await clienteDe(usuarios.execOp, senha);
    // o01: participante do Operacional. o12: não participa.
    aceita(await exec.rpc("definir_aguardando_fluxo_obra", { p_obra_id: obras.o01, p_setor: "operacional", p_aguardando: "transportadora" }));
    aceita(await exec.rpc("definir_aguardando_fluxo_obra", { p_obra_id: obras.o01, p_setor: "operacional" }));
    recusada(await exec.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o12, p_setor: "operacional", p_status: "agendada" }));
    recusada(await exec.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o01, p_setor: "engenharia", p_status: "aprovado" }));
    recusada(
      await exec.rpc("atribuir_participante_obra", { p_obra_id: obras.o01, p_membro_id: usuarios.execCompras.membroId, p_setor: "operacional", p_funcao: "apoio" }),
    );
  });

  test("gestor, vendedor e SDR: nenhuma escrita operacional", async () => {
    for (const papel of ["gestor", "vendedor", "sdr"] as const) {
      const c = await clienteDe(usuarios[papel], senha);
      recusada(await c.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o11, p_setor: "compras", p_status: "cotando" }));
      recusada(await c.rpc("marcar_parado_fluxo_obra", { p_obra_id: obras.o11, p_setor: "compras", p_parado: true, p_motivo: "x" }));
      recusada(await c.rpc("definir_aguardando_fluxo_obra", { p_obra_id: obras.o11, p_setor: "compras", p_aguardando: "cliente" }));
      recusada(await c.rpc("atualizar_marco_obra", { p_obra_id: obras.o11, p_marco: "nf_cliente", p_status: "concluido" }));
      recusada(
        await c.rpc("atribuir_participante_obra", { p_obra_id: obras.o11, p_membro_id: usuarios.apoioEng.membroId, p_setor: "engenharia", p_funcao: "apoio" }),
      );
    }
  });

  test("obra cancelada: nada; obra pausada: só participantes", async () => {
    const admin = await clienteDe(usuarios.admin, senha);
    recusada(await admin.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o08, p_setor: "compras", p_status: "pedido_realizado" }));
    recusada(
      await admin.rpc("atribuir_participante_obra", { p_obra_id: obras.o08, p_membro_id: usuarios.apoioEng.membroId, p_setor: "engenharia", p_funcao: "apoio" }),
    );
    recusada(await admin.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o07, p_setor: "engenharia", p_status: "aprovado" }));
    recusada(await admin.rpc("atualizar_marco_obra", { p_obra_id: obras.o07, p_marco: "nf_cliente", p_status: "concluido" }));
    aceita(
      await admin.rpc("atribuir_participante_obra", { p_obra_id: obras.o07, p_membro_id: usuarios.apoioEng.membroId, p_setor: "engenharia", p_funcao: "apoio" }),
    );
  });

  test("outra empresa: não lê nem altera", async () => {
    const adminB = await clienteDe(usuarios.adminB, senha);
    const admin = await clienteDe(usuarios.admin, senha);
    recusada(await adminB.rpc("alterar_status_fluxo_obra", { p_obra_id: obras.o11, p_setor: "compras", p_status: "cotando" }));
    recusada(await admin.rpc("alterar_status_fluxo_obra", { p_obra_id: obrasB.b1, p_setor: "compras", p_status: "cotando" }));
    const leitura = await admin.from("obras").select("id").eq("id", obrasB.b1);
    expect(leitura.data ?? []).toHaveLength(0);
    const fluxos = await admin.from("obra_fluxos").select("obra_id").eq("obra_id", obrasB.b1);
    expect(fluxos.data ?? []).toHaveLength(0);
  });
});
