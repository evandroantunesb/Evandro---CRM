import { expect, test, type Locator, type Page } from "@playwright/test";
import { abrirAba, CLIENTE_CONTRATO, clienteDe, clienteServico, entrarComo, fichaNaAba, lerBase } from "./ajuda";
import type { BaseFicticia } from "./base-ficticia";

/**
 * Estados do cálculo na ficha do negócio e na proposta (interface real + Supabase LOCAL descartável, base fictícia).
 *
 * Regra vigente (escopo congelado pelo Evandro): o motor real NÃO calcula economia nem payback; a estimativa é SEMPRE
 * incompleta (pendências: enquadramento, Fio B da distribuidora com origem/vigência, base tributária, fórmula não
 * validada; mais consumo/tarifa quando faltam). Nenhuma linha nova em `calculos_solares`; toda linha existente é LEGADA
 * (fórmula antiga, não validada) e só aparece como histórico recolhido. Nova proposta bloqueada; proposta já emitida =>
 * página pública com indisponibilidade e PDF 409. O contrato não bloqueia por legado nem por preço, só por kit/consumo/
 * produtividade.
 *
 * Estados: (a) dados completos do vendedor, (b) sem consumo, (c) linha legada, (d) proposta emitida antes.
 * Parâmetros da empresa fictícia (padrão do banco): produtividade 120 kWh/kWp/mês. Kit de 10 x 550 W = 5,5 kWp =>
 * geração 5,5 x 120 = 660 kWh/mês.
 */

let base: BaseFicticia;
test.beforeAll(() => {
  base = lerBase();
});

/** `distribuidora`: qualificação residencial com essa distribuidora (texto livre da Qualificação SDR). */
type Opcoes = { kit?: boolean; legado?: boolean; distribuidora?: string };

/**
 * Negócio fictício de R$ 25.000 do vendedor; opcionalmente com kit (10 x 550 W) e uma linha LEGADA inserida como fixture
 * (o motor não gera mais linhas). A linha é coerente com o negócio (nome do kit, consumo 500, conta 450, produtividade 120):
 * o único motivo de desatualização é `legado`, e o contrato (que ignora `legado`) fica liberado.
 */
async function novoNegocio(nome: string, { kit = false, legado = false, distribuidora }: Opcoes = {}) {
  const v = base.usuarios.vendedor;
  const c = await clienteDe(v, base.senha);
  const { data: funil } = await c.from("funis").select("id").eq("empresa_id", base.empresaA).single();
  const { data: etapa } = await c.from("etapas").select("id").eq("funil_id", funil!.id).order("ordem").limit(1).single();
  const { data: contato, error: e1 } = await c.from("contatos").insert({ ...CLIENTE_CONTRATO, empresa_id: base.empresaA, nome }).select("id").single();
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
      ...(legado ? { consumo_medio_kwh: 500, valor_conta_energia: 450 } : {}),
      ...(distribuidora ? { qualif_tipo_cliente: "residencial", qualif_distribuidora: distribuidora } : {}),
    })
    .select("id")
    .single();
  if (e2) throw e2;
  const id = negocio!.id;
  if (kit || legado) {
    const { error } = await c
      .from("kit_componentes")
      .insert({ empresa_id: base.empresaA, negocio_id: id, tipo: "modulo", descricao: "Módulo fictício 550 W", potencia_w: 550, quantidade: 10, ordem: 0 });
    if (error) throw error;
  }
  if (legado) {
    // Linha legada só como fixture, pelo serviço local: o app não a cria e o vendedor não grava `calculos_solares`.
    const { error } = await clienteServico().from("calculos_solares").insert({
      empresa_id: base.empresaA,
      negocio_id: id,
      // Mesmo formato que `nomeKitPersonalizado` grava: o nome do kit carrega a potência do cálculo.
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
    if (error) throw error;
  }
  return {
    id,
    cliente: c,
    /** Linha de calculos_solares inteira (como o vendedor a enxerga, com a RLS real) ou null. */
    calculo: async () => {
      const { data, error } = await c.from("calculos_solares").select("*").eq("negocio_id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    itens: async () => {
      const { data, error } = await c.from("kit_componentes").select("descricao, potencia_w, quantidade").eq("negocio_id", id).order("ordem");
      if (error) throw error;
      return data ?? [];
    },
    negocio: async () => {
      const { data, error } = await c.from("negocios").select("consumo_medio_kwh, valor_conta_energia, valor").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    /** Proposta já emitida (fixture): só o token importa, a página pública não lê mais números. */
    emitirProposta: async () => {
      const { data, error } = await c
        .from("propostas")
        .insert({ empresa_id: base.empresaA, negocio_id: id, criado_por: v.membroId, atualizado_por: v.membroId })
        .select("token")
        .single();
      if (error) throw error;
      return data.token;
    },
  };
}

async function abrir(page: Page, negocioId: string) {
  await entrarComo(page, base.usuarios.vendedor, base.senha);
  await page.goto(fichaNaAba(negocioId, "Conta e sistema"));
}

async function adicionarModulo(page: Page, potenciaW: string, quantidade: string) {
  await page.getByRole("button", { name: "+ Adicionar módulo" }).click();
  await page.getByLabel("Modelo / descrição").last().fill("Módulo fictício 550 W");
  await page.getByLabel("Potência (W)").last().fill(potenciaW);
  await page.getByLabel("Qtd.").last().fill(quantidade);
}

const estaAberto = (d: Locator) => d.evaluate((e) => e instanceof HTMLDetailsElement && e.open);
const porId = (page: Page, id: string) => page.getByTestId(id);
const TEXTO_INDISPONIVEL = "Os valores de economia desta proposta não estão disponíveis nesta versão do sistema. Fale com o seu vendedor.";

/** Nada de economia, payback, preço ou números do sistema na página (o que o cliente não pode ler). */
async function semNumerosDaProposta(page: Page) {
  const corpo = page.locator("body");
  await expect(corpo).not.toContainText("Sua economia");
  await expect(corpo).not.toContainText("Economia estimada");
  await expect(corpo).not.toContainText("Retorno do investimento");
  await expect(corpo).not.toContainText("Potência");
  await expect(corpo).not.toContainText("Geração estimada");
  await expect(corpo).not.toContainText("5,5 kWp");
  await expect(corpo).not.toContainText("222,75");
  await expect(corpo).not.toContainText("660");
  await expect(corpo).not.toContainText("25.000");
  await expect(corpo).not.toContainText("R$");
}

test.describe("estados do cálculo", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("(a) dados do vendedor completos: prévia com potência e geração, quadro só com pendências da empresa; salvar grava só o resultado técnico", async ({ page }) => {
    // Distribuidora sem tarifa oficial cadastrada: o que falta não depende do vendedor.
    const n = await novoNegocio("Cliente dados completos (fictício)", { distribuidora: "Cemig" });
    await abrir(page, n.id);
    await adicionarModulo(page, "550", "10");
    await page.getByLabel("Consumo médio (kWh/mês)").fill("700");
    await page.getByLabel("Tarifa (R$/kWh)").fill("0,95");
    await page.getByLabel("Base tributária da tarifa").selectOption("sem_tributos");

    // Prévia: potência e geração valem; economia e payback não existem.
    const sistema = porId(page, "previa-sistema");
    await expect(sistema).toContainText("5,5 kWp");
    await expect(sistema).toContainText("660 kWh/mês");
    await expect(page.getByText("Economia estimada")).toHaveCount(0);
    await expect(page.getByText("Payback estimado")).toHaveCount(0);

    // Quadro "Estimativa financeira incompleta": nada a informar pelo vendedor; só o que depende da empresa.
    const quadro = porId(page, "estimativa-incompleta");
    await expect(quadro).toBeVisible();
    await expect(quadro).toContainText("Estimativa financeira incompleta");
    await expect(porId(page, "pendencias-vendedor")).toHaveCount(0);
    const empresa = porId(page, "pendencias-empresa");
    await expect(empresa).toContainText("O que não depende de você");
    await expect(empresa.getByRole("listitem")).toHaveText(["Não há tarifa oficial cadastrada para a distribuidora informada (“Cemig”)."]);

    await page.getByRole("button", { name: /^Salvar kit/ }).click();

    // Mensagem persistente do salvamento (não some sozinha); some ao editar qualquer campo.
    const salvo = porId(page, "kit-salvo");
    await expect(salvo).toBeVisible();
    await expect(salvo).toContainText("Kit e resultado técnico salvos. A conta e a economia ainda não foram calculadas.");
    await expect(salvo).toContainText("Não depende de você: não há tarifa oficial cadastrada para a distribuidora informada (“Cemig”).");
    await expect(salvo).not.toContainText("Falta você informar");
    await expect(salvo).not.toContainText("fórmula antiga");
    await page.waitForTimeout(2000);
    await expect(salvo).toBeVisible();

    // Itens e consumo gravados; a linha de calculos_solares é só o resultado técnico (sem nenhum número financeiro).
    await expect.poll(async () => (await n.itens()).map((i) => ({ potencia: i.potencia_w, quantidade: i.quantidade }))).toEqual([{ potencia: 550, quantidade: 10 }]);
    expect(await n.calculo()).toMatchObject({
      estado_financeiro: "incompleto",
      consumo_medio_kwh: 700,
      tarifa_kwh: 0.95,
      geracao_estimada_kwh_mes: 660,
      economia_mensal: null,
      conta_sem_solar: null,
      conta_com_solar: null,
      custo_fio_b: null,
      payback_meses: null,
    });
    expect(await n.negocio()).toMatchObject({ consumo_medio_kwh: 700 });
    await expect(page.getByText("Economia estimada")).toHaveCount(0);
    await expect(page.getByText("Payback estimado")).toHaveCount(0);
    // O resultado técnico salvo fica recolhido; nunca aparece o histórico da fórmula antiga.
    await expect(porId(page, "resultado-tecnico-salvo")).toHaveCount(1);
    await expect(porId(page, "calculo-anterior")).toHaveCount(0);

    // Reabrir: o mesmo resultado técnico, ainda sem números inventados.
    await page.reload();
    await expect(porId(page, "resultado-tecnico-salvo")).toContainText("660 kWh/mês");
    await expect(page.getByText("Economia estimada")).toHaveCount(0);

    await page.getByRole("button", { name: "Editar kit / recalcular" }).click();
    await expect(salvo).toHaveCount(0);
    await page.getByLabel("Consumo médio (kWh/mês)").fill("710");
    await expect(porId(page, "estimativa-incompleta")).toBeVisible();

    // Detalhes técnicos: recolhido, só leitura, sem percentual nem campo editável.
    const det = porId(page, "detalhes-tecnicos");
    await expect(det).toHaveCount(1);
    expect(await estaAberto(det)).toBe(false);
    await det.locator("summary").click();
    expect(await estaAberto(det)).toBe(true);
    await expect(det).toContainText("Só leitura");
    await expect(det.getByRole("textbox")).toHaveCount(0);
    await expect(det.getByRole("spinbutton")).toHaveCount(0);
    await expect(det.getByRole("combobox")).toHaveCount(0);
    await expect(det.getByText("Percentual do Fio B")).toHaveCount(0);
    expect(await det.innerText()).not.toMatch(/\d\s*%/);
  });

  test("(b) sem consumo nem qualificação: pendências do vendedor (nenhuma da empresa); salvar grava o kit e a conta, sem cálculo", async ({ page }) => {
    const n = await novoNegocio("Cliente sem consumo (fictício)");
    await abrir(page, n.id);
    await adicionarModulo(page, "550", "10");
    await page.getByLabel("Valor médio da fatura (R$, opcional)").fill("800,00");
    await page.getByLabel("Tarifa (R$/kWh)").fill("0,95");

    const sistema = porId(page, "previa-sistema");
    await expect(sistema).toContainText("5,5 kWp");
    await expect(sistema).toContainText("660 kWh/mês");
    await expect(porId(page, "estimativa-incompleta")).toBeVisible();
    const vendedor = porId(page, "pendencias-vendedor");
    await expect(vendedor).toContainText("O que você pode informar");
    await expect(vendedor.getByRole("listitem")).toHaveText([
      "Informe o tipo de cliente na Qualificação SDR.",
      "Informe a distribuidora na Qualificação SDR.",
      "Informe o consumo médio em kWh/mês.",
      "Informe se a tarifa inclui tributos (base tributária).",
    ]);
    await expect(porId(page, "pendencias-empresa")).toHaveCount(0);
    await expect(page.getByText("Economia estimada")).toHaveCount(0);
    await expect(page.getByText("Payback estimado")).toHaveCount(0);

    // Sem tarifa também: a tarifa entra na lista do vendedor (a ordem é a das pendências do motor: tarifa, depois consumo).
    await page.getByLabel("Tarifa (R$/kWh)").fill("");
    await expect(vendedor.getByRole("listitem")).toHaveText([
      "Informe o tipo de cliente na Qualificação SDR.",
      "Informe a distribuidora na Qualificação SDR.",
      "Informe a tarifa (R$/kWh).",
      "Informe o consumo médio em kWh/mês.",
      "Informe se a tarifa inclui tributos (base tributária).",
    ]);
    await page.getByLabel("Tarifa (R$/kWh)").fill("0,95");

    await page.getByRole("button", { name: /^Salvar kit/ }).click();
    const salvo = porId(page, "kit-salvo");
    await expect(salvo).toBeVisible();
    await expect(salvo).toContainText("Itens do kit salvos. A conta e a economia ainda não foram calculadas.");
    await expect(salvo).toContainText(
      "Falta você informar o tipo de cliente na Qualificação SDR, a distribuidora na Qualificação SDR, o consumo médio em kWh/mês e se a tarifa inclui tributos (base tributária).",
    );
    await expect(salvo).not.toContainText("Não depende de você");

    await expect.poll(async () => (await n.itens()).map((i) => i.potencia_w)).toEqual([550]);
    expect(await n.calculo()).toBeNull();
    expect(await n.negocio()).toMatchObject({ consumo_medio_kwh: null, valor_conta_energia: 800 });

    // Recarregar: continua sem cálculo e sem números inventados.
    await page.reload();
    await expect(page.getByText("Itens do kit salvos, ainda sem cálculo de conta e economia.")).toBeVisible();
    await expect(page.getByText("Economia estimada")).toHaveCount(0);
    await expect(page.getByText("Payback estimado")).toHaveCount(0);
    expect(await n.calculo()).toBeNull();
  });

  test("(c) linha legada: histórico recolhido ('fórmula antiga, não validada'), proposta e atualizar preço bloqueados, contrato liberado", async ({ page }) => {
    const n = await novoNegocio("Cliente linha legada (fictício)", { legado: true });
    const antes = await n.calculo();
    expect(antes).toMatchObject({ kit_potencia_kwp: 5.5, economia_mensal: 222.75, payback_meses: 112.2 });
    await abrir(page, n.id);

    // Valores antigos só dentro do <details> recolhido, rotulados como fórmula antiga; nunca como resultado atual.
    const anterior = porId(page, "calculo-anterior");
    await expect(anterior).toHaveCount(1);
    expect(await estaAberto(anterior)).toBe(false);
    await expect(anterior.locator("summary")).toHaveText("Cálculo anterior (fórmula antiga, não validada)");
    await expect(anterior.getByText("R$ 222,75/mês")).toBeHidden();
    await expect(page.getByText("Economia estimada")).toHaveCount(0);
    await expect(page.getByText("Payback estimado")).toHaveCount(0);
    await anterior.locator("summary").click();
    expect(await estaAberto(anterior)).toBe(true);
    await expect(anterior).toContainText("fórmula antiga, que não foi validada");
    await expect(anterior).toContainText("não são a economia nem o payback atuais");
    await expect(anterior).toContainText("Economia (fórmula antiga)");
    await expect(anterior.getByText("R$ 222,75/mês")).toBeVisible();
    // Potência e geração valem pelo kit atual (motor), com o quadro de pendências.
    await expect(porId(page, "previa-sistema")).toContainText("660 kWh/mês");
    await expect(porId(page, "estimativa-incompleta")).toBeVisible();

    // Proposta: sem link emitido, o cartão do link (modelo completo) fica escondido.
    await abrirAba(page, "Proposta e contrato");
    await expect(page.getByRole("button", { name: "Gerar link da proposta" })).toHaveCount(0);
    await expect(porId(page, "proposta-bloqueada")).toHaveCount(0);

    // Preço (no kit, aba Sistema): valor do negócio diverge da linha legada, mas "Atualizar preço no cálculo" não é oferecido.
    const { error } = await n.cliente.from("negocios").update({ valor: 28000 }).eq("id", n.id);
    if (error) throw error;
    await page.goto(fichaNaAba(n.id, "Conta e sistema"));
    await expect(porId(page, "calculo-anterior")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Atualizar preço no cálculo" })).toHaveCount(0);
    await expect(page.getByText("Atualizar preço no cálculo")).toHaveCount(0);

    // Contrato liberado: nem legado nem preço divergente bloqueiam.
    await abrirAba(page, "Proposta e contrato");
    await expect(page.getByRole("button", { name: "Gerar contrato" })).toBeEnabled();
    expect(await n.calculo()).toEqual(antes);
  });

  test("(c2) linha legada com o kit alterado: o contrato continua bloqueado pelo kit, sem tocar na linha", async ({ page }) => {
    const n = await novoNegocio("Cliente legado kit alterado (fictício)", { legado: true });
    const { error } = await n.cliente.from("kit_componentes").update({ quantidade: 11 }).eq("negocio_id", n.id);
    if (error) throw error;
    const antes = await n.calculo();
    await abrir(page, n.id);
    await abrirAba(page, "Proposta e contrato");
    await expect(page.getByRole("button", { name: "Gerar contrato" })).toBeDisabled();
    await expect(page.getByRole("alert").filter({ hasText: "O kit mudou depois do último cálculo. Recalcule antes de gerar o contrato." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar link da proposta" })).toHaveCount(0);
    expect(await n.calculo()).toEqual(antes);
    const { data: contratos } = await n.cliente.from("contratos").select("id").eq("negocio_id", n.id);
    expect(contratos).toEqual([]);
  });

  test("(d) proposta emitida antes: página pública indisponível (sem sistema, economia nem preço) e PDF 409; ficha sem 'Baixar PDF'", async ({ page, request }) => {
    const n = await novoNegocio("Cliente proposta emitida (fictício)", { legado: true });
    const token = await n.emitirProposta();
    const antes = await n.calculo();

    await page.goto(`/proposta/${token}`);
    const aviso = porId(page, "proposta-indisponivel");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(TEXTO_INDISPONIVEL);
    await expect(aviso).toContainText(/Proposta emitida em \d{2}\/\d{2}\/\d{4}\./);
    await expect(page.getByRole("heading", { name: "Cliente proposta emitida (fictício)" })).toBeVisible();
    await semNumerosDaProposta(page);
    await expect(page.getByRole("link", { name: "Baixar PDF" })).toHaveCount(0);

    const pdf = await request.get(`/proposta/${token}/pdf`);
    expect(pdf.status()).toBe(409);
    const texto = await pdf.text();
    expect(texto).toContain(TEXTO_INDISPONIVEL);
    expect(texto).toMatch(/Proposta emitida em \d{2}\/\d{2}\/\d{4}\./);

    // Ficha: o link existe, mas sem PDF e com o aviso de que os valores não estão disponíveis.
    await abrir(page, n.id);
    await abrirAba(page, "Proposta e contrato");
    await expect(page.getByText("Link da proposta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Baixar PDF" })).toHaveCount(0);
    await expect(porId(page, "proposta-bloqueada")).toContainText("O link já enviado ao cliente continua válido");
    expect(await n.calculo()).toEqual(antes);
  });

  test("(d2) proposta emitida em negócio sem linha de cálculo: igualmente indisponível (nunca 404) e PDF 409", async ({ page, request }) => {
    const n = await novoNegocio("Cliente proposta sem linha (fictício)", { kit: true });
    const token = await n.emitirProposta();
    expect(await n.calculo()).toBeNull();

    await page.goto(`/proposta/${token}`);
    await expect(porId(page, "proposta-indisponivel")).toContainText(TEXTO_INDISPONIVEL);
    await semNumerosDaProposta(page);
    const pdf = await request.get(`/proposta/${token}/pdf`);
    expect(pdf.status()).toBe(409);
    expect(await pdf.text()).toContain(TEXTO_INDISPONIVEL);
  });
});
