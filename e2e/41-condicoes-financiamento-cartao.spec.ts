import { expect, test } from "@playwright/test";
import { clienteDe, entrarComo, fichaNaAba, lerBase, preencherCondicoes } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Condições de pagamento pedidas pelo Evandro em 27/11/2026: financiamento automático pela taxa ao mês (24, 36, 48 e
 * 60x pela tabela Price, entrada e carência únicas) e cartão com a taxa da maquininha informada pelo vendedor (a empresa
 * da base fictícia não tem taxas de cartão cadastradas). Interface real + Supabase LOCAL descartável, base fictícia.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

const AMANHA = () => new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const reais = (texto: string) => new RegExp(`R\\$\\s${texto.replace(".", "\\.")}`);

async function negocio(nome: string) {
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
  const { data: n, error: e2 } = await c
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
  const { error: e3 } = await c.from("kit_componentes").insert([
    { empresa_id: base.empresaA, negocio_id: n!.id, tipo: "modulo", descricao: "Módulo fictício 550 W", potencia_w: 550, quantidade: 10, ordem: 0 },
    { empresa_id: base.empresaA, negocio_id: n!.id, tipo: "inversor", descricao: "Inversor fictício 5 kW", potencia_w: null, quantidade: 1, ordem: 1 },
  ]);
  if (e3) throw e3;
  return n!.id;
}

test.describe("condições de pagamento: financiamento automático e cartão com a taxa do vendedor", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("prévias na emissão e, na página do cliente, a entrada uma vez e as parcelas calculadas", async ({ page, browser }) => {
    const id = await negocio("Cliente condições (fictício)");
    await entrarComo(page, base.usuarios.vendedor, base.senha);
    await page.goto(fichaNaAba(id, "Proposta e contrato"));
    await page.getByLabel("Válida até").fill(AMANHA());
    await preencherCondicoes(page, "Valores de teste");
    const condicoes = page.getByTestId("condicoes-pagamento");

    // Cartão sem taxas da empresa: o vendedor informa a taxa ao mês; 1x sai sem juros.
    await condicoes.getByRole("checkbox", { name: "Parcelado" }).check();
    await condicoes.getByLabel("Taxa ao mês (%)").first().fill("2,99");
    await expect(condicoes.getByTestId("previa-parcelado")).toContainText(/1x R\$\s24\.900,00/);
    await expect(condicoes.getByTestId("previa-parcelado")).toContainText(/3x R\$\s8\.801,21/);

    // Financiamento automático: R$ 24.900 menos R$ 5.000 de entrada, a 2,5% ao mês.
    await condicoes.getByRole("checkbox", { name: "Financiamento" }).check();
    await condicoes.getByLabel("Entrada (R$)").fill("5.000");
    await condicoes.getByLabel("Taxa ao mês (%)").last().fill("2,5");
    const previa = condicoes.getByTestId("previa-financiamento");
    await expect(previa).toContainText("24x");
    await expect(previa).toContainText(reais("1.112,67"));
    await expect(previa).toContainText(reais("643,83"));

    await page.getByRole("button", { name: /^Emitir/ }).click();
    await expect(page.getByText("Proposta v1 emitida.")).toBeVisible();

    const c = await clienteDe(base.usuarios.vendedor, base.senha);
    const { data: linhas } = await c.from("propostas_emissoes").select("token").eq("negocio_id", id);
    const anonimo = await browser.newContext();
    const pagina = await anonimo.newPage();
    await pagina.goto(`/proposta/${linhas![0]!.token}`);
    await expect(pagina.getByText(/Entrada de R\$\s5\.000,00 · carência de 90 dias/)).toBeVisible();
    for (const parcela of ["24x de R\\$\\s1\\.112,67", "36x de R\\$\\s844,79", "48x de R\\$\\s716,52", "60x de R\\$\\s643,83", "3x de R\\$\\s8\\.801,21"]) {
      await expect(pagina.getByText(new RegExp(parcela))).toBeVisible();
    }
    await anonimo.close();
  });
});
