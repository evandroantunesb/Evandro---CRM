/**
 * Blindagem comercial no banco (PR 3b-1, 20261007100100_blindagem_comercial.sql). O papel
 * `operacao` nasce sem acesso ao domínio comercial, nem direto pelo Supabase: vê só a
 * própria empresa, a própria linha de membro e o próprio perfil. Cobre também: negócio,
 * tarefa e handoff só com responsável comercial da mesma empresa; handoff com negócio,
 * contato e membros da mesma empresa; reatribuição de tarefa só por admin/gestor; ranking
 * com lista positiva; funções internas fechadas a clientes; perfis e avatares de colegas só
 * para papel comercial (`compartilha_empresa_comercial`), com `compartilha_empresa` genérica. Os 4 papéis atuais seguem
 * cobertos pelas suítes existentes (rls, crm, gamificação, obras...).
 */
import { randomUUID } from "node:crypto";
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
let vendedorB: Usuario;
let duplo: Usuario;
let empresa: string;
let empresaB: string;
const membro: Record<string, string> = {};
let membroVendedorB: string;
let duploEmA: string;
let duploEmB: string;
let negocio: string;
let contato: string;
let negocioB: string;
let contatoB: string;
let funilA: string;
let etapaA: string;
let tarefaDoVendedor: string;

const VENCE = new Date(Date.now() + 86_400_000).toISOString();

beforeAll(async () => {
  [admin, gestor, vendedor, vendedor2, sdr, operacao, operacaoGestorEquipe, vendedorB, duplo] = await Promise.all(
    ["bc-admin", "bc-gestor", "bc-vendedor", "bc-vendedor2", "bc-sdr", "bc-operacao", "bc-operacao-gestor", "bc-vendedor-b", "bc-duplo"].map(
      criarUsuario,
    ),
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

  // Empresa B: um vendedor só dela e um usuário (`duplo`) vendedor nas duas.
  const { data: empB } = await servico.from("empresas").insert({ nome: `Blindagem B ${sufixo}` }).select("id").single();
  empresaB = empB!.id;
  const { data: vB } = await servico
    .from("empresa_membros")
    .insert([
      { empresa_id: empresaB, user_id: vendedorB.id, papel: "vendedor", perfil_gamificacao: "closer" },
      { empresa_id: empresaB, user_id: duplo.id, papel: "vendedor", perfil_gamificacao: "closer" },
    ])
    .select("id, user_id");
  membroVendedorB = vB!.find((v) => v.user_id === vendedorB.id)!.id;
  duploEmB = vB!.find((v) => v.user_id === duplo.id)!.id;
  const { data: dA } = await servico
    .from("empresa_membros")
    .insert({ empresa_id: empresa, user_id: duplo.id, papel: "vendedor", perfil_gamificacao: "closer" })
    .select("id")
    .single();
  duploEmA = dA!.id;
  const { data: fB } = await servico.from("funis").select("id").eq("empresa_id", empresaB).single();
  const { data: etB } = await servico.from("etapas").select("id").eq("funil_id", fB!.id).order("ordem").limit(1).single();
  const { data: cB } = await servico.from("contatos").insert({ empresa_id: empresaB, nome: "Cliente B" }).select("id").single();
  contatoB = cB!.id;
  const { data: nB, error: erroNegocioB } = await servico
    .from("negocios")
    .insert({ empresa_id: empresaB, titulo: "Negócio B", contato_id: contatoB, funil_id: fB!.id, etapa_id: etB!.id, responsavel_id: duploEmB })
    .select("id")
    .single();
  if (erroNegocioB) throw erroNegocioB;
  negocioB = nB!.id;

  // Equipe: gestor e um `operacao` marcados como gestores do vendedor.
  const { data: equipe } = await servico.from("equipes").insert({ empresa_id: empresa, nome: "Equipe blindagem" }).select("id").single();
  await servico.from("equipe_membros").insert([
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[gestor.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[operacaoGestorEquipe.id], e_gestor: true },
    { empresa_id: empresa, equipe_id: equipe!.id, membro_id: membro[vendedor.id], e_gestor: false },
  ]);

  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  const { data: et } = await servico.from("etapas").select("id").eq("funil_id", f!.id).order("ordem").limit(1).single();
  funilA = f!.id;
  etapaA = et!.id;
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
    expect(await contar(vendedor, "empresa_membros")).toBe(8);
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

describe("handoff: integridade multiempresa", () => {
  /** Negócio novo na empresa A, do vendedor, com contato próprio. */
  async function negocioDoVendedor(titulo: string) {
    const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
    const { data, error } = await servico
      .from("negocios")
      .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funilA, etapa_id: etapaA, responsavel_id: membro[vendedor.id] })
      .select("id")
      .single();
    if (error) throw error;
    return { negocioId: data!.id, contatoId: c!.id };
  }

  type DadosHandoff = { empresa_id: string; negocio_id: string; contato_id: string; de_membro_id: string; para_membro_id: string };
  function handoff(cliente: Usuario["cliente"], dados: DadosHandoff) {
    return cliente.from("handoffs").insert({ ...dados, status_qualificacao: "qualificado" }).select("id");
  }

  it("handoff normal continua funcionando", async () => {
    const { negocioId, contatoId } = await negocioDoVendedor("Handoff normal");
    const { data, error } = await handoff(vendedor.cliente, {
      empresa_id: empresa,
      negocio_id: negocioId,
      contato_id: contatoId,
      de_membro_id: membro[vendedor.id],
      para_membro_id: membro[vendedor2.id],
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("destinatário comercial de outra empresa é recusado", async () => {
    const { negocioId, contatoId } = await negocioDoVendedor("Destinatário B");
    const { error } = await handoff(vendedor.cliente, {
      empresa_id: empresa,
      negocio_id: negocioId,
      contato_id: contatoId,
      de_membro_id: membro[vendedor.id],
      para_membro_id: membroVendedorB,
    });
    expect(error?.message).toContain("destinatário");
  });

  it("remetente de outra empresa é recusado", async () => {
    const { negocioId, contatoId } = await negocioDoVendedor("Remetente B");
    const { error } = await handoff(vendedor.cliente, {
      empresa_id: empresa,
      negocio_id: negocioId,
      contato_id: contatoId,
      de_membro_id: membroVendedorB,
      para_membro_id: membro[vendedor2.id],
    });
    expect(error?.message).toContain("remetente");
  });

  it("negócio da empresa B com empresa_id da A é recusado, mesmo para quem é membro das duas", async () => {
    const { error } = await handoff(duplo.cliente, {
      empresa_id: empresa,
      negocio_id: negocioB,
      contato_id: contatoB,
      de_membro_id: duploEmA,
      para_membro_id: membro[vendedor.id],
    });
    expect(error).not.toBeNull();
    const { count } = await servico.from("handoffs").select("id", { count: "exact", head: true }).eq("negocio_id", negocioB);
    expect(count).toBe(0);
  });

  it("contato de outro negócio ou de outra empresa é recusado", async () => {
    const { negocioId } = await negocioDoVendedor("Contato errado");
    const { contatoId: outroContato } = await negocioDoVendedor("Outro contato");
    for (const contatoErrado of [outroContato, contatoB]) {
      const { error } = await handoff(vendedor.cliente, {
        empresa_id: empresa,
        negocio_id: negocioId,
        contato_id: contatoErrado,
        de_membro_id: membro[vendedor.id],
        para_membro_id: membro[vendedor2.id],
      });
      expect(error).not.toBeNull();
    }
    const { count } = await servico.from("handoffs").select("id", { count: "exact", head: true }).eq("negocio_id", negocioId);
    expect(count).toBe(0);
  });

  /** Handoff legítimo na empresa B: vendedorB → duplo (membro das duas empresas). */
  async function handoffEmB(titulo: string) {
    const { data: cB } = await servico.from("contatos").insert({ empresa_id: empresaB, nome: `Cliente ${titulo}` }).select("id").single();
    const { data: fB } = await servico.from("funis").select("id").eq("empresa_id", empresaB).single();
    const { data: etB } = await servico.from("etapas").select("id").eq("funil_id", fB!.id).order("ordem").limit(1).single();
    const { data: nB, error: erroN } = await servico
      .from("negocios")
      .insert({ empresa_id: empresaB, titulo, contato_id: cB!.id, funil_id: fB!.id, etapa_id: etB!.id, responsavel_id: membroVendedorB })
      .select("id")
      .single();
    if (erroN) throw erroN;
    const { data: hB, error: erroH } = await vendedorB.cliente
      .from("handoffs")
      .insert({ empresa_id: empresaB, negocio_id: nB!.id, contato_id: cB!.id, de_membro_id: membroVendedorB, para_membro_id: duploEmB, status_qualificacao: "qualificado" })
      .select("id")
      .single();
    if (erroH) throw erroH;
    return hB!.id;
  }

  it("feedback de handoff de outra empresa é recusado", async () => {
    const handoffB = await handoffEmB("Negócio feedback B");

    // Combinações cruzadas com a empresa A: recusadas.
    for (const autor_id of [duploEmA, duploEmB]) {
      const { error } = await duplo.cliente.from("handoffs_feedback").insert({ empresa_id: empresa, handoff_id: handoffB, autor_id, feedback: "Cruzado" });
      expect(error, autor_id).not.toBeNull();
    }
    // Controle: na própria empresa do handoff, o destinatário registra o feedback.
    const { error: erroOk } = await duplo.cliente
      .from("handoffs_feedback")
      .insert({ empresa_id: empresaB, handoff_id: handoffB, autor_id: duploEmB, feedback: "Legítimo" });
    expect(erroOk).toBeNull();
  });

  it("feedback: o autor edita só o texto; identidade não muda", async () => {
    const handoffB = await handoffEmB("Negócio edição feedback B");
    const outroHandoffB = await handoffEmB("Negócio outro handoff B");
    const { data: fb, error: erroFb } = await duplo.cliente
      .from("handoffs_feedback")
      .insert({ empresa_id: empresaB, handoff_id: handoffB, autor_id: duploEmB, feedback: "Original" })
      .select("id, empresa_id, handoff_id, autor_id, created_at")
      .single();
    if (erroFb) throw erroFb;

    // 1. editar só o texto: passa
    const texto = await duplo.cliente.from("handoffs_feedback").update({ feedback: "Editado" }).eq("id", fb!.id).select("feedback");
    expect(texto.error).toBeNull();
    expect(texto.data).toEqual([{ feedback: "Editado" }]);

    // 2. trocar empresa_id + autor_id para o vínculo da empresa A: falha
    const cruzado = await duplo.cliente.from("handoffs_feedback").update({ empresa_id: empresa, autor_id: duploEmA }).eq("id", fb!.id).select("id");
    expect(cruzado.error).not.toBeNull();

    // 3. trocar handoff_id: falha
    const outroHandoff = await duplo.cliente.from("handoffs_feedback").update({ handoff_id: outroHandoffB }).eq("id", fb!.id).select("id");
    expect(outroHandoff.error).not.toBeNull();

    // 4. vínculo original intacto
    const { data: atual } = await servico.from("handoffs_feedback").select("id, empresa_id, handoff_id, autor_id, created_at, feedback").eq("id", fb!.id).single();
    expect(atual).toEqual({ ...fb, feedback: "Editado" });
  });

  it("destinatário operacao continua recusado", async () => {
    const { negocioId, contatoId } = await negocioDoVendedor("Destinatário operação");
    const { error } = await handoff(vendedor.cliente, {
      empresa_id: empresa,
      negocio_id: negocioId,
      contato_id: contatoId,
      de_membro_id: membro[vendedor.id],
      para_membro_id: membro[operacao.id],
    });
    expect(error?.message).toContain("destinatário");
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

describe("perfis e avatares: compartilha_empresa_comercial", () => {
  let caminhoColega: string;
  let caminhoOperacao: string;

  beforeAll(async () => {
    // Cada um envia o próprio avatar (policy de envio: só na própria pasta).
    caminhoColega = `${vendedor2.id}/${randomUUID()}.png`;
    caminhoOperacao = `${operacao.id}/${randomUUID()}.png`;
    const png = () => new Blob([new Uint8Array(64)], { type: "image/png" });
    for (const [quem, caminho] of [
      [vendedor2, caminhoColega],
      [operacao, caminhoOperacao],
    ] as const) {
      const { error } = await quem.cliente.storage
        .from("avatares")
        .upload(caminho, png(), { contentType: "image/png" });
      expect(error).toBeNull();
    }
  });

  it("os 4 papéis comerciais continuam vendo perfil e avatar dos colegas", async () => {
    for (const quem of [admin, gestor, vendedor, sdr]) {
      const { data: perfis } = await quem.cliente
        .from("perfis")
        .select("id")
        .in("id", [vendedor2.id, operacao.id]);
      expect(perfis, "perfis").toHaveLength(2);
      const { data } = await quem.cliente.storage
        .from("avatares")
        .createSignedUrls([caminhoColega, caminhoOperacao], 60);
      for (const item of data ?? [])
        expect(item.signedUrl ?? "", item.path ?? "").toContain("token=");
      expect(data).toHaveLength(2);
    }
  });

  // 3b-2: operacao vê avatar de colega ativo da mesma empresa (identidade
  // básica), mas continua sem perfis alheios e sem acesso comercial.
  it("operacao vê só o próprio perfil, mas vê o avatar de colega ativo (3b-2)", async () => {
    const { data: perfis } = await operacao.cliente
      .from("perfis")
      .select("id")
      .in("id", [vendedor2.id, admin.id, operacao.id]);
    expect(perfis).toEqual([{ id: operacao.id }]);

    const proprio = await operacao.cliente.storage
      .from("avatares")
      .createSignedUrls([caminhoOperacao], 60);
    expect(proprio.data?.[0]?.signedUrl ?? "").toContain("token=");

    const alheio = await operacao.cliente.storage
      .from("avatares")
      .createSignedUrls([caminhoColega], 60);
    expect(alheio.data?.[0]?.signedUrl ?? "").not.toBe("");
    expect(
      (await operacao.cliente.storage.from("avatares").download(caminhoColega)).error,
    ).toBeNull();
  });

  it("operacao lista o avatar de colega ativo, sem virar comercial (3b-2)", async () => {
    const pasta = await operacao.cliente.storage.from("avatares").list(vendedor2.id);
    expect(pasta.error).toBeNull();
    expect((pasta.data ?? []).map((i) => `${vendedor2.id}/${i.name}`)).toContain(caminhoColega);
    const raiz = await operacao.cliente.storage.from("avatares").list();
    expect((raiz.data ?? []).map((i) => i.name)).toContain(vendedor2.id);

    const { data: podeVer } = await operacao.cliente.rpc("pode_ver_avatar", {
      p_pasta: vendedor2.id,
    });
    expect(podeVer).toBe(true);
    const { data: comercial } = await operacao.cliente.rpc("compartilha_empresa_comercial", {
      p_user_id: vendedor2.id,
    });
    expect(comercial).toBe(false);
    const { data: vendedorVe } = await vendedor.cliente.rpc("pode_ver_avatar", {
      p_pasta: vendedor2.id,
    });
    expect(vendedorVe).toBe(true);
  });

  it("compartilha_empresa mantém a semântica genérica (sem exigir papel comercial)", async () => {
    const { data: mesmaEmpresa } = await operacao.cliente.rpc("compartilha_empresa", {
      p_user_id: vendedor2.id,
    });
    expect(mesmaEmpresa).toBe(true);
    const { data: outraEmpresa } = await operacao.cliente.rpc("compartilha_empresa", {
      p_user_id: vendedorB.id,
    });
    expect(outraEmpresa).toBe(false);

    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      const { rows } = await banco.query(
        "select pg_get_functiondef('public.compartilha_empresa(uuid)'::regprocedure) as def",
      );
      expect(rows[0].def).not.toContain("papel");
    } finally {
      await banco.end();
    }
  });
});

describe("funções novas: privilégios", () => {
  /** Quem tem EXECUTE na função (PUBLIC = grantee 0). proacl nulo significaria o padrão (PUBLIC executa). */
  async function quemExecuta(assinatura: string) {
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      const { rows: acl } = await banco.query("select proacl is null as padrao from pg_proc where oid = $1::regprocedure", [assinatura]);
      expect(acl[0].padrao, `${assinatura} com privilégio padrão (PUBLIC executa)`).toBe(false);
      const { rows } = await banco.query(
        "select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel " +
          "from pg_proc p cross join lateral aclexplode(p.proacl) a " +
          "where p.oid = $1::regprocedure and a.privilege_type = 'EXECUTE'",
        [assinatura],
      );
      return rows.map((r) => r.papel as string);
    } finally {
      await banco.end();
    }
  }

  it("e_membro_comercial é interna: nenhum cliente executa", async () => {
    const papeis = await quemExecuta("public.e_membro_comercial(uuid, uuid)");
    for (const papel of ["PUBLIC", "anon", "authenticated", "service_role"]) expect(papeis).not.toContain(papel);

    const { error } = await vendedor.cliente.rpc("e_membro_comercial" as never, { p_empresa_id: empresaB, p_membro_id: membroVendedorB } as never);
    expect(error).not.toBeNull();
  });

  it("tem_acesso_comercial: só authenticated executa (usada nas policies)", async () => {
    const papeis = await quemExecuta("public.tem_acesso_comercial(uuid)");
    expect(papeis).toContain("authenticated");
    for (const papel of ["PUBLIC", "anon", "service_role"]) expect(papeis).not.toContain(papel);
  });

  it("closer de handoff pendente exige handoff, negócio e destinatário na mesma empresa (inclusive dado legado)", async () => {
    const banco = new Client({ connectionString: urlBancoLocal() });
    await banco.connect();
    try {
      const { rows } = await banco.query("select pg_get_functiondef('public.e_closer_de_handoff_pendente(uuid)'::regprocedure) as def");
      expect(rows[0].def).toContain("join public.negocios n on n.id = h.negocio_id and n.empresa_id = h.empresa_id");
      expect(rows[0].def).toContain("join public.empresa_membros m on m.id = h.para_membro_id and m.empresa_id = h.empresa_id");
    } finally {
      await banco.end();
    }
  });

  it("compartilha_empresa_comercial: só authenticated executa (usada em perfis e avatares)", async () => {
    const papeis = await quemExecuta("public.compartilha_empresa_comercial(uuid)");
    expect(papeis).toContain("authenticated");
    for (const papel of ["PUBLIC", "anon", "service_role"]) expect(papeis).not.toContain(papel);
  });

  it("funções de gatilho novas não são executáveis por clientes", async () => {
    for (const fn of [
      "exigir_responsavel_comercial()",
      "restringir_reatribuicao_tarefa()",
      "validar_handoff_empresa()",
      "proteger_identidade_handoff_feedback()",
    ]) {
      const papeis = await quemExecuta(`public.${fn}`);
      for (const papel of ["PUBLIC", "anon", "authenticated", "service_role"]) expect(papeis, fn).not.toContain(papel);
    }
  });
});
