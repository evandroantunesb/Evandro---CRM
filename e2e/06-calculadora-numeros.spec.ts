import { expect, test, type Page } from "@playwright/test";
import { clienteDe, clienteServico, entrarComo, fichaNaAba, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * M2-a — números no padrão brasileiro na calculadora (interface real + Supabase LOCAL).
 * Defeito reproduzido antes da correção: 1200 kWh salvo reabria como "1.200" e, salvo de novo sem
 * editar, virava 1,2 kWh. Aqui: salvar → reabrir → salvar sem editar não muda nenhum número; "1.200,50" tem
 * prévia e grava 1200,5; "1.2" é recusado sem gravar.
 *
 * Regra vigente: o salvamento NÃO gera mais linha em `calculos_solares` (estimativa sempre incompleta); o consumo e a
 * conta ficam no negócio. ANTES estes testes conferiam consumo, economia e payback da linha gravada; AGORA conferem o
 * consumo gravado no negócio e que nenhuma linha nasce. O ida e volta com a linha LEGADA (fixture) segue coberto: salvar
 * sem editar não a altera.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

async function novoNegocio(nome: string, { legado = false, consumoNegocio = null }: { legado?: boolean; consumoNegocio?: number | null } = {}) {
  const v = base.usuarios.vendedor;
  const c = await clienteDe(v, base.senha);
  const { data: funil } = await c.from("funis").select("id").eq("empresa_id", base.empresaA).single();
  const { data: etapa } = await c.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await c.from("contatos").insert({ empresa_id: base.empresaA, nome, telefone: "(45) 90000-0000" }).select("id").single();
  if (e1) throw e1;
  const { data: negocio, error: e2 } = await c
    .from("negocios")
    .insert({ empresa_id: base.empresaA, titulo: `Sistema solar — ${nome}`, contato_id: contato!.id, funil_id: funil!.id, etapa_id: etapa!.id, responsavel_id: v.membroId, valor: 25000, consumo_medio_kwh: consumoNegocio })
    .select("id")
    .single();
  if (e2) throw e2;
  const id = negocio!.id;
  if (legado) {
    // Fixture legada (fórmula antiga, não validada): 10 x 550 W = 5,5 kWp; consumo 1200 e tarifa 0,95.
    const { error: e3 } = await c
      .from("kit_componentes")
      .insert({ empresa_id: base.empresaA, negocio_id: id, tipo: "modulo", descricao: "Módulo fictício 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });
    if (e3) throw e3;
    // Linha legada só como fixture, pelo serviço local: o app não a cria e o vendedor não grava `calculos_solares`.
    const { error: e4 } = await clienteServico().from("calculos_solares").insert({
      empresa_id: base.empresaA,
      negocio_id: id,
      kit_nome: "Kit personalizado · 5,5 kWp (Módulo fictício 550 W)",
      kit_potencia_kwp: 5.5,
      kit_preco: 25000,
      tipo_ligacao: "trifasico",
      consumo_medio_kwh: 1200,
      tarifa_kwh: 0.95,
      produtividade_kwh_kwp_mes: 120,
      percentual_fio_b: 0.45,
      disponibilidade_kwh: 100,
      geracao_estimada_kwh_mes: 660,
      kwh_faturado: 540,
      kwh_compensado: 660,
      custo_fio_b: 100,
      conta_sem_solar: 1140,
      conta_com_solar: 613,
      economia_mensal: 527,
      payback_meses: 47.4,
    });
    if (e4) throw e4;
  }
  const calculo = async () => {
    const { data, error } = await c.from("calculos_solares").select("*").eq("negocio_id", id).maybeSingle();
    if (error) throw error;
    return data;
  };
  const consumoDoNegocio = async () => {
    const { data, error } = await c.from("negocios").select("consumo_medio_kwh").eq("id", id).single();
    if (error) throw error;
    return data.consumo_medio_kwh;
  };
  /** Linhas guardadas no histórico (R6.1): a legada vai para lá, inteira, quando o kit é salvo de novo. */
  const historico = async () => {
    const { data, error } = await c.from("calculos_solares_historico").select("motivo, linha").eq("negocio_id", id);
    if (error) throw error;
    return data;
  };
  return { id, calculo, consumoDoNegocio, historico };
}

/** Parte financeira do resultado técnico incompleto: sempre nula (ausência nunca vira zero). */
const SEM_FINANCEIRO = {
  estado_financeiro: "incompleto",
  kwh_faturado: null,
  kwh_compensado: null,
  custo_fio_b: null,
  conta_sem_solar: null,
  conta_com_solar: null,
  economia_mensal: null,
  payback_meses: null,
};

/** Colunas que o salvamento decide (sem id, autor e datas, que mudam a cada gravação). */
function tecnicoDa(l: Record<string, unknown> | null) {
  if (!l) return null;
  const campos = ["consumo_medio_kwh", "tarifa_kwh", "geracao_estimada_kwh_mes", ...Object.keys(SEM_FINANCEIRO)];
  return Object.fromEntries(campos.map((k) => [k, l[k]]));
}

async function montarKit(page: Page, consumo: string, tarifa: string) {
  await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
  await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 550 W");
  await page.getByLabel("Potência (W)").last().fill("550");
  await page.getByLabel("Qtd.").last().fill("10");
  await page.getByLabel("Consumo médio (kWh/mês)").fill(consumo);
  await page.getByLabel("Tarifa (R$/kWh)").fill(tarifa);
}

async function salvar(page: Page) {
  await page.getByRole("button", { name: /^Salvar kit/ }).click();
  await expect(page.getByTestId("kit-salvo")).toBeVisible();
}

test.describe("calculadora: números no padrão brasileiro", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1200 kWh: salvar → reabrir → salvar sem editar mantém o consumo e o resultado técnico (sem parte financeira)", async ({ page }) => {
    const n = await novoNegocio("Cliente M2-a ida e volta (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await montarKit(page, "1200", "0,95");
    await expect(page.getByTestId("previa-sistema")).toContainText("660 kWh/mês"); // prévia: geração não depende do consumo
    await salvar(page);
    expect(await n.consumoDoNegocio()).toBe(1200);
    // Resultado técnico salvo: 5,5 kWp × 120 = 660 kWh/mês; nenhum número financeiro (estado `incompleto`).
    const tecnico = tecnicoDa(await n.calculo());
    expect(tecnico).toEqual({ ...SEM_FINANCEIRO, consumo_medio_kwh: 1200, tarifa_kwh: 0.95, geracao_estimada_kwh_mes: 660 });

    for (let i = 0; i < 2; i++) {
      await page.reload();
      // O consumo reabre na escala brasileira ("1.200", não 1,2) e salvar sem editar não muda nada.
      await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
      await expect(page.getByLabel("Consumo médio (kWh/mês)")).toHaveValue("1.200");
      await salvar(page);
      expect(await n.consumoDoNegocio()).toBe(1200);
      expect(tecnicoDa(await n.calculo())).toEqual(tecnico);
    }
  });

  test("linha legada: reabrir e salvar sem editar mantém consumo e tarifa na escala; a legada vai inteira ao histórico", async ({ page }) => {
    // O editor reabre o consumo do NEGÓCIO (1200); a linha legada só fornece a tarifa.
    const n = await novoNegocio("Cliente M2-a legado (fictício)", { legado: true, consumoNegocio: 1200 });
    const linha = await n.calculo();
    expect(linha).toMatchObject({ consumo_medio_kwh: 1200, tarifa_kwh: 0.95 });
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));

    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
      await expect(page.getByLabel("Consumo médio (kWh/mês)")).toHaveValue("1.200");
      await expect(page.getByLabel("Tarifa (R$/kWh)")).toHaveValue("0,95");
      await salvar(page);
      // R6.1/R6.2: a linha atual passa a ser o resultado técnico com as mesmas entradas (sem financeiro, sem base
      // declarada); a legada fica só no histórico, marcada como desatualizada, com os números de antes.
      expect(tecnicoDa(await n.calculo())).toEqual({ ...SEM_FINANCEIRO, consumo_medio_kwh: 1200, tarifa_kwh: 0.95, geracao_estimada_kwh_mes: 660 });
      const hist = await n.historico();
      expect(hist).toHaveLength(1); // a segunda gravação substitui uma linha incompleta, que não é arquivada
      expect(hist[0]!.motivo).toBe("desatualizado_por_entradas");
      expect(hist[0]!.linha).toMatchObject({ id: linha!.id, estado_financeiro: "legado", consumo_medio_kwh: 1200, tarifa_kwh: 0.95, economia_mensal: 527 });
      expect(await n.consumoDoNegocio()).toBe(1200);
      await page.reload();
    }
  });

  test("linha legada com consumo diferente do negócio: o editor abre o do negócio e salvar sem editar não traz o antigo", async ({ page }) => {
    const n = await novoNegocio("Cliente legado divergente (fictício)", { legado: true, consumoNegocio: 450 });
    const linha = await n.calculo();
    expect(linha).toMatchObject({ consumo_medio_kwh: 1200 });
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));

    await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
    await expect(page.getByLabel("Consumo médio (kWh/mês)")).toHaveValue("450");
    await salvar(page);
    expect(await n.consumoDoNegocio()).toBe(450);
    // A linha atual tem o consumo do negócio (450); o 1200 antigo só existe no histórico, como desatualizado.
    expect(await n.calculo()).toMatchObject({ estado_financeiro: "incompleto", consumo_medio_kwh: 450, economia_mensal: null });
    const hist = await n.historico();
    expect(hist).toHaveLength(1);
    expect(hist[0]!.linha).toMatchObject({ id: linha!.id, estado_financeiro: "legado", consumo_medio_kwh: 1200 });
  });

  test("1.200,50 tem prévia e grava 1200,5 no negócio; 1.2 é recusado sem gravar", async ({ page }) => {
    const n = await novoNegocio("Cliente M2-a decimal (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await montarKit(page, "1.200,50", "0,95");
    await expect(page.getByTestId("previa-sistema")).toContainText("660 kWh/mês");
    // Consumo válido: nada sobre consumo na lista do vendedor (o que falta é a qualificação e a base da tarifa).
    await expect(page.getByTestId("pendencias-vendedor")).toBeVisible();
    await expect(page.getByTestId("pendencias-vendedor")).not.toContainText("consumo");
    await salvar(page);
    expect(await n.consumoDoNegocio()).toBe(1200.5);
    const tecnico = tecnicoDa(await n.calculo());
    expect(tecnico).toEqual({ ...SEM_FINANCEIRO, consumo_medio_kwh: 1200.5, tarifa_kwh: 0.95, geracao_estimada_kwh_mes: 660 });

    await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
    await page.getByLabel("Consumo médio (kWh/mês)").fill("1.2");
    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Número inválido" })).toBeVisible();
    expect(await n.consumoDoNegocio()).toBe(1200.5);
    expect(tecnicoDa(await n.calculo())).toEqual(tecnico);
  });
});
