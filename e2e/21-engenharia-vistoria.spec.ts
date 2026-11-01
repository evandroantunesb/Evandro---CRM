import { expect, test, type Locator, type Page } from "@playwright/test";
import { abrirTodosPassos, clienteDe, entrarComo, lerBase } from "./ajuda";

const cartao = (page: Page, titulo: string): Locator =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: titulo, level: 2 }) });
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

// Engenharia (P4): na o10 (só Compras é usado por outro teste), o protocolo aprovado e a instalação concluída são
// preparados pelas RPCs reais; pela tela, o admin pede a vistoria, registra a não conformidade, registra a correção de
// campo no card do Operacional (tela da obra), pede de novo, aprova,
// registra medidor e conexão e só então conclui a Engenharia. O vendedor vê só a situação, no card do Operacional.
test("vistoria com não conformidade, nova vistoria, medidor, conexão e conclusão", async ({ page }) => {
  test.setTimeout(180_000);
  const { usuarios, senha, obras } = lerBase();
  const obra = obras.o10;
  const admin = await clienteDe(usuarios.admin, senha);
  const feito = (r: { error: { message: string } | null }, ctx: string) => {
    if (r.error) throw new Error(`${ctx}: ${r.error.message}`);
  };
  feito(await admin.rpc("aplicar_checklist_engenharia", { p_obra_id: obra }), "checklist");
  const { data: itens } = await admin.from("obra_engenharia_itens").select("id").eq("obra_id", obra).eq("obrigatorio", true);
  for (const i of itens ?? []) feito(await admin.rpc("alterar_item_engenharia", { p_item_id: i.id, p_status: "dispensado", p_motivo: "Teste E2E" }), "item");
  const protocolo = await admin.rpc("registrar_protocolo_engenharia", {
    p_obra_id: obra,
    p_distribuidora: "Copel",
    p_canal: "pew",
    p_numero: "E2E-21-001",
    p_tipo_solicitacao: "nova_conexao",
    p_protocolado_em: hoje(),
  });
  feito(protocolo, "protocolo");

  await entrarComo(page, usuarios.admin, senha);
  await page.goto(`/engenharia/${obra}`);
  await abrirTodosPassos(page);
  const vistoria = cartao(page, "Vistoria e conexão");
  // Gate G5 explicado na tela.
  await expect(vistoria.getByText(/depois que o protocolo for aprovado/)).toBeVisible();

  feito(await admin.rpc("registrar_evento_protocolo_engenharia", { p_protocolo_id: protocolo.data as string, p_tipo: "aprovado", p_ocorrido_em: hoje() }), "aprovar");
  await page.reload();
  await abrirTodosPassos(page);
  await expect(vistoria.getByText(/depois que o Operacional concluir a instalação/)).toBeVisible();
  feito(await admin.rpc("alterar_status_fluxo_obra", { p_obra_id: obra, p_setor: "operacional", p_status: "instalacao_concluida" }), "instalação");
  await page.reload();
  await abrirTodosPassos(page);

  // Pedido → Engenharia em "Aguardando vistoria".
  await vistoria.getByLabel("Número do pedido (opcional)").fill("VIS-E2E-21");
  await vistoria.getByRole("button", { name: "Registrar pedido de vistoria" }).click();
  await expect(vistoria.getByText("Solicitada", { exact: true })).toBeVisible();
  await expect(cartao(page, "Engenharia").getByText("Aguardando vistoria").first()).toBeVisible();

  const registrar = async (tipo: string, descricao?: string) => {
    await vistoria.getByLabel("O que aconteceu").selectOption(tipo);
    if (descricao) await vistoria.getByLabel("O que foi apontado").fill(descricao);
    await vistoria.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(vistoria.getByRole("button", { name: "Registrando..." })).toHaveCount(0);
  };

  await registrar("nao_conformidade", "Placa de advertência ausente (fictício)");
  await expect(vistoria.getByText(/apontou não conformidade/)).toBeVisible();

  // Correção de campo pela tela da obra, no card do Operacional (o admin atua nos dois setores).
  await page.goto(`/obras/${obra}`);
  const campo = page.locator("form").filter({ hasText: "Registrar andamento" });
  await expect(campo).toHaveCount(1);
  await campo.getByLabel("O que aconteceu").selectOption("correcao_campo");
  await campo.getByLabel("O que foi corrigido").fill("Placa de advertência instalada (fictício)");
  await campo.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Correção de campo feita").first()).toBeVisible();
  await page.goto(`/engenharia/${obra}`);
  await abrirTodosPassos(page);
  await expect(vistoria.locator("li").filter({ hasText: "Correção de campo feita" })).toBeVisible();

  await vistoria.getByRole("button", { name: "Registrar pedido de vistoria" }).click();
  await expect(vistoria.getByText("Solicitada", { exact: true })).toBeVisible();
  await expect(vistoria.getByText("Vistorias anteriores (1)")).toBeVisible();

  await registrar("aprovada");
  await expect(vistoria.getByText(/Vistoria aprovada não é conexão/)).toBeVisible();

  // Gate G6 na tela: aprovada sem conexão não conclui.
  await page.locator("summary").filter({ hasText: "Atualizar Engenharia" }).click();
  await page.getByLabel("Status de Engenharia").selectOption("concluido");
  await page.getByRole("button", { name: "Salvar status" }).click();
  await expect(page.getByText("Para concluir a Engenharia, registre a vistoria aprovada e a conexão confirmada.")).toBeVisible();

  await registrar("medidor_adequado");
  await vistoria.getByLabel("O que aconteceu").selectOption("conexao_confirmada");
  await vistoria.getByLabel(/^Arquivos/).setInputFiles({ name: "conexao.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
  await vistoria.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(vistoria.getByRole("link", { name: /conexao\.pdf/ })).toBeVisible();
  await expect(vistoria.getByText(/Conexão confirmada\. Conclua a Engenharia/)).toBeVisible();

  await page.reload();
  await abrirTodosPassos(page);
  await page.locator("summary").filter({ hasText: "Atualizar Engenharia" }).click();
  await page.getByLabel("Status de Engenharia").selectOption("concluido");
  await page.getByRole("button", { name: "Salvar status" }).click();
  await expect(cartao(page, "Engenharia").getByText("Concluído").first()).toBeVisible();

  // Vendedor: sem o card da Engenharia; no card do Operacional, só situação e datas.
  await page.context().clearCookies();
  await entrarComo(page, usuarios.vendedor, senha);
  await page.goto(`/obras/${obra}`);
  const resumo = page.getByLabel("Vistoria da distribuidora");
  await expect(resumo).toContainText("Aprovada");
  await expect(resumo).toContainText("Conexão confirmada em");
  await expect(page.locator("body")).not.toContainText("VIS-E2E-21");
  await expect(page.locator("body")).not.toContainText("Placa de advertência");
});
