/**
 * Temperatura do negócio (20261024100000_temperatura_negocio.sql): regras padrão nascem com a empresa; a 1ª regra
 * ligada que bate (pela ordem) define Quente/Frio, nenhuma = Morno; só admin e gestor alteram, pela função que salva a
 * lista inteira, com autor e auditoria; parâmetros inválidos são recusados; mês previsto obrigatório por etapa.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/supabase/database.types";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let estranho: Usuario;
let empresa: string;
let funil: string;
let etapas: string[];
let contato: string;
let membroVendedor: string;
let membroGestor: string;

beforeAll(async () => {
  [admin, gestor, vendedor, estranho] = await Promise.all([
    criarUsuario("temp-admin"),
    criarUsuario("temp-gestor"),
    criarUsuario("temp-vendedor"),
    criarUsuario("temp-estranho"),
  ]);
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Temperatura ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" });
  const { data: mg } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: gestor.id, papel: "gestor" }).select("id").single();
  membroGestor = mg!.id;
  const { data: mv } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" }).select("id").single();
  membroVendedor = mv!.id;
  const { data: outra } = await servico.from("empresas").insert({ nome: `Temperatura outra ${sufixo}` }).select("id").single();
  await servico.from("empresa_membros").insert({ empresa_id: outra!.id, user_id: estranho.id, papel: "admin" });

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: e } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapas = e!.map((x) => x.id);
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente temperatura" }).select("id").single();
  contato = c!.id;
});

async function novoNegocio(extra: Record<string, unknown> = {}) {
  const { data, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: `Temp ${Math.random()}`, contato_id: contato, funil_id: funil, etapa_id: etapas[0], responsavel_id: membroVendedor, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function temperatura(usuario: Usuario, negocio: string) {
  const { data, error } = await usuario.cliente.rpc("temperatura_negocios", { p_negocio_ids: [negocio] });
  if (error) throw error;
  return data?.[0] ?? null;
}

async function regras(usuario: Usuario = admin) {
  const { data } = await usuario.cliente.from("regras_temperatura").select("id, sinal, ativa, temperatura, parametros, ordem").eq("empresa_id", empresa).order("ordem");
  return data!;
}

/** Monta a lista para `salvar_regras_temperatura` a partir da atual, aplicando mudanças e uma nova ordem de sinais. */
async function listaCom(mudancas: Record<string, Partial<{ ativa: boolean; temperatura: string; parametros: Json }>>, ordem?: string[]): Promise<Json> {
  const atuais = await regras();
  const ordenadas = ordem ? [...atuais].sort((a, b) => ordem.indexOf(a.sinal) - ordem.indexOf(b.sinal)) : atuais;
  return ordenadas.map((r) => ({ id: r.id, ativa: r.ativa, temperatura: r.temperatura, parametros: r.parametros, ...mudancas[r.sinal] }));
}

const ORDEM_PADRAO = [
  "contrato_gerado", "sem_atividade", "somente_pesquisando", "prazo_instalacao", "etapa_negociacao", "etapa",
  "proposta_emitida", "decisor", "busca_financiamento", "orcamento_outra_empresa", "tarefa_atrasada",
];

describe("regras padrão", () => {
  it("toda empresa nasce com as 11 regras, 4 ligadas, na ordem aprovada", async () => {
    const lista = await regras(vendedor);
    expect(lista.map((r) => r.sinal)).toEqual(ORDEM_PADRAO);
    expect(lista.filter((r) => r.ativa).map((r) => r.sinal)).toEqual(["contrato_gerado", "sem_atividade", "somente_pesquisando", "prazo_instalacao"]);
    expect(lista.find((r) => r.sinal === "sem_atividade")?.parametros).toEqual({ dias: 7 });
  });

  it("membro de outra empresa não vê as regras", async () => {
    const { data } = await estranho.cliente.from("regras_temperatura").select("id").eq("empresa_id", empresa);
    expect(data).toEqual([]);
  });
});

describe("cálculo", () => {
  it("sem nenhum sinal fica morno", async () => {
    const n = await novoNegocio();
    expect(await temperatura(vendedor, n)).toMatchObject({ temperatura: "morno", sinal: null });
  });

  it("prazo curto e decisor deixam quente; sem decisor fica morno", async () => {
    const comDecisor = await novoNegocio({ qualif_prazo_instalacao: "ate_30_dias", qualif_e_decisor: true });
    const semDecisor = await novoNegocio({ qualif_prazo_instalacao: "imediatamente", qualif_e_decisor: false });
    expect(await temperatura(vendedor, comDecisor)).toMatchObject({ temperatura: "quente", sinal: "prazo_instalacao" });
    expect(await temperatura(vendedor, semDecisor)).toMatchObject({ temperatura: "morno" });
  });

  it("cliente só pesquisando fica frio", async () => {
    const n = await novoNegocio({ qualif_prazo_instalacao: "somente_pesquisando" });
    expect(await temperatura(vendedor, n)).toMatchObject({ temperatura: "frio", sinal: "somente_pesquisando" });
  });

  it("sem atividade há 7+ dias fica frio, com os dias; nota ou tarefa concluída recente contam como atividade", async () => {
    const n = await novoNegocio();
    const antigo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await servico.from("negocios").update({ etapa_desde: antigo }).eq("id", n);
    expect(await temperatura(vendedor, n)).toMatchObject({ temperatura: "frio", sinal: "sem_atividade", dias: 10 });

    await servico.from("notas").insert({ empresa_id: empresa, negocio_id: n, texto: "Liguei" });
    expect(await temperatura(vendedor, n)).toMatchObject({ temperatura: "morno" });
  });

  it("contrato gerado (rascunho) vence a falta de atividade, por estar em 1º", async () => {
    const n = await novoNegocio();
    await servico.from("negocios").update({ etapa_desde: new Date(Date.now() - 30 * 86_400_000).toISOString() }).eq("id", n);
    const { error } = await servico.from("contratos").insert({ empresa_id: empresa, negocio_id: n, conteudo: "Contrato" });
    expect(error).toBeNull();
    expect(await temperatura(vendedor, n)).toMatchObject({ temperatura: "quente", sinal: "contrato_gerado" });
  });

  it("negócio fechado não tem temperatura; outra empresa não enxerga o negócio", async () => {
    const n = await novoNegocio({ valor: 1000 });
    expect(await temperatura(estranho, n)).toBeNull();
    await servico.from("negocios").update({ status: "ganho" }).eq("id", n);
    expect(await temperatura(vendedor, n)).toBeNull();
  });
});

describe("edição das regras", () => {
  it("vendedor não altera: a função recusa e o UPDATE direto não muda nada", async () => {
    const lista = await listaCom({ decisor: { ativa: true } });
    const { error } = await vendedor.cliente.rpc("salvar_regras_temperatura", { p_empresa_id: empresa, p_regras: lista });
    expect(error?.message).toBe("Só admin ou gestor alteram as regras de temperatura.");

    const { data } = await vendedor.cliente.from("regras_temperatura").update({ ativa: true }).eq("empresa_id", empresa).eq("sinal", "decisor").select("id");
    expect(data).toEqual([]);
    const { error: erroInsert } = await admin.cliente.from("regras_temperatura").insert({ empresa_id: empresa, sinal: "decisor", temperatura: "quente", ordem: 99 });
    expect(erroInsert).not.toBeNull();
    const { error: erroDelete, count } = await admin.cliente.from("regras_temperatura").delete({ count: "exact" }).eq("empresa_id", empresa);
    expect(erroDelete !== null || count === 0).toBe(true);
    expect((await regras()).length).toBe(11);
  });

  it("parâmetros inválidos são recusados com mensagem", async () => {
    const zeroDias = await listaCom({ sem_atividade: { parametros: { dias: 0 } } });
    const r1 = await gestor.cliente.rpc("salvar_regras_temperatura", { p_empresa_id: empresa, p_regras: zeroDias });
    expect(r1.error?.message).toBe("Dias devem ser um número inteiro de 1 a 365.");

    const etapaVazia = await listaCom({ etapa: { ativa: true, parametros: { etapas: [] } } });
    const r2 = await gestor.cliente.rpc("salvar_regras_temperatura", { p_empresa_id: empresa, p_regras: etapaVazia });
    expect(r2.error?.message).toBe("Escolha pelo menos uma etapa para ligar a regra.");

    const { data: outraEtapa } = await servico.from("etapas").select("id").neq("empresa_id", empresa).limit(1).single();
    const etapaAlheia = await listaCom({ etapa: { parametros: { etapas: [outraEtapa!.id] } } });
    const r3 = await gestor.cliente.rpc("salvar_regras_temperatura", { p_empresa_id: empresa, p_regras: etapaAlheia });
    expect(r3.error?.message).toBe("Etapa inválida.");

    const incompleta = ((await listaCom({})) as Json[]).slice(1);
    const r4 = await gestor.cliente.rpc("salvar_regras_temperatura", { p_empresa_id: empresa, p_regras: incompleta });
    expect(r4.error?.message).toBe("A lista de regras está incompleta. Recarregue a página.");
  });

  it("gestor reordena e liga regras; vale na hora, com autor e auditoria", async () => {
    const n = await novoNegocio({ qualif_prazo_instalacao: "imediatamente", qualif_e_decisor: true });
    await servico.from("negocios").update({ etapa_desde: new Date(Date.now() - 9 * 86_400_000).toISOString() }).eq("id", n);
    // Padrão: "sem atividade" (2º) vence o prazo curto (4º).
    expect(await temperatura(vendedor, n)).toMatchObject({ temperatura: "frio", sinal: "sem_atividade" });

    const novaOrdem = ["prazo_instalacao", ...ORDEM_PADRAO.filter((s) => s !== "prazo_instalacao")];
    const lista = await listaCom({ etapa: { ativa: true, parametros: { etapas: [etapas[1]] } } }, novaOrdem);
    const { error } = await gestor.cliente.rpc("salvar_regras_temperatura", { p_empresa_id: empresa, p_regras: lista });
    expect(error).toBeNull();

    expect((await regras()).map((r) => r.sinal)).toEqual(novaOrdem);
    expect(await temperatura(vendedor, n)).toMatchObject({ temperatura: "quente", sinal: "prazo_instalacao" });

    const { data: linha } = await servico.from("regras_temperatura").select("atualizado_por").eq("empresa_id", empresa).eq("sinal", "etapa").single();
    expect(linha!.atualizado_por).toBe(membroGestor);
    const { data: logs } = await servico
      .from("logs_auditoria")
      .select("user_id, acao")
      .eq("empresa_id", empresa)
      .eq("entidade", "regras_temperatura")
      .eq("acao", "update");
    expect(logs!.some((l) => l.user_id === gestor.id)).toBe(true);

    // Etapa escolhida: negócio movido para ela fica quente pela regra "etapa".
    const naEtapa = await novoNegocio({ etapa_id: etapas[1] });
    expect(await temperatura(vendedor, naEtapa)).toMatchObject({ temperatura: "quente", sinal: "etapa" });
  });
});

describe("mês previsto de fechamento", () => {
  it("só aceita o 1º dia do mês", async () => {
    const { error } = await servico.from("negocios").insert({
      empresa_id: empresa, titulo: "Mês inválido", contato_id: contato, funil_id: funil, etapa_id: etapas[0], fechamento_previsto: "2026-11-15",
    });
    expect(error?.message).toContain("negocios_fechamento_previsto_mes");
  });

  it("etapa que exige o mês recusa a entrada sem ele e aceita com ele", async () => {
    await servico.from("etapas").update({ campos_obrigatorios: ["fechamento_previsto"] }).eq("id", etapas[3]);
    const n = await novoNegocio();
    const { error } = await vendedor.cliente.from("negocios").update({ etapa_id: etapas[3] }).eq("id", n);
    expect(error?.message).toMatch(/preencha: mês previsto de fechamento\.$/);

    const { error: ok } = await vendedor.cliente.from("negocios").update({ etapa_id: etapas[3], fechamento_previsto: "2026-12-01" }).eq("id", n);
    expect(ok).toBeNull();
  });
});
