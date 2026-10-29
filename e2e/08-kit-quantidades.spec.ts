import { expect, test, type Page } from "@playwright/test";
import { clienteDe, entrarComo, fichaNaAba, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Quantidades do kit (interface real + Supabase LOCAL, base fictícia). Antes da correção o editor trocava
 * a quantidade por 1 (vazia, 0, texto) ou a arredondava (1,5 virava 2), descartava linha sem descrição e
 * lia "1.200" como 1,2 no preço. Agora: valor inválido bloqueia o envio com a mensagem na própria linha,
 * o que foi digitado continua na tela, NADA é gravado, e "1.200" grava 1200 unidades.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

/** Negócio fictício sem kit, e leitura dos itens gravados (pelo próprio vendedor, com a RLS real). */
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
  const itens = async () => {
    const { data, error } = await c.from("kit_componentes").select("descricao, potencia_w, quantidade").eq("negocio_id", negocio!.id);
    if (error) throw error;
    return data ?? [];
  };
  return { id: negocio!.id, itens };
}

async function abrirKit(page: Page, negocioId: string) {
  await entrarComo(page, base.usuarios.vendedor, base.senha);
  await page.goto(fichaNaAba(negocioId, "Conta e sistema"));
  await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
}

const salvarKit = (page: Page) => page.getByRole("button", { name: /^Salvar kit/ }).click();
const aviso = (page: Page, texto: string | RegExp) => page.getByRole("alert").filter({ hasText: texto });
const bloqueio = (page: Page) => page.getByRole("status").filter({ hasText: "Corrija o kit antes de continuar" });

test.describe("kit: quantidades e linhas incompletas", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("quantidade 0, 1,5, abc ou vazia bloqueia, mantém o digitado e não grava nada", async ({ page }) => {
    const n = await novoNegocio("Cliente quantidades inválidas (fictício)");
    await abrirKit(page, n.id);
    await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 550 W");
    await page.getByLabel("Potência (W)").last().fill("550");

    const casos: [string, string | RegExp][] = [
      ["0", "A quantidade deve ser um número inteiro maior que zero."],
      ["1,5", "A quantidade deve ser um número inteiro maior que zero."],
      ["abc", /Quantidade inválida/],
      ["", "Informe a quantidade."],
    ];
    for (const [digitado, mensagem] of casos) {
      await page.getByLabel("Qtd.").fill(digitado);
      await salvarKit(page);
      await expect(aviso(page, mensagem)).toBeVisible();
      await expect(bloqueio(page)).toBeVisible();
      // Nada é arredondado nem substituído por 1: o campo continua como foi digitado.
      await expect(page.getByLabel("Qtd.")).toHaveValue(digitado);
      await expect(page.getByLabel("Potência (W)")).toHaveValue("550");
      await expect(page.getByLabel("Modelo / descrição")).toHaveValue("Módulo fictício 550 W");
      expect(await n.itens()).toEqual([]);
    }
  });

  test("linha sem descrição exige preencher ou remover, mantém potência e quantidade e não grava", async ({ page }) => {
    const n = await novoNegocio("Cliente linha sem descrição (fictício)");
    await abrirKit(page, n.id);
    await page.getByLabel("Potência (W)").last().fill("550");
    await page.getByLabel("Qtd.").last().fill("10");

    await salvarKit(page);
    await expect(aviso(page, "Preencha o modelo / descrição ou remova esta linha.")).toBeVisible();
    await expect(page.getByLabel("Potência (W)")).toHaveValue("550");
    await expect(page.getByLabel("Qtd.")).toHaveValue("10");
    expect(await n.itens()).toEqual([]);

    // Preenchendo a descrição, o mesmo envio passa e grava a linha como está.
    await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 550 W");
    await expect(aviso(page, "Preencha o modelo / descrição")).toHaveCount(0);
    await salvarKit(page);
    await expect.poll(async () => (await n.itens()).map((i) => i.quantidade)).toEqual([10]);
  });

  test("1.200 grava 1200 unidades (e não 1 nem 1,2)", async ({ page }) => {
    const n = await novoNegocio("Cliente quantidade 1.200 (fictício)");
    await abrirKit(page, n.id);
    await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 550 W");
    await page.getByLabel("Qtd.").last().fill("1.200");

    await salvarKit(page);
    await expect(bloqueio(page)).toHaveCount(0);
    await expect.poll(async () => (await n.itens()).map((i) => i.quantidade)).toEqual([1200]);
  });
});
