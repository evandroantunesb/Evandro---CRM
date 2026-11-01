/**
 * Privilégios das tabelas (20261102140000_privilegios_tabelas_e_iniciar_atuacao.sql): anon e authenticated sem
 * TRUNCATE, REFERENCES, TRIGGER e MAINTAIN em nenhuma tabela do projeto em public (TRUNCATE passa por cima do RLS e
 * dos triggers por linha); tabela criada por migration futura já nasce assim; service_role não trunca o histórico
 * imutável; o resto (SELECT/INSERT/UPDATE/DELETE com RLS) não muda. Precisa do Supabase local (roda no CI).
 */
import { describe, expect, it } from "vitest";
import { sufixo } from "./ajuda";
import { novoClienteBanco } from "./banco-local";

const PROIBIDOS = ["TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];
const HISTORICO = [
  "point_ledger",
  "eventos",
  "atividades",
  "logs_auditoria",
  "historico_etapas",
  "calculos_solares_historico",
  "propostas_emissoes",
];

async function comBanco<T>(fn: (db: ReturnType<typeof novoClienteBanco>) => Promise<T>): Promise<T> {
  const db = novoClienteBanco();
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

describe("privilégios das tabelas de public", () => {
  it("anon e authenticated sem TRUNCATE, REFERENCES, TRIGGER e MAINTAIN em nenhuma tabela do projeto", async () => {
    const { total, sobrando } = await comBanco(async (db) => {
      const { rows } = await db.query<{ tabela: string; papel: string; privilegio: string; tem: boolean }>(
        `select c.relname as tabela, r as papel, p as privilegio, has_table_privilege(r, c.oid, p) as tem
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         cross join unnest(array['anon', 'authenticated']) r
         cross join unnest($1::text[]) p
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')`,
        [PROIBIDOS],
      );
      return { total: new Set(rows.map((x) => x.tabela)).size, sobrando: rows.filter((x) => x.tem).map((x) => `${x.papel} ${x.privilegio} ${x.tabela}`) };
    });
    expect(total).toBeGreaterThan(80);
    expect(sobrando).toEqual([]);
  });

  it("o acesso do app continua: authenticated e service_role com SELECT/INSERT/UPDATE/DELETE onde já tinham", async () => {
    const faltando = await comBanco(async (db) => {
      const { rows } = await db.query<{ item: string; tem: boolean }>(`
        select papel || ' ' || priv || ' ' || tabela as item, has_table_privilege(papel, 'public.' || tabela, priv) as tem
        from (values
          ('authenticated', 'negocios', 'SELECT'), ('authenticated', 'negocios', 'INSERT'),
          ('authenticated', 'negocios', 'UPDATE'), ('authenticated', 'contatos', 'DELETE'),
          ('service_role', 'negocios', 'SELECT'), ('service_role', 'propostas', 'UPDATE'),
          ('service_role', 'empresas', 'TRUNCATE')
        ) v(papel, tabela, priv)`);
      return rows.filter((x) => !x.tem).map((x) => x.item);
    });
    expect(faltando).toEqual([]);
  });

  it("service_role não trunca o histórico imutável", async () => {
    const truncaveis = await comBanco(async (db) => {
      const { rows } = await db.query<{ tabela: string }>(
        `select t as tabela from unnest($1::text[]) t where has_table_privilege('service_role', 'public.' || t, 'TRUNCATE')`,
        [HISTORICO],
      );
      return rows.map((x) => x.tabela);
    });
    expect(truncaveis).toEqual([]);
  });

  it("tabela criada depois por uma migration já nasce sem esses privilégios para anon e authenticated", async () => {
    const nome = `teste_padrao_tabela_${sufixo.replace(/\W/g, "_")}`;
    const linhas = await comBanco(async (db) => {
      await db.query("begin");
      try {
        await db.query(`create table public.${nome} (id int)`);
        const { rows } = await db.query<{ papel: string; truncate: boolean; trigger: boolean; selecionar: boolean }>(
          `select r as papel, has_table_privilege(r, 'public.${nome}', 'TRUNCATE') as truncate,
                  has_table_privilege(r, 'public.${nome}', 'TRIGGER') as trigger,
                  has_table_privilege(r, 'public.${nome}', 'SELECT') as selecionar
           from unnest(array['anon', 'authenticated']) r order by r`,
        );
        return rows;
      } finally {
        await db.query("rollback");
      }
    });
    expect(linhas).toEqual([
      { papel: "anon", truncate: false, trigger: false, selecionar: true },
      { papel: "authenticated", truncate: false, trigger: false, selecionar: true },
    ]);
  });
});
