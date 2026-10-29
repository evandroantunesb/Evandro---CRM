import { createHash } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { abrirAba, clienteDe, entrarComo, fichaNaAba, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Calculadora GD II integrada (M2 P0; contrato .aurora/contratos/m2-p0-decisao-fio-b-copel.md). Interface real + Supabase
 * LOCAL descartável, base fictícia. Fluxo: prévia → salvar → reabrir → proposta emitida; depois, entrada nova com base
 * tributária incompatível → resultado incompleto, cálculo anterior no histórico como desatualizado, versão emitida intacta;
 * e isolamento entre empresas.
 *
 * Data: o SERVIDOR de teste roda com o relógio em DATA_CALCULO (scripts/e2e-relogio.mjs, só no `next start` do e2e),
 * independente da data real; a emissão volta ao relógio real (o banco exige `emitida_em` perto do `now()` dele).
 * Caso numérico (22/10/2026: vigência da REH 3.592, 2026 → 60%): Copel residencial B1, bifásico
 * (D = 50 kWh), consumo 500 kWh, 5 × 500 W = 2,5 kWp × 120 = 300 kWh, T = 0,76802 (TE + TUSD, sem tributos).
 * Conta sem solar 384,01; com solar 192,22; economia 191,79; payback indisponível.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const AMANHA = () => new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Instante do cálculo: no passado em relação a qualquer execução (sessões e JWT nunca expiram no relógio deslocado). */
const DATA_CALCULO = "2026-10-22T12:00:00-03:00";
const ARQUIVO_RELOGIO = join(__dirname, ".estado", "relogio.json");

/** Data do servidor de teste: `iso` (deslocamento lido por scripts/e2e-relogio.mjs) ou a real (`null`). */
async function relogioDoServidor(page: Page, iso: string | null) {
  if (iso) writeFileSync(ARQUIVO_RELOGIO, JSON.stringify({ deslocamentoMs: Date.parse(iso) - Date.now() }));
  else rmSync(ARQUIVO_RELOGIO, { force: true });
  await page.waitForTimeout(400); // o servidor relê o arquivo a cada 250 ms
}

test.afterEach(() => {
  rmSync(ARQUIVO_RELOGIO, { force: true });
});

async function negocioResidencialCopel(nome: string) {
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
      valor: 19900,
      consumo_medio_kwh: 500,
      qualif_tipo_cliente: "residencial",
      qualif_distribuidora: "Copel",
    })
    .select("id")
    .single();
  if (e2) throw e2;
  // Produtividade confirmada (fixture, como no 12-proposta-emitida) para a proposta levar a geração.
  const admin = await clienteDe(base.usuarios.admin, base.senha);
  const { data: p } = await admin.from("parametros_calculadora").select("produtividade_kwh_kwp_mes").eq("empresa_id", base.empresaA).single();
  expect(p!.produtividade_kwh_kwp_mes).toBe(120);
  const { error: e3 } = await admin.rpc("confirmar_produtividade_calculadora", {
    p_empresa_id: base.empresaA,
    p_valor: p!.produtividade_kwh_kwp_mes,
    p_fonte: "Relatório de geração real das usinas da região (e2e fictício)",
    p_responsavel: "Eng. Ana Prado (e2e fictício)",
  });
  if (e3) throw e3;
  return { id: negocio!.id, cliente: c };
}

async function montarKit(page: Page) {
  await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
  await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 500 W");
  await page.getByLabel("Potência (W)").last().fill("500");
  await page.getByLabel("Qtd.").last().fill("5");
  await page.getByLabel("Tipo de ligação").selectOption("bifasico");
  await page.getByLabel("Consumo médio (kWh/mês)").fill("500");
}

test.describe("calculadora GD II integrada", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("prévia → salvar → reabrir → proposta; entrada nova incompleta vai ao histórico e a versão emitida não muda", async ({ page, browser, request }) => {
    await relogioDoServidor(page, DATA_CALCULO);
    const n = await negocioResidencialCopel("Cliente GD II Copel (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));

    // Sem cálculo: tarifa oficial e base "sem tributos" já vêm preenchidas, ambas editáveis.
    await montarKit(page);
    await expect(page.getByLabel("Tarifa (R$/kWh)")).toHaveValue("0,76802");
    await expect(page.getByLabel("Base tributária da tarifa")).toHaveValue("sem_tributos");
    await expect(page.getByTestId("tarifa-origem")).toContainText("Em uso.");

    // Prévia completa: contas, economia, payback indisponível, hipótese visível, limitações e detalhes recolhidos.
    const previa = page.getByTestId("previa-sistema");
    await expect(previa).toContainText("300 kWh/mês");
    await expect(previa).toContainText(/R\$\s384,01\/mês/);
    await expect(previa).toContainText(/R\$\s192,22\/mês/);
    await expect(page.getByTestId("previa-economia")).toHaveText(/^R\$\s191,79\/mês$/);
    await expect(page.getByTestId("previa-payback")).toHaveText("indisponível");
    await expect(page.getByTestId("hipotese-autoconsumo")).toContainText("autoconsumo simultâneo considerado zero");
    // Premissas presumidas sempre visíveis (fora do bloco recolhido); tarifa oficial: sem aviso de tarifa informada.
    await expect(page.getByTestId("premissas-presumidas")).toHaveText(
      "Presumido (confira na conta do cliente): tarifa convencional presumida (não tarifa branca); bifásico considerado a três condutores (custo de disponibilidade de 50 kWh).",
    );
    await expect(page.getByTestId("tarifa-informada")).toHaveCount(0);
    await expect(page.getByTestId("limitacoes-estimativa")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("detalhes-tecnicos")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("detalhes-tecnicos")).toContainText("214,5356");
    await expect(page.getByTestId("detalhes-tecnicos")).toContainText("Data de referência: 22/10/2026.");

    // Salvar: linha completa com o retrato dos parâmetros.
    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    await expect(page.getByText("Kit e cálculo salvos.")).toBeVisible();
    await expect(page.getByText("A conta e a economia ainda não foram calculadas.")).toHaveCount(0);
    const { data: linha } = await n.cliente
      .from("calculos_solares")
      .select(
        "estado_financeiro, conta_sem_solar, conta_com_solar, economia_mensal, payback_meses, tarifa_kwh, tarifa_base_tributaria, tarifa_origem, fio_b_rs_mwh, percentual_legal_fio_b, disponibilidade_kwh, tipo_ligacao, financeiro_desatualizado_em, data_referencia",
      )
      .eq("negocio_id", n.id)
      .single();
    expect(linha).toEqual({
      estado_financeiro: "completo",
      conta_sem_solar: 384.01,
      conta_com_solar: 192.22,
      economia_mensal: 191.79,
      payback_meses: null,
      tarifa_kwh: 0.76802,
      tarifa_base_tributaria: "sem_tributos",
      tarifa_origem: "oficial_aneel",
      fio_b_rs_mwh: 214.535600374,
      percentual_legal_fio_b: 0.6,
      disponibilidade_kwh: 50,
      tipo_ligacao: "bifasico",
      financeiro_desatualizado_em: null,
      data_referencia: "2026-10-22",
    });

    // Reabrir: o resultado salvo é o atual.
    await page.reload();
    await expect(page.getByTestId("resultado-atual")).toBeVisible();
    await expect(page.getByTestId("economia-salva")).toHaveText(/^R\$\s191,79\/mês$/);
    await expect(page.getByTestId("payback-salvo")).toHaveText("indisponível");
    await expect(page.getByTestId("hipotese-autoconsumo")).toBeVisible();
    await expect(page.getByTestId("detalhes-tecnicos")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("calculo-historico")).toHaveCount(0);
    // Link antigo (proposta com conta e economia, D1/D2 congelados): continua bloqueado mesmo com o cálculo completo.
    await abrirAba(page, "Proposta e contrato");
    await expect(page.getByRole("button", { name: "Gerar link da proposta" })).toBeDisabled();
    await expect(page.getByTestId("proposta-bloqueada")).toHaveText(
      "A proposta com conta e economia ainda não está liberada. Emita a proposta simples (sistema, geração e preço, sem economia).",
    );

    // Proposta simples emitida (sem economia: D1/D2 congelados), com o relógio real: o banco confere `emitida_em` e a
    // validade contra o próprio `now()`.
    await relogioDoServidor(page, null);
    await page.reload();
    await page.getByLabel("Válida até").fill(AMANHA());
    await page.getByLabel("Condições de pagamento").fill("À vista por Pix ou transferência");
    await page.getByRole("button", { name: /^Emitir/ }).click();
    await expect(page.getByText("Proposta v1 emitida.")).toBeVisible();
    const { data: emissoes } = await n.cliente.from("propostas_emissoes").select("token, pdf_sha256").eq("negocio_id", n.id);
    expect(emissoes).toHaveLength(1);
    const v1 = emissoes![0]!;
    const html1 = await (await request.get(`/proposta/${v1.token}`)).text();
    expect(html1).toMatch(/Geração estimada<\/dt><dd[^>]*>300(<!-- -->)? kWh\/mês/); // o React separa número e unidade com um comentário
    expect(html1).not.toContain("191,79");
    const pdf1 = new Uint8Array(await (await request.get(`/proposta/${v1.token}/pdf`)).body());
    expect(sha256(pdf1)).toBe(v1.pdf_sha256);

    // Entrada nova: base "com tributos" (incompatível com o Fio B sem tributos) → financeiro incompleto. De volta à data
    // do cálculo, para que a única pendência seja a base (e não a vigência).
    await relogioDoServidor(page, DATA_CALCULO);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
    await page.getByLabel("Base tributária da tarifa").selectOption("com_tributos");
    await expect(page.getByTestId("previa-economia")).toHaveCount(0);
    await expect(page.getByTestId("estimativa-incompleta")).toBeVisible();
    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    await expect(page.getByTestId("kit-salvo")).toContainText("guardado no histórico como desatualizado");

    const { data: depois } = await n.cliente
      .from("calculos_solares")
      .select("estado_financeiro, economia_mensal, conta_sem_solar, tarifa_base_tributaria, pendencias")
      .eq("negocio_id", n.id)
      .single();
    expect(depois).toMatchObject({ estado_financeiro: "incompleto", economia_mensal: null, conta_sem_solar: null, tarifa_base_tributaria: "com_tributos" });
    expect((depois!.pendencias as { codigo: string }[]).map((p) => p.codigo)).toEqual(["base_tributaria_divergente"]);
    const { data: hist } = await n.cliente.from("calculos_solares_historico").select("motivo, linha").eq("negocio_id", n.id);
    expect(hist).toHaveLength(1);
    expect(hist![0]!.motivo).toBe("desatualizado_por_entradas");
    expect(hist![0]!.linha).toMatchObject({ estado_financeiro: "completo", economia_mensal: 191.79, tarifa_base_tributaria: "sem_tributos" });

    // Reabrir: nenhuma economia atual; a antiga só no histórico, marcada como desatualizada.
    await page.reload();
    await expect(page.getByTestId("economia-salva")).toHaveCount(0);
    await expect(page.getByTestId("resultado-atual")).toHaveCount(0);
    const historico = page.getByTestId("calculo-historico");
    await expect(historico).toContainText("desatualizado");
    await expect(historico).not.toHaveAttribute("open", "");
    await historico.locator("summary").click();
    await expect(historico).toContainText(/R\$\s191,79\/mês/);
    await expect(historico).toContainText("não correspondem às entradas atuais e não entram em proposta");

    // A versão emitida continua exatamente a mesma (página e PDF).
    const anonimo = await browser.newContext();
    const pagina = await anonimo.newPage();
    await pagina.goto(`/proposta/${v1.token}`);
    await expect(pagina.getByRole("heading", { name: "Cliente GD II Copel (fictício)" })).toBeVisible();
    await expect(pagina.getByText("300 kWh/mês", { exact: true })).toBeVisible();
    await expect(pagina.getByText("R$ 19.900,00")).toBeVisible();
    await anonimo.close();
    const pdf2 = new Uint8Array(await (await request.get(`/proposta/${v1.token}/pdf`)).body());
    expect(sha256(pdf2)).toBe(v1.pdf_sha256);

    // Isolamento: a empresa B não vê o negócio, o cálculo, o histórico nem as emissões, e a tarifa ANEEL é só leitura.
    const b = await clienteDe(base.usuarios.vendedorB, base.senha);
    expect((await b.from("calculos_solares").select("id").eq("negocio_id", n.id)).data).toEqual([]);
    expect((await b.from("calculos_solares_historico").select("id").eq("negocio_id", n.id)).data).toEqual([]);
    expect((await b.from("propostas_emissoes").select("id").eq("negocio_id", n.id)).data).toEqual([]);
    const { data: tarifas } = await b.from("tarifas_gd_aneel").select("id, tusd_fio_b_rs_mwh");
    expect(tarifas!.length).toBeGreaterThan(0);
    const { data: alteradas } = await b.from("tarifas_gd_aneel").update({ tusd_fio_b_rs_mwh: 1 }).eq("id", tarifas![0]!.id).select("id");
    expect(alteradas ?? []).toEqual([]);
    await entrarComo(page, base.usuarios.vendedorB, base.senha);
    const resposta = await page.goto(`/negocios/${n.id}`);
    expect(resposta!.status()).toBe(404);
    await expect(page.getByText("Cliente GD II Copel (fictício)")).toHaveCount(0);
  });

  test("ligação muda o piso (art. 291): monofásico 30 kWh e trifásico 100 kWh na prévia", async ({ page }) => {
    await relogioDoServidor(page, DATA_CALCULO);
    const n = await negocioResidencialCopel("Cliente GD II pisos (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await montarKit(page);
    const detalhes = page.getByTestId("detalhes-tecnicos");
    await page.getByLabel("Tipo de ligação").selectOption("monofasico");
    await expect(detalhes).toContainText("art. 291): 30 kWh");
    await page.getByLabel("Tipo de ligação").selectOption("trifasico");
    await expect(detalhes).toContainText("art. 291): 100 kWh");
    await page.getByLabel("Tipo de ligação").selectOption("bifasico");
    await expect(detalhes).toContainText("art. 291): 50 kWh");
    await expect(page.getByTestId("previa-economia")).toHaveText(/^R\$\s191,79\/mês$/);
  });

  test("relógio do servidor fora da vigência (10/05/2026): sem tarifa oficial, estimativa incompleta mesmo com tarifa e base", async ({ page }) => {
    await relogioDoServidor(page, "2026-05-10T12:00:00-03:00");
    const n = await negocioResidencialCopel("Cliente GD II antes da vigência (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await montarKit(page);
    // Sem linha vigente nessa data: nada é sugerido e o vendedor não consegue "forçar" o resultado completo.
    await expect(page.getByLabel("Tarifa (R$/kWh)")).toHaveValue("");
    await expect(page.getByTestId("tarifa-origem")).toContainText("Sem tarifa oficial para este negócio");
    await page.getByLabel("Tarifa (R$/kWh)").fill("0,76802");
    await page.getByLabel("Base tributária da tarifa").selectOption("sem_tributos");
    await expect(page.getByTestId("previa-economia")).toHaveCount(0);
    await expect(page.getByTestId("pendencias-empresa").getByRole("listitem")).toHaveText(["Sem tarifa vigente da COPEL-DIS para 10/05/2026."]);
    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    await expect(page.getByTestId("kit-salvo")).toBeVisible();
    const { data } = await n.cliente.from("calculos_solares").select("estado_financeiro, economia_mensal, data_referencia, pendencias").eq("negocio_id", n.id).single();
    expect(data).toMatchObject({ estado_financeiro: "incompleto", economia_mensal: null, data_referencia: "2026-05-10" });
    expect((data!.pendencias as { codigo: string }[]).map((p) => p.codigo)).toEqual(["fio_b_vigencia_fora"]);
  });
});
