import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Engenharia (P6a): a carteira alterna entre Lista e Kanban; o Kanban mostra as sete fases da spec, cada obra numa só,
// e o cartão abre o card da obra (sem arrastar).
test("carteira da Engenharia alterna para Kanban e o cartão abre a obra", async ({ page }) => {
  const { usuarios, senha } = lerBase();

  await entrarComo(page, usuarios.execEng, senha);
  await page.goto("/engenharia");
  const visao = page.getByRole("navigation", { name: "Visão da carteira" });
  await expect(visao.getByRole("link", { name: "Lista" })).toHaveAttribute("aria-current", "page");
  const naLista = await page.getByRole("region", { name: "Carteira por etapa" }).getByRole("link", { name: /^Obra #/ }).count();

  await visao.getByRole("link", { name: "Kanban" }).click();
  await expect(page).toHaveURL(/carteira=kanban/);
  await expect(visao.getByRole("link", { name: "Kanban" })).toHaveAttribute("aria-current", "page");

  const quadro = page.getByRole("region", { name: "Kanban da carteira" });
  const fases = [
    "Conferência inicial",
    "Em elaboração",
    "Pronto para protocolo",
    "Em análise externa",
    "Exigência / correção",
    "Conexão / vistoria",
    "Concluída",
  ];
  for (const fase of fases) await expect(quadro.getByRole("region", { name: fase, exact: true })).toBeVisible();

  // As obras em curso são as mesmas da lista; a coluna "Concluída" soma as que já fecharam a Engenharia.
  const emCurso = quadro.getByRole("region").filter({ hasNot: page.getByRole("heading", { name: /^Concluída/ }) }).getByRole("link", { name: /^Continuar a obra/ });
  await expect(emCurso).toHaveCount(naLista);

  const continuar = quadro.getByRole("link", { name: /^Continuar a obra/ }).first();
  const href = (await continuar.getAttribute("href"))!;
  await continuar.click();
  await page.waitForURL(`**${href}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // O período dos indicadores guarda a visão escolhida.
  await page.goto("/engenharia?carteira=kanban");
  await page.getByRole("link", { name: "90 dias" }).click();
  await expect(page).toHaveURL(/carteira=kanban/);
  await expect(page).toHaveURL(/periodo=90/);
});
