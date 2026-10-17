/**
 * Arquivamento de negócio × operações concorrentes, com DUAS SESSÕES REAIS de PostgreSQL
 * (20261016200000_negocios_arquivamento.sql).
 *
 * `arquivar_negocio` trava o negócio (FOR UPDATE) e só então confere tarefas abertas, distribuição de lead e
 * repasse pendentes, contrato, pagamento e obra. Os gatilhos das tabelas filhas travam o mesmo negócio em
 * FOR KEY SHARE antes de ler o estado: quem chega depois ESPERA a outra transação e REVALIDA com a versão
 * nova. Cada caso roda nos dois ordenamentos:
 *   - arquivamento primeiro: a operação concorrente espera o commit e é recusada (somente leitura);
 *   - operação primeiro: o arquivamento espera o commit e é recusado pela pendência que a operação criou.
 * A sessão "observadora" confere em `pg_stat_activity` que a segunda sessão estava de fato esperando trava.
 *
 * O cenário é criado por SQL na própria conexão direta (só banco local), sem depender da API.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL_BANCO = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function urlBancoLocal() {
  const host = new URL(URL_BANCO).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Teste direto no banco recusado: host "${host}" não é local.`);
  return URL_BANCO;
}

const SOMENTE_LEITURA = "Negócio arquivado é somente leitura: desarquive antes de alterar.";
const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

let observador: Client;
let empresa: string;
let funil: string;
let etapa: string;
let contato: string;
const usuario: Record<"admin" | "vendedor" | "vendedor2" | "sdr", string> = { admin: "", vendedor: "", vendedor2: "", sdr: "" };
const membro: Record<"admin" | "vendedor" | "vendedor2" | "sdr", string> = { admin: "", vendedor: "", vendedor2: "", sdr: "" };

async function conectar() {
  const c = new Client({ connectionString: urlBancoLocal() });
  await c.connect();
  return c;
}

async function um<T = Record<string, unknown>>(c: Client, sql: string, params: unknown[] = []) {
  const { rows } = await c.query(sql, params);
  return rows[0] as T;
}

/** Abre transação na sessão e assume o usuário (como a API: papel authenticated + claims do JWT). */
async function iniciarComo(c: Client, quem: keyof typeof usuario | null) {
  await c.query("begin");
  if (quem) {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: usuario[quem], role: "authenticated" })]);
    await c.query("set local role authenticated");
  }
}

/** Espera até a sessão `pid` estar parada aguardando trava (prova de que houve disputa real). */
async function esperarBloqueio(pid: number) {
  for (let i = 0; i < 100; i++) {
    const r = await um<{ esperando: boolean }>(observador, "select coalesce(bool_or(wait_event_type = 'Lock'), false) as esperando from pg_stat_activity where pid = $1", [pid]);
    if (r.esperando) return true;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  return false;
}

async function erroDe(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function novoNegocio(responsavel: keyof typeof membro = "vendedor") {
  const r = await um<{ id: string }>(
    observador,
    `insert into public.negocios (empresa_id, titulo, contato_id, funil_id, etapa_id, responsavel_id)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [empresa, `Concorrência ${sufixo} ${Math.random()}`, contato, funil, etapa, membro[responsavel]],
  );
  // Negócio de SDR nasce com a tarefa "Realizar primeiro contato" (M1); ela é concluída aqui para que a única
  // pendência em disputa seja a do caso testado.
  await observador.query("update public.tarefas set concluida_em = now(), resultado = 'contato_realizado' where negocio_id = $1 and concluida_em is null", [r.id]);
  return r.id;
}

async function estado(negocio: string) {
  return um<{ arquivado: boolean; tarefas_abertas: number; atribuicoes: number; repasses: number; contratos: number }>(
    observador,
    `select (select arquivado_em is not null from public.negocios where id = $1) as arquivado,
            (select count(*)::int from public.tarefas where negocio_id = $1 and concluida_em is null) as tarefas_abertas,
            (select count(*)::int from public.atribuicoes_leads where negocio_id = $1 and status = 'pendente') as atribuicoes,
            (select count(*)::int from public.handoffs where negocio_id = $1 and status = 'pendente') as repasses,
            (select count(*)::int from public.contratos where negocio_id = $1) as contratos`,
    [negocio],
  );
}

beforeAll(async () => {
  observador = await conectar();
  for (const papel of Object.keys(usuario) as (keyof typeof usuario)[]) {
    const u = await um<{ id: string }>(
      observador,
      `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, $2, now(), now())
       returning id`,
      [`arq-conc-${papel}-${sufixo}@teste.raion`, JSON.stringify({ nome: `arq-conc-${papel}` })],
    );
    usuario[papel] = u.id;
  }
  empresa = (await um<{ id: string }>(observador, "insert into public.empresas (nome) values ($1) returning id", [`Arquivamento concorrência ${sufixo}`])).id;
  funil = (await um<{ id: string }>(observador, "select id from public.funis where empresa_id = $1 limit 1", [empresa])).id;
  etapa = (await um<{ id: string }>(observador, "select id from public.etapas where funil_id = $1 order by ordem limit 1", [funil])).id;
  contato = (await um<{ id: string }>(observador, "insert into public.contatos (empresa_id, nome) values ($1, 'Cliente concorrência') returning id", [empresa])).id;
  const papeis = { admin: "admin", vendedor: "vendedor", vendedor2: "vendedor", sdr: "sdr" } as const;
  for (const [quem, papel] of Object.entries(papeis) as [keyof typeof membro, string][]) {
    membro[quem] = (
      await um<{ id: string }>(observador, "insert into public.empresa_membros (empresa_id, user_id, papel) values ($1, $2, $3) returning id", [empresa, usuario[quem], papel])
    ).id;
  }
});

afterAll(async () => {
  await observador?.end();
});

/**
 * Roda a disputa: `primeiro` executa e fica com a transação aberta; `segundo` começa e precisa ficar esperando;
 * então `primeiro` faz commit e devolve-se o erro (ou null) de cada um.
 */
async function disputa(
  primeiro: { quem: keyof typeof usuario | null; sql: string; params: unknown[] },
  segundo: { quem: keyof typeof usuario | null; sql: string; params: unknown[] },
) {
  const a = await conectar();
  const b = await conectar();
  try {
    const pidB = (await um<{ pid: number }>(b, "select pg_backend_pid() as pid")).pid;
    await iniciarComo(a, primeiro.quem);
    const erroPrimeiro = await erroDe(a.query(primeiro.sql, primeiro.params));
    expect(erroPrimeiro, "a primeira operação deveria passar enquanto está sozinha").toBeNull();
    await iniciarComo(b, segundo.quem);
    const pendenteB = erroDe(b.query(segundo.sql, segundo.params));
    const esperou = await esperarBloqueio(pidB);
    await a.query("commit");
    const erroSegundo = await pendenteB;
    await b.query(erroSegundo ? "rollback" : "commit");
    return { esperou, erroSegundo };
  } finally {
    await a.end();
    await b.end();
  }
}

const ARQUIVAR = (negocio: string) => ({ quem: "admin" as const, sql: "select public.arquivar_negocio($1, 'Teste de concorrência')", params: [negocio] });

describe("arquivamento × tarefas (duas sessões)", () => {
  const criarTarefa = (negocio: string) => ({
    quem: "vendedor" as const,
    sql: "insert into public.tarefas (empresa_id, negocio_id, titulo, vence_em, responsavel_id) values ($1, $2, 'Tarefa concorrente', now() + interval '1 day', $3)",
    params: [empresa, negocio, membro.vendedor],
  });

  it("arquivamento primeiro: a tarefa criada no meio espera e é recusada; não sobra tarefa aberta", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(ARQUIVAR(negocio), criarTarefa(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe(SOMENTE_LEITURA);
    expect(await estado(negocio)).toMatchObject({ arquivado: true, tarefas_abertas: 0 });
  });

  it("tarefa primeiro: o arquivamento espera, revalida e é recusado informando a quantidade", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(criarTarefa(negocio), ARQUIVAR(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe("Há 1 tarefa aberta neste negócio: conclua ou exclua a tarefa antes de arquivar.");
    expect(await estado(negocio)).toMatchObject({ arquivado: false, tarefas_abertas: 1 });
  });

  it("tarefa concluída e negócio editado na outra sessão: o arquivamento espera, revalida e arquiva, sem deadlock", async () => {
    const negocio = await novoNegocio();
    const tarefa = (
      await um<{ id: string }>(
        observador,
        "insert into public.tarefas (empresa_id, negocio_id, titulo, vence_em, responsavel_id) values ($1, $2, 'Tarefa a concluir', now() + interval '1 day', $3) returning id",
        [empresa, negocio, membro.vendedor],
      )
    ).id;
    const a = await conectar();
    const b = await conectar();
    try {
      const pidA = (await um<{ pid: number }>(a, "select pg_backend_pid() as pid")).pid;
      // B conclui a tarefa (trava o negócio em FOR KEY SHARE) e mantém a transação aberta.
      await iniciarComo(b, "vendedor");
      await b.query("update public.tarefas set concluida_em = now() where id = $1", [tarefa]);
      // A tenta arquivar: precisa esperar B.
      await iniciarComo(a, "admin");
      const pendenteA = erroDe(a.query("select public.arquivar_negocio($1, 'Teste de concorrência')", [negocio]));
      expect(await esperarBloqueio(pidA)).toBe(true);
      // B ainda edita o próprio negócio (sobe a trava para FOR NO KEY UPDATE) com A na fila: não pode haver deadlock.
      await b.query("update public.negocios set descricao = 'Editado durante o arquivamento' where id = $1", [negocio]);
      await b.query("commit");
      expect(await pendenteA).toBeNull();
      await a.query("commit");
    } finally {
      await a.end();
      await b.end();
    }
    expect(await estado(negocio)).toMatchObject({ arquivado: true, tarefas_abertas: 0 });
    const n = await um<{ descricao: string }>(observador, "select descricao from public.negocios where id = $1", [negocio]);
    expect(n.descricao).toBe("Editado durante o arquivamento");
  });
});

describe("arquivamento × distribuição de lead (duas sessões)", () => {
  const distribuir = (negocio: string) => ({
    quem: null,
    sql: "insert into public.atribuicoes_leads (empresa_id, negocio_id, membro_sugerido_id, expira_em) values ($1, $2, $3, now() + interval '1 hour')",
    params: [empresa, negocio, membro.vendedor2],
  });

  it("arquivamento primeiro: a distribuição criada no meio espera e é recusada", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(ARQUIVAR(negocio), distribuir(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe(SOMENTE_LEITURA);
    expect(await estado(negocio)).toMatchObject({ arquivado: true, atribuicoes: 0 });
  });

  it("distribuição primeiro: o arquivamento espera e é recusado", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(distribuir(negocio), ARQUIVAR(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe("Há uma distribuição de lead pendente para este negócio: conclua antes de arquivar.");
    expect(await estado(negocio)).toMatchObject({ arquivado: false, atribuicoes: 1 });
  });
});

describe("arquivamento × repasse (duas sessões)", () => {
  const repassar = (negocio: string) => ({
    quem: null,
    sql: `insert into public.handoffs (empresa_id, negocio_id, contato_id, de_membro_id, para_membro_id, status_qualificacao)
          values ($1, $2, $3, $4, $5, 'qualificado')`,
    params: [empresa, negocio, contato, membro.sdr, membro.vendedor],
  });

  it("arquivamento primeiro: o repasse criado no meio espera e é recusado", async () => {
    const negocio = await novoNegocio("sdr");
    const r = await disputa(ARQUIVAR(negocio), repassar(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe(SOMENTE_LEITURA);
    expect(await estado(negocio)).toMatchObject({ arquivado: true, repasses: 0 });
  });

  it("repasse primeiro: o arquivamento espera e é recusado", async () => {
    const negocio = await novoNegocio("sdr");
    const r = await disputa(repassar(negocio), ARQUIVAR(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe("Há um repasse pendente para este negócio: conclua antes de arquivar.");
    expect(await estado(negocio)).toMatchObject({ arquivado: false, repasses: 1 });
  });
});

describe("arquivamento × contrato (duas sessões)", () => {
  const contratar = (negocio: string) => ({
    quem: null,
    sql: "insert into public.contratos (empresa_id, negocio_id, conteudo) values ($1, $2, 'Contrato concorrente')",
    params: [empresa, negocio],
  });

  it("arquivamento primeiro: o contrato criado no meio espera e é recusado", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(ARQUIVAR(negocio), contratar(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe(SOMENTE_LEITURA);
    expect(await estado(negocio)).toMatchObject({ arquivado: true, contratos: 0 });
  });

  it("contrato primeiro: o arquivamento espera e é recusado", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(contratar(negocio), ARQUIVAR(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe("Negócio com contrato, pagamento ou obra não pode ser arquivado.");
    expect(await estado(negocio)).toMatchObject({ arquivado: false, contratos: 1 });
  });
});

describe("arquivamento × transferência de pendência por UPDATE (duas sessões)", () => {
  // Como dono do banco (quem: null), o caminho mais amplo: troca o negocio_id de uma pendência de outro negócio.
  async function distribuicaoPendente() {
    const origem = await novoNegocio();
    return (
      await um<{ id: string }>(
        observador,
        "insert into public.atribuicoes_leads (empresa_id, negocio_id, membro_sugerido_id, expira_em) values ($1, $2, $3, now() + interval '1 hour') returning id",
        [empresa, origem, membro.vendedor2],
      )
    ).id;
  }
  async function contratoDeOutro() {
    const origem = await novoNegocio();
    return (await um<{ id: string }>(observador, "insert into public.contratos (empresa_id, negocio_id, conteudo) values ($1, $2, 'Contrato a transferir') returning id", [empresa, origem])).id;
  }
  const transferir = (tabela: "atribuicoes_leads" | "contratos", id: string, negocio: string) => ({
    quem: null,
    sql: `update public.${tabela} set negocio_id = $1 where id = $2`,
    params: [negocio, id],
  });

  it("arquivamento primeiro: a distribuição transferida no meio espera e é recusada", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(ARQUIVAR(negocio), transferir("atribuicoes_leads", await distribuicaoPendente(), negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe(SOMENTE_LEITURA);
    expect(await estado(negocio)).toMatchObject({ arquivado: true, atribuicoes: 0 });
  });

  it("transferência da distribuição primeiro: o arquivamento espera e é recusado", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(transferir("atribuicoes_leads", await distribuicaoPendente(), negocio), ARQUIVAR(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe("Há uma distribuição de lead pendente para este negócio: conclua antes de arquivar.");
    expect(await estado(negocio)).toMatchObject({ arquivado: false, atribuicoes: 1 });
  });

  it("arquivamento primeiro: o contrato transferido no meio espera e é recusado", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(ARQUIVAR(negocio), transferir("contratos", await contratoDeOutro(), negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe(SOMENTE_LEITURA);
    expect(await estado(negocio)).toMatchObject({ arquivado: true, contratos: 0 });
  });

  it("transferência do contrato primeiro: o arquivamento espera e é recusado", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(transferir("contratos", await contratoDeOutro(), negocio), ARQUIVAR(negocio));
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe("Negócio com contrato, pagamento ou obra não pode ser arquivado.");
    expect(await estado(negocio)).toMatchObject({ arquivado: false, contratos: 1 });
  });
});

// Sem disputa: o mesmo acesso direto, como DONO do banco (postgres), o papel que nem a RLS nem as concessões limitam.
describe("dono do banco: arquivamento só pelas funções e arquivado sem 'toque'", () => {
  async function arquivarComoAdmin(negocio: string) {
    const c = await conectar();
    try {
      await iniciarComo(c, "admin");
      await c.query("select public.arquivar_negocio($1, 'Teste do dono')", [negocio]);
      await c.query("commit");
    } finally {
      await c.end();
    }
  }
  async function auditoria(negocio: string) {
    return (await um<{ n: number }>(observador, "select count(*)::int as n from public.logs_auditoria where entidade = 'negocios' and entidade_id = $1", [negocio])).n;
  }

  it("arquivar ou desarquivar direto nas colunas é recusado até para o dono (nada sem auditoria)", async () => {
    const ativo = await novoNegocio();
    expect(
      await erroDe(observador.query("update public.negocios set arquivado_em = now(), motivo_arquivamento = 'direto' where id = $1", [ativo])),
    ).toBe("Use arquivar ou desarquivar para mudar o arquivamento.");

    const arquivado = await novoNegocio();
    await arquivarComoAdmin(arquivado);
    expect(
      await erroDe(observador.query("update public.negocios set arquivado_em = null, motivo_arquivamento = null, arquivado_por = null where id = $1", [arquivado])),
    ).toBe("Use arquivar ou desarquivar para mudar o arquivamento.");
    expect(await auditoria(ativo)).toBe(0);
    expect(await auditoria(arquivado)).toBe(1);
    expect(await estado(arquivado)).toMatchObject({ arquivado: true });
  });

  it("dono não muda só o updated_at do arquivado; apagar o membro que arquivou continua anulando o autor", async () => {
    const negocio = await novoNegocio();
    const u = await um<{ id: string }>(
      observador,
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, now(), now()) returning id`,
      [`arq-conc-gestor-${sufixo}-${Math.random()}@teste.raion`],
    );
    const gestor = (await um<{ id: string }>(observador, "insert into public.empresa_membros (empresa_id, user_id, papel) values ($1, $2, 'gestor') returning id", [empresa, u.id])).id;
    const c = await conectar();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u.id, role: "authenticated" })]);
      await c.query("set local role authenticated");
      await c.query("select public.arquivar_negocio($1, 'Arquivado pelo gestor')", [negocio]);
      await c.query("commit");
    } finally {
      await c.end();
    }

    expect(await erroDe(observador.query("update public.negocios set updated_at = now() - interval '1 day' where id = $1", [negocio]))).toBe(SOMENTE_LEITURA);
    expect(await erroDe(observador.query("update public.negocios set titulo = titulo where id = $1", [negocio]))).toBe(SOMENTE_LEITURA);

    expect(await erroDe(observador.query("delete from public.empresa_membros where id = $1", [gestor]))).toBeNull();
    const n = await um<{ arquivado: boolean; autor: string | null }>(observador, "select arquivado_em is not null as arquivado, arquivado_por as autor from public.negocios where id = $1", [negocio]);
    expect(n).toEqual({ arquivado: true, autor: null });
  });
});

describe("arquivamento × edição do negócio (duas sessões)", () => {
  it("arquivamento primeiro: a edição concorrente espera e é recusada", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(ARQUIVAR(negocio), {
      quem: "vendedor",
      sql: "update public.negocios set valor = 12345 where id = $1",
      params: [negocio],
    });
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBe(SOMENTE_LEITURA);
    const n = await um<{ arquivado: boolean; valor: string | null }>(observador, "select arquivado_em is not null as arquivado, valor from public.negocios where id = $1", [negocio]);
    expect(n.arquivado).toBe(true);
    expect(n.valor).not.toBe("12345.00");
  });

  it("edição primeiro: o arquivamento espera e arquiva a versão editada", async () => {
    const negocio = await novoNegocio();
    const r = await disputa(
      { quem: "vendedor", sql: "update public.negocios set valor = 12345 where id = $1", params: [negocio] },
      ARQUIVAR(negocio),
    );
    expect(r.esperou).toBe(true);
    expect(r.erroSegundo).toBeNull();
    const n = await um<{ arquivado: boolean; valor: string }>(observador, "select arquivado_em is not null as arquivado, valor::text from public.negocios where id = $1", [negocio]);
    expect(n).toMatchObject({ arquivado: true, valor: "12345.00" });
  });
});
