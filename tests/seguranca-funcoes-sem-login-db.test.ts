/**
 * Segurança das funções do banco (20261102120000_seguranca_funcoes_sem_login.sql): sem login, nenhuma função do
 * projeto executa; `decidir_atribuicao_lead` (que pula a checagem de admin/gestor com p_automatico) e
 * `expirar_atribuicoes_leads` saíram da API; admin e gestor continuam decidindo por `aprovar_atribuicao_lead`;
 * authenticated e service_role mantêm o que tinham; funções novas já nascem sem EXECUTE para anon.
 * Precisa do Supabase local (roda no CI).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { beforeAll, describe, expect, it } from "vitest";
import { criarUsuario, servico, sufixo, type Usuario } from "./ajuda";
import { novoClienteBanco } from "./banco-local";

const semLogin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});

let admin: Usuario;
let vendedor: Usuario;
let empresa: string;
let membroAdmin: string;
let membroVendedor: string;
let funil: string;
let etapa: string;

beforeAll(async () => {
  admin = await criarUsuario("sf-admin");
  vendedor = await criarUsuario("sf-vendedor");
  const { data: emp, error } = await servico.from("empresas").insert({ nome: `Segurança funções ${sufixo}` }).select("id").single();
  if (error) throw error;
  empresa = emp!.id;
  const { data: ma } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: admin.id, papel: "admin" }).select("id").single();
  membroAdmin = ma!.id;
  const { data: mv } = await servico.from("empresa_membros").insert({ empresa_id: empresa, user_id: vendedor.id, papel: "vendedor" }).select("id").single();
  membroVendedor = mv!.id;
  const { data: f } = await servico.from("funis").select("id").eq("empresa_id", empresa).single();
  funil = f!.id;
  const { data: etapas } = await servico.from("etapas").select("id").eq("funil_id", funil).order("ordem");
  etapa = etapas![0].id;
});

/** Negócio do vendedor com uma atribuição pendente que ainda não venceu. */
async function atribuicaoPendente(titulo: string) {
  const { data: c } = await servico.from("contatos").insert({ empresa_id: empresa, nome: `Cliente ${titulo}` }).select("id").single();
  const { data: n, error } = await servico
    .from("negocios")
    .insert({ empresa_id: empresa, titulo, contato_id: c!.id, funil_id: funil, etapa_id: etapa, responsavel_id: membroVendedor })
    .select("id")
    .single();
  if (error) throw error;
  const { data: a, error: erroAtrib } = await servico
    .from("atribuicoes_leads")
    .insert({ empresa_id: empresa, negocio_id: n!.id, membro_sugerido_id: membroVendedor, expira_em: new Date(Date.now() + 86_400_000).toISOString() })
    .select("id")
    .single();
  if (erroAtrib) throw erroAtrib;
  return { negocio: n!.id, atribuicao: a!.id };
}

async function situacao(negocio: string, atribuicao: string) {
  const [{ data: n }, { data: a }] = await Promise.all([
    servico.from("negocios").select("responsavel_id").eq("id", negocio).single(),
    servico.from("atribuicoes_leads").select("status, decidido_por").eq("id", atribuicao).single(),
  ]);
  return { responsavel: n!.responsavel_id, status: a!.status, decididoPor: a!.decidido_por };
}

describe("funções do banco sem login", () => {
  it("nenhuma função do projeto em public é executável por anon, nem concedida a PUBLIC", async () => {
    const db = novoClienteBanco();
    await db.connect();
    try {
      const { rows } = await db.query<{ funcao: string; anon: boolean; publico: boolean }>(`
        select p.oid::regprocedure::text as funcao,
               has_function_privilege('anon', p.oid, 'execute') as anon,
               exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as publico
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`);
      expect(rows.length).toBeGreaterThan(100);
      expect(rows.filter((r) => r.anon || r.publico).map((r) => r.funcao)).toEqual([]);
    } finally {
      await db.end();
    }
  });

  it("authenticated e service_role mantêm o EXECUTE das funções que o app usa", async () => {
    const db = novoClienteBanco();
    await db.connect();
    try {
      const { rows } = await db.query<{ papel: string; funcao: string; pode: boolean }>(`
        select papel, funcao, has_function_privilege(papel, funcao, 'execute') as pode
        from (values
          ('authenticated', 'public.tem_papel(uuid, papel_membro[])'),
          ('authenticated', 'public.aprovar_atribuicao_lead(uuid, uuid)'),
          ('authenticated', 'public.iniciar_atuacao_engenharia(uuid)'),
          ('service_role', 'public.incrementar_visualizacao_formulario(uuid)'),
          ('service_role', 'public.incrementar_preenchimento_formulario(uuid)')
        ) v(papel, funcao)`);
      expect(rows.filter((r) => !r.pode)).toEqual([]);
    } finally {
      await db.end();
    }
  });

  it("função criada depois por uma migration já nasce sem EXECUTE para anon (e com ele para authenticated)", async () => {
    const db = novoClienteBanco();
    await db.connect();
    try {
      await db.query("begin");
      await db.query(`create function public.teste_padrao_execucao_${sufixo.replace(/\W/g, "_")}() returns int language sql as 'select 1'`);
      const { rows } = await db.query<{ anon: boolean; autenticado: boolean }>(`
        select has_function_privilege('anon', p.oid, 'execute') as anon,
               has_function_privilege('authenticated', p.oid, 'execute') as autenticado
        from pg_proc p where p.proname = 'teste_padrao_execucao_${sufixo.replace(/\W/g, "_")}'`);
      expect(rows).toEqual([{ anon: false, autenticado: true }]);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});

describe("atribuição de leads: decisão só por quem pode", () => {
  it("sem login, decidir_atribuicao_lead (mesmo 'automática') e expirar_atribuicoes_leads são recusadas e nada muda", async () => {
    const { negocio, atribuicao } = await atribuicaoPendente(`SF anon ${sufixo}`);
    const decidir = await semLogin.rpc("decidir_atribuicao_lead", { p_id: atribuicao, p_membro_final_id: membroAdmin, p_automatico: true });
    expect(decidir.error?.code).toBe("42501");
    const expirar = await semLogin.rpc("expirar_atribuicoes_leads");
    expect(expirar.error?.code).toBe("42501");
    expect(await situacao(negocio, atribuicao)).toEqual({ responsavel: membroVendedor, status: "pendente", decididoPor: null });
  });

  it("logado, nem admin chama decidir_atribuicao_lead direto: só pelo caminho que confere o papel", async () => {
    const { negocio, atribuicao } = await atribuicaoPendente(`SF logado ${sufixo}`);
    for (const u of [vendedor, admin]) {
      const r = await u.cliente.rpc("decidir_atribuicao_lead", { p_id: atribuicao, p_membro_final_id: membroAdmin, p_automatico: true });
      expect(r.error?.code).toBe("42501");
      const e = await u.cliente.rpc("expirar_atribuicoes_leads");
      expect(e.error?.code).toBe("42501");
    }
    expect(await situacao(negocio, atribuicao)).toEqual({ responsavel: membroVendedor, status: "pendente", decididoPor: null });
  });

  it("vendedor não aprova; admin aprova por aprovar_atribuicao_lead, com autor registrado", async () => {
    const { negocio, atribuicao } = await atribuicaoPendente(`SF aprovar ${sufixo}`);
    const pelo = await vendedor.cliente.rpc("aprovar_atribuicao_lead", { p_id: atribuicao, p_membro_final_id: membroVendedor });
    expect(pelo.error?.message).toContain("Sem permissão");
    expect((await situacao(negocio, atribuicao)).status).toBe("pendente");

    const { error } = await admin.cliente.rpc("aprovar_atribuicao_lead", { p_id: atribuicao, p_membro_final_id: membroAdmin });
    expect(error).toBeNull();
    expect(await situacao(negocio, atribuicao)).toEqual({ responsavel: membroAdmin, status: "reatribuida", decididoPor: membroAdmin });
  });
});
