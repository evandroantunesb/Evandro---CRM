import { expect, test } from "@playwright/test";
import { abrirTodosPassos, entrarComo, lerBase } from "./ajuda";

// Engenharia (#317): na o11, depois do protocolo do teste 20 (em análise), o admin registra o orçamento de conexão.
// O passo 7 passa a mostrar a obra de rede; a vistoria fica bloqueada até a obra concluída. Registra as três
// etapas (pagamento com o prazo da Copel), corrige uma com motivo e confere que o bloqueio da obra de rede sai.
test("orçamento de conexão abre a obra de rede no passo 7 e segura a vistoria até a obra concluída", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  await entrarComo(page, usuarios.admin, senha);
  await page.goto(`/engenharia/${obras.o11}`);
  await abrirTodosPassos(page);

  const obraRede = page.getByRole("group", { name: "Obra de rede" });
  const msgObraRede = page.getByText(/a vistoria pode ser pedida depois da obra de rede concluída/);

  // Sem orçamento, o passo 7 não mostra a obra de rede.
  await expect(obraRede).toHaveCount(0);

  const protocolo = page.locator("section").filter({ has: page.getByRole("heading", { name: "Protocolo na concessionária", level: 2 }) });
  await protocolo.getByLabel("O que aconteceu").selectOption("orcamento_emitido");
  await protocolo.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(protocolo.getByText("Orçamento emitido", { exact: true }).first()).toBeVisible();

  await expect(obraRede).toBeVisible();
  await expect(msgObraRede).toBeVisible();

  const etapa = (titulo: string) => obraRede.getByRole("listitem").filter({ hasText: titulo });
  const documentos = etapa("Documentação enviada ao e-mail do cliente");
  const pagamento = etapa("Pagamento à distribuidora");
  const concluida = etapa("Obra de rede concluída");

  await documentos.getByRole("button", { name: "Registrar" }).click();
  await expect(documentos.getByText("Feito")).toBeVisible();

  await pagamento.getByLabel("Prazo da obra informado pela Copel").selectOption("90");
  await pagamento.getByRole("button", { name: "Registrar" }).click();
  await expect(pagamento.getByText(/prazo da obra: 90 dias úteis/)).toBeVisible();

  // Correção só com motivo; o prazo muda e o registro volta a aparecer sozinho.
  await pagamento.getByRole("button", { name: "Corrigir" }).click();
  await pagamento.getByLabel("Prazo da obra informado pela Copel").selectOption("130");
  await pagamento.getByLabel("Motivo da correção").fill("Copel corrigiu o prazo");
  await pagamento.getByRole("button", { name: "Salvar correção" }).click();
  await expect(pagamento.getByText(/prazo da obra: 130 dias úteis/)).toBeVisible();
  await expect(pagamento.getByLabel("Motivo da correção")).toHaveCount(0);

  await expect(msgObraRede).toBeVisible();
  await concluida.getByRole("button", { name: "Registrar" }).click();
  await expect(concluida.getByText("Feito")).toBeVisible();

  // Obra concluída: o bloqueio da obra de rede sai (a vistoria ainda pode esperar a instalação).
  await page.reload();
  await abrirTodosPassos(page);
  await expect(obraRede.getByText("Feito")).toHaveCount(3);
  await expect(msgObraRede).toHaveCount(0);
});
