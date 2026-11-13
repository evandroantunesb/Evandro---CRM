import { expect, test } from "@playwright/test";
import { entrarComo, lerBase } from "./ajuda";

// Configurações › Funis e etapas: o seletor de cor dispara "input" a cada movimento; só a confirmação ("change") envia
// a cor ao servidor. Antes cada movimento virava um envio e a tela travava. A cor original volta no fim.
test("cor da etapa: arrastar no seletor não envia; confirmar envia uma vez e salva", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto("/configuracoes/funil");

  const etapa = () => page.getByRole("listitem").filter({ has: page.locator('input[value="Proposta enviada"]') }).first();
  const cor = () => etapa().getByLabel("Cor da etapa");
  const original = await cor().inputValue();

  let envios = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) envios++;
  });

  // Arrastar dentro do seletor: vários "input", nenhum envio.
  // Setter nativo (como o navegador): `el.value = …` atualizaria o rastreador de valor do React e esconderia o bug.
  await cor().evaluate((el: HTMLInputElement) => {
    const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (const valor of ["#111111", "#222222", "#333333", "#444444", "#123456"]) {
      definir.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForTimeout(500);
  expect(envios).toBe(0);

  // Confirmar a cor: um envio só.
  const resposta = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await cor().evaluate((el: HTMLInputElement) => el.dispatchEvent(new Event("change", { bubbles: true })));
  await resposta;
  await page.waitForTimeout(300);
  expect(envios).toBe(1);

  await page.reload();
  await expect(cor()).toHaveValue("#123456");

  // Devolve a cor original para os demais testes.
  const volta = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await cor().evaluate((el: HTMLInputElement, valor: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, valor);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, original);
  await volta;
  await page.reload();
  await expect(cor()).toHaveValue(original);
});
