import { expect, test, type Page } from "@playwright/test";
import { abrirAba, clienteServico, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Ficha do negócio: o cartão de fechamento vem logo após o cabeçalho e antes das abas; cada aba mostra só os seus
 * cartões; o SDR vê só a situação e não tem a aba de proposta e contrato. Guarda a divisão de `negocios/[id]/page.tsx`
 * em arquivos menores: a tela tem de continuar igual.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

// Cartões que identificam cada aba (os que sempre aparecem; Etiquetas, Pagamento e afins dependem de configuração).
const CARTOES = {
  Negócio: ["Oportunidade", "Perfil do lead", "Contato"],
  "Conta e sistema": ["Conta de luz e local", "Kit personalizado"],
  "Proposta e contrato": ["Contrato"],
  Atividades: ["Tarefas", "Notas e linha do tempo"],
} as const;
type Aba = keyof typeof CARTOES | "Arquivos";

const cartao = (page: Page, titulo: string | RegExp) => page.getByRole("heading", { name: titulo, exact: typeof titulo === "string" });
const ARQUIVOS = /^Arquivos \(\d+\)$/;

async function negocioAberto(nome: string, responsavel: keyof BaseFicticia["usuarios"]) {
  const s = clienteServico();
  const { data: funil } = await s.from("funis").select("id").eq("empresa_id", base.empresaA).limit(1).single();
  const { data: etapa } = await s.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await s
    .from("contatos")
    .insert({ empresa_id: base.empresaA, nome, telefone: "(45) 90000-0025", cidade: "Cascavel", uf: "PR" })
    .select("id")
    .single();
  if (e1) throw e1;
  const { data: negocio, error: e2 } = await s
    .from("negocios")
    .insert({
      empresa_id: base.empresaA,
      titulo: `Sistema solar — ${nome}`,
      contato_id: contato!.id,
      funil_id: funil!.id,
      etapa_id: etapa!.id,
      responsavel_id: base.usuarios[responsavel].membroId,
      valor: 18000,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  return negocio!.id;
}

/** Na aba aberta, os cartões dela aparecem e os que identificam as outras abas não. */
async function soCartoesDa(page: Page, aba: Aba) {
  for (const [outra, titulos] of Object.entries(CARTOES))
    for (const t of titulos)
      if (outra === aba) await expect(cartao(page, t).first(), `${aba}: ${t}`).toBeVisible();
      else await expect(cartao(page, t), `${aba} sem ${t}`).toHaveCount(0);
  if (aba === "Arquivos") await expect(cartao(page, ARQUIVOS)).toBeVisible();
  else await expect(cartao(page, ARQUIVOS), `${aba} sem Arquivos`).toHaveCount(0);
}

test("admin: fechamento antes das abas e cada aba com só os seus cartões", async ({ page }) => {
  const nome = `Ficha Abas ${Date.now()}`;
  const id = await negocioAberto(nome, "vendedor");
  await entrarComo(page, base.usuarios.admin, base.senha);
  await page.goto(`/negocios/${id}`);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(nome);
  const fechamento = cartao(page, "Fechamento da venda");
  await expect(fechamento).toHaveCount(1);
  const nav = page.getByRole("navigation", { name: "Seções do negócio" });
  const yFechamento = (await fechamento.boundingBox())!.y;
  expect(yFechamento).toBeLessThan((await nav.boundingBox())!.y);
  expect(yFechamento).toBeGreaterThan((await page.getByRole("heading", { level: 1 }).boundingBox())!.y);
  await expect(nav.getByRole("link")).toHaveText([/^Negócio/, /^Conta e sistema/, /^Proposta e contrato/, /^Atividades/, /^Arquivos/]);

  await soCartoesDa(page, "Negócio");
  for (const aba of ["Conta e sistema", "Proposta e contrato", "Atividades", "Arquivos", "Negócio"] as const) {
    await abrirAba(page, aba);
    await soCartoesDa(page, aba);
    // O fechamento fica fora das abas: está em todas, uma vez só.
    await expect(fechamento).toHaveCount(1);
  }
});

test("venda concluída: os 3 marcos, o link da obra e os cartões de contrato e pagamento", async ({ page }) => {
  const { data: obra } = await clienteServico().from("obras").select("negocio_id, numero").eq("id", base.obras.o02).single();
  await entrarComo(page, base.usuarios.admin, base.senha);
  await page.goto(`/negocios/${obra!.negocio_id}`);

  const fechamento = page.locator("section").filter({ has: cartao(page, "Fechamento da venda") });
  await expect(fechamento).toContainText("Venda concluída · 3 de 3 marcos concluídos");
  await expect(fechamento.getByRole("link", { name: `Ver obra nº ${obra!.numero}` })).toBeVisible();

  await abrirAba(page, "Proposta e contrato");
  await expect(cartao(page, "Contrato")).toBeVisible();
  await expect(cartao(page, "Pagamento")).toBeVisible();
  await expect(page.locator("#contrato")).toHaveCount(1);
  await expect(page.locator("#pagamento")).toHaveCount(1);
});

test("SDR: só a situação no topo e sem a aba de proposta e contrato", async ({ page }) => {
  const id = await negocioAberto(`Ficha SDR ${Date.now()}`, "sdr");
  await entrarComo(page, base.usuarios.sdr, base.senha);
  await page.goto(`/negocios/${id}`);

  await expect(cartao(page, "Situação")).toHaveCount(1);
  await expect(cartao(page, "Fechamento da venda")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Seções do negócio" }).getByRole("link")).toHaveText([
    /^Negócio/,
    /^Conta e sistema/,
    /^Atividades/,
    /^Arquivos/,
  ]);
  await expect(cartao(page, "Perfil do lead")).toBeVisible();
  await expect(cartao(page, "Oportunidade")).toBeVisible();
});
