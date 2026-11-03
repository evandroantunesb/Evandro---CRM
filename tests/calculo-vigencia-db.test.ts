/**
 * Vigência do cálculo solar com Supabase local (banco DESCARTÁVEL). Regra atual: toda linha de `calculos_solares` é
 * LEGADA (fórmula antiga, não validada; as linhas aqui são fixture inserida direto). Nova proposta e "atualizar preço"
 * RECUSAM com linha legada (e sem linha, no caso da proposta), mesmo com o kit vigente; o contrato NÃO bloqueia por
 * legado nem por preço divergente, mas continua bloqueando por kit, consumo e produtividade. Mensagens exatas vêm de
 * `@/lib/calculo-vigencia` / `@/lib/estimativa-financeira` e NADA é gravado numa recusa (cálculo, kit, negócio,
 * propostas e contratos são comparados antes e depois). `gerarLinkProposta` é a Server Action de verdade (só a sessão é substituída, como em
 * negocios-acoes-db); contrato e preço entram pelos núcleos `*ComCliente`, com o cliente autenticado do vendedor (RLS real).
 * Dados fictícios. Fixture: kit 10 x 550 W = 5,5 kWp e cálculo com `kit_potencia_kwp` 5,5; "desatualizar" = 11 x 550 W (6,05 kWp).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseServidor } from "@/lib/supabase/server";
import type { Usuario } from "./ajuda";

const sessao = vi.hoisted(() => ({
  usuario: null as unknown as { cliente: unknown },
  atual: null as unknown as { empresaId: string; membroId: string; papel: string },
}));

vi.mock("@/lib/sessao", () => ({
  exigirPapel: async (...papeis: string[]) => {
    if (!papeis.includes(sessao.atual.papel)) throw new Error("sem permissão");
    return { atual: sessao.atual };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => sessao.usuario.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { gerarLinkProposta } = await import("@/lib/acoes/propostas");
const { gerarContratoComCliente } = await import("@/lib/contratos-geracao");
const { atualizarPrecoCalculoComCliente, salvarKitComCliente } = await import("@/lib/negocios-gravacao");
const { MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO, MENSAGEM_PRECO_CALCULO_LEGADO } = await import("@/lib/calculo-vigencia");
const { criarUsuario, servico, sufixo } = await import("./ajuda");
const { nomeKitPersonalizado } = await import("@/lib/calculadora");
const { mensagemDeRecusa, MENSAGEM_PROPOSTA_ECONOMIA_INDISPONIVEL } = await import("@/lib/calculo-vigencia");
const { mensagemPropostaIncompleta, pendenciasSemDados } = await import("@/lib/estimativa-financeira");

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
let membroVendedor: string;
let funil: string;
let etapa: string;

const MODELO =
  "CONTRATO entre {{empresa_nome}} e {{cliente_nome}}, CPF {{cliente_documento}}.\nValor: {{negocio_valor}}.\nItens:\n{{kit_itens}}\nVendedor: {{vendedor_nome}}.";

beforeAll(async () => {
  [admin, vendedor] = await Promise.all(["cv-admin", "cv-vendedor"].map(criarUsuario));
  const { data: emp } = await servico.from("empresas").insert({ nome: `Vigência ${sufixo}` }).select("id").single();
  empresa = emp!.id;
  const { data: membros, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  if (error) throw error;
  membroVendedor = membros!.find((m) => m.user_id === vendedor.id)!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
  const { error: erroModelo } = await admin.cliente.from("modelos_contrato").upsert({ empresa_id: empresa, conteudo: MODELO });
  if (erroModelo) throw erroModelo;
  sessao.usuario = vendedor;
  sessao.atual = { empresaId: empresa, membroId: membroVendedor, papel: "vendedor" };
});

const cliente = (u: Usuario) => u.cliente as unknown as SupabaseServidor;
const atual = () => ({ empresaId: empresa, membroId: membroVendedor, papel: "vendedor" as const });

const COMPONENTES_KIT = [
  { tipo: "modulo" as const, descricao: "Módulo 550 W", potenciaW: 550, quantidade: 10 },
  { tipo: "inversor" as const, descricao: "Inversor 5 kW", potenciaW: 5000, quantidade: 1 },
];

/**
 * Negócio de R$ 25.000 com kit 10 x 550 W + inversor, consumo 500 kWh e uma linha LEGADA (fórmula antiga, não validada,
 * inserida como fixture: o motor atual não gera linhas) de 5,5 kWp pelo mesmo preço. A linha é coerente com o negócio
 * (nome do kit, consumo, parâmetros reais da empresa: 120 kWh/kWp/mês, Fio B 0,6, disponibilidade bifásica 50): o ÚNICO
 * motivo de desatualização é `legado` até o teste mudar algo.
 */
async function negocioComCalculo(nome: string, opcoes: { semCalculo?: boolean } = {}) {
  const { data: c, error: e1 } = await servico
    .from("contatos")
    .insert({ empresa_id: empresa, nome: `Cliente ${nome}`, documento: "123.456.789-09", telefone: "(45) 90000-0000" })
    .select("id")
    .single();
  if (e1) throw e1;
  const { data: n, error: e2 } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: nome, contato_id: c!.id, funil_id: funil, etapa_id: etapa, responsavel_id: membroVendedor, valor: 25000, consumo_medio_kwh: 500 })
    .select("id")
    .single();
  if (e2) throw e2;
  const id = n!.id;
  const { error: e3 } = await servico.from("kit_componentes").insert([
    { empresa_id: empresa, negocio_id: id, tipo: "modulo", descricao: "Módulo 550 W", potencia_w: 550, quantidade: 10, ordem: 0 },
    { empresa_id: empresa, negocio_id: id, tipo: "inversor", descricao: "Inversor 5 kW", potencia_w: 5000, quantidade: 1, ordem: 1 },
  ]);
  if (e3) throw e3;
  if (!opcoes.semCalculo) {
    const { error: e4 } = await servico.from("calculos_solares").insert({
      empresa_id: empresa,
      negocio_id: id,
      kit_nome: nomeKitPersonalizado(COMPONENTES_KIT),
      kit_potencia_kwp: 5.5,
      kit_preco: 25000,
      tipo_ligacao: "bifasico",
      consumo_medio_kwh: 500,
      tarifa_kwh: 0.9,
      produtividade_kwh_kwp_mes: 120,
      percentual_fio_b: 0.6,
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
  }
  return id;
}

async function quantidadeDeModulos(negocioId: string, quantidade: number) {
  const { error } = await servico.from("kit_componentes").update({ quantidade }).eq("negocio_id", negocioId).eq("tipo", "modulo");
  if (error) throw error;
}
/** 11 x 550 W = 6,05 kWp: o kit mudou depois do cálculo de 5,5 kWp. */
const desatualizar = (negocioId: string) => quantidadeDeModulos(negocioId, 11);
/** Volta a 10 x 550 W = 5,5 kWp: o cálculo volta a valer. */
const restaurar = (negocioId: string) => quantidadeDeModulos(negocioId, 10);

async function ler<T>(consulta: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data!;
}

/** Tudo que as ações poderiam gravar, linha a linha (inclui updated_at). */
async function estado(negocioId: string) {
  const [calculo, kit, negocio, propostas, contratos] = await Promise.all([
    ler(servico.from("calculos_solares").select("*").eq("negocio_id", negocioId)),
    ler(servico.from("kit_componentes").select("*").eq("negocio_id", negocioId).order("ordem")),
    ler(servico.from("negocios").select("*").eq("id", negocioId)),
    ler(servico.from("propostas").select("*").eq("negocio_id", negocioId)),
    ler(servico.from("contratos").select("*").eq("negocio_id", negocioId)),
  ]);
  return { calculo, kit, negocio, propostas, contratos };
}

const formulario = (negocioId: string) => {
  const f = new FormData();
  f.append("negocioId", negocioId);
  return f;
};
const gerarProposta = (negocioId: string) => gerarLinkProposta(null, formulario(negocioId));
const gerarContrato = (negocioId: string) =>
  gerarContratoComCliente(cliente(vendedor), { empresaId: empresa, membroId: membroVendedor, negocioId });
const atualizarPreco = (negocioId: string) => atualizarPrecoCalculoComCliente(cliente(vendedor), atual(), negocioId);

/** Cliente cujas leituras de `kit_componentes` falham (a leitura incerta nunca vale como cálculo vigente). */
function comLeituraDoKitQuebrada(c: Usuario["cliente"]): SupabaseServidor {
  const erro = { message: "falha injetada", code: "XX000", details: "", hint: "" };
  const cadeia: Record<string, unknown> = {};
  for (const metodo of ["eq", "in", "order", "select", "limit", "maybeSingle", "single"]) cadeia[metodo] = () => cadeia;
  cadeia.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: erro, count: null, status: 500, statusText: "falha injetada" }).then(ok, falha);
  const ligar = (alvo: object, prop: string | symbol) => {
    const valor = Reflect.get(alvo, prop);
    return typeof valor === "function" ? valor.bind(alvo) : valor;
  };
  return new Proxy(c, {
    get(alvo, prop) {
      if (prop !== "from") return ligar(alvo, prop);
      return (tabela: string) => {
        const consulta = alvo.from(tabela as never);
        if (tabela !== "kit_componentes") return consulta;
        return new Proxy(consulta, { get: (q, p) => (p === "select" ? () => cadeia : ligar(q, p)) });
      };
    },
  }) as unknown as SupabaseServidor;
}

// Mensagens da proposta (regra nova): toda linha existente é legada (fórmula antiga, não validada) e a nova proposta
// fica BLOQUEADA, com ou sem kit alterado; sem linha, a mensagem é a de dados incompletos (sem o motivo legado).
// Com a regra aceita, a linha legada pede recálculo (a mensagem não lista pendências de dados).
const MENSAGEM_PROPOSTA_LEGADO = "O último cálculo foi feito pela fórmula antiga, que não foi validada. Recalcule o kit antes de gerar a proposta.";
const MENSAGEM_PROPOSTA_SEM_LINHA = mensagemPropostaIncompleta(pendenciasSemDados());

describe("gerarLinkProposta (Server Action)", () => {
  it("as mensagens da proposta são as da regra nova (legado cita a fórmula antiga; sem linha não cita)", () => {
    expect(MENSAGEM_PROPOSTA_LEGADO).toContain("fórmula antiga, que não foi validada");
    expect(MENSAGEM_PROPOSTA_LEGADO).toContain("Recalcule o kit antes de gerar a proposta.");
    expect(MENSAGEM_PROPOSTA_SEM_LINHA).toContain("A estimativa financeira está incompleta:");
    expect(MENSAGEM_PROPOSTA_SEM_LINHA).not.toContain("fórmula antiga");
    expect(MENSAGEM_PROPOSTA_SEM_LINHA).not.toBe(MENSAGEM_PROPOSTA_LEGADO);
  });

  // ANTES (controle): kit vigente gerava "Proposta pronta.". AGORA: a linha existente é legada e a proposta é recusada.
  it("linha legada com kit vigente: recusa (fórmula antiga, não validada) e não grava nada", async () => {
    const id = await negocioComCalculo("Proposta legado");
    const antes = await estado(id);
    expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: MENSAGEM_PROPOSTA_LEGADO });
    expect(await estado(id)).toEqual(antes);
    expect((await estado(id)).propostas).toHaveLength(0);
  });

  // ANTES: kit alterado recusava com MENSAGEM_PROPOSTA_CALCULO_DESATUALIZADO e, restaurado o kit, gerava. AGORA: o motivo
  // principal é `legado` (prioridade sobre `kit`) e restaurar o kit NÃO libera a proposta.
  it("kit alterado depois do cálculo: recusa e não grava nada; restaurado o kit, continua recusando (legado)", async () => {
    const id = await negocioComCalculo("Proposta desatualizada");
    await desatualizar(id);
    const antes = await estado(id);
    expect(antes.propostas).toHaveLength(0);

    expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: MENSAGEM_PROPOSTA_LEGADO });
    expect(await estado(id)).toEqual(antes);

    await restaurar(id);
    expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: MENSAGEM_PROPOSTA_LEGADO });
    expect((await estado(id)).propostas).toHaveLength(0);
  });

  it("kit sem nenhum módulo (potência 0) contra cálculo de 5,5 kWp: recusa sem gravar", async () => {
    const id = await negocioComCalculo("Proposta sem módulos");
    await servico.from("kit_componentes").delete().eq("negocio_id", id).eq("tipo", "modulo");
    const antes = await estado(id);
    expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: MENSAGEM_PROPOSTA_LEGADO });
    expect(await estado(id)).toEqual(antes);
  });

  it("falha ao ler o kit nunca vale como vigente: recusa e não grava", async () => {
    const id = await negocioComCalculo("Proposta leitura falha");
    const antes = await estado(id);
    sessao.usuario = { cliente: comLeituraDoKitQuebrada(vendedor.cliente) };
    try {
      expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: "Não foi possível conferir o cálculo. Tente de novo." });
    } finally {
      sessao.usuario = vendedor;
    }
    expect(await estado(id)).toEqual(antes);
  });

  // Regra aceita (GD II): cálculo completo e vigente. A proposta com conta e economia (D1/D2) segue congelada: o link
  // antigo é recusado e nada é gravado; a proposta simples (sem economia) é pela emissão.
  it("cálculo completo e vigente: link antigo recusado (sem economia em proposta) e nada gravado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00-03:00"));
    try {
      const id = await negocioComCalculo("Proposta completo", { semCalculo: true });
      await servico.from("negocios").update({ qualif_tipo_cliente: "residencial", qualif_distribuidora: "Copel" }).eq("id", id);
      const dadosKit = new FormData();
      for (const [k, v] of Object.entries({
        negocioId: id,
        tipoLigacao: "bifasico",
        consumoMedioKwh: "500",
        tarifaKwh: "0,76802",
        tarifaBaseTributaria: "sem_tributos",
        componentes: JSON.stringify(COMPONENTES_KIT),
      }))
        dadosKit.append(k, v);
      const salvo = await salvarKitComCliente(vendedor.cliente as unknown as SupabaseServidor, { empresaId: empresa, membroId: membroVendedor, papel: "vendedor" }, dadosKit);
      expect(salvo).toMatchObject({ ok: true, mensagem: "Kit e cálculo salvos." });
      const antes = await estado(id);
      expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: MENSAGEM_PROPOSTA_ECONOMIA_INDISPONIVEL });
      expect(await estado(id)).toEqual(antes);
      expect(antes.propostas).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // ANTES: "Calcule o kit antes de gerar a proposta.". AGORA: dados incompletos, sem linha e sem proposta.
  it("sem linha de cálculo: recusa (estimativa incompleta), sem proposta", async () => {
    const id = await negocioComCalculo("Proposta sem cálculo", { semCalculo: true });
    expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: MENSAGEM_PROPOSTA_SEM_LINHA });
    expect((await estado(id)).propostas).toHaveLength(0);
  });

  // ANTES (LIMITAÇÃO CONHECIDA): consumo/tarifa diferentes sem mudar a potência geravam a proposta. AGORA a linha legada
  // bloqueia a proposta de qualquer forma, com a mesma mensagem.
  it("linha legada com consumo/tarifa diferentes do negócio: recusa igual (legado), sem proposta", async () => {
    const id = await negocioComCalculo("Proposta limitação");
    const { error } = await servico.from("calculos_solares").update({ consumo_medio_kwh: 80, tarifa_kwh: 1.5 }).eq("negocio_id", id);
    if (error) throw error;
    expect(await gerarProposta(id)).toEqual({ ok: false, mensagem: MENSAGEM_PROPOSTA_LEGADO });
    expect((await estado(id)).propostas).toHaveLength(0);
  });
});

describe("gerarContratoComCliente", () => {
  it("controle: kit vigente gera o contrato", async () => {
    const id = await negocioComCalculo("Contrato vigente");
    expect(await gerarContrato(id)).toEqual({ ok: true, mensagem: "Contrato pronto." });
    expect((await estado(id)).contratos).toHaveLength(1);
  });

  it("kit alterado depois do cálculo: recusa com a mensagem exata e não grava nada; restaurado o kit, gera", async () => {
    const id = await negocioComCalculo("Contrato desatualizado");
    await desatualizar(id);
    const antes = await estado(id);
    expect(antes.contratos).toHaveLength(0);

    expect(await gerarContrato(id)).toEqual({ ok: false, mensagem: MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO });
    expect(await estado(id)).toEqual(antes);

    await restaurar(id);
    expect(await gerarContrato(id)).toEqual({ ok: true, mensagem: "Contrato pronto." });
    expect((await estado(id)).contratos).toHaveLength(1);
  });

  it("regerar o rascunho com o kit alterado depois: recusa e o contrato anterior fica intacto", async () => {
    const id = await negocioComCalculo("Contrato rascunho");
    expect(await gerarContrato(id)).toEqual({ ok: true, mensagem: "Contrato pronto." });
    await desatualizar(id);
    const antes = await estado(id);
    expect(antes.contratos).toHaveLength(1);

    expect(await gerarContrato(id)).toEqual({ ok: false, mensagem: MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO });
    expect(await estado(id)).toEqual(antes);
  });

  // ANTES: preço divergente E kit alterado valia a mensagem de preço. AGORA a guarda de preço não se aplica à linha legada:
  // vale a do kit.
  it("preço divergente E kit alterado: vale a mensagem do kit (preço não bloqueia com linha legada), sem gravar", async () => {
    const id = await negocioComCalculo("Contrato preço e kit");
    await desatualizar(id);
    await servico.from("negocios").update({ valor: 28000 }).eq("id", id);
    const antes = await estado(id);
    expect(await gerarContrato(id)).toEqual({ ok: false, mensagem: MENSAGEM_CONTRATO_CALCULO_DESATUALIZADO });
    expect(await estado(id)).toEqual(antes);
  });

  it("preço divergente com linha legada e kit vigente: o contrato é gerado (não bloqueia por legado nem por preço)", async () => {
    const id = await negocioComCalculo("Contrato preço divergente");
    await servico.from("negocios").update({ valor: 28000 }).eq("id", id);
    expect(await gerarContrato(id)).toEqual({ ok: true, mensagem: "Contrato pronto." });
    const e = await estado(id);
    expect(e.contratos).toHaveLength(1);
    expect(e.calculo[0]).toMatchObject({ kit_preco: 25000 }); // a linha legada segue intocada
  });

  it("consumo do negócio diferente do cálculo: continua bloqueando o contrato (mensagem de consumo), sem gravar", async () => {
    const id = await negocioComCalculo("Contrato consumo");
    await servico.from("negocios").update({ consumo_medio_kwh: 800 }).eq("id", id);
    const antes = await estado(id);
    const r = await gerarContrato(id);
    expect(r).toEqual({ ok: false, mensagem: mensagemDeRecusa(["consumo"], "contrato") });
    expect(r.mensagem).toBe("O consumo ou a fatura mudou depois do último cálculo. Recalcule o kit antes de gerar o contrato.");
    expect(await estado(id)).toEqual(antes);
  });

  it("produtividade da empresa diferente da do cálculo: bloqueia o contrato; percentual do Fio B diferente não bloqueia", async () => {
    const id = await negocioComCalculo("Contrato parâmetros");
    const original = { produtividade_kwh_kwp_mes: 120, percentual_fio_b: 0.6 };
    try {
      // Fio B (parâmetro só financeiro): ignorado pelo contrato.
      await servico.from("parametros_calculadora").update({ percentual_fio_b: 0.45 }).eq("empresa_id", empresa);
      expect(await gerarContrato(id)).toEqual({ ok: true, mensagem: "Contrato pronto." });
      await servico.from("parametros_calculadora").update({ percentual_fio_b: original.percentual_fio_b }).eq("empresa_id", empresa);

      // Produtividade (afeta a geração): bloqueia.
      await servico.from("parametros_calculadora").update({ produtividade_kwh_kwp_mes: 130 }).eq("empresa_id", empresa);
      const id2 = await negocioComCalculo("Contrato produtividade");
      const antes = await estado(id2);
      expect(await gerarContrato(id2)).toEqual({ ok: false, mensagem: mensagemDeRecusa(["parametros"], "contrato") });
      expect(await estado(id2)).toEqual(antes);
    } finally {
      await servico.from("parametros_calculadora").update(original).eq("empresa_id", empresa);
    }
  });

  it("sem cálculo a guarda de vigência não se aplica (o kit alterado não impede o contrato)", async () => {
    const id = await negocioComCalculo("Contrato sem cálculo", { semCalculo: true });
    await desatualizar(id);
    expect(await gerarContrato(id)).toEqual({ ok: true, mensagem: "Contrato pronto." });
  });
});

describe("atualizarPrecoCalculoComCliente", () => {
  // ANTES (controle): kit vigente + valor mudado atualizava preço e payback (28000; 125,7). AGORA: linha legada, recusa.
  it("linha legada com kit vigente e valor do negócio mudado: recusa (fórmula antiga) e nada é gravado", async () => {
    const id = await negocioComCalculo("Preço vigente");
    await servico.from("negocios").update({ valor: 28000 }).eq("id", id);
    const antes = await estado(id);
    expect(await atualizarPreco(id)).toEqual({ ok: false, mensagem: MENSAGEM_PRECO_CALCULO_LEGADO });
    const depois = await estado(id);
    expect(depois).toEqual(antes);
    expect(depois.calculo[0]).toMatchObject({ kit_preco: 25000, payback_meses: 112.2, economia_mensal: 222.75 });
  });

  // ANTES: kit alterado recusava com MENSAGEM_PRECO_CALCULO_DESATUALIZADO e, restaurado o kit, atualizava. AGORA: o
  // motivo principal é `legado` e restaurar o kit não libera a atualização.
  it("kit alterado e preço a atualizar: recusa e nada é gravado; restaurado o kit, continua recusando (legado)", async () => {
    const id = await negocioComCalculo("Preço desatualizado");
    await servico.from("negocios").update({ valor: 28000 }).eq("id", id);
    await desatualizar(id);
    const antes = await estado(id);
    expect(antes.calculo[0]).toMatchObject({ kit_preco: 25000, payback_meses: 112.2 });

    expect(await atualizarPreco(id)).toEqual({ ok: false, mensagem: MENSAGEM_PRECO_CALCULO_LEGADO });
    expect(await estado(id)).toEqual(antes);

    await restaurar(id);
    const restaurado = await estado(id);
    expect(await atualizarPreco(id)).toEqual({ ok: false, mensagem: MENSAGEM_PRECO_CALCULO_LEGADO });
    expect(await estado(id)).toEqual(restaurado);
    expect(restaurado.calculo[0]).toMatchObject({ kit_preco: 25000, payback_meses: 112.2 });
  });

  it("kit alterado com o preço já em dia: também recusa (não responde 'já está em dia'), sem gravar", async () => {
    const id = await negocioComCalculo("Preço em dia e kit alterado");
    await desatualizar(id);
    const antes = await estado(id);
    expect(await atualizarPreco(id)).toEqual({ ok: false, mensagem: MENSAGEM_PRECO_CALCULO_LEGADO });
    expect(await estado(id)).toEqual(antes);
  });

  it("falha ao ler o kit nunca vale como vigente: recusa e não grava", async () => {
    const id = await negocioComCalculo("Preço leitura falha");
    await servico.from("negocios").update({ valor: 28000 }).eq("id", id);
    const antes = await estado(id);
    const r = await atualizarPrecoCalculoComCliente(comLeituraDoKitQuebrada(vendedor.cliente), atual(), id);
    expect(r).toEqual({ ok: false, mensagem: "Não foi possível conferir o cálculo. Nada foi alterado." });
    expect(await estado(id)).toEqual(antes);
  });
});
