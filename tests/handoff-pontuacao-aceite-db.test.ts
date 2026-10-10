/**
 * PR B1a — pontuação do repasse SDR → vendedor (migration 20261010100000), com Supabase local
 * (roda no CI), cliente autenticado de cada usuário (RLS real) e conferência dos lançamentos
 * reais em point_ledger.
 *
 * Decisões do Evandro (2026-10-09): D1 só o aceite pontua (envio vira histórico); D2 devolução
 * não pontua; D3 aceite creditado fica se o negócio for perdido; D4 envio validado no banco
 * (SDR responsável → vendedor ativo, mesma empresa, quem executa autorizado); D5 delegação de
 * gestor/admin credita o SDR, nunca o ator; D6 só o primeiro aceite do negócio pontua, no
 * motor; D7 nada histórico é alterado.
 *
 * Regras de teste com os valores da Raion Solar Demo: envio 5 XP / 0 moedas; aceite 10 XP /
 * 5 moedas. A regra do aceite fica SEM unica_por_negocio de propósito: a garantia é do motor.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

const NOMES = [
  "admin",
  "gestor",
  "gestorOutro",
  "sdr",
  "sdr2",
  "closer",
  "closer2",
  "closerInativo",
  "sdrB",
  "closerB",
] as const;
type Nome = (typeof NOMES)[number];

const u = {} as Record<Nome, Usuario>;
const membro = {} as Record<Nome, string>;
const nomeDoMembro = new Map<string, Nome>();
const chaveDaRegra = new Map<string, string>();
let empresa: string;
let outra: string;
let funil: string;
let etapa: string;
let funilB: string;
let etapaB: string;
let motivoPerda: string;

beforeAll(async () => {
  const usuarios = await Promise.all(NOMES.map((n) => criarUsuario(`b1a-${n}`)));
  NOMES.forEach((n, i) => (u[n] = usuarios[i]));

  const { data: emps } = await servico
    .from("empresas")
    .insert([{ nome: `B1a ${sufixo}` }, { nome: `B1a outra ${sufixo}` }])
    .select("id, nome");
  empresa = emps!.find((e) => !e.nome.includes("outra"))!.id;
  outra = emps!.find((e) => e.nome.includes("outra"))!.id;

  const papeis: [Nome, string, "admin" | "gestor" | "vendedor" | "sdr", "sdr" | "closer" | null, boolean][] = [
    ["admin", empresa, "admin", null, true],
    ["gestor", empresa, "gestor", null, true],
    ["gestorOutro", empresa, "gestor", null, true],
    ["sdr", empresa, "sdr", "sdr", true],
    ["sdr2", empresa, "sdr", "sdr", true],
    ["closer", empresa, "vendedor", "closer", true],
    ["closer2", empresa, "vendedor", "closer", true],
    ["closerInativo", empresa, "vendedor", "closer", false],
    ["sdrB", outra, "sdr", "sdr", true],
    ["closerB", outra, "vendedor", "closer", true],
  ];
  const { data: vinculos, error } = await servico
    .from("empresa_membros")
    .insert(
      papeis.map(([n, e, papel, perfil, ativo]) => ({
        empresa_id: e,
        user_id: u[n].id,
        papel,
        perfil_gamificacao: perfil,
        status: ativo ? ("ativo" as const) : ("inativo" as const),
      })),
    )
    .select("id, user_id");
  if (error) throw error;
  for (const n of NOMES) {
    membro[n] = vinculos!.find((v) => v.user_id === u[n].id)!.id;
    nomeDoMembro.set(membro[n], n);
  }

  // Equipe do gestor: os SDRs e os closers. O gestorOutro gerencia uma equipe sem SDR.
  const equipe = async (nome: string, gestor: Nome, membros: Nome[]) => {
    const { data: eq, error: e1 } = await servico.from("equipes").insert({ empresa_id: empresa, nome }).select("id").single();
    if (e1) throw e1;
    const { error: e2 } = await servico.from("equipe_membros").insert([
      { equipe_id: eq!.id, empresa_id: empresa, membro_id: membro[gestor], e_gestor: true },
      ...membros.map((m) => ({ equipe_id: eq!.id, empresa_id: empresa, membro_id: membro[m], e_gestor: false })),
    ]);
    if (e2) throw e2;
  };
  await equipe("Equipe comercial", "gestor", ["sdr", "sdr2", "closer", "closer2"]);
  await equipe("Equipe sem SDR", "gestorOutro", ["closer2"]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem").limit(1).single();
  etapa = et!.id;
  const { data: fB } = await servico.from("funis").select("id").eq("empresa_id", outra).single();
  funilB = fB!.id;
  const { data: etB } = await servico.from("etapas").select("id").eq("funil_id", funilB).order("ordem").limit(1).single();
  etapaB = etB!.id;
  const { data: m } = await servico.from("motivos_perda").select("id").eq("empresa_id", empresa).limit(1).single();
  motivoPerda = m!.id;

  // Regras criadas pela sessão do admin (como na tela), inclusive as "antigas" de envio e
  // devolução, que o motor precisa ignorar.
  const regras = [
    { chave: "envio", evento_tipo: "handoff.created", perfil_aplicavel: "sdr", xp: 5, moedas: 0, unica_por_negocio: false },
    { chave: "aceite", evento_tipo: "oportunidade_aceita", perfil_aplicavel: "sdr", xp: 10, moedas: 5, unica_por_negocio: false },
    { chave: "devolucao", evento_tipo: "handoff.devolvido", perfil_aplicavel: null, xp: 3, moedas: 1, unica_por_negocio: false },
    { chave: "venda", evento_tipo: "handoff.won", perfil_aplicavel: "sdr", xp: 50, moedas: 10, unica_por_negocio: true },
    { chave: "contrato", evento_tipo: "handoff.contrato_assinado", perfil_aplicavel: "sdr", xp: 20, moedas: 0, unica_por_negocio: true },
  ] as const;
  for (const r of regras) {
    const { chave, ...campos } = r;
    const { data, error: erroRegra } = await u.admin.cliente
      .from("gamification_rules")
      .insert({ empresa_id: empresa, nome: `B1a ${chave}`, ...campos })
      .select("id")
      .single();
    if (erroRegra) throw erroRegra;
    chaveDaRegra.set(data!.id, chave);
  }
});

async function negocio(titulo: string, responsavel: Nome = "sdr", emOutra = false) {
  const { data: c } = await servico
    .from("contatos")
    .insert({ empresa_id: emOutra ? outra : empresa, nome: `Cliente ${titulo}`, telefone: "45999990000" })
    .select("id")
    .single();
  const { data, error } = await servico
    .from("negocios")
    .insert({
      empresa_id: emOutra ? outra : empresa,
      titulo,
      contato_id: c!.id,
      funil_id: emOutra ? funilB : funil,
      etapa_id: emOutra ? etapaB : etapa,
      responsavel_id: membro[responsavel],
      valor: 25000,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { negocioId: data!.id, contatoId: c!.id };
}

async function enviar(quem: Nome, n: { negocioId: string; contatoId: string }, de: Nome, para: Nome, empresaId = empresa) {
  const { data, error } = await u[quem].cliente
    .from("handoffs")
    .insert({
      empresa_id: empresaId,
      negocio_id: n.negocioId,
      contato_id: n.contatoId,
      de_membro_id: membro[de],
      para_membro_id: membro[para],
      status_qualificacao: "Qualificado",
      qualificacao_snapshot: {},
    })
    .select("id")
    .single();
  return { handoffId: data?.id as string | undefined, error };
}

async function enviarOk(quem: Nome, n: { negocioId: string; contatoId: string }, de: Nome, para: Nome) {
  const r = await enviar(quem, n, de, para);
  if (r.error) throw r.error;
  return r.handoffId!;
}

async function aceitar(quem: Nome, handoffId: string) {
  const { error } = await u[quem].cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
  if (error) throw error;
}

type Lancamento = { quem: Nome | undefined; regra: string | undefined; xp: number; moedas: number; perfil: string | null; estornado: boolean };
async function lancamentos(negocioId: string): Promise<Lancamento[]> {
  const { data, error } = await servico
    .from("point_ledger")
    .select("membro_id, regra_id, xp, moedas, profile_at_event, estornado")
    .eq("referencia_tipo", "negocio")
    .eq("referencia_id", negocioId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((l) => ({
    quem: nomeDoMembro.get(l.membro_id),
    regra: l.regra_id ? chaveDaRegra.get(l.regra_id) : undefined,
    xp: l.xp,
    moedas: l.moedas,
    perfil: l.profile_at_event,
    estornado: l.estornado,
  }));
}

async function eventosDo(negocioId: string, tipo: string) {
  const { data, error } = await servico
    .from("eventos")
    .select("id, ator_id, beneficiario_id, profile_at_event, payload")
    .eq("entidade_id", negocioId)
    .eq("tipo", tipo)
    .order("id");
  if (error) throw error;
  return data ?? [];
}

async function handoffsDo(negocioId: string) {
  const { count } = await servico.from("handoffs").select("id", { count: "exact", head: true }).eq("negocio_id", negocioId);
  return count;
}

const CREDITO_ACEITE = { regra: "aceite", xp: 10, moedas: 5, perfil: "sdr", estornado: false };

describe("segurança do envio (validar_handoff_empresa)", () => {
  it("SDR responsável envia a vendedor ativo: handoff criado, envio no histórico sem pontos", async () => {
    const n = await negocio("Envio legítimo");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    const [ev] = await eventosDo(n.negocioId, "handoff.created");
    expect(ev).toMatchObject({ ator_id: u.sdr.id, beneficiario_id: u.sdr.id, profile_at_event: "sdr" });
    expect(ev.payload).toMatchObject({ handoff_id: handoffId, de_membro_id: membro.sdr, para_membro_id: membro.closer, por_delegacao: false });
    // Regra antiga de envio (5 XP) ativa: nada creditado.
    expect(await lancamentos(n.negocioId)).toEqual([]);
    // Notificação ao destinatário continua.
    const { count } = await servico
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("membro_id", membro.closer)
      .eq("tipo", "handoff_recebido")
      .eq("link", `/negocios/${n.negocioId}`);
    expect(count).toBe(1);
  });

  it("SDR não envia para si mesmo", async () => {
    const n = await negocio("Autoenvio");
    const { error } = await enviar("sdr", n, "sdr", "sdr");
    expect(error?.message).toContain("precisam ser pessoas diferentes");
    expect(error?.hint).toBe("mensagem_usuario");
    expect(await handoffsDo(n.negocioId)).toBe(0);
  });

  it("SDR não usa outro SDR como remetente (negócio dele ou do outro)", async () => {
    const meu = await negocio("Remetente forjado (meu negócio)", "sdr");
    const r1 = await enviar("sdr", meu, "sdr2", "closer");
    expect(r1.error?.message).toContain("Só o SDR responsável pelo negócio pode ser o remetente");
    const doOutro = await negocio("Remetente forjado (negócio do outro)", "sdr2");
    const r2 = await enviar("sdr", doOutro, "sdr2", "closer");
    expect(r2.error).not.toBeNull();
    expect(await handoffsDo(meu.negocioId)).toBe(0);
    expect(await handoffsDo(doOutro.negocioId)).toBe(0);
  });

  it("vendedor responsável não envia (remetente precisa ser SDR)", async () => {
    const n = await negocio("Vendedor remetente", "closer");
    const { error } = await enviar("closer", n, "closer", "closer2");
    expect(error?.message).toContain("O remetente precisa ser um SDR ativo da empresa.");
    expect(await handoffsDo(n.negocioId)).toBe(0);
  });

  it.each([
    ["SDR", "sdr2"],
    ["gestor", "gestor"],
    ["vendedor inativo", "closerInativo"],
    ["vendedor de outra empresa", "closerB"],
  ] as const)("destinatário %s é recusado", async (_, para) => {
    const n = await negocio(`Destinatário ${para}`);
    const { error } = await enviar("sdr", n, "sdr", para);
    expect(error?.message).toContain("O destinatário precisa ser um membro ativo da empresa com papel vendedor.");
    expect(await handoffsDo(n.negocioId)).toBe(0);
  });

  it("negócio de outra empresa com empresa_id da A é recusado", async () => {
    const nB = await negocio("Negócio da B", "sdrB", true);
    const { error } = await enviar("sdr", nB, "sdr", "closer", empresa);
    expect(error).not.toBeNull();
    expect(await handoffsDo(nB.negocioId)).toBe(0);
    // Na própria empresa B, o SDR dela envia normalmente.
    const ok = await enviar("sdrB", nB, "sdrB", "closerB", outra);
    expect(ok.error).toBeNull();
  });

  it.each(["gestor", "admin"] as const)("%s envia em nome do SDR responsável: ator é quem executou, beneficiário é o SDR", async (quem) => {
    const n = await negocio(`Delegação ${quem}`);
    const handoffId = await enviarOk(quem, n, "sdr", "closer");
    const [ev] = await eventosDo(n.negocioId, "handoff.created");
    expect(ev).toMatchObject({ ator_id: u[quem].id, beneficiario_id: u.sdr.id, profile_at_event: "sdr" });
    expect(ev.payload).toMatchObject({ handoff_id: handoffId, por_delegacao: true });
    expect(await lancamentos(n.negocioId)).toEqual([]);
  });

  it("gestor sem equipe do SDR e vendedor não enviam por delegação", async () => {
    for (const quem of ["gestorOutro", "closer2"] as const) {
      const n = await negocio(`Delegação recusada ${quem}`);
      const { error } = await enviar(quem, n, "sdr", "closer");
      expect(error, quem).not.toBeNull();
      expect(await handoffsDo(n.negocioId)).toBe(0);
    }
  });

  it("gestor não usa a delegação para trocar o SDR remetente", async () => {
    const n = await negocio("Gestor troca remetente", "sdr");
    const { error } = await enviar("gestor", n, "sdr2", "closer");
    expect(error?.message).toContain("Só o SDR responsável pelo negócio pode ser o remetente");
    expect(await handoffsDo(n.negocioId)).toBe(0);
  });
});

describe("pontuação do repasse", () => {
  it("primeiro aceite credita 10 XP / 5 moedas ao SDR, com perfil congelado; envio segue sem pontos", async () => {
    const n = await negocio("Aceite simples");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    await aceitar("closer", handoffId);
    expect(await lancamentos(n.negocioId)).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
    const { data: neg } = await servico.from("negocios").select("responsavel_id, handoff_origem_id").eq("id", n.negocioId).single();
    expect(neg).toEqual({ responsavel_id: membro.closer, handoff_origem_id: handoffId });
  });

  it.each(["gestor", "admin"] as const)("aceite por %s credita o SDR, nunca o ator", async (quem) => {
    const n = await negocio(`Aceite por ${quem}`);
    const handoffId = await enviarOk(quem, n, "sdr", "closer");
    await aceitar(quem, handoffId);
    const lista = await lancamentos(n.negocioId);
    expect(lista).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
    expect(lista.some((l) => l.quem === quem)).toBe(false);
    const [ev] = await eventosDo(n.negocioId, "oportunidade_aceita");
    expect(ev).toMatchObject({ ator_id: u[quem].id, beneficiario_id: u.sdr.id, profile_at_event: "sdr" });
  });

  it("devolução não pontua (regra antiga ativa); reenvio e aceite creditam uma única vez", async () => {
    const n = await negocio("Devolução e reenvio");
    const primeiro = await enviarOk("sdr", n, "sdr", "closer");
    const { error } = await u.closer.cliente.rpc("devolver_handoff", { p_handoff_id: primeiro, p_motivo: "Sem perfil agora" });
    expect(error).toBeNull();
    expect(await eventosDo(n.negocioId, "handoff.devolvido")).toHaveLength(1);
    expect(await lancamentos(n.negocioId)).toEqual([]);

    const segundo = await enviarOk("sdr", n, "sdr", "closer2");
    await aceitar("closer2", segundo);
    // Um handoff.created por envio (histórico), nenhum pontuando.
    expect((await eventosDo(n.negocioId, "handoff.created")).map((e) => (e.payload as { handoff_id: string }).handoff_id)).toEqual([primeiro, segundo]);
    expect(await lancamentos(n.negocioId)).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it("aceites posteriores do mesmo negócio não pontuam de novo (sem unica_por_negocio na regra)", async () => {
    const n = await negocio("Segundo aceite");
    await aceitar("closer", await enviarOk("sdr", n, "sdr", "closer"));
    // O negócio volta para outro SDR, que repassa de novo; o novo aceite é histórico, não crédito.
    const { error } = await servico.from("negocios").update({ responsavel_id: membro.sdr2 }).eq("id", n.negocioId);
    if (error) throw error;
    await aceitar("closer2", await enviarOk("sdr2", n, "sdr2", "closer2"));
    expect(await eventosDo(n.negocioId, "oportunidade_aceita")).toHaveLength(2);
    expect(await lancamentos(n.negocioId)).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it("aceites concorrentes do mesmo handoff: um vence, um crédito só", async () => {
    const n = await negocio("Aceite concorrente");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    const resultados = await Promise.all(
      (["closer", "gestor", "admin"] as const).map((q) => u[q].cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId })),
    );
    expect(resultados.filter((r) => !r.error)).toHaveLength(1);
    for (const r of resultados.filter((x) => x.error)) expect(r.error!.message).toContain("já foi respondida");
    expect(await eventosDo(n.negocioId, "oportunidade_aceita")).toHaveLength(1);
    expect(await lancamentos(n.negocioId)).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it("negócio perdido depois do aceite mantém os pontos do aceite", async () => {
    const n = await negocio("Aceito e perdido");
    await aceitar("closer", await enviarOk("sdr", n, "sdr", "closer"));
    const { error } = await u.closer.cliente.from("negocios").update({ status: "perdido", motivo_perda_id: motivoPerda }).eq("id", n.negocioId);
    expect(error).toBeNull();
    expect(await lancamentos(n.negocioId)).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it("venda e contrato continuam com concessão e estorno próprios; o aceite não é estornado", async () => {
    const n = await negocio("Venda e contrato");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    await aceitar("closer", handoffId);
    const status = async (s: "ganho" | "aberto") => {
      const { error } = await u.closer.cliente.from("negocios").update({ status: s }).eq("id", n.negocioId);
      if (error) throw error;
    };
    await status("ganho");
    const { data: contrato, error: erroContrato } = await u.closer.cliente
      .from("contratos")
      .insert({ empresa_id: empresa, negocio_id: n.negocioId, conteudo: "Contrato B1a" })
      .select("id")
      .single();
    if (erroContrato) throw erroContrato;
    const assinar = async (s: "assinado" | "aguardando_assinatura") => {
      const { error } = await u.closer.cliente.from("contratos").update({ status: s }).eq("id", contrato!.id);
      if (error) throw error;
    };
    await assinar("assinado");
    expect(await lancamentos(n.negocioId)).toEqual([
      { quem: "sdr", ...CREDITO_ACEITE },
      { quem: "sdr", regra: "venda", xp: 50, moedas: 10, perfil: "sdr", estornado: false },
      { quem: "sdr", regra: "contrato", xp: 20, moedas: 0, perfil: "sdr", estornado: false },
    ]);

    await assinar("aguardando_assinatura");
    await status("aberto");
    expect(await lancamentos(n.negocioId)).toEqual([
      { quem: "sdr", ...CREDITO_ACEITE },
      { quem: "sdr", regra: "venda", xp: 50, moedas: 10, perfil: "sdr", estornado: true },
      { quem: "sdr", regra: "contrato", xp: 20, moedas: 0, perfil: "sdr", estornado: true },
    ]);
    const { data: neg } = await servico.from("negocios").select("handoff_origem_id").eq("id", n.negocioId).single();
    expect(neg!.handoff_origem_id).toBe(handoffId);
  });
});

// Conexão direta só no banco local (nunca remoto/produção), para segurar uma transação aberta.
const URL_BANCO = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function urlBancoLocal() {
  const host = new URL(URL_BANCO).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Teste direto no banco recusado: host "${host}" não é local.`);
  return URL_BANCO;
}

describe("concorrência do envio", () => {
  it("troca de responsável em andamento: o envio espera e é recusado se o SDR deixou de ser o responsável", async () => {
    const n = await negocio("Envio x troca de responsável");
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      await banco.query("begin");
      await banco.query("update public.negocios set responsavel_id = $1 where id = $2", [membro.sdr2, n.negocioId]);
      let terminou = false;
      const envio = enviar("sdr", n, "sdr", "closer").then((r) => {
        terminou = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 700));
      expect(terminou, "o envio precisa esperar a troca de responsável em andamento").toBe(false);
      await banco.query("commit");
      const { error } = await envio;
      expect(error).not.toBeNull();
    } finally {
      await banco.query("rollback").catch(() => undefined);
      await banco.end();
    }
    expect(await handoffsDo(n.negocioId)).toBe(0);
  });

  it("desativação do destinatário em andamento: o envio espera e é recusado", async () => {
    const n = await negocio("Envio x desativação");
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      await banco.query("begin");
      await banco.query("update public.empresa_membros set status = 'inativo' where id = $1", [membro.closer2]);
      let terminou = false;
      const envio = enviar("sdr", n, "sdr", "closer2").then((r) => {
        terminou = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 700));
      expect(terminou, "o envio precisa esperar a desativação em andamento").toBe(false);
      await banco.query("rollback");
      // Desativação desfeita: o envio segue e passa.
      const { error } = await envio;
      expect(error).toBeNull();
    } finally {
      await banco.end();
    }
    expect(await handoffsDo(n.negocioId)).toBe(1);
  });
});

describe("migration sem alteração de histórico (D7)", () => {
  it("só (re)define funções: nenhum insert/update/delete fora dos corpos das funções", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261010100000_handoff_pontuacao_aceite.sql"), "utf-8");
    const semCorpos = sql.replace(/\$\$[\s\S]*?\$\$/g, "$$$$").replace(/--.*$/gm, "");
    expect(semCorpos).not.toMatch(/\b(insert\s+into|update\s+\w|delete\s+from|truncate|alter\s+table|drop\s)/i);
    expect(semCorpos.match(/create or replace function/gi)).toHaveLength(4);
  });
});

describe("aceite desatualizado: responsável mudou depois do envio", () => {
  const DESATUALIZADO = "A oportunidade mudou de responsável após o envio. Este repasse não pode mais ser aceito.";

  async function trocarResponsavel(negocioId: string, para: Nome) {
    // Usuário autorizado (admin) troca o responsável pela própria sessão, como na tela.
    const { error } = await u.admin.cliente.from("negocios").update({ responsavel_id: membro[para] }).eq("id", negocioId).select("id");
    if (error) throw error;
  }

  /** Tudo que um aceite gravaria: handoff, negócio, eventos, pontos, atividades e notificações. */
  async function retrato(negocioId: string, handoffId: string) {
    const [h, n, aceites, atividades, notificacoes] = await Promise.all([
      servico.from("handoffs").select("status, respondido_por, respondido_em, motivo_devolucao, perfil_sdr_credito").eq("id", handoffId).single(),
      servico.from("negocios").select("responsavel_id, handoff_origem_id").eq("id", negocioId).single(),
      eventosDo(negocioId, "oportunidade_aceita"),
      servico.from("atividades").select("tipo").eq("negocio_id", negocioId).order("id"),
      servico.from("notificacoes").select("membro_id, tipo").eq("link", `/negocios/${negocioId}`).order("id"),
    ]);
    return {
      handoff: h.data,
      negocio: n.data,
      aceites: aceites.length,
      pontos: await lancamentos(negocioId),
      atividades: (atividades.data ?? []).map((a) => a.tipo),
      notificacoes: (notificacoes.data ?? []).map((x) => `${nomeDoMembro.get(x.membro_id)}:${x.tipo}`),
    };
  }

  it("sem mudança de responsável o aceite continua funcionando", async () => {
    const n = await negocio("Desatualizado: sem mudança");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    await aceitar("closer", handoffId);
    const r = await retrato(n.negocioId, handoffId);
    expect(r.negocio).toEqual({ responsavel_id: membro.closer, handoff_origem_id: handoffId });
    expect(r.pontos).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it.each(["closer", "admin", "gestor"] as const)(
    "%s não aceita depois da troca de responsável; nada é gravado (handoff, negócio, eventos, pontos, atividades, notificações)",
    async (quem) => {
      const n = await negocio(`Desatualizado: aceite por ${quem}`);
      const handoffId = await enviarOk("sdr", n, "sdr", "closer");
      await trocarResponsavel(n.negocioId, "sdr2");
      const antes = await retrato(n.negocioId, handoffId);
      expect(antes.handoff).toMatchObject({ status: "pendente", respondido_por: null });
      expect(antes.negocio).toEqual({ responsavel_id: membro.sdr2, handoff_origem_id: null });

      const { data, error } = await u[quem].cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
      expect(data).toBeNull();
      expect(error?.message).toContain(DESATUALIZADO);
      expect(error?.message).toContain("Devolva a oportunidade informando o motivo.");
      expect(error?.hint).toBe("mensagem_usuario");
      const depois = await retrato(n.negocioId, handoffId);
      expect(depois).toEqual(antes);
      expect(depois.aceites).toBe(0);
      expect(depois.pontos).toEqual([]);
    },
  );

  it.each(["admin", "gestor"] as const)(
    "%s devolve depois da troca: motivo obrigatório, responsável novo preservado, sem pontos",
    async (quem) => {
      const n = await negocio(`Desatualizado: devolução por ${quem}`);
      const handoffId = await enviarOk("sdr", n, "sdr", "closer");
      await trocarResponsavel(n.negocioId, "sdr2");

      const semMotivo = await u[quem].cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "   " });
      expect(semMotivo.error?.message).toContain("Informe o motivo da devolução.");
      expect((await retrato(n.negocioId, handoffId)).handoff).toMatchObject({ status: "pendente", respondido_por: null });

      const motivo = `Responsável mudou (${quem}) ${sufixo}`;
      const { data, error } = await u[quem].cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: motivo });
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: "devolvido", respondido_por: membro[quem], motivo_devolucao: motivo });
      const r = await retrato(n.negocioId, handoffId);
      expect(r.negocio).toEqual({ responsavel_id: membro.sdr2, handoff_origem_id: null });
      expect(r.pontos).toEqual([]);
      expect(r.atividades).toContain("handoff_devolvido");
      // Notificação legítima: o SDR remetente fica sabendo da devolução.
      expect(r.notificacoes).toContain("sdr:handoff_devolvido");
      const [ev] = await eventosDo(n.negocioId, "handoff.devolvido");
      expect(ev).toMatchObject({ ator_id: u[quem].id });
      expect((ev.payload as { motivo: string; por_delegacao: boolean }).motivo).toBe(motivo);
    },
  );

  it("destinatário também devolve depois da troca, sem tocar no responsável novo", async () => {
    const n = await negocio("Desatualizado: devolução pelo destinatário");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    await trocarResponsavel(n.negocioId, "sdr2");
    const { error } = await u.closer.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "Mudou de dono" });
    expect(error).toBeNull();
    expect((await retrato(n.negocioId, handoffId)).negocio).toEqual({ responsavel_id: membro.sdr2, handoff_origem_id: null });
  });

  it("depois de devolver o repasse antigo, o novo responsável envia e só o primeiro aceite legítimo pontua (para ele)", async () => {
    const n = await negocio("Desatualizado: novo repasse");
    const antigo = await enviarOk("sdr", n, "sdr", "closer");
    await trocarResponsavel(n.negocioId, "sdr2");
    expect((await u.closer.cliente.rpc("aceitar_handoff", { p_handoff_id: antigo })).error?.message).toContain(DESATUALIZADO);
    expect((await u.gestor.cliente.rpc("devolver_handoff", { p_handoff_id: antigo, p_motivo: "Repasse antigo" })).error).toBeNull();

    const novo = await enviarOk("sdr2", n, "sdr2", "closer2");
    await aceitar("closer2", novo);
    const r = await retrato(n.negocioId, novo);
    expect(r.negocio).toEqual({ responsavel_id: membro.closer2, handoff_origem_id: novo });
    expect(r.pontos).toEqual([{ quem: "sdr2", ...CREDITO_ACEITE }]);
  });

  it("A → C → A antes do aceite: qualquer troca efetiva depois do envio invalida o repasse, mesmo voltando ao SDR original", async () => {
    const n = await negocio("Desatualizado: A → C → A");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    await trocarResponsavel(n.negocioId, "sdr2");
    await trocarResponsavel(n.negocioId, "sdr");
    const antes = await retrato(n.negocioId, handoffId);
    expect(antes.negocio).toEqual({ responsavel_id: membro.sdr, handoff_origem_id: null });

    for (const quem of ["closer", "admin", "gestor"] as const) {
      const { data, error } = await u[quem].cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
      expect(data, quem).toBeNull();
      expect(error?.message, quem).toContain(DESATUALIZADO);
      expect(error?.hint, quem).toBe("mensagem_usuario");
    }
    // Nada gravado: handoff pendente, responsável A, sem evento de aceite, pontos ou atividade nova.
    const depois = await retrato(n.negocioId, handoffId);
    expect(depois).toEqual(antes);
    expect(depois.handoff).toMatchObject({ status: "pendente", respondido_por: null, respondido_em: null });
    expect(depois.aceites).toBe(0);
    expect(depois.pontos).toEqual([]);
    expect(depois.atividades.filter((t) => t === "handoff_aceito")).toEqual([]);

    // Devolução autorizada segue funcionando, com motivo, sem mexer no responsável.
    const semMotivo = await u.gestor.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "" });
    expect(semMotivo.error?.message).toContain("Informe o motivo da devolução.");
    const { error: erroDevolucao } = await u.gestor.cliente.rpc("devolver_handoff", { p_handoff_id: handoffId, p_motivo: "Responsável trocou e voltou" });
    expect(erroDevolucao).toBeNull();
    const devolvido = await retrato(n.negocioId, handoffId);
    expect(devolvido.handoff).toMatchObject({ status: "devolvido", respondido_por: membro.gestor, motivo_devolucao: "Responsável trocou e voltou" });
    expect(devolvido.negocio).toEqual({ responsavel_id: membro.sdr, handoff_origem_id: null });
    expect(devolvido.pontos).toEqual([]);

    // Repasse novo do mesmo SDR, depois da devolução: as trocas antigas (anteriores a este
    // envio) não contam, e o aceite pontua uma vez, para ele.
    const novo = await enviarOk("sdr", n, "sdr", "closer");
    await aceitar("closer", novo);
    const final = await retrato(n.negocioId, novo);
    expect(final.handoff).toMatchObject({ status: "aceito", respondido_por: membro.closer });
    expect(final.negocio).toEqual({ responsavel_id: membro.closer, handoff_origem_id: novo });
    expect(final.aceites).toBe(1);
    expect(final.pontos).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it("histórico de repasses anteriores não contamina o atual: trocas antes do envio não bloqueiam; troca depois bloqueia", async () => {
    const n = await negocio("Desatualizado: histórico de repasses");
    // Ciclo anterior completo: envio, devolução e trocas de responsável (A → C → A), tudo antes do repasse atual.
    const antigo = await enviarOk("sdr", n, "sdr", "closer");
    expect((await u.closer.cliente.rpc("devolver_handoff", { p_handoff_id: antigo, p_motivo: "Ciclo anterior" })).error).toBeNull();
    await trocarResponsavel(n.negocioId, "sdr2");
    await trocarResponsavel(n.negocioId, "sdr");

    // Repasse atual sem troca depois do envio: aceita normalmente.
    const atual = await enviarOk("sdr", n, "sdr", "closer2");
    await aceitar("closer2", atual);
    expect((await retrato(n.negocioId, atual)).negocio).toEqual({ responsavel_id: membro.closer2, handoff_origem_id: atual });

    // E o handoff antigo (já devolvido) continua sem poder ser aceito.
    const tardio = await u.admin.cliente.rpc("aceitar_handoff", { p_handoff_id: antigo });
    expect(tardio.error?.message).toContain("já foi respondida");
    expect((await lancamentos(n.negocioId))).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it("aceite concluído antes: a troca de responsável posterior segue as regras dela e não desfaz o aceite", async () => {
    const n = await negocio("Desatualizado: aceite antes da troca");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    await aceitar("closer", handoffId);
    await trocarResponsavel(n.negocioId, "closer2");
    const r = await retrato(n.negocioId, handoffId);
    expect(r.handoff).toMatchObject({ status: "aceito", respondido_por: membro.closer });
    expect(r.negocio).toEqual({ responsavel_id: membro.closer2, handoff_origem_id: handoffId });
    expect(r.pontos).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });

  it("corrida: troca de responsável em andamento faz o aceite esperar; confirmada, o aceite é recusado sem estado parcial", async () => {
    const n = await negocio("Desatualizado: corrida confirmada");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      await banco.query("begin");
      await banco.query("update public.negocios set responsavel_id = $1 where id = $2", [membro.sdr2, n.negocioId]);
      let terminou = false;
      const aceite = u.gestor.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId }).then((r) => {
        terminou = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 700));
      expect(terminou, "o aceite precisa esperar a troca de responsável em andamento").toBe(false);
      await banco.query("commit");
      const { error } = await aceite;
      expect(error?.message).toContain(DESATUALIZADO);
    } finally {
      await banco.query("rollback").catch(() => undefined);
      await banco.end();
    }
    const r = await retrato(n.negocioId, handoffId);
    expect(r.handoff).toMatchObject({ status: "pendente", respondido_por: null });
    expect(r.negocio).toEqual({ responsavel_id: membro.sdr2, handoff_origem_id: null });
    expect(r.aceites).toBe(0);
    expect(r.pontos).toEqual([]);
  });

  it("corrida: A → C → A numa transação em andamento faz o aceite esperar e, confirmada, recusa", async () => {
    const n = await negocio("Desatualizado: corrida A → C → A");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      await banco.query("begin");
      await banco.query("update public.negocios set responsavel_id = $1 where id = $2", [membro.sdr2, n.negocioId]);
      await banco.query("update public.negocios set responsavel_id = $1 where id = $2", [membro.sdr, n.negocioId]);
      let terminou = false;
      const aceite = u.closer.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId }).then((r) => {
        terminou = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 700));
      expect(terminou, "o aceite precisa esperar a transação em andamento").toBe(false);
      await banco.query("commit");
      const { error } = await aceite;
      expect(error?.message).toContain(DESATUALIZADO);
    } finally {
      await banco.query("rollback").catch(() => undefined);
      await banco.end();
    }
    const r = await retrato(n.negocioId, handoffId);
    expect(r.handoff).toMatchObject({ status: "pendente", respondido_por: null });
    expect(r.negocio).toEqual({ responsavel_id: membro.sdr, handoff_origem_id: null });
    expect(r.aceites).toBe(0);
    expect(r.pontos).toEqual([]);
  });

  it("corrida: troca de responsável desfeita (rollback) libera o aceite, que conclui normalmente", async () => {
    const n = await negocio("Desatualizado: corrida desfeita");
    const handoffId = await enviarOk("sdr", n, "sdr", "closer");
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      await banco.query("begin");
      await banco.query("update public.negocios set responsavel_id = $1 where id = $2", [membro.sdr2, n.negocioId]);
      const aceite = u.closer.cliente.rpc("aceitar_handoff", { p_handoff_id: handoffId });
      await new Promise((r) => setTimeout(r, 500));
      await banco.query("rollback");
      expect((await aceite).error).toBeNull();
    } finally {
      await banco.end();
    }
    const r = await retrato(n.negocioId, handoffId);
    expect(r.negocio).toEqual({ responsavel_id: membro.closer, handoff_origem_id: handoffId });
    expect(r.pontos).toEqual([{ quem: "sdr", ...CREDITO_ACEITE }]);
  });
});
