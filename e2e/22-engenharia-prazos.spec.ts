import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Engenharia (P5): o admin ajusta um prazo interno e cadastra/remove um feriado da empresa; a Central mostra os prazos
// vencidos no topo e o cartão de desempenho com troca de período.
test("prazos configuráveis, feriado da empresa e desempenho na Central", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await entrarComo(page, usuarios.admin, senha);

  await page.goto("/configuracoes/engenharia");
  const aIniciar = page.getByLabel("A iniciar: dias úteis");
  await expect(aIniciar).toHaveValue("2");
  await expect(page.getByLabel("Análise do protocolo pela distribuidora: dias úteis")).toHaveValue("");
  await aIniciar.fill("3");
  await page.getByRole("button", { name: "Salvar prazos" }).click();
  await expect(page.getByText("Prazos salvos.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("A iniciar: dias úteis")).toHaveValue("3");
  // Volta ao padrão para não mudar o que outros testes veem.
  await page.getByLabel("A iniciar: dias úteis").fill("2");
  await page.getByRole("button", { name: "Salvar prazos" }).click();
  await expect(page.getByText("Prazos salvos.")).toBeVisible();

  await page.getByLabel("Data do feriado").fill("2030-03-19");
  await page.getByLabel("Nome do feriado").fill("Feriado E2E");
  await page.getByRole("button", { name: "Adicionar feriado" }).click();
  const linha = page.locator("form").filter({ hasText: "Feriado E2E" });
  await expect(linha).toContainText("19/03/2030");
  await linha.getByRole("button", { name: "Remover" }).click();
  await expect(page.locator("form").filter({ hasText: "Feriado E2E" })).toHaveCount(0);

  await page.goto("/engenharia");
  await expect(page.getByText("Prazos vencidos")).toBeVisible();
  const desempenho = page.locator("section").filter({ has: page.getByRole("heading", { name: "Desempenho", level: 2 }) });
  await expect(desempenho.getByText("Do protocolo à aprovação")).toBeVisible();
  await desempenho.getByRole("link", { name: "90 dias" }).click();
  await expect(page).toHaveURL(/periodo=90/);
  await expect(desempenho.getByRole("link", { name: "90 dias" })).toHaveAttribute("aria-current", "page");
});
