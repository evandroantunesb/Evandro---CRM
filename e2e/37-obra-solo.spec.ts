import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../src/lib/supabase/database.types";
import { CLIENTE_CONTRATO, anexarDocumentosContrato, clienteServico } from "./ajuda";

// Obra do Solo (Onboarding, subprojeto 4b): o admin de uma empresa Solo marca "Instalação" com foto e anotação; o
// cliente abre o link sem login e vê a etapa feita e a foto, sem a anotação; "Gerar novo link" invalida o antigo.
// A empresa Solo é criada aqui, à parte da base fictícia.

const SENHA = "senha-e2e-obra-solo-123";
const sufixo = Date.now().toString(36);
const email = `e2e-solo-admin-${sufixo}@teste.raion`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let obraId = "";

test.beforeAll(async () => {
  const s = clienteServico();
  const { data: u, error } = await s.auth.admin.createUser({ email, password: SENHA, email_confirm: true, user_metadata: { nome: "Sol Solo" } });
  if (error || !u.user) throw error ?? new Error("usuário");
  const { data: empresa, error: ee } = await s.from("empresas").insert({ nome: `Solar Solo (E2E ${sufixo})` }).select("id").single();
  if (ee || !empresa) throw ee ?? new Error("empresa");
  const { error: ep } = await s.from("planos_empresa").upsert({ empresa_id: empresa.id, produto: "solo" } as never);
  if (ep) throw ep;
  const { data: membro, error: em } = await s.from("empresa_membros").insert({ empresa_id: empresa.id, user_id: u.user.id, papel: "admin" } as never).select("id").single();
  if (em || !membro) throw em ?? new Error("membro");

  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: el } = await admin.auth.signInWithPassword({ email, password: SENHA });
  if (el) throw el;
  const { data: f } = await s.from("funis").select("id").eq("empresa_id", empresa.id).single();
  const { data: et } = await s.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await s.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: empresa.id, nome: "Marcos Pereira" }).select("id").single();
  const { data: neg, error: en } = await s
    .from("negocios")
    .insert({ empresa_id: empresa.id, titulo: "Usina Marcos", contato_id: c!.id, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro.id, valor: 24900 })
    .select("id")
    .single();
  if (en || !neg) throw en ?? new Error("negócio");
  const passo = (r: { error: unknown }, nome: string) => {
    if (r.error) throw new Error(`${nome}: ${JSON.stringify(r.error)}`);
  };
  passo(await admin.from("negocios").update({ status: "ganho" }).eq("id", neg.id), "ganho");
  await anexarDocumentosContrato(empresa.id, neg.id);
  const { data: contrato, error: ec } = await admin.from("contratos").insert({ empresa_id: empresa.id, negocio_id: neg.id, conteudo: "Contrato E2E" }).select("id").single();
  if (ec || !contrato) throw ec ?? new Error("contrato");
  passo(await admin.from("contratos").update({ status: "assinado" }).eq("id", contrato.id), "assinatura");
  passo(await admin.rpc("confirmar_pagamento", { p_contrato_id: contrato.id }), "pagamento");
  const { data: obra } = await s.from("obras").select("id").eq("negocio_id", neg.id).single();
  obraId = obra!.id;
});

async function entrar(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/inicio", { timeout: 30_000 });
}

const token = async () => (await clienteServico().from("obras").select("link_cliente").eq("id", obraId).single()).data!.link_cliente!;

test.describe("obra do Solo", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("marca a instalação com foto e o cliente vê pelo link, sem a anotação; o link antigo deixa de valer", async ({ page, browser }) => {
    await entrar(page);
    await page.goto("/obras");
    await expect(page.getByRole("heading", { name: "1 obra em andamento", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: /Marcos Pereira/ }).click();
    await expect(page.getByRole("heading", { name: "Do contrato à entrega" })).toBeVisible();

    await page.getByRole("button", { name: "Instalação", exact: true }).click();
    await page.getByLabel("Escolher foto").setInputFiles({ name: "instalacao.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: "Foto da etapa" })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Anotação · Só você vê").fill("Telhas trocadas, cliente ciente");
    await page.getByRole("button", { name: "Salvar anotação" }).click();
    await expect(page.getByRole("button", { name: "Salvar anotação" })).toBeDisabled();
    await page.getByRole("button", { name: "✓ Marcar como feita" }).click();
    await expect(page.getByText("Etapa marcada. Quer avisar o cliente?")).toBeVisible();
    await expect(page.getByRole("link", { name: "Avisar no WhatsApp" }).first()).toHaveAttribute("href", /^https:\/\/wa\.me\/5545900000000\?text=/);

    const antigo = await token();
    const cliente = await browser.newPage();
    await cliente.goto(`/obra/${antigo}`);
    await expect(cliente.getByRole("heading", { name: /Olá, Marcos\./ })).toBeVisible();
    await expect(cliente.getByText("Instalação", { exact: true })).toBeVisible();
    await expect(cliente.getByRole("img", { name: "Foto 1 de Instalação" })).toBeVisible();
    await expect(cliente.getByText("Telhas trocadas")).toHaveCount(0);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Gerar novo link" }).click();
    await expect(page.getByText("Link novo gerado. O antigo parou de funcionar.")).toBeVisible();
    await cliente.goto(`/obra/${antigo}`);
    await expect(cliente.getByText("Link inválido ou trocado.")).toBeVisible();
    await cliente.goto(`/obra/${await token()}`);
    await expect(cliente.getByRole("img", { name: "Foto 1 de Instalação" })).toBeVisible();
    await cliente.close();
  });
});
