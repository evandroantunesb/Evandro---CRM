import { expect, test } from "@playwright/test";
import { abrirAba, anexarDocumentosContrato, CLIENTE_CONTRATO, clienteDe, clienteServico, entrarComo, fichaNaAba, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Contrato: conferir, editar e enviar (18/11/2026; interface real + Supabase LOCAL, base fictícia).
 * O vendedor gera o contrato, confere o texto formatado no cartão, ajusta à mão (marca "editado à mão"), "Gerar
 * novamente" pede confirmação antes de perder a edição, o WhatsApp abre a conversa do cliente e o link público mostra
 * o texto formatado.
 */

const MODELO = [
  "# CONTRATO DE INSTALAÇÃO",
  "**CONTRATANTE:** {{cliente_nome}}",
  "## CLÁUSULA 1ª",
  "Valor de {{negocio_valor}} ({{negocio_valor_extenso}}).",
  "- Telhado: {{tipo_telhado}}",
  "- Local: {{endereco_instalacao}}",
].join("\n");

let base: BaseFicticia;
test.beforeAll(async () => {
  base = lerBase();
  // Fixture: modelo da empresa A pelo serviço local (o admin o cadastraria em Configurações).
  const { error } = await clienteServico().from("modelos_contrato").upsert({ empresa_id: base.empresaA, conteudo: MODELO });
  if (error) throw error;
});

async function negocioDoVendedor(nome: string) {
  const v = base.usuarios.vendedor;
  const c = await clienteDe(v, base.senha);
  const { data: funil } = await c.from("funis").select("id").eq("empresa_id", base.empresaA).single();
  const { data: etapa } = await c.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await c.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: base.empresaA, nome }).select("id").single();
  if (e1) throw e1;
  const { data: negocio, error: e2 } = await c
    .from("negocios")
    .insert({
      empresa_id: base.empresaA,
      titulo: `Sistema solar — ${nome}`,
      contato_id: contato!.id,
      funil_id: funil!.id,
      etapa_id: etapa!.id,
      responsavel_id: v.membroId,
      valor: 42500,
      tipo_telhado: "metálico",
      endereco_instalacao: "Sítio Boa Vista, km 3",
    })
    .select("id")
    .single();
  if (e2) throw e2;
  await anexarDocumentosContrato(base.empresaA, negocio!.id);
  return negocio!.id;
}

test.describe("contrato: conferir, editar e enviar", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("gera, confere formatado, edita, pede confirmação ao gerar de novo e envia ao cliente", async ({ page }) => {
    const id = await negocioDoVendedor("Marcos Contrato (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(id, "Conta e sistema"));
    await abrirAba(page, "Proposta e contrato");

    await page.getByRole("button", { name: "Gerar contrato" }).click();
    const texto = page.getByTestId("texto-contrato");
    await expect(texto.getByRole("heading", { name: "CLÁUSULA 1ª" })).toBeVisible();
    await expect(texto).toContainText("quarenta e dois mil e quinhentos reais");
    await expect(texto).toContainText("Telhado: metálico");
    await expect(texto).toContainText("Sítio Boa Vista, km 3");
    await expect(texto).not.toContainText("##");
    await expect(texto.locator("strong", { hasText: "CONTRATANTE:" })).toBeVisible();

    const whatsapp = page.getByRole("link").filter({ has: page.getByRole("button", { name: "Enviar no WhatsApp" }) });
    await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/5545900000000\?text=/);
    await expect(page.getByText("Abre a conversa com Marcos Contrato (fictício)")).toBeVisible();

    // Edição à mão.
    await page.getByRole("button", { name: "Editar texto" }).click();
    await page.getByLabel("Texto do contrato").fill("# CONTRATO AJUSTADO\nEntrada via Pix em 25/11/2026.");
    await page.getByRole("button", { name: "Salvar texto" }).click();
    await expect(page.getByTestId("contrato-editado")).toContainText("Texto editado à mão · Vera Vendedora (fictícia)");
    await expect(texto).toContainText("Entrada via Pix em 25/11/2026.");

    // Link público já mostra o texto editado, formatado.
    const { data: contrato } = await clienteServico().from("contratos").select("token").eq("negocio_id", id).single();
    const publico = await page.context().newPage();
    await publico.goto(`/contrato/${contrato!.token}`);
    await expect(publico.getByRole("heading", { name: "CONTRATO AJUSTADO" })).toBeVisible();
    await publico.close();

    // Gerar novamente com edição: confirma antes; "Manter" desiste.
    await page.getByRole("button", { name: "Gerar novamente" }).click();
    await expect(page.getByText("O texto volta ao modelo e você perde as edições feitas à mão. Gerar de novo?")).toBeVisible();
    await page.getByRole("button", { name: "Manter" }).click();
    await expect(page.getByTestId("contrato-editado")).toBeVisible();
    await page.getByRole("button", { name: "Gerar novamente" }).click();
    await page.getByRole("button", { name: "Gerar e perder edições" }).click();
    await expect(page.getByTestId("contrato-editado")).toHaveCount(0);
    await expect(texto.getByRole("heading", { name: "CLÁUSULA 1ª" })).toBeVisible();
  });
});
