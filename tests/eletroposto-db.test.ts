/**
 * Eletroposto com Supabase local (roda no CI): criação pelo núcleo das ações (`@/lib/eletroposto-gravacao`) com o
 * cliente autenticado de cada papel (RLS real), trava do módulo por empresa, preços congelados do catálogo,
 * tipo imutável e o isolamento de `negocios_eletroposto` (SDR e outra empresa não leem; ninguém apaga).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { criarNegocioEletropostoComCliente, salvarEletropostoComCliente } from "@/lib/eletroposto-gravacao";
import type { Atual } from "@/lib/negocios-gravacao";
import type { SupabaseServidor } from "@/lib/supabase/server";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let vendedor: Usuario;
let sdr: Usuario;
let estranho: Usuario;
let empresa: string;
let empresaDesligada: string;
let funil: string;
let funilDesligada: string;
const atual: Record<string, Atual> = {};

const cliente = (u: Usuario) => u.cliente as unknown as SupabaseServidor;

beforeAll(async () => {
  [admin, vendedor, sdr, estranho] = await Promise.all(["ev-admin", "ev-vendedor", "ev-sdr", "ev-estranho"].map(criarUsuario));
  const { data: emps, error: erroEmp } = await servico
    .from("empresas")
    .insert([
      { nome: `Eletroposto ${sufixo}`, eletroposto_ativo: true },
      // Inserção em lote: a coluna vai explícita nas duas (a API manda null para chave ausente).
      { nome: `Sem eletroposto ${sufixo}`, eletroposto_ativo: false },
    ])
    .select("id, nome");
  if (erroEmp) throw erroEmp;
  empresa = emps!.find((e) => e.nome.startsWith("Eletroposto"))!.id;
  empresaDesligada = emps!.find((e) => e.nome.startsWith("Sem"))!.id;
  const { data: membros, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresaDesligada, user_id: estranho.id, papel: "admin" },
    ])
    .select("id, user_id, empresa_id, papel");
  if (error) throw error;
  for (const m of membros!) atual[m.user_id] = { empresaId: m.empresa_id, membroId: m.id, papel: m.papel };
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: f2 } = await servico.from("funis").select("id").eq("empresa_id", empresaDesligada).single();
  funilDesligada = f2!.id;
});

function fd(campos: Record<string, string | string[] | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
  }
  return f;
}

const novo = (extra: Record<string, string | string[] | undefined> = {}) =>
  fd({
    funil_id: funil,
    contato_tipo: "pj",
    contato_nome: `Posto ${Math.random().toString(36).slice(2, 7)}`,
    contato_telefone: "(45) 99876-5432",
    contato_endereco: "Av. Brasil, 1200 - Cascavel/PR",
    local_proprio: "sim",
    usina_fv: "nao",
    modelos: ["full", "basic"],
    ...extra,
  });

async function criar(u: Usuario, dados: FormData) {
  const r = await criarNegocioEletropostoComCliente(cliente(u), atual[u.id], dados);
  if (!r.ok) throw new Error(r.mensagem);
  expect(r.avisos).toEqual([]);
  return r;
}

describe("criação do negócio de eletroposto", () => {
  it("cria negócio, contato e proposta com preços do catálogo; vários modelos deixam o negócio sem valor", async () => {
    const r = await criar(vendedor, novo());
    const { data: negocio } = await vendedor.cliente.from("negocios").select("tipo, valor, titulo, contatos(nome, endereco, telefone)").eq("id", r.negocioId).single();
    expect(negocio!.tipo).toBe("eletroposto");
    expect(negocio!.valor).toBeNull();
    expect(negocio!.titulo).toMatch(/^Eletroposto — Posto /);
    const { data: reg } = await vendedor.cliente.from("negocios_eletroposto").select("*").eq("negocio_id", r.negocioId).single();
    expect(reg!.modelos).toEqual(["basic", "full"]);
    expect(reg!.precos).toEqual({ basic: 99900, full: 119900 });
    expect(reg!.local_proprio).toBe(true);
    expect(reg!.usina_fv).toBe(false);
    expect(reg!.token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("um modelo só já dá valor ao negócio", async () => {
    const r = await criar(admin, novo({ modelos: ["screen"] }));
    const { data } = await admin.cliente.from("negocios").select("valor").eq("id", r.negocioId).single();
    expect(Number(data!.valor)).toBe(149900);
  });

  it("recusa sem modelo, sem endereço, WhatsApp inválido e sem as duas respostas", async () => {
    const casos: [Record<string, string | string[] | undefined>, RegExp][] = [
      [{ modelos: undefined }, /pelo menos um modelo/],
      [{ contato_endereco: "" }, /endereço/],
      [{ contato_telefone: "(45) 3333-3333" }, /WhatsApp inválido/],
      [{ local_proprio: undefined }, /local próprio/],
      [{ usina_fv: "talvez" }, /usina fotovoltaica/],
    ];
    for (const [extra, erro] of casos) {
      const r = await criarNegocioEletropostoComCliente(cliente(vendedor), atual[vendedor.id], novo(extra));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.mensagem).toMatch(erro);
    }
  });

  it("SDR cria negócio de eletroposto sem modelos, preço nem proposta (os modelos enviados são ignorados)", async () => {
    const r = await criar(sdr, novo());
    const { data: negocio } = await servico.from("negocios").select("tipo, valor").eq("id", r.negocioId).single();
    expect(negocio).toEqual({ tipo: "eletroposto", valor: null });
    const { data: reg } = await servico.from("negocios_eletroposto").select("modelos, precos, local_proprio, usina_fv").eq("negocio_id", r.negocioId).single();
    expect(reg).toEqual({ modelos: [], precos: {}, local_proprio: true, usina_fv: false });
  });

  it("empresa com o módulo desligado: o banco recusa o negócio de eletroposto", async () => {
    const r = await criarNegocioEletropostoComCliente(cliente(estranho), atual[estranho.id], novo({ funil_id: funilDesligada }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/não está ativo/);
  });
});

describe("travas do banco", () => {
  it("o tipo do negócio não muda depois de criado", async () => {
    const r = await criar(vendedor, novo());
    const { error } = await servico.from("negocios").update({ tipo: "solar" }).eq("id", r.negocioId);
    expect(error?.message).toMatch(/não pode ser alterado/);
  });

  it("preços precisam ser um número positivo por modelo, sem chave a mais", async () => {
    const r = await criar(vendedor, novo());
    for (const precos of [{ basic: 99900 }, { basic: 99900, full: 119900, screen: 149900 }, { basic: 0, full: 119900 }, { basic: "99900", full: 119900 }]) {
      const { error } = await vendedor.cliente.from("negocios_eletroposto").update({ precos }).eq("negocio_id", r.negocioId);
      expect(error, JSON.stringify(precos)).not.toBeNull();
    }
    const { error } = await vendedor.cliente.from("negocios_eletroposto").update({ modelos: ["basic", "outro"] }).eq("negocio_id", r.negocioId);
    expect(error).not.toBeNull();
  });

  it("negócio solar não recebe registro de eletroposto", async () => {
    const { data: contato } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Solar" }).select("id").single();
    const { data: etapa } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
    const { data: solar } = await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo: "Solar", contato_id: contato!.id, funil_id: funil, etapa_id: etapa!.id, responsavel_id: atual[vendedor.id].membroId })
      .select("id")
      .single();
    const { error } = await vendedor.cliente.from("negocios_eletroposto").insert({
      negocio_id: solar!.id,
      empresa_id: empresa,
      local_proprio: true,
      usina_fv: true,
      modelos: ["basic"],
      precos: { basic: 99900 },
    });
    expect(error).not.toBeNull();
  });
});

describe("acesso (RLS)", () => {
  it("SDR e outra empresa não leem; ninguém apaga", async () => {
    const r = await criar(admin, novo());
    // O SDR vira responsável (vê o negócio), mas não o registro com preços e o token da proposta.
    await servico.from("negocios").update({ responsavel_id: atual[sdr.id].membroId }).eq("id", r.negocioId);
    const { data: doSdr } = await sdr.cliente.from("negocios_eletroposto").select("token").eq("negocio_id", r.negocioId);
    expect(doSdr).toEqual([]);
    const { data: deFora } = await estranho.cliente.from("negocios_eletroposto").select("token").eq("negocio_id", r.negocioId);
    expect(deFora).toEqual([]);
    const { data: apagados } = await admin.cliente.from("negocios_eletroposto").delete().eq("negocio_id", r.negocioId).select("negocio_id");
    expect(apagados ?? []).toEqual([]);
    const { data: ainda } = await servico.from("negocios_eletroposto").select("negocio_id").eq("negocio_id", r.negocioId);
    expect(ainda).toHaveLength(1);
  });
});

describe("edição na ficha", () => {
  it("mesmos modelos mantêm data e preços; modelos novos renovam a proposta no mesmo link", async () => {
    const r = await criar(vendedor, novo());
    const { data: antes } = await servico.from("negocios_eletroposto").select("token, emitida_em").eq("negocio_id", r.negocioId).single();

    const igual = await salvarEletropostoComCliente(cliente(vendedor), atual[vendedor.id], fd({ negocioId: r.negocioId, local_proprio: "nao", usina_fv: "sim", modelos: ["basic", "full"] }));
    expect(igual).toEqual({ ok: true, mensagem: "Salvo." });
    const { data: meio } = await servico.from("negocios_eletroposto").select("emitida_em, local_proprio, usina_fv").eq("negocio_id", r.negocioId).single();
    expect(meio!.emitida_em).toBe(antes!.emitida_em);
    expect(meio!.local_proprio).toBe(false);
    expect(meio!.usina_fv).toBe(true);

    const outro = await salvarEletropostoComCliente(cliente(vendedor), atual[vendedor.id], fd({ negocioId: r.negocioId, local_proprio: "nao", usina_fv: "sim", modelos: ["screen"] }));
    expect(outro.ok).toBe(true);
    const { data: depois } = await servico.from("negocios_eletroposto").select("token, emitida_em, modelos, precos").eq("negocio_id", r.negocioId).single();
    expect(depois!.token).toBe(antes!.token);
    expect(depois!.modelos).toEqual(["screen"]);
    expect(depois!.precos).toEqual({ screen: 149900 });
    expect(new Date(depois!.emitida_em).getTime()).toBeGreaterThan(new Date(antes!.emitida_em).getTime());
  });

  it("SDR não edita registro com proposta", async () => {
    const r = await criar(vendedor, novo());
    await servico.from("negocios").update({ responsavel_id: atual[sdr.id].membroId }).eq("id", r.negocioId);
    const res = await salvarEletropostoComCliente(cliente(sdr), atual[sdr.id], fd({ negocioId: r.negocioId, local_proprio: "nao", usina_fv: "sim", modelos: ["basic"] }));
    expect(res.ok).toBe(false);
    const { data: reg } = await servico.from("negocios_eletroposto").select("local_proprio, modelos").eq("negocio_id", r.negocioId).single();
    expect(reg).toEqual({ local_proprio: true, modelos: ["basic", "full"] });
  });

  it("SDR edita só local e usina enquanto não há proposta; o vendedor escolhe os modelos e o link nasce novo", async () => {
    const r = await criar(sdr, novo());
    const { data: doSdr } = await sdr.cliente.from("negocios_eletroposto").select("token, modelos").eq("negocio_id", r.negocioId).single();
    expect(doSdr!.modelos).toEqual([]);

    // Modelos enviados pelo SDR são ignorados: ele só grava local próprio e usina FV.
    const salvo = await salvarEletropostoComCliente(cliente(sdr), atual[sdr.id], fd({ negocioId: r.negocioId, local_proprio: "nao", usina_fv: "sim", modelos: ["screen"] }));
    expect(salvo).toEqual({ ok: true, mensagem: "Salvo." });
    const { data: meio } = await servico.from("negocios_eletroposto").select("modelos, local_proprio, usina_fv").eq("negocio_id", r.negocioId).single();
    expect(meio).toEqual({ modelos: [], local_proprio: false, usina_fv: true });

    // Direto no banco o SDR também não põe modelos nem preços.
    const { data: burla } = await sdr.cliente
      .from("negocios_eletroposto")
      .update({ modelos: ["basic"], precos: { basic: 1 } })
      .eq("negocio_id", r.negocioId)
      .select("negocio_id");
    expect(burla ?? []).toEqual([]);

    await servico.from("negocios").update({ responsavel_id: atual[vendedor.id].membroId }).eq("id", r.negocioId);
    const proposta = await salvarEletropostoComCliente(cliente(vendedor), atual[vendedor.id], fd({ negocioId: r.negocioId, local_proprio: "nao", usina_fv: "sim", modelos: ["full"] }));
    expect(proposta.ok).toBe(true);
    const { data: depois } = await servico.from("negocios_eletroposto").select("token, modelos, precos").eq("negocio_id", r.negocioId).single();
    expect(depois!.modelos).toEqual(["full"]);
    expect(depois!.precos).toEqual({ full: 119900 });
    // O token que o SDR leu nunca vira o link da proposta com preços.
    expect(depois!.token).not.toBe(doSdr!.token);

    // Com proposta, o registro sai da visão do SDR (mesmo voltando a ser o responsável).
    await servico.from("negocios").update({ responsavel_id: atual[sdr.id].membroId }).eq("id", r.negocioId);
    const { data: escondido } = await sdr.cliente.from("negocios_eletroposto").select("token").eq("negocio_id", r.negocioId);
    expect(escondido).toEqual([]);
  });

  it("o token do link é sempre gerado pelo banco e não muda depois da proposta", async () => {
    const r = await criar(vendedor, novo());
    const { data: antes } = await servico.from("negocios_eletroposto").select("token").eq("negocio_id", r.negocioId).single();
    await vendedor.cliente.from("negocios_eletroposto").update({ token: "escolhido-por-mim" }).eq("negocio_id", r.negocioId);
    const { data: depois } = await servico.from("negocios_eletroposto").select("token").eq("negocio_id", r.negocioId).single();
    expect(depois!.token).toBe(antes!.token);
  });
});
