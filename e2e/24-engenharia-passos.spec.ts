import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Engenharia (P6b): o card mostra os oito passos e onde a obra está; o executor confirma o enquadramento (passo 2) e
// reabre com motivo. Roda depois dos outros testes da Engenharia, na primeira obra da carteira do executor.
test("executor vê os oito passos, confirma o enquadramento e reabre com motivo", async ({ page }) => {
  const { usuarios, senha } = lerBase();

  await entrarComo(page, usuarios.execEng, senha);
  await page.goto("/engenharia");
  const link = page.getByRole("region", { name: "Carteira por etapa" }).getByRole("link", { name: /^Obra #/ }).first();
  const href = (await link.getAttribute("href"))!;
  await page.goto(href);

  const passos = page.getByRole("navigation", { name: "Passos da Engenharia" });
  await expect(passos.getByRole("listitem")).toHaveCount(8);
  await expect(page.getByText(/^Etapa \d de 8 · /).or(page.getByText("Todos os passos concluídos"))).toBeVisible();

  const passo2 = page.locator("#passo-2");
  await passos.getByRole("link", { name: /^2\. Enquadrar sistema/ }).click();
  await expect(page).toHaveURL(/#passo-2$/);

  // Se outro teste já confirmou, reabre antes; o fim é sempre o mesmo.
  if (await passo2.getByRole("button", { name: "Reabrir" }).isVisible()) {
    await passo2.getByRole("button", { name: "Reabrir" }).click();
    await passo2.getByLabel("Por que reabrir?").fill("Reabrindo para o teste");
    await passo2.getByRole("button", { name: "Reabrir passo" }).click();
  }
  await passo2.getByLabel("Observação (opcional)").fill("Copel, micro, telhado");
  await passo2.getByRole("button", { name: "Concluir enquadramento" }).click();
  await expect(passo2.getByText(/^Concluído em .* · Copel, micro, telhado$/)).toBeVisible();
  await expect(passos.getByRole("link", { name: /^2\. Enquadrar sistema/ }).getByText("Concluído")).toBeVisible();

  await passo2.getByRole("button", { name: "Reabrir" }).click();
  await passo2.getByLabel("Por que reabrir?").fill("Categoria errada");
  await passo2.getByRole("button", { name: "Reabrir passo" }).click();
  await expect(passo2.getByText(/^Reaberto em .* · Categoria errada$/)).toBeVisible();
  await expect(passos.getByRole("link", { name: /^2\. Enquadrar sistema/ }).getByText("Com pendência")).toBeVisible();
});
