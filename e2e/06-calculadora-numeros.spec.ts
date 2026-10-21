import { expect, test, type Page } from "@playwright/test";
import { clienteDe, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * M2-a — números no padrão brasileiro na calculadora (interface real + Supabase LOCAL).
 * Defeito reproduzido antes da correção: 1200 kWh salvo reabria como "1.200" e, salvo de novo sem
 * editar, virava 1,2 kWh (economia R$ 0,00). Aqui: salvar → reabrir → salvar sem editar não muda
 * nenhum número; "1.200,50" tem prévia e grava 1200,5; "1.2" é recusado sem gravar.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

type Calculo = { consumo_medio_kwh: number; tarifa_kwh: number; geracao_estimada_kwh_mes: number; economia_mensal: number; payback_meses: number | null };

async function novoNegocio(nome: string) {
  const v = base.usuarios.vendedor;
  const c = await clienteDe(v, base.senha);
  const { data: funil } = await c.from("funis").select("id").eq("empresa_id", base.empresaA).single();
  const { data: etapa } = await c.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await c.from("contatos").insert({ empresa_id: base.empresaA, nome, telefone: "(45) 90000-0000" }).select("id").single();
  if (e1) throw e1;
  const { data: negocio, error: e2 } = await c
    .from("negocios")
    .insert({ empresa_id: base.empresaA, titulo: `Sistema solar — ${nome}`, contato_id: contato!.id, funil_id: funil!.id, etapa_id: etapa!.id, responsavel_id: v.membroId, valor: 25000 })
    .select("id")
    .single();
  if (e2) throw e2;
  const calculo = async () => {
    const { data } = await c
      .from("calculos_solares")
      .select("consumo_medio_kwh, tarifa_kwh, geracao_estimada_kwh_mes, economia_mensal, payback_meses")
      .eq("negocio_id", negocio!.id)
      .maybeSingle();
    return data as Calculo | null;
  };
  return { id: negocio!.id, calculo };
}

async function montarKit(page: Page, consumo: string, tarifa: string) {
  await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
  await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 550 W");
  await page.getByLabel("Potência (W)").last().fill("550");
  await page.getByLabel("Qtd.").last().fill("10");
  await page.getByLabel("Consumo médio (kWh/mês)").fill(consumo);
  await page.getByLabel("Tarifa base (TE + TUSD) (R$/kWh)").fill(tarifa);
}

async function salvar(page: Page) {
  await page.getByRole("button", { name: /^Salvar kit/ }).click();
  await expect(page.getByRole("button", { name: "Editar kit / recalcular" })).toBeVisible();
}

test.describe("calculadora: números no padrão brasileiro", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1200 kWh: salvar → reabrir → salvar sem editar mantém consumo e resultados", async ({ page }) => {
    const n = await novoNegocio("Cliente M2-a ida e volta (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(`/negocios/${n.id}`);
    await montarKit(page, "1200", "0,95");
    await expect(page.getByText("660 kWh/mês")).toBeVisible(); // prévia
    await salvar(page);
    const primeiro = await n.calculo();
    expect(primeiro).toMatchObject({ consumo_medio_kwh: 1200, tarifa_kwh: 0.95, geracao_estimada_kwh_mes: 660 });
    expect(primeiro!.economia_mensal).toBeGreaterThan(0);

    for (let i = 0; i < 2; i++) {
      await page.reload();
      await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
      await expect(page.getByLabel("Consumo médio (kWh/mês)")).toHaveValue("1.200");
      await expect(page.getByLabel("Tarifa base (TE + TUSD) (R$/kWh)")).toHaveValue("0,95");
      await salvar(page);
      expect(await n.calculo()).toEqual(primeiro);
    }
    await expect(page.getByText("1.200 kWh/mês")).toBeVisible();
  });

  test("1.200,50 tem prévia e grava 1200,5; 1.2 é recusado sem gravar", async ({ page }) => {
    const n = await novoNegocio("Cliente M2-a decimal (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(`/negocios/${n.id}`);
    await montarKit(page, "1.200,50", "0,95");
    await expect(page.getByText("660 kWh/mês")).toBeVisible(); // antes: sem prévia
    await salvar(page);
    expect((await n.calculo())!.consumo_medio_kwh).toBe(1200.5);

    const antes = await n.calculo();
    await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
    await page.getByLabel("Consumo médio (kWh/mês)").fill("1.2");
    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Número inválido" })).toBeVisible();
    expect(await n.calculo()).toEqual(antes);
  });
});
