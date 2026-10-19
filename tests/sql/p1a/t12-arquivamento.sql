-- v6 (fail-closed), teste CONJUNTO do arquivamento: P1a-0 + P1a-1 aplicadas em sequência. Banco LOCAL, tudo revertido.
-- Parte A/S: os mesmos corpos do teste individual (nada do arquivamento muda com a P1a-1).
-- Parte B: o fluxo que substitui a exclusão, agora que negócio com versão não pode mais ser apagado.
\set ON_ERROR_STOP 1
begin;
\i /tmp/p1v10-assercoes.sql
\i /tmp/p1v10-01.sql
\i /tmp/p1v10-02.sql
\i /tmp/p1v10-emissao-fechada.sql
\i /tmp/p1v10-cenario.sql

\i /tmp/p1v10-arquivamento-corpo.sql
\i /tmp/p1v10-somente-leitura-corpo.sql

\echo '=== B1. vendedor emite v1; admin NÃO apaga o negócio com versão'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select numero, situacao, pg_temp.confere(numero = 1 and situacao = 'vigente', 'B1. v1 emitida') as confere from public.emitir_proposta_versao(:neg, 'preliminar');
reset role;
create temp table t_tok on commit drop as select id, token from public.proposta_versoes where negocio_id = :neg;
grant select on t_tok to authenticated, service_role;
update public.empresa_membros set papel = 'admin' where user_id = :sdr and empresa_id = :empresa;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin delete from public.negocios where id = (select neg from cen); raise exception 'FALHA: admin apagou negócio com versão' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'update or delete on table "negocios" violates foreign key constraint "proposta_versoes_negocio_id_empresa_id_fkey" on table "proposta_versoes"', 'exclusão bloqueada'); end $$;

\echo '=== B2. o mesmo admin ARQUIVA (o caminho no lugar da exclusão)'
select pg_temp.confere(public.arquivar_negocio(:neg, 'Cliente desistiu (teste)')::text = '', 'B2. admin arquiva o negócio com versão');
select pg_temp.confere(count(*) = 1, 'B2. versão continua visível') from public.proposta_versoes where negocio_id = :neg;
do $$ begin perform public.emitir_proposta_versao((select neg from cen), 'preliminar'); raise exception 'FALHA: emitiu em negócio arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado: desarquive antes de emitir.', 'emitir arquivado'); end $$;
do $$ begin delete from public.negocios where id = (select neg from cen); raise exception 'FALHA: apagou negócio arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado não pode ser apagado: desarquive antes.', 'apagar arquivado com versão'); end $$;
reset role;
set local role service_role;
select pg_temp.confere(count(*) = 1 and bool_and(jsonb_typeof(r -> 'documento') = 'object'), 'B2. link continua após arquivar')
  from t_tok, public.obter_proposta_versao_publica(token) r;
reset role;

\echo '--- B2b. v6: cancelar o link de uma versão de negócio arquivado continua possível (revogação administrativa)'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
savepoint s_cancela;
select pg_temp.confere(situacao = 'cancelada', 'B2b. versão de negócio arquivado cancelada') from public.cancelar_proposta_versao((select id from t_tok), 'Link enviado por engano (teste)');
rollback to savepoint s_cancela;
reset role;

\echo '=== B3. desarquivar (com motivo) devolve o negócio ao fluxo normal (emissão volta a funcionar)'
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select pg_temp.confere(public.desarquivar_negocio(:neg, 'Cliente retomou (teste)')::text = '', 'B3. desarquivou');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select numero, situacao, pg_temp.confere(numero = 2 and situacao = 'vigente', 'B3. v2 emitida após desarquivar') as confere from public.emitir_proposta_versao(:neg, 'preliminar');
reset role;

\echo '=== B4. negócio SEM versão e não arquivado continua apagável pelo admin (sem regressão)'
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
savepoint s_del;
do $$ declare n int; begin
  delete from public.negocios where id = (select neg_sem_versao from cen); get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if;
  raise notice 'sem regressão (admin apaga negócio sem versão): 1 linha'; end $$;
rollback to savepoint s_del;
reset role;

rollback;
\echo '--- ROLLBACK feito: nada foi gravado'
