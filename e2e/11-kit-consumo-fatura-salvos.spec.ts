import { expect, test, type Page } from "@playwright/test";
import { clienteDe, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * kWh e fatura do kit preservados (M2 P0, contrato .aurora/contratos/m2-p0-kit-consumo-fatura.md; interface real +
 * Supabase LOCAL descartável, base fictícia).
 *
 * Regra: campo vazio no kit mantém o valor gravado no negócio (a tela avisa com `kit-consumo-salvo` e
 * `kit-fatura-salva`); só "Dados do negócio" apaga. Nenhuma linha nova em `calculos_solares`.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

const ROTULO_KWH = "Consumo médio (kWh/mês)";
const ROTULO_FATURA = "Valor médio da fatura (R$, opcional)";
const TEXTO_PADRAO_KWH = "O kit é salvo mesmo sem o consumo em kWh. Só o valor da conta em R$ não é usado como consumo.";

/** Negócio fictício do vendedor com consumo e fatura gravados (450 kWh e R$ 300,00) e sem kit. */
async function novoNegocio(nome: string) {
  const v = base.usuarios.vendedor;
  const c = await clienteDe(v, base.senha);
  const { data: funil } = await c.from("funis").select("id").eq("empresa_id", base.empresaA).single();
  const { data: etapa } = await c.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await c.from("contatos").insert({ empresa_id: base.empresaA, nome, telefone: "(45) 90000-0000" }).select("id").single();
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
      valor: 25000,
      consumo_medio_kwh: 450,
      valor_conta_energia: 300,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  const id = negocio!.id;
  return {
    id,
    calculo: async () => {
      const { data, error } = await c
        .from("calculos_solares")
        .select("estado_financeiro, consumo_medio_kwh, valor_fatura_medio, economia_mensal")
        .eq("negocio_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    itens: async () => {
      const { data, error } = await c.from("kit_componentes").select("potencia_w, quantidade").eq("negocio_id", id).order("ordem");
      if (error) throw error;
      return data ?? [];
    },
    negocio: async () => {
      const { data, error } = await c.from("negocios").select("consumo_medio_kwh, valor_conta_energia").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  };
}

async function abrir(page: Page, negocioId: string) {
  await entrarComo(page, base.usuarios.vendedor, base.senha);
  await page.goto(`/negocios/${negocioId}`);
}

async function adicionarModulo(page: Page) {
  await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
  await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 550 W");
  await page.getByLabel("Potência (W)").last().fill("550");
  await page.getByLabel("Qtd.").last().fill("10");
}

test.describe("kWh e fatura do kit preservados", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("campos do kit vazios avisam o valor já salvo, salvar preserva consumo e fatura e grava só o resultado técnico", async ({ page }) => {
    const n = await novoNegocio("Cliente kit vazio preserva (fictício)");
    await abrir(page, n.id);
    await adicionarModulo(page);
    await page.getByLabel("Tarifa (R$/kWh)").fill("0,95");

    await page.getByLabel(ROTULO_KWH).fill("");
    await page.getByLabel(ROTULO_FATURA).fill("");
    const consumo = page.getByTestId("kit-consumo-salvo");
    const fatura = page.getByTestId("kit-fatura-salva");
    await expect(consumo).toHaveText("Campo vazio: ao salvar, vale o consumo já salvo no negócio (450 kWh/mês). Para apagar, use “Dados do negócio”.");
    await expect(fatura).toHaveText(/^Campo vazio: ao salvar, vale a fatura já salva no negócio \(R\$\s300,00\)\. Para apagar, use “Dados do negócio”\.$/);
    await expect(page.getByText(TEXTO_PADRAO_KWH)).toHaveCount(0);

    // Preencher um campo troca o aviso daquele campo (kWh volta ao texto atual; fatura some); o outro segue avisando.
    await page.getByLabel(ROTULO_KWH).fill("520");
    await expect(consumo).toHaveCount(0);
    await expect(page.getByText(TEXTO_PADRAO_KWH)).toBeVisible();
    await expect(fatura).toBeVisible();
    await page.getByLabel(ROTULO_FATURA).fill("410,50");
    await expect(fatura).toHaveCount(0);
    await page.getByLabel(ROTULO_KWH).fill("");
    await page.getByLabel(ROTULO_FATURA).fill("");
    await expect(consumo).toBeVisible();
    await expect(fatura).toBeVisible();

    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    await expect(page.getByTestId("kit-salvo")).toBeVisible();

    // Reabrir: itens gravados, consumo e fatura preservados; a linha de calculos_solares é só o resultado técnico com os
    // valores efetivos (450 kWh / R$ 300), sem parte financeira.
    await expect.poll(async () => (await n.itens()).map((i) => ({ potencia: i.potencia_w, quantidade: i.quantidade }))).toEqual([{ potencia: 550, quantidade: 10 }]);
    expect(await n.negocio()).toEqual({ consumo_medio_kwh: 450, valor_conta_energia: 300 });
    expect(await n.calculo()).toEqual({ estado_financeiro: "incompleto", consumo_medio_kwh: 450, valor_fatura_medio: 300, economia_mensal: null });
    await page.reload();
    expect(await n.negocio()).toEqual({ consumo_medio_kwh: 450, valor_conta_energia: 300 });
    await expect(page.getByLabel("Consumo médio (12 meses, kWh)")).toHaveValue("450");
    await expect(page.getByLabel("Valor da conta de energia (R$)")).toHaveValue("300");
  });

  test("limpar em Dados do negócio apaga os dois; no kit os avisos somem e o texto atual volta; salvar mantém vazio", async ({ page }) => {
    const n = await novoNegocio("Cliente limpa dados do negócio (fictício)");
    await abrir(page, n.id);

    await page.getByLabel("Consumo médio (12 meses, kWh)").fill("");
    await page.getByLabel("Valor da conta de energia (R$)").fill("");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect.poll(() => n.negocio()).toEqual({ consumo_medio_kwh: null, valor_conta_energia: null });

    await page.reload();
    await adicionarModulo(page);
    // Sem tarifa: com tarifa e sem consumo nem fatura o servidor recusa o kit (comportamento anterior, coberto no teste de banco).
    await page.getByLabel("Tarifa (R$/kWh)").fill("");
    await page.getByLabel(ROTULO_KWH).fill("");
    await page.getByLabel(ROTULO_FATURA).fill("");
    await expect(page.getByTestId("kit-consumo-salvo")).toHaveCount(0);
    await expect(page.getByTestId("kit-fatura-salva")).toHaveCount(0);
    await expect(page.getByText(TEXTO_PADRAO_KWH)).toBeVisible();
    // Sem consumo: a pendência do vendedor volta a aparecer.
    await expect(page.getByTestId("pendencias-vendedor")).toBeVisible();

    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    await expect(page.getByTestId("kit-salvo")).toBeVisible();
    await expect.poll(async () => (await n.itens()).length).toBe(1);
    expect(await n.negocio()).toEqual({ consumo_medio_kwh: null, valor_conta_energia: null });
    expect(await n.calculo()).toBeNull();
  });
});
