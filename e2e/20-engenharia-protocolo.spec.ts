import { expect, test, type Locator } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

const cartao = (page: import("@playwright/test").Page, titulo: string): Locator =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: titulo, level: 2 }) });

// Engenharia (P3): na o11 (estado inicial, nenhum outro teste grava nela), o admin resolve o checklist, registra o
// protocolo (a Engenharia vai para "Enviado à concessionária" sozinha), recebe uma exigência e reenvia.
test("admin registra o protocolo depois do checklist, recebe exigência e reenvia", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto(`/engenharia/${obras.o11}`);

  const protocolo = cartao(page, "Protocolo na concessionária");
  await expect(protocolo.getByText("Aplique o checklist")).toBeVisible();

  const checklist = cartao(page, "Checklist e documentos");
  await checklist.getByRole("button", { name: "Aplicar checklist" }).click();
  await expect(protocolo.getByText(/Faltam \d+ itens obrigatórios/)).toBeVisible();

  // O admin marca todos como "não se aplica" (só para o teste: obrigatório só admin ou coordenador dispensa).
  const dispensar = checklist.getByRole("button", { name: "Não se aplica" });
  // O botão some ao abrir o formulário: espera o formulário fechar (gravou) antes do próximo item.
  const motivo = checklist.getByLabel("Por que não se aplica?");
  for (let i = 0; i < 15 && (await dispensar.count()) > 0; i++) {
    await dispensar.first().click();
    await motivo.fill("Teste E2E");
    await checklist.getByRole("button", { name: "Confirmar" }).click();
    await expect(motivo).toHaveCount(0);
  }

  await protocolo.getByLabel("Número do protocolo").fill("E2E-20-001");
  await protocolo.getByRole("button", { name: "Registrar protocolo" }).click();
  await expect(protocolo.getByText("Protocolado", { exact: true })).toBeVisible();
  await expect(cartao(page, "Engenharia").getByText("Enviado à concessionária").first()).toBeVisible();

  await protocolo.getByLabel("O que aconteceu").selectOption("exigencia");
  await protocolo.getByLabel("Categoria da exigência").selectOption("projeto_eletrico");
  await protocolo.getByLabel("Texto da exigência").fill("Diagrama unifilar ilegível (fictício)");
  await protocolo.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(protocolo.getByRole("region", { name: "Exigências pendentes" })).toContainText("Diagrama unifilar ilegível");
  await expect(protocolo.getByText("Com exigência", { exact: true })).toBeVisible();

  await protocolo.getByLabel("O que aconteceu").selectOption("reenvio");
  await protocolo.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(protocolo.getByText("Em análise", { exact: true }).first()).toBeVisible();
  await expect(protocolo.getByText("Reenviado com correções")).toBeVisible();
});
