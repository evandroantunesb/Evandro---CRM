-- v6 (fail-closed), teste INDIVIDUAL da P1a-0 (arquivamento), aplicada SOZINHA. Banco LOCAL, tudo revertido no final.
\set ON_ERROR_STOP 1
begin;
\i /tmp/p1v10-assercoes.sql
\i /tmp/p1v10-01.sql
\i /tmp/p1v10-cenario.sql

\i /tmp/p1v10-arquivamento-corpo.sql
\i /tmp/p1v10-somente-leitura-corpo.sql

\echo '=== A11. só a P1a-0: negócio NÃO arquivado continua apagável (comportamento de hoje)'
update public.empresa_membros set papel = 'admin' where user_id = :sdr and empresa_id = :empresa;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
savepoint s_del;
do $$ declare n int; begin
  delete from public.negocios where id = (select neg_sem_versao from cen); get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if;
  raise notice 'sem regressão (admin apaga negócio): 1 linha'; end $$;
rollback to savepoint s_del;
reset role;

\echo '=== A12. objetos da P1a-1 ainda não existem'
select pg_temp.confere(to_regclass('public.proposta_versoes') is null
         and to_regprocedure('public.emitir_proposta_versao(uuid, text, uuid, jsonb)') is null
         and not exists (select 1 from pg_constraint where conname = 'propostas_id_negocio_empresa_key'), 'A12. nenhum objeto da P1a-1');

rollback;
\echo '--- ROLLBACK feito: nada foi gravado'
