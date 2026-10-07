/**
 * Blindagem comercial no banco (PR 3b-1, 20261007100100_blindagem_comercial.sql). O papel
 * `operacao` nasce sem acesso ao domínio comercial, nem direto pelo Supabase: vê só a
 * própria empresa, a própria linha de membro e o próprio perfil. Cobre também: negócio,
 * tarefa e handoff só com responsável comercial; reatribuição de tarefa só por
 * admin/gestor; ranking com lista positiva. Os 4 papéis atuais seguem cobertos pelas
 * suítes existentes (rls, crm, gamificação, obras...).
 */
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";

let admin: Usuario;
let gestor: Usuario;
let vendedor: Usuario;
let vendedor2: Usuario;
let sdr: Usuario;
let operacao: Usuario;
let operacaoGestorEquipe: Usuario;
let empresa: string;
const membro: Record<string, string> = {};
let negocio: string;
let contato: string;
let tarefaDoVendedor: string;

const VENCE = new Date(Date.now() + 86_400_000).toISOString();

beforeAll(async () => {
  [admin, gestor, vendedor, vendedor2, sdr, operacao, operacaoGestorEquipe] = await Promise.all(
    ["bc-admin", "bc-gestor", "bc-vendedor", "bc-vendedor2", "bc-sdr", "bc-operacao", "bc-operacao-gestor"].map(criarUsuario),
  );
  const { data: emp } = await servico.from("empresas").insert({ nome: `Blindagem ${sufixo}` }).select("id").single();
  empresa = emp!.id;

  const { data: vinculos, error } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresa, user_id: admin.id, papel: "admin" },
      { empresa_id: empresa, user_id: gestor.id, papel: "gestor" },
      { empresa_id: empresa, user_id: vendedor.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: vendedor2.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresa, user_id: sdr.id, papel: "sdr", perfil_gamificacao: "sdr" },
      { empresa_id: empresa, user_id: operacao.id, papel: "operacao" },
      { empresa_id: empresa, user_id: operacaoGestorEquipe.id, papel: "operacao" },
    ])
    .select("id, user_id");
  if (error) throw error;
  for (const v of vinculos!) membro[v.user_id] = v.id;

  // Equipe: gestor e um `operacao` marcados como gestores do vendedor.
  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe blindagem" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[operacaoGestorEquipe.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
  ]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: "Cliente blindagem" }).select("id").single();
  contato = c!.id;
  const { data: n, error: erroNegocio } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo: "Negócio blindagem", contato_id: contato, funil_id: f!.id, etapa_id: et!.id, responsavel_id: membro[vendedor.id] })
    .select("id")
    .single();
  if (erroNegocio) throw erroNegocio;
  negocio = n!.id;

  await vendedor.cliente.from("notas").insert({ empresa_id: empresa, negocio_id: negocio, texto: "Nota" });
  const { data: t } = await vendedor.cliente
    .from("tarefas")
    .insert({ empresa_id: empresa, titulo: "Tarefa do vendedor", tipo: "outro", vence_em: VENCE, responsavel_id: membro[vendedor.id], negocio_id: negocio })
    .select("id")
    .single();
  tarefaDoVendedor = t!.id;
});

async function contar(usuario: Usuario, tabela: string, coluna = "empresa_id", valor = empresa) {
  const { data, error } = await usuario.cliente.from(tabela as never).select("*").eq(coluna, valor);
  expect(error).toBeNull();
  return (data as unknown[]).length;
}

describe("operacao: o que ele vê", () => {
  it("vê a própria empresa, a própria linha de membro e o próprio perfil", async () => {
    expect(await contar(operacao, "empresas", "id")).toBe(1);

    const { data: membros } = await operacao.cliente.from("empresa_membros").select("id").eq("empresa_id", empresa);
    expect(membros).toEqual([{ id: membro[operacao.id] }]);

    const { data: perfis } = await operacao.cliente.from("perfis").select("id");
    expect(perfis).toEqual([{ id: operacao.id }]);
  });

  it("não vê membros, perfis nem equipes de terceiros (comercial continua vendo)", async () => {
    expect(await contar(vendedor, "empresa_membros")).toBe(7);
    const { data: perfisVendedor } = await vendedor.cliente.from("perfis").select("id").in("id", [admin.id, operacao.id]);
    expect(perfisVendedor).toHaveLength(2);

    for (const tabela of ["equipes", "equipe_membros"]) {
      expect(await contar(operacao, tabela)).toBe(0);
      expect(await contar(vendedor, tabela)).toBeGreaterThan(0);
    }
  });

  it("não vê nenhum dado comercial", async () => {
    for (const tabela of ["negocios", "contatos", "tarefas", "notas", "contratos", "propostas", "kit_componentes", "calculos_solares", "handoffs", "anexos", "atividades", "metas", "point_ledger"]) {
      expect(await contar(operacao, tabela), tabela).toBe(0);
    }
    expect(await contar(vendedor, "negocios")).toBe(1);
  });

  it("não lê configuração comercial: funil, preços, proposta, contrato, formulários", async () => {
    for (const tabela of [
      "funis", "etapas", "origens", "etiquetas", "motivos_perda", "kits_solares", "parametros_calculadora",
      "modelos_contrato", "proposta_identidades", "proposta_modelos", "formularios",
    ]) {
      expect(await contar(operacao, tabela), tabela).toBe(0);
    }
    expect(await contar(vendedor, "funis")).toBeGreaterThan(0);
    expect(await contar(vendedor, "etapas")).toBeGreaterThan(0);
  });

  it("não lê catálogo nem imagens da gamificação", async () => {
    for (const tabela of ["conquistas", "niveis_gamificacao", "recompensas"]) {
      expect(await contar(operacao, tabela), tabela).toBe(0);
      const { count } = await servico.from(tabela as never).select("*", { count: "exact", head: true }).eq("empresa_id", empresa);
      expect(await contar(vendedor, tabela), tabela).toBe(count ?? 0);
    }

    const caminho = `${empresa}/${crypto.randomUUID()}/imagem.png`;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const { error: erroUpload } = await servico.storage.from("recompensas").upload(caminho, png, { contentType: "image/png" });
    expect(erroUpload).toBeNull();
    expect((await operacao.cliente.storage.from("recompensas").download(caminho)).error).not.toBeNull();
    expect((await vendedor.cliente.storage.from("recompensas").download(caminho)).error).toBeNull();
  });

  it("não lê anexo de negócio no storage", async () => {
    const caminho = `${empresa}/${negocio}/${crypto.randomUUID()}.txt`;
    const { error: erroUpload } = await servico.storage.from("anexos").upload(caminho, Buffer.from("anexo"), { contentType: "text/plain" });
    expect(erroUpload).toBeNull();
    expect((await operacao.cliente.storage.from("anexos").download(caminho)).error).not.toBeNull();
    expect((await vendedor.cliente.storage.from("anexos").download(caminho)).error).toBeNull();
  });
});

describe("operacao: o que ele não cria", () => {
  it("não cria contato, negócio, tarefa, nota nem handoff", async () => {
    expect((await operacao.cliente.from("contatos").insert({ empresa_id: empresa, nome: "X" })).error).not.toBeNull();

    const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
    const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).limit(1).single();
    expect(
      (await operacao.cliente.from("negocios").insert({ empresa_id: empresa, titulo: "X", contato_id: contato, funil_id: f!.id, etapa_id: et!.id })).error,
    ).not.toBeNull();

    expect(
      (await operacao.cliente.from("tarefas").insert({ empresa_id: empresa, titulo: "X", tipo: "outro", vence_em: VENCE, responsavel_id: membro[operacao.id] })).error,
    ).not.toBeNull();
    expect((await operacao.cliente.from("notas").insert({ empresa_id: empresa, negocio_id: negocio, texto: "X" })).error).not.toBeNull();
    expect(
      (
        await operacao.cliente.from("handoffs").insert({
          empresa_id: empresa,
          negocio_id: negocio,
          contato_id: contato,
          de_membro_id: membro[operacao.id],
          para_membro_id: membro[vendedor.id],
          status_qualificacao: "qualificado",
        })
      ).error,
    ).not.toBeNull();
  });

  it("marcado como gestor de equipe, continua sem ver o comercial da equipe", async () => {
    for (const tabela of ["negocios", "tarefas", "metas", "point_ledger", "comissoes_calculadas"]) {
      expect(await contar(operacaoGestorEquipe, tabela), tabela).toBe(0);
    }
  });
});

describe("responsável comercial", () => {
  it("negócio não pode ter responsável operacao", async () => {
    const { error } = await admin.cliente.from("negocios").update({ responsavel_id: membro[operacao.id] }).eq("id", negocio);
    expect(error?.message).toContain("papel comercial");
  });

  it("tarefa não pode ter responsável operacao", async () => {
    const { error } = await admin.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, titulo: "Para operação", tipo: "outro", vence_em: VENCE, responsavel_id: membro[operacao.id] });
    expect(error?.message).toContain("papel comercial");
  });

  it("handoff não pode ter destinatário operacao", async () => {
    const { error } = await vendedor.cliente.from("handoffs").insert({
      empresa_id: empresa,
      negocio_id: negocio,
      contato_id: contato,
      de_membro_id: membro[vendedor.id],
      para_membro_id: membro[operacao.id],
      status_qualificacao: "qualificado",
    });
    expect(error).not.toBeNull();
  });
});

describe("reatribuição de tarefa", () => {
  async function tarefaDeTerceiroNoNegocio() {
    // Admin cria, no negócio do vendedor, uma tarefa para o SDR (terceiro).
    const { data, error } = await admin.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, titulo: "Tarefa do SDR", tipo: "outro", vence_em: VENCE, responsavel_id: membro[sdr.id], negocio_id: negocio })
      .select("id")
      .single();
    if (error) throw error;
    return data!.id;
  }

  it("vendedor conclui tarefa de terceiro no próprio negócio", async () => {
    const id = await tarefaDeTerceiroNoNegocio();
    const { data, error } = await vendedor.cliente.from("tarefas").update({ concluida_em: new Date().toISOString() }).eq("id", id).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("vendedor não reatribui para terceiro, mas pode assumir para si", async () => {
    const id = await tarefaDeTerceiroNoNegocio();
    const terceiro = await vendedor.cliente.from("tarefas").update({ responsavel_id: membro[vendedor2.id] }).eq("id", id);
    expect(terceiro.error?.message).toContain("Só admin ou gestor");

    const assumir = await vendedor.cliente.from("tarefas").update({ responsavel_id: membro[vendedor.id] }).eq("id", id).select("id");
    expect(assumir.error).toBeNull();
    expect(assumir.data).toHaveLength(1);
  });

  it("gestor e admin reatribuem", async () => {
    const pelaGestao = await gestor.cliente.from("tarefas").update({ responsavel_id: membro[gestor.id] }).eq("id", tarefaDoVendedor).select("id");
    expect(pelaGestao.error).toBeNull();
    expect(pelaGestao.data).toHaveLength(1);

    const peloAdmin = await admin.cliente.from("tarefas").update({ responsavel_id: membro[vendedor.id] }).eq("id", tarefaDoVendedor).select("id");
    expect(peloAdmin.error).toBeNull();
    expect(peloAdmin.data).toHaveLength(1);
  });

  it("SDR não cria tarefa para terceiro", async () => {
    const { error } = await sdr.cliente
      .from("tarefas")
      .insert({ empresa_id: empresa, titulo: "Para outro", tipo: "outro", vence_em: VENCE, responsavel_id: membro[vendedor.id] });
    expect(error).not.toBeNull();
  });
});

// Definição de função conferida direto no banco local (nunca remoto/produção).
const URL_BANCO = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
function urlBancoLocal() {
  const host = new URL(URL_BANCO).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Teste direto no banco recusado: host "${host}" não é local.`);
  return URL_BANCO;
}

describe("ranking da gamificação", () => {
  it("usa lista positiva de quem compete e só responde a quem tem acesso comercial", async () => {
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      const { rows } = await banco.query(
        "select pg_get_functiondef('public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz, timestamptz)'::regprocedure) as def",
      );
      const def = rows[0].def as string;
      expect(def).toContain("m.papel in ('vendedor', 'sdr')");
      expect(def).not.toMatch(/not in \('admin', 'gestor'\)/);
      expect(def).toContain("tem_acesso_comercial(p_empresa_id)");
    } finally {
      await banco.end();
    }

    const { data } = await operacao.cliente.rpc("ranking_gamificacao", { p_empresa_id: empresa, p_perfil: "closer" });
    expect(data ?? []).toEqual([]);
  });
});
