-- Emissão FECHADA (P1a-1). Incluído logo depois de aplicar a migration, dentro da transação do teste, rodando como o
-- dono (postgres). F1 confere que NENHUM papel da aplicação executa emitir_proposta_versao e reconstruir_proposta_legada.
-- F2 concede EXECUTE a authenticated SÓ dentro desta transação, que termina em ROLLBACK (a própria migration é revertida),
-- para que os testes das regras internas continuem rodando com o papel e as claims reais da aplicação.

\echo '=== F1. emissão e reconstrução fechadas para todos os papéis da aplicação'
select pg_temp.confere(count(*) = 2 and bool_and(p.pronamespace = 'public'::regnamespace)
         and bool_and(p.oid::regprocedure::text in ('emitir_proposta_versao(uuid,text,uuid,jsonb)', 'reconstruir_proposta_legada(uuid)')),
       'F1a. uma assinatura de cada, só no schema public (sem sobrecarga em nenhum schema)')
  from pg_proc p where p.proname in ('emitir_proposta_versao', 'reconstruir_proposta_legada');

select pg_temp.confere(bool_and(p.proacl is not null
         and not exists (select 1 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner)),
       'F1b. ACL explícita: EXECUTE só do dono, nem PUBLIC')
  from pg_proc p where p.oid in ('public.emitir_proposta_versao(uuid,text,uuid,jsonb)'::regprocedure, 'public.reconstruir_proposta_legada(uuid)'::regprocedure);

select pg_temp.confere(count(*) = 10 and bool_and(not has_function_privilege(r, p.oid, 'execute')),
       'F1c. EXECUTE efetivo negado a public, anon, authenticated, service_role e authenticator')
  from pg_proc p cross join unnest(array['public', 'anon', 'authenticated', 'service_role', 'authenticator']) r
 where p.oid in ('public.emitir_proposta_versao(uuid,text,uuid,jsonb)'::regprocedure, 'public.reconstruir_proposta_legada(uuid)'::regprocedure)
   and (r = 'public' or exists (select 1 from pg_roles where rolname = r));

-- Qualquer outro papel sem superusuário que execute é listado e reprova (só o dono e quem herda dele podem).
select pg_temp.confere(count(*) = 0, 'F1d. nenhum outro papel não-superusuário executa (fora o dono e seus herdeiros)')
  from pg_proc p cross join pg_roles r
 where p.oid in ('public.emitir_proposta_versao(uuid,text,uuid,jsonb)'::regprocedure, 'public.reconstruir_proposta_legada(uuid)'::regprocedure)
   and not r.rolsuper and not pg_has_role(r.oid, p.proowner, 'USAGE') and has_function_privilege(r.oid, p.oid, 'execute');

-- Tentativas reais com os papéis do PostgREST: anon, service_role e authenticated com as claims de um membro ativo de
-- cada perfil existente (admin, gestor, vendedor, sdr, operacao), num negócio da própria empresa.
create temp table f_membros on commit drop as
select distinct on (m.papel) m.papel::text as papel, m.user_id, n.id as negocio
  from public.empresa_membros m join public.negocios n on n.empresa_id = m.empresa_id
 where m.status = 'ativo' order by m.papel, m.user_id, n.id;
grant select on f_membros to anon, authenticated, service_role;
select pg_temp.confere(count(*) >= 3, 'F1e. cenário: ao menos 3 perfis com membro ativo e negócio') from f_membros;

set local role anon;
do $$ begin perform public.emitir_proposta_versao(gen_random_uuid(), 'preliminar'); raise exception 'FALHA: anon emitiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function emitir_proposta_versao', 'F1f. anon emite'); end $$;
do $$ begin perform public.reconstruir_proposta_legada(gen_random_uuid()); raise exception 'FALHA: anon reconstruiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function reconstruir_proposta_legada', 'F1f. anon reconstrói'); end $$;
reset role;
set local role service_role;
do $$ begin perform public.emitir_proposta_versao(gen_random_uuid(), 'preliminar'); raise exception 'FALHA: service_role emitiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function emitir_proposta_versao', 'F1g. service_role emite'); end $$;
do $$ begin perform public.reconstruir_proposta_legada(gen_random_uuid()); raise exception 'FALHA: service_role reconstruiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function reconstruir_proposta_legada', 'F1g. service_role reconstrói'); end $$;
reset role;
set local role authenticated;
do $$ declare r record; begin
  for r in select * from f_membros order by papel loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    begin
      perform public.emitir_proposta_versao(r.negocio, 'preliminar');
      raise exception 'FALHA: % emitiu', r.papel using errcode = 'TF001';
    exception when sqlstate 'TF001' then raise;
      when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function emitir_proposta_versao', 'F1h. ' || r.papel || ' emite');
    end;
    begin
      perform public.reconstruir_proposta_legada(r.negocio);
      raise exception 'FALHA: % reconstruiu', r.papel using errcode = 'TF001';
    exception when sqlstate 'TF001' then raise;
      when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function reconstruir_proposta_legada', 'F1h. ' || r.papel || ' reconstrói');
    end;
  end loop;
end $$;
reset role;
select pg_temp.confere(count(*) = 0, 'F1i. nenhuma versão nasceu nas tentativas') from public.proposta_versoes;

\echo '=== F2. contexto de teste: EXECUTE a authenticated SÓ nesta transação (ROLLBACK no fim reverte a migration inteira)'
grant execute on function public.emitir_proposta_versao(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.reconstruir_proposta_legada(uuid) to authenticated;
