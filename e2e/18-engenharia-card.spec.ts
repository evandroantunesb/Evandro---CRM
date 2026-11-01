import { expect, test } from "@playwright/test";
import { abrirTodosPassos, clienteServico, entrarComo, lerBase } from "./ajuda";

// Engenharia: a lista mostra as obras por etapa, o card abre e aceita uma tarefa do setor; quem não atua em Engenharia
// não entra nem na lista nem no card.
test("executor de Engenharia abre o card da obra e cria tarefa; Compras não entra", async ({ page }) => {
  const { usuarios, senha } = lerBase();
  const titulo = `Pedir vistoria ${Date.now()}`;

  await entrarComo(page, usuarios.execEng, senha);
  await page.getByRole("link", { name: "Engenharia", exact: true }).first().click();
  await page.waitForURL("**/engenharia");
  await expect(page.getByRole("heading", { name: "Engenharia", level: 1 })).toBeVisible();
  // A primeira obra com responsável que o executor vê na carteira: outros testes (03) trocam responsáveis e etapas da
  // base antes deste, então não se fixa obra nem etapa. As obras novas (sem responsável) ficam de fora: nelas ele ainda
  // não atua, só pode iniciar.
  const comResponsavel = page.getByRole("listitem").filter({ hasNotText: "Sem responsável" });
  const etapa = page.getByRole("region", { name: "Carteira por etapa" }).getByRole("region").filter({ has: comResponsavel }).first();
  const rotuloEtapa = (await etapa.getByRole("heading").textContent())!.replace(/\s*\(\d+\)$/, "");
  const link = etapa.locator(comResponsavel).first().getByRole("link");
  const obraId = (await link.getAttribute("href"))!.split("/").at(-1)!;
  const { data: obra } = await clienteServico().from("obras").select("numero, cliente_nome").eq("id", obraId).single();
  await link.click();

  await page.waitForURL(`**/engenharia/${obraId}`);
  await abrirTodosPassos(page);
  await expect(page.getByRole("heading", { name: obra!.cliente_nome, level: 1 })).toBeVisible();
  await expect(page.getByText(rotuloEtapa).first()).toBeVisible();

  const novo = page.locator("form").filter({ has: page.getByRole("button", { name: "Enviar ao setor" }) });
  await novo.getByPlaceholder(/O que a Engenharia precisa fazer/).fill(titulo);
  await expect(novo.getByRole("combobox", { name: "Setor" })).toHaveValue("engenharia");
  await novo.getByRole("button", { name: "Enviar ao setor" }).click();
  await expect(page.getByText(titulo, { exact: true })).toBeVisible();

  // Na Central, a tarefa da fila que o executor pode assumir aparece em "Precisa de você", com o link para o card.
  await page.goto("/engenharia");
  const tarefasMinhas = page.getByRole("region", { name: "Tarefas", exact: true });
  await expect(tarefasMinhas.getByText(titulo, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`^Obra #${obra!.numero} `) }).first()).toHaveAttribute("href", `/engenharia/${obraId}`);

  await entrarComo(page, usuarios.execCompras, senha);
  await page.goto("/engenharia");
  await expect(page.getByText("Você não atua em Engenharia nesta empresa.")).toBeVisible();
  const resposta = await page.goto(`/engenharia/${obraId}`);
  expect(resposta?.status()).toBe(404);
});
