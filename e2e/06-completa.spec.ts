import { expect, test, type Page } from "@playwright/test";
import { RESOLUCOES, capturar, entrarComo, lerBase, semRolagemHorizontal, type Resolucao } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * OPR — visão Completa de Obras (desenho aprovado "Obras — Completa"), contra o app real e o Supabase LOCAL: só admin
 * e gestor; números, semáforo, lista e as regras; a lista por setor a um clique; escalonamento aberto na ficha
 * aparece em "Pedem decisão".
 */

let usuarios: BaseFicticia["usuarios"];
let obras: BaseFicticia["obras"];
let senha: string;
test.beforeAll(() => {
  ({ usuarios, obras, senha } = lerBase());
});

const tabela = (page: Page) => page.locator("table");

for (const [resolucao, tamanho] of Object.entries(RESOLUCOES) as [Resolucao, { width: number; height: number }][]) {
  test.describe(`completa — capturas ${resolucao} (${tamanho.width}×${tamanho.height})`, () => {
    test.use({ viewport: tamanho });

    test("admin: números, semáforo, lista e regras", async ({ page }) => {
      await entrarComo(page, usuarios.admin, senha);
      await page.goto("/obras");
      await expect(page.getByRole("heading", { level: 1, name: "Obras" })).toBeVisible();
      await expect(page.getByText("Obras em execução", { exact: true })).toBeVisible();
      await expect(page.getByText("Margem líquida prevista")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Como o semáforo decide" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Escalonamentos abertos \(\d+\)/ })).toBeVisible();
      await expect(page.getByRole("link", { name: "Apresentar →" }).first()).toBeVisible();
      await semRolagemHorizontal(page, "visão Completa");
      await capturar(page, resolucao, "30-completa-admin");
    });
  });
}

test.describe("completa — funcionamento", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("gestor também abre na Completa; vendedor fica com a lista de sempre", async ({ page }) => {
    await entrarComo(page, usuarios.gestor, senha);
    await page.goto("/obras");
    await expect(page.getByRole("heading", { name: "Como o semáforo decide" })).toBeVisible();

    await entrarComo(page, usuarios.vendedor, senha);
    await page.goto("/obras");
    await expect(page.getByRole("heading", { name: "Como o semáforo decide" })).toHaveCount(0);
    await expect(page.getByText("Obras em execução", { exact: true })).toHaveCount(0);
  });

  test("filtros por cor e concluídas; a lista por setor continua a um clique", async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto("/obras");
    const filtro = page.getByRole("navigation", { name: "Filtro" });
    for (const rotulo of ["Vermelhas", "Amarelas", "Verdes"]) {
      await filtro.getByRole("link", { name: rotulo }).click();
      await expect(filtro.getByRole("link", { name: rotulo })).toHaveAttribute("aria-current", "page");
      // Toda linha mostrada é da cor do filtro.
      const cor = rotulo.slice(0, -1);
      for (const celula of await tabela(page).locator("tbody tr td:first-child").all()) await expect(celula).toHaveText(cor);
    }
    await filtro.getByRole("link", { name: "Concluídas" }).click();
    await expect(page).toHaveURL(/cor=concluidas/);

    await page.getByRole("link", { name: "Lista por setor" }).click();
    await expect(page.getByText("12 de 12 obras")).toBeVisible();
    await page.getByRole("link", { name: "‹ Visão Completa" }).click();
    await expect(page.getByRole("heading", { name: "Como o semáforo decide" })).toBeVisible();
  });

  test("escalonamento aberto na ficha aparece em Pedem decisão; fechado, sai", async ({ page }) => {
    await entrarComo(page, usuarios.admin, senha);
    await page.goto(`/obras/${obras.o01}`);
    const cartao = page.locator("#escalonamentos");
    await cartao.locator("summary", { hasText: "Abrir escalonamento" }).click();
    const titulo = `Aprovar custo extra (e2e ${Date.now()})`;
    await cartao.getByLabel("O que precisa de decisão").fill(titulo);
    await cartao.getByLabel("Fora do programado (R$)").fill("14.600,00");
    await cartao.getByRole("button", { name: "Abrir escalonamento" }).click();
    await expect(cartao.getByText("Escalonamento aberto.")).toBeVisible();

    await page.goto("/obras");
    const pedem = page.getByRole("link", { name: new RegExp(titulo.replace(/[()]/g, "\\$&")) });
    await expect(pedem).toBeVisible();
    await expect(page.getByText(/14.600,00 fora do programado/).first()).toBeVisible();
    await capturar(page, "desktop", "31-completa-escalonamento-aberto");

    await pedem.click();
    await expect(page).toHaveURL(new RegExp(`/obras/${obras.o01}#escalonamentos`));
    await cartao.getByText("Fechar com a decisão").first().click();
    await cartao.getByLabel("Decisão tomada").first().fill("Custo aprovado (e2e).");
    await cartao.getByRole("button", { name: "Fechar", exact: true }).first().click();
    // Fechado, sai dos abertos e vai para "Fechados".
    await expect(cartao.getByText(/^Fechados \(\d+\)$/)).toBeVisible();
    await page.goto("/obras");
    await expect(page.getByRole("link", { name: new RegExp(titulo.replace(/[()]/g, "\\$&")) })).toHaveCount(0);
  });
});
