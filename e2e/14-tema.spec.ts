import { expect, test, type Page } from "@playwright/test";
import { capturar, entrarComo, lerBase, RESOLUCOES, semRolagemHorizontal } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Tema do app (claro, escuro ou do sistema): o seletor da barra lateral grava o cookie raion_tema, o servidor
 * aplica o data-tema no wrapper .tema-app (sem piscar) e a escolha sobrevive ao recarregar. Telas públicas
 * ficam fora do tema. Capturas das telas principais nos dois temas (desktop e celular), sem rolagem horizontal.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

const wrapper = (page: Page) => page.locator(".tema-app");
const fundo = (page: Page) => wrapper(page).evaluate((el) => getComputedStyle(el).backgroundColor);

async function usarTema(page: Page, tema: "claro" | "escuro") {
  const url = new URL(page.url());
  await page.context().addCookies([{ name: "raion_tema", value: tema, url: url.origin }]);
}

test.describe("seletor de tema", () => {
  test.use({ viewport: RESOLUCOES.desktop });

  test("escolher escuro aplica na hora, persiste ao recarregar e volta ao claro", async ({ page }) => {
    await entrarComo(page, base.usuarios.admin, base.senha);
    await expect(wrapper(page)).toHaveAttribute("data-tema", "sistema");

    const grupo = page.getByRole("group", { name: "Tema" }).first();
    await grupo.getByRole("button", { name: "Tema escuro" }).click();
    await expect(wrapper(page)).toHaveAttribute("data-tema", "escuro");
    await expect(grupo.getByRole("button", { name: "Tema escuro" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => fundo(page)).toBe("rgb(15, 15, 16)");

    await page.reload();
    await expect(wrapper(page)).toHaveAttribute("data-tema", "escuro");

    await page.getByRole("group", { name: "Tema" }).first().getByRole("button", { name: "Tema claro" }).click();
    await expect(wrapper(page)).toHaveAttribute("data-tema", "claro");
    await expect.poll(() => fundo(page)).toBe("rgb(250, 248, 243)");
  });

  test("'sistema' segue o aparelho", async ({ browser }) => {
    const contexto = await browser.newContext({ viewport: RESOLUCOES.desktop, colorScheme: "dark" });
    const page = await contexto.newPage();
    await entrarComo(page, base.usuarios.admin, base.senha);
    await expect(wrapper(page)).toHaveAttribute("data-tema", "sistema");
    await expect.poll(() => fundo(page)).toBe("rgb(15, 15, 16)");
    await contexto.close();
  });

  test("tela pública fica fora do tema", async ({ page }) => {
    await page.context().addCookies([{ name: "raion_tema", value: "escuro", url: "http://localhost:3100" }]);
    await page.goto("/login");
    await expect(page.locator(".tema-app")).toHaveCount(0);
  });
});

const TELAS = [
  ["inicio", "/inicio"],
  ["negocios", "/negocios"],
  ["novo-negocio", "/negocios/novo"],
  ["contatos", "/contatos"],
  ["obras", "/obras"],
  ["calculadora", "/configuracoes/calculadora"],
  ["gamificacao", "/gamificacao"],
] as const;

for (const resolucao of ["desktop", "celular"] as const) {
  test.describe(`telas nos dois temas — ${resolucao}`, () => {
    test.use({ viewport: RESOLUCOES[resolucao] });

    for (const tema of ["claro", "escuro"] as const) {
      test(`${tema}: capturas e sem rolagem horizontal`, async ({ page }) => {
        await entrarComo(page, base.usuarios.admin, base.senha);
        await usarTema(page, tema);
        for (const [nome, rota] of TELAS) {
          await page.goto(rota);
          await expect(wrapper(page)).toHaveAttribute("data-tema", tema);
          await semRolagemHorizontal(page, `${nome} (${tema})`);
          await capturar(page, resolucao, `tema-${tema}-${nome}`);
        }
      });
    }
  });
}
