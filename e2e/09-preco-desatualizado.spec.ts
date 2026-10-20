import { expect, test } from "@playwright/test";
import { clienteDe, entrarComo, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Preço do cálculo x valor do negócio (interface real + Supabase LOCAL, base fictícia). Editar o valor do
 * negócio não muda o cálculo salvo: a proposta continuava com o preço antigo e o contrato saía com o novo,
 * sem aviso. Agora a ficha avisa, o contrato não é gerado até o preço ser atualizado, e "Atualizar preço no
 * cálculo" leva só preço e payback (a economia não muda).
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

async function negocioComCalculo(nome: string) {
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
  const { error: e3 } = await c
    .from("kit_componentes")
    .insert({ empresa_id: base.empresaA, negocio_id: negocio!.id, tipo: "modulo", descricao: "Módulo fictício 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });
  if (e3) throw e3;
  const { error: e4 } = await c.from("calculos_solares").insert({
    empresa_id: base.empresaA,
    negocio_id: negocio!.id,
    kit_nome: "Kit fictício 5,5 kWp",
    kit_potencia_kwp: 5.5,
    kit_preco: 25000,
    tipo_ligacao: "bifasico",
    consumo_medio_kwh: 500,
    tarifa_kwh: 0.9,
    produtividade_kwh_kwp_mes: 120,
    percentual_fio_b: 0.45,
    disponibilidade_kwh: 50,
    geracao_estimada_kwh_mes: 660,
    kwh_faturado: 50,
    kwh_compensado: 450,
    custo_fio_b: 182.25,
    conta_sem_solar: 450,
    conta_com_solar: 227.25,
    economia_mensal: 222.75,
    payback_meses: 112.2,
  });
  if (e4) throw e4;
  const calculo = async () => {
    const { data, error } = await c.from("calculos_solares").select("kit_preco, payback_meses, economia_mensal").eq("negocio_id", negocio!.id).single();
    if (error) throw error;
    return data;
  };
  return { id: negocio!.id, calculo, cliente: c };
}

test.describe("cálculo desatualizado depois de editar o valor do negócio", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("em dia: sem aviso; valor editado: avisa, bloqueia o contrato; atualizar leva só preço e payback", async ({ page }) => {
    const n = await negocioComCalculo("Cliente preço desatualizado (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(`/negocios/${n.id}`);
    await expect(page.getByText("Atualizar preço no cálculo")).toHaveCount(0);

    const { error } = await n.cliente.from("negocios").update({ valor: 28000 }).eq("id", n.id);
    if (error) throw error;
    await page.goto(`/negocios/${n.id}`);
    await expect(page.getByRole("alert").filter({ hasText: "é diferente do preço usado neste cálculo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar contrato" })).toBeDisabled();
    // O cálculo salvo não mudou sozinho.
    expect(await n.calculo()).toMatchObject({ kit_preco: 25000, payback_meses: 112.2 });

    await page.getByRole("button", { name: "Atualizar preço no cálculo" }).click();
    await expect(page.getByText("Preço do cálculo atualizado.")).toBeVisible();
    await expect(page.getByText("Atualizar preço no cálculo")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gerar contrato" })).toBeEnabled();
    expect(await n.calculo()).toMatchObject({ kit_preco: 28000, payback_meses: 125.7, economia_mensal: 222.75 });
  });
});
