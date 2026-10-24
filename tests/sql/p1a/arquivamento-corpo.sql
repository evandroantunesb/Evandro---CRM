-- v6 (fail-closed). Corpo dos testes de arquivamento (P1a-0). Incluído por t01 (só a P1a-0) e por t12-arquivamento (P1a-0 + P1a-1).
-- Requer: cenario.sql já carregado. O SDR vira gestor e depois admin só dentro da transação.

\echo '=== A0. nenhuma linha existente foi alterada: nenhum negócio nasce arquivado'
select pg_temp.confere(count(*) = 0, 'A0. nenhum negócio arquivado após a migration')
  from public.negocios where arquivado_em is not null or arquivado_por is not null or motivo_arquivamento is not null;

\echo '=== A1. EXECUTE efetivo nas funções do arquivamento'
select p.proname as funcao, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('arquivar_negocio', 'desarquivar_negocio', 'negocios_proteger_arquivamento') order by 1;
select pg_temp.confere(count(*) = 6 and bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('service_role', p.oid, 'execute')
         and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname in ('arquivar_negocio', 'desarquivar_negocio'))),
       'A1. só arquivar/desarquivar para authenticated; gatilhos e auxiliar negados')
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('arquivar_negocio', 'desarquivar_negocio', 'negocios_proteger_arquivamento',
  'negocios_arquivado_somente_leitura', 'negocio_arquivado_bloquear_filho', 'arquivado_so_anulacao_automatica');

\echo '=== A2. vendedor responsável: não arquiva, não usa atalho pela API; edição comum continua'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: vendedor arquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio não encontrado.', 'vendedor não arquiva'); end $$;
do $$ declare n int; begin
  update public.negocios set arquivado_em = now(), motivo_arquivamento = 'atalho' where id = (select neg from cen);
  get diagnostics n = row_count;
  if n = 0 then raise notice 'ok (atalho pela API): nenhuma linha (RLS)'; else raise exception 'FALHA: arquivou direto pela API' using errcode = 'TF001'; end if;
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'atalho pela API'); end $$;
do $$ declare n int; begin
  update public.negocios set descricao = coalesce(descricao, '') where id = (select neg from cen);
  get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if;
  raise notice 'sem regressão (vendedor edita o negócio): 1 linha'; end $$;
reset role;

\echo '=== A3. service_role e anon: sem função e sem atalho'
set local role service_role;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: service_role arquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function arquivar_negocio', 'service_role arquivar'); end $$;
do $$ begin update public.negocios set arquivado_em = now(), motivo_arquivamento = 'atalho' where id = (select neg from cen);
  raise exception 'FALHA: service_role arquivou direto' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'service_role atalho'); end $$;
reset role;
set local role anon;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: anon arquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function arquivar_negocio', 'anon arquivar'); end $$;
reset role;

\echo '=== A4. vendedor de OUTRA empresa não arquiva nem desarquiva'
select set_config('request.jwt.claims', json_build_object('sub', :outro, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: outra empresa arquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio não encontrado.', 'outra empresa arquivar'); end $$;
do $$ begin perform public.desarquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: outra empresa desarquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio não encontrado.', 'outra empresa desarquivar'); end $$;
reset role;


\echo '=== A5. gestor: motivo obrigatório; arquiva; não arquiva duas vezes'
update public.empresa_membros set papel = 'gestor' where user_id = :sdr and empresa_id = :empresa;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg from cen), '   '); raise exception 'FALHA: arquivou sem motivo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Informe o motivo do arquivamento.', 'sem motivo'); end $$;
select pg_temp.confere(public.arquivar_negocio(:neg, 'Cliente desistiu (teste)')::text = '', 'A5. gestor arquiva');
do $$ begin perform public.arquivar_negocio((select neg from cen), 'de novo'); raise exception 'FALHA: arquivou duas vezes' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Este negócio já está arquivado.', 'já arquivado'); end $$;
reset role;
select arquivado_em is not null as arquivado, motivo_arquivamento,
       arquivado_por = (select id from public.empresa_membros where user_id = :sdr and empresa_id = :empresa) as autor_e_o_gestor
  from public.negocios where id = :neg;
select pg_temp.confere(count(*) = 1 and bool_and(arquivado_em is not null and motivo_arquivamento = 'Cliente desistiu (teste)'
         and arquivado_por = (select id from public.empresa_membros where user_id = :sdr and empresa_id = :empresa)), 'A5. data, motivo e autor gravados')
  from public.negocios where id = :neg;
\echo '--- A5b. v6: o arquivamento fica na auditoria existente (logs_auditoria), com data, autor e motivo'
select pg_temp.confere(count(*) = 1 and bool_and(user_id = :sdr and created_at is not null and dados_depois ->> 'motivo' = 'Cliente desistiu (teste)'
         and (dados_depois ->> 'membro_id')::uuid = (select id from public.empresa_membros where user_id = :sdr and empresa_id = :empresa)
         and dados_depois ->> 'membro_nome' is not null and empresa_id = :empresa),
       'A5b. 1 registro de arquivamento em logs_auditoria')
  from public.logs_auditoria where entidade = 'negocios' and acao = 'arquivar' and entidade_id = (select neg::text from cen);

\echo '=== A6. negócio arquivado: a ficha continua visível ao vendedor; vendedor não desarquiva'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select pg_temp.confere(count(*) = 1, 'A6. vendedor vê o negócio arquivado') from public.negocios where id = :neg;
do $$ begin perform public.desarquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: vendedor desarquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio não encontrado.', 'vendedor não desarquiva'); end $$;
reset role;

\echo '=== A7. gestor desarquiva com motivo (obrigatório na v6); desarquivar o que não está arquivado é recusado'
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.desarquivar_negocio((select neg from cen), '  '); raise exception 'FALHA: desarquivou sem motivo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Informe o motivo do desarquivamento.', 'desarquivar sem motivo'); end $$;
select pg_temp.confere(public.desarquivar_negocio(:neg, 'Cliente retomou (teste)')::text = '', 'A7. gestor desarquiva');
do $$ begin perform public.desarquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: desarquivou negócio não arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Este negócio não está arquivado.', 'não arquivado'); end $$;
reset role;
select pg_temp.confere(count(*) = 1 and bool_and(arquivado_em is null and arquivado_por is null and motivo_arquivamento is null), 'A7. colunas limpas')
  from public.negocios where id = :neg;
select pg_temp.confere(count(*) = 1 and bool_and(user_id = :sdr and dados_depois ->> 'motivo' = 'Cliente retomou (teste)'
         and dados_antes ->> 'motivo_arquivamento' = 'Cliente desistiu (teste)' and dados_antes ->> 'arquivado_em' is not null),
       'A7. desarquivamento auditado com o motivo dele e o estado anterior')
  from public.logs_auditoria where entidade = 'negocios' and acao = 'desarquivar' and entidade_id = (select neg::text from cen);

\echo '=== A8. admin também arquiva e desarquiva'
update public.empresa_membros set papel = 'admin' where user_id = :sdr and empresa_id = :empresa;
set local role authenticated;
select pg_temp.confere(public.arquivar_negocio(:neg, 'Teste admin')::text = '', 'A8. admin arquiva');
select pg_temp.confere(count(*) = 1 and bool_and(arquivado_em is not null), 'A8. arquivado pelo admin') from public.negocios where id = :neg;
select pg_temp.confere(public.desarquivar_negocio(:neg, 'Teste admin')::text = '', 'A8. admin desarquiva');
select pg_temp.confere(count(*) = 1 and bool_and(arquivado_em is null), 'A8. desarquivado pelo admin') from public.negocios where id = :neg;
reset role;
select pg_temp.confere(count(*) = 4, 'A8. 4 registros de auditoria (2 arquivamentos, 2 desarquivamentos)')
  from public.logs_auditoria where entidade = 'negocios' and acao in ('arquivar', 'desarquivar') and entidade_id = (select neg::text from cen);

\echo '=== A9. restrição de coerência (nem o dono grava estado incoerente)'
-- v10: sem a marca de arquivar/desarquivar, o gatilho recusa antes da restrição; com a marca (o único caminho
-- que ainda grava essas colunas), a restrição continua barrando estado incoerente.
do $$ begin update public.negocios set arquivado_por = (select vendedor_membro from cen) where id = (select neg from cen);
  raise exception 'FALHA: dono gravou autor sem a função' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'v10: dono sem a marca das funções'); end $$;
do $$ begin perform set_config('raion.arquivamento_negocio', (select neg from cen)::text, true);
  update public.negocios set arquivado_por = (select vendedor_membro from cen) where id = (select neg from cen);
  raise exception 'FALHA: autor sem data aceito' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'new row for relation "negocios" violates check constraint "negocios_arquivamento_coerente"', 'autor sem data, novo na v5'); end $$;
do $$ begin perform set_config('raion.arquivamento_negocio', (select neg from cen)::text, true);
  update public.negocios set arquivado_em = now() where id = (select neg from cen);
  raise exception 'FALHA: data sem motivo aceita' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'new row for relation "negocios" violates check constraint "negocios_arquivamento_coerente"', 'data sem motivo'); end $$;
do $$ begin perform set_config('raion.arquivamento_negocio', (select neg from cen)::text, true);
  update public.negocios set motivo_arquivamento = 'x' where id = (select neg from cen);
  raise exception 'FALHA: motivo sem data aceito' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'new row for relation "negocios" violates check constraint "negocios_arquivamento_coerente"', 'motivo sem data'); end $$;

\echo '=== A10. v6: admin AUTENTICADO apaga, pela API, o membro que arquivou e é o responsável do negócio arquivado'
-- Membro criado só para o teste (o usuário da outra empresa entra como gestor desta), vira responsável do negócio,
-- arquiva e depois é APAGADO pelo admin da empresa (policy "admin remove membros"), com o arquivamento ativo.
savepoint s_autor;
insert into public.empresa_membros (empresa_id, user_id, papel) values (:empresa, :outro, 'gestor');
update public.negocios set responsavel_id = (select id from public.empresa_membros where user_id = :outro and empresa_id = :empresa) where id = :neg_sem_versao;
select set_config('request.jwt.claims', json_build_object('sub', :outro, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select pg_temp.confere(public.arquivar_negocio(:neg_sem_versao, 'Teste autor apagado')::text = '', 'A10. membro temporário arquiva');
reset role;
create temp table t_membro_tmp on commit drop as select id from public.empresa_membros where user_id = :outro and empresa_id = :empresa;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ declare n int; begin
  delete from public.empresa_membros where user_id = (select outro from cen) and empresa_id = (select empresa from cen);
  get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if;
  raise notice 'sem regressão (admin autenticado apaga o membro que arquivou): % linha(s)', n; end $$;
reset role;
select arquivado_em is not null as continua_arquivado, motivo_arquivamento, arquivado_por is null as autor_virou_nulo, responsavel_id is null as responsavel_virou_nulo
  from public.negocios where id = :neg_sem_versao;
select pg_temp.confere(count(*) = 1 and bool_and(arquivado_em is not null and motivo_arquivamento = 'Teste autor apagado'
         and arquivado_por is null and responsavel_id is null), 'A10. continua arquivado; autor e responsável anulados pelo banco')
  from public.negocios where id = :neg_sem_versao;
select pg_temp.confere(count(*) = 1 and bool_and((dados_depois ->> 'membro_id')::uuid = (select id from t_membro_tmp) and user_id = :outro
         and dados_depois ->> 'membro_nome' is not null), 'A10. a auditoria preserva quem arquivou, mesmo com o membro apagado')
  from public.logs_auditoria where entidade = 'negocios' and acao = 'arquivar' and entidade_id = (select neg_sem_versao::text from cen);
rollback to savepoint s_autor;
update public.empresa_membros set papel = 'sdr' where user_id = :sdr and empresa_id = :empresa;
