-- Segurança (revisão de 01/11): nenhuma função do projeto no schema public é executável sem login.
--
-- 1. `decidir_atribuicao_lead` só confere admin/gestor quando `p_automatico` é falso, e o parâmetro vem de quem chama.
--    Como estava exposta na API (anon e authenticated), quem tivesse o id de uma atribuição pendente trocava o
--    responsável do negócio, mesmo antes do vencimento, e a atribuição ficava "expirada" sem autor. Ela passa a ser só
--    interna: `aprovar_atribuicao_lead` (admin/gestor, sempre com p_automatico = false) e `expirar_atribuicoes_leads`
--    (pg_cron) a chamam como dono. `expirar_atribuicoes_leads` também sai da API: só o pg_cron a usa.
-- 2. O app público (proposta, contrato, captura) lê e grava pelo service role; nada sem login chama função do banco.
--    Revoga o EXECUTE de PUBLIC e de anon em todas as funções do projeto em public (as de extensão ficam como estão)
--    e nas que as migrations criarem daqui em diante. authenticated e service_role continuam exatamente com o que
--    tinham: em todas as funções eles têm grant explícito, nunca só via PUBLIC.
--
-- Trigger não depende de EXECUTE ao disparar, e política de RLS roda com o papel de quem consulta (authenticated):
-- nenhum dos dois muda.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Atribuição de leads: decisão só pelos caminhos que conferem quem decide
-- ---------------------------------------------------------------------------

revoke execute on function public.decidir_atribuicao_lead(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.expirar_atribuicoes_leads() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sem login, nenhuma função do projeto
-- ---------------------------------------------------------------------------

do $$
declare
  v_funcao regprocedure;
begin
  for v_funcao in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- Funções de extensão (citext) são da extensão: não mexe.
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', v_funcao);
  end loop;
end;
$$;

-- Funções criadas pelas próximas migrations (dono postgres) já nascem sem EXECUTE para PUBLIC e anon. O padrão de
-- PUBLIC é global no Postgres (por schema só dá para acrescentar); o de anon vem do padrão do Supabase para public.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

reset lock_timeout;
