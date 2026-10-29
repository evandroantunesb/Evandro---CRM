import { expect, test } from "@playwright/test";
import { abrirAba, clienteDe, clienteServico, entrarComo, fichaNaAba, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Preço do cálculo x valor do negócio (interface real + Supabase LOCAL, base fictícia).
 *
 * ANTES: o valor editado avisava, bloqueava o contrato e "Atualizar preço no cálculo" levava só preço e payback.
 * AGORA (escopo congelado): toda linha de `calculos_solares` é LEGADA (fórmula antiga, não validada), não aparece como
 * resultado atual e a proposta não mostra preço. Logo: valor divergente NÃO gera aviso de preço, NÃO bloqueia o
 * contrato (usa o valor atual do negócio), "Atualizar preço no cálculo" NÃO é oferecido e a linha nunca muda.
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
  // Consumo e conta no negócio coerentes com a linha (senão o contrato recusaria por "consumo não comprovado").
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
      consumo_medio_kwh: 500,
      valor_conta_energia: 450,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  const { error: e3 } = await c
    .from("kit_componentes")
    .insert({ empresa_id: base.empresaA, negocio_id: negocio!.id, tipo: "modulo", descricao: "Módulo fictício 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });
  if (e3) throw e3;
  // Linha legada só como fixture, pelo serviço local: o app não a cria e o vendedor não grava `calculos_solares`.
  const { error: e4 } = await clienteServico().from("calculos_solares").insert({
    empresa_id: base.empresaA,
    negocio_id: negocio!.id,
    kit_nome: "Kit personalizado · 5,5 kWp (Módulo fictício 550 W)",
    kit_potencia_kwp: 5.5,
    kit_preco: 25000,
    tipo_ligacao: "bifasico",
    consumo_medio_kwh: 500,
    valor_fatura_medio: 450,
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
    const { data, error } = await c.from("calculos_solares").select("*").eq("negocio_id", negocio!.id).single();
    if (error) throw error;
    return data;
  };
  return { id: negocio!.id, calculo, cliente: c };
}

test.describe("linha legada e valor do negócio editado", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("valor igual ou editado: nenhum aviso de preço, sem 'Atualizar preço', contrato liberado e linha intocada", async ({ page }) => {
    const n = await negocioComCalculo("Cliente preço legado (fictício)");
    const linha = await n.calculo();
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    // Kit (aba Sistema): a linha existe só como histórico recolhido de fórmula antiga.
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await expect(page.getByTestId("calculo-anterior")).toHaveCount(1);
    await expect(page.getByText("Atualizar preço no cálculo")).toHaveCount(0);
    await abrirAba(page, "Proposta e contrato");
    await expect(page.getByRole("button", { name: "Gerar contrato" })).toBeEnabled();

    const { error } = await n.cliente.from("negocios").update({ valor: 28000 }).eq("id", n.id);
    if (error) throw error;
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await expect(page.getByTestId("calculo-anterior")).toHaveCount(1);
    await expect(page.getByRole("alert").filter({ hasText: "é diferente do preço usado" })).toHaveCount(0);
    await expect(page.getByText("Atualizar preço no cálculo")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Atualizar preço no cálculo" })).toHaveCount(0);
    await expect(page.getByTestId("preco-bloqueado")).toHaveCount(0);
    await abrirAba(page, "Proposta e contrato");
    // Contrato NÃO bloqueia por preço divergente com linha legada.
    await expect(page.getByRole("button", { name: "Gerar contrato" })).toBeEnabled();
    // O link da proposta (modelo completo) fica escondido enquanto não há link emitido, e a linha não mudou sozinha.
    await expect(page.getByRole("button", { name: "Gerar link da proposta" })).toHaveCount(0);
    expect(await n.calculo()).toEqual(linha);
    expect(await n.calculo()).toMatchObject({ kit_preco: 25000, payback_meses: 112.2, economia_mensal: 222.75 });
  });
});
