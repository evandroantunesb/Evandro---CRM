import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { clienteDe, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Proposta simples emitida (M2 P0; contrato .aurora/contratos/m2-p0-emissao-preservada-implantacao.md): o vendedor emite
 * pela ficha, o cliente abre o link sem login e baixa o PDF; depois de mudar negócio, kit e modelo, o MESMO link entrega
 * os MESMOS bytes. Interface real + Supabase LOCAL descartável, base fictícia.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const FONTE = "Relatório de geração real das usinas da região (e2e fictício)";
const RESPONSAVEL = "Eng. Ana Prado (e2e fictício)";

async function negocioComKit(nome: string, confirmarProdutividade: boolean) {
  const v = base.usuarios.vendedor;
  const c = await clienteDe(v, base.senha);
  const { data: funil } = await c.from("funis").select("id").eq("empresa_id", base.empresaA).single();
  const { data: etapa } = await c.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await c
    .from("contatos")
    .insert({ empresa_id: base.empresaA, nome, telefone: "(45) 90000-0000", cidade: "Cascavel", uf: "PR" })
    .select("id")
    .single();
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
      valor: 24900,
      consumo_medio_kwh: 450,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  const id = negocio!.id;
  const { error: e3 } = await c.from("kit_componentes").insert([
    { empresa_id: base.empresaA, negocio_id: id, tipo: "modulo", descricao: "Módulo fictício 550 W", potencia_w: 550, quantidade: 10, ordem: 0 },
    { empresa_id: base.empresaA, negocio_id: id, tipo: "inversor", descricao: "Inversor fictício 5 kW", potencia_w: null, quantidade: 1, ordem: 1 },
  ]);
  if (e3) throw e3;
  if (confirmarProdutividade) {
    const admin = await clienteDe(base.usuarios.admin, base.senha);
    const { data: p } = await admin.from("parametros_calculadora").select("produtividade_kwh_kwp_mes").eq("empresa_id", base.empresaA).single();
    const { error } = await admin.rpc("confirmar_produtividade_calculadora", {
      p_empresa_id: base.empresaA,
      p_valor: p!.produtividade_kwh_kwp_mes,
      p_fonte: FONTE,
      p_responsavel: RESPONSAVEL,
    });
    if (error) throw error;
  }
  return { id, cliente: c };
}

async function emitir(page: import("@playwright/test").Page, negocioId: string, validade: string) {
  await entrarComo(page, base.usuarios.vendedor, base.senha);
  await page.goto(`/negocios/${negocioId}`);
  await page.getByLabel("Válida até").fill(validade);
  await page.getByLabel("Condições de pagamento").fill("À vista por Pix ou transferência\nFinanciamento bancário, com parcelas a combinar");
  await page.getByRole("button", { name: /^Emitir/ }).click();
}

const AMANHA = () => new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

test.describe("proposta simples emitida", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("emitir, abrir o link sem login, baixar o PDF e reabrir depois de mudar negócio e kit: mesmo PDF", async ({ page, browser, request }) => {
    const n = await negocioComKit("Cliente emissão (fictício)", true);
    await emitir(page, n.id, AMANHA());
    await expect(page.getByText("Proposta v1 emitida.")).toBeVisible();
    await expect(page.getByTestId("lista-emissoes")).toContainText("Versão 1");

    const { data: linhas } = await n.cliente.from("propostas_emissoes").select("token, pdf_sha256, pdf_bytes, dados").eq("negocio_id", n.id);
    expect(linhas).toHaveLength(1);
    const v1 = linhas![0]!;

    // Cliente: sem login, contexto novo.
    const anonimo = await browser.newContext();
    const pagina = await anonimo.newPage();
    await pagina.goto(`/proposta/${v1.token}`);
    await expect(pagina.getByRole("heading", { name: "Cliente emissão (fictício)" })).toBeVisible();
    // 5,5 kWp × 120 (produtividade confirmada pela fixture acima; não é parâmetro de proposta real).
    await expect(pagina.getByText("660 kWh/mês", { exact: true })).toBeVisible();
    await expect(pagina.getByText("R$ 24.900,00")).toBeVisible();
    await expect(pagina.getByText("Esta proposta apresenta o sistema e sua geração estimada. Não inclui estimativa de economia ou prazo de retorno.")).toBeVisible();

    const resposta1 = await request.get(`/proposta/${v1.token}/pdf`);
    expect(resposta1.status()).toBe(200);
    expect(resposta1.headers()["content-type"]).toContain("application/pdf");
    const bytes1 = new Uint8Array(await resposta1.body());
    expect(Buffer.from(bytes1).subarray(0, 4).toString()).toBe("%PDF");
    expect(sha256(bytes1)).toBe(v1.pdf_sha256);
    expect(bytes1.byteLength).toBe(v1.pdf_bytes);

    // Mudanças depois da emissão: preço, consumo e kit do negócio.
    await n.cliente.from("negocios").update({ valor: 99999, consumo_medio_kwh: 10 }).eq("id", n.id);
    await n.cliente.from("kit_componentes").update({ quantidade: 40 }).eq("negocio_id", n.id).eq("tipo", "modulo");

    await pagina.reload();
    await expect(pagina.getByText("R$ 24.900,00")).toBeVisible();
    await expect(pagina.getByText("R$ 99.999,00")).toHaveCount(0);
    const resposta2 = await request.get(`/proposta/${v1.token}/pdf`);
    expect(sha256(new Uint8Array(await resposta2.body()))).toBe(v1.pdf_sha256);
    await anonimo.close();

    // Nova versão: outro link, outro arquivo; a anterior continua igual.
    await page.reload();
    await page.getByLabel("Válida até").fill(AMANHA());
    await page.getByLabel("Condições de pagamento").fill("À vista por Pix ou transferência");
    await page.getByRole("button", { name: /^Emitir/ }).click();
    await expect(page.getByText("Proposta v2 emitida.")).toBeVisible();
    const { data: depois } = await n.cliente.from("propostas_emissoes").select("token, pdf_sha256, versao").eq("negocio_id", n.id).order("versao");
    expect(depois).toHaveLength(2);
    expect(depois![1]!.token).not.toBe(v1.token);
    expect(depois![1]!.pdf_sha256).not.toBe(v1.pdf_sha256);
    const resposta3 = await request.get(`/proposta/${v1.token}/pdf`);
    expect(sha256(new Uint8Array(await resposta3.body()))).toBe(v1.pdf_sha256);
  });

  test("sem a produtividade confirmada pelo admin a proposta sai SEM o número de geração", async ({ page, request }) => {
    // Empresa fictícia compartilhada: apaga a confirmação mudando e restaurando o valor pelo admin.
    const admin = await clienteDe(base.usuarios.admin, base.senha);
    const { data: p } = await admin.from("parametros_calculadora").select("produtividade_kwh_kwp_mes").eq("empresa_id", base.empresaA).single();
    const atual = p!.produtividade_kwh_kwp_mes;
    await admin.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: atual + 1 }).eq("empresa_id", base.empresaA);
    await admin.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: atual }).eq("empresa_id", base.empresaA);

    const n = await negocioComKit("Cliente sem geração (fictício)", false);
    await emitir(page, n.id, AMANHA());
    await expect(page.getByTestId("geracao-status")).toContainText("fora da proposta");
    await expect(page.getByText("Proposta v1 emitida.")).toBeVisible();
    const { data } = await n.cliente.from("propostas_emissoes").select("token, dados").eq("negocio_id", n.id).single();
    expect((data!.dados as { sistema: { geracao: unknown } }).sistema.geracao).toBeNull();
    const html = await (await request.get(`/proposta/${data!.token}`)).text();
    expect(html).not.toContain("Geração estimada");
    // O rodapé também não promete a geração que não está na proposta.
    expect(html).toContain("Esta proposta apresenta o sistema. Não inclui estimativa de geração, economia ou prazo de retorno.");
  });

  test("SDR não vê o card de emissão e a validade é obrigatória e não pode ser passada", async ({ page }) => {
    const n = await negocioComKit("Cliente validade (fictício)", true);
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(`/negocios/${n.id}`);
    await expect(page.getByLabel("Válida até")).toHaveAttribute("required", "");
    await expect(page.getByLabel("Válida até")).toHaveAttribute("min", /^\d{4}-\d{2}-\d{2}$/);

    await entrarComo(page, base.usuarios.sdr, base.senha);
    await page.goto(`/negocios/${n.id}`);
    await expect(page.getByRole("button", { name: /^Emitir/ })).toHaveCount(0);
  });

  test("token inexistente não vira proposta (404); links antigos seguem o comportamento já coberto em 10-calculo-estados", async ({ request }) => {
    const resposta = await request.get(`/proposta/${crypto.randomUUID()}`);
    expect(resposta.status()).toBe(404);
  });
});
