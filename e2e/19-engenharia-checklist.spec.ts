import { expect, test } from "@playwright/test";
import { abrirTodosPassos, entrarComo, lerBase } from "./ajuda";

// Engenharia (P2): no card da obra, o admin aplica o checklist, anexa um arquivo (vira versão 1 e vai para
// conferência), marca válido e dispensa um item opcional com motivo; o arquivo abre pelo link.
test("admin aplica o checklist, anexa, confere e marca 'não se aplica'", async ({ page }) => {
  const { usuarios, senha, obras } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto(`/engenharia/${obras.o01}`);
  await abrirTodosPassos(page);

  const checklist = page.locator("section").filter({ has: page.getByRole("heading", { name: "Checklist e documentos" }) });
  const aplicar = checklist.getByRole("button", { name: "Aplicar checklist" });
  if (await aplicar.isVisible()) await aplicar.click();
  await expect(checklist.getByText(/Obrigatórios resolvidos: \d+ de \d+/)).toBeVisible();

  const fatura = checklist.getByRole("listitem").filter({ hasText: "Fatura recente da unidade consumidora" });
  await fatura.getByLabel(/Anexar arquivo: Fatura/).setInputFiles({ name: "fatura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
  await expect(fatura.getByRole("link", { name: "fatura.pdf" }).first()).toBeVisible();
  await expect(fatura.getByText("Em conferência")).toBeVisible();

  await fatura.getByRole("button", { name: "Marcar válido" }).click();
  await expect(fatura.getByText("Válido", { exact: true })).toBeVisible();

  const unifilar = checklist.getByRole("listitem").filter({ hasText: "Diagrama unifilar" });
  await unifilar.getByRole("button", { name: "Não se aplica" }).click();
  await unifilar.getByLabel("Por que não se aplica?").fill("Sistema simples, sem unifilar");
  await unifilar.getByRole("button", { name: "Confirmar" }).click();
  await expect(unifilar.getByText("Motivo: Sistema simples, sem unifilar")).toBeVisible();

  // O link do documento redireciona para um endereço temporário do Storage.
  const href = await fatura.getByRole("link", { name: "fatura.pdf" }).first().getAttribute("href");
  const resposta = await page.request.get(href!, { maxRedirects: 0 });
  expect(resposta.status()).toBe(307);
});
