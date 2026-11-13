import { expect, test, type Page } from "@playwright/test";
import { clienteDe, clienteServico, entrarComo, fichaNaAba, lerBase } from "./ajuda";
import { noBancoLocal, type BaseFicticia } from "./base-ficticia";

/**
 * Compras P4c: o valor do negócio abaixo do preço sugerido pela tabela, além do limite da vendedora, pede aprovação.
 * A vendedora vê o cartão "Desconto" com o aviso e pede (o % já vem preenchido); o gestor da equipe vê "Aprovar
 * desconto" nas prioridades do Início, abre o negócio pelo link e aprova; a vendedora vê o pedido aprovado e o aviso
 * some. O sugerido (gravado pelo servidor ao salvar o kit) entra pelo dono do banco LOCAL, como na base fictícia.
 */
test.describe.configure({ mode: "serial" });

let base: BaseFicticia;
let negocioId: string;
let titulo: string;
let limitesAntes: { desconto_max_vendedor: number; desconto_max_gestor: number } | null;

test.beforeAll(async () => {
  base = lerBase();
  const s = clienteServico();
  const { data: atuais } = await s
    .from("condicoes_pagamento_preferencias")
    .select("desconto_max_vendedor, desconto_max_gestor")
    .eq("empresa_id", base.empresaA)
    .maybeSingle();
  limitesAntes = atuais;
  // Limites como o admin configura em Condições de pagamento: vendedora até 3%, gestor até 10%.
  const admin = await clienteDe(base.usuarios.admin, base.senha);
  const { error: eLimites } = await admin
    .from("condicoes_pagamento_preferencias")
    .upsert({ empresa_id: base.empresaA, desconto_max_vendedor: 3, desconto_max_gestor: 10 }, { onConflict: "empresa_id" });
  if (eLimites) throw eLimites;

  const nome = `Desconto Sugerido ${Date.now()}`;
  titulo = `Sistema solar — ${nome}`;
  const { data: funil } = await s.from("funis").select("id").eq("empresa_id", base.empresaA).limit(1).single();
  const { data: etapa } = await s.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await s
    .from("contatos")
    .insert({ empresa_id: base.empresaA, nome, telefone: "(45) 90000-0038", cidade: "Cascavel", uf: "PR" })
    .select("id")
    .single();
  if (e1) throw e1;
  const { data: negocio, error: e2 } = await s
    .from("negocios")
    .insert({
      empresa_id: base.empresaA,
      titulo,
      contato_id: contato!.id,
      funil_id: funil!.id,
      etapa_id: etapa!.id,
      responsavel_id: base.usuarios.vendedor.membroId,
      valor: 28000,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  negocioId = negocio!.id;
  await noBancoLocal("insert into public.negocio_precificacao (negocio_id, empresa_id, preco_sugerido) values ($1, $2, 30000)", [
    negocioId,
    base.empresaA,
  ]);
});

test.afterAll(async () => {
  // Devolve os limites da empresa A para os outros testes.
  const admin = await clienteDe(base.usuarios.admin, base.senha);
  await admin
    .from("condicoes_pagamento_preferencias")
    .update(limitesAntes ?? { desconto_max_vendedor: 0, desconto_max_gestor: 0 })
    .eq("empresa_id", base.empresaA);
});

const cartaoDesconto = (page: Page) => page.locator("#desconto");

test("vendedora: valor abaixo do sugerido além do limite pede aprovação", async ({ page }) => {
  await entrarComo(page, base.usuarios.vendedor, base.senha);
  await page.goto(fichaNaAba(negocioId, "Proposta e contrato"));
  const cartao = cartaoDesconto(page);
  await expect(cartao.getByRole("heading", { name: "Desconto", exact: true })).toBeVisible();
  await expect(cartao).toContainText(/Preço sugerido: R\$\s30\.000,00 · valor do negócio: R\$\s28\.000,00 · desconto de 6,67%/);
  await expect(cartao.getByRole("status")).toContainText("Acima do desconto liberado (3%)");
  await expect(cartao).toContainText("Você dá até 3% de desconto sem aprovação.");

  // O % do pedido já vem com o desconto atual.
  await expect(cartao.getByLabel("Desconto (%)")).toHaveValue("6,67");
  await cartao.getByLabel("Motivo (vai para o gestor)").fill("Cliente fecha esta semana com este valor (fictício)");
  await cartao.getByRole("button", { name: "Pedir aprovação do desconto" }).click();

  await expect(cartao).toContainText(/Pedido de R\$\s27\.999,00 \(−6,67%\)/);
  await expect(cartao.getByText("Aguardando aprovação", { exact: true })).toBeVisible();
  await expect(cartao.getByRole("status").filter({ hasText: "Pedido enviado. Quem pode aprovar já foi avisado." })).toBeVisible();
  await expect(
    cartao.getByRole("status").filter({ hasText: "Aguardando aprovação: a proposta e o contrato só saem depois dela" }),
  ).toBeVisible();
  await expect(cartao.getByRole("button", { name: "Cancelar pedido de desconto" })).toBeVisible();
});

test("gestor: aprova pelo Início", async ({ page }) => {
  await entrarComo(page, base.usuarios.gestor, base.senha);
  const prioridade = page.getByRole("listitem").filter({ hasText: titulo });
  await expect(prioridade).toContainText("Aprovar desconto");
  await expect(prioridade).toContainText(/pediu 6,67% de desconto \(R\$\s27\.999,00\)/);
  await prioridade.getByRole("link").first().click();

  await expect(page).toHaveURL(new RegExp(`/negocios/${negocioId}\\?aba=proposta#desconto$`));
  const cartao = cartaoDesconto(page);
  await expect(cartao.getByText("Aguardando aprovação", { exact: true })).toBeVisible();
  // Quem pediu é a vendedora: o gestor não cancela o pedido dela.
  await expect(cartao.getByRole("button", { name: "Cancelar pedido de desconto" })).toHaveCount(0);
  await cartao.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(cartao.getByText("Aprovado", { exact: true })).toBeVisible();
  await expect(cartao).toContainText(`Aprovado por ${base.usuarios.gestor.nome}`);

  // Decidido, sai das prioridades do Início.
  await page.goto("/inicio");
  await expect(page.getByRole("listitem").filter({ hasText: titulo })).toHaveCount(0);
});

test("vendedora: pedido aprovado libera o desconto", async ({ page }) => {
  await entrarComo(page, base.usuarios.vendedor, base.senha);
  await page.goto(fichaNaAba(negocioId, "Proposta e contrato"));
  const cartao = cartaoDesconto(page);
  await expect(cartao.getByText("Aprovado", { exact: true })).toBeVisible();
  await expect(cartao).toContainText(`Aprovado por ${base.usuarios.gestor.nome}`);
  await expect(cartao.getByRole("status")).toHaveCount(0);
});
