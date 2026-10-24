-- v6 (conjunto P1a-0 + P1a-1, fail-closed: cada resultado é conferido): mesmo teste da v4, com os IDs fixos trocados por marcadores {{...}} que o
-- executor (executar-testes.sh) preenche com o cenário do banco local (cenario.sql).
-- P1a v4: privilégios efetivos, isolamento multiempresa, helpers SECURITY DEFINER, exclusões (negócio, empresa,
-- membro), vínculos, lista explícita de campos, recursos e histórico. Banco LOCAL, tudo revertido no final.
\set ON_ERROR_STOP 1
begin;
\i /tmp/p1v10-assercoes.sql
\i /tmp/p1v10-01.sql
\i /tmp/p1v10-02.sql
\i /tmp/p1v10-emissao-fechada.sql
\set neg '''{{NEG}}'''
\set neg_sem_versao '''{{NEG_SEM_VERSAO}}'''
\set empresa '''{{EMPRESA}}'''
\set vendedor '''{{VENDEDOR}}'''
\set admin_teste '''{{SDR}}'''
\set outro '''{{OUTRO}}'''

-- Massa: v1 e v2 emitidas pelo vendedor (v1 substituída). O membro SDR vira ADMIN só nesta transação.
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select numero from public.emitir_proposta_versao(:neg, 'preliminar');
select numero from public.emitir_proposta_versao(:neg, 'preliminar');
reset role;
update public.empresa_membros set papel = 'admin' where user_id = :admin_teste and empresa_id = :empresa;
create temp table t_tokens on commit drop as select numero, token from public.proposta_versoes where negocio_id = :neg;
grant select on t_tokens to authenticated, service_role;

\echo '=== 1. privilégios EFETIVOS na tabela (has_table_privilege)'
select r as papel,
       has_table_privilege(r, 'public.proposta_versoes', 'select') as sel, has_table_privilege(r, 'public.proposta_versoes', 'insert') as ins,
       has_table_privilege(r, 'public.proposta_versoes', 'update') as upd, has_table_privilege(r, 'public.proposta_versoes', 'delete') as del,
       has_table_privilege(r, 'public.proposta_versoes', 'truncate') as trunc
from unnest(array['anon', 'authenticated', 'service_role']) r;
select pg_temp.confere(bool_and(case r when 'authenticated' then has_table_privilege(r, 'public.proposta_versoes', 'select') else not has_table_privilege(r, 'public.proposta_versoes', 'select') end
         and not has_table_privilege(r, 'public.proposta_versoes', 'insert') and not has_table_privilege(r, 'public.proposta_versoes', 'update')
         and not has_table_privilege(r, 'public.proposta_versoes', 'delete') and not has_table_privilege(r, 'public.proposta_versoes', 'truncate')),
       '1. só authenticated lê (sob RLS); ninguém escreve') from unnest(array['anon', 'authenticated', 'service_role']) r;

\echo '=== 2. EXECUTE efetivo em cada função do P1 (has_function_privilege)'
-- Contexto de teste: emitir/reconstruir foram concedidas a authenticated SÓ nesta transação (F2, emissao-fechada.sql);
-- o estado instalado pela migration, com as duas fechadas, é conferido em F1.
select p.proname as funcao, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('arquivar_negocio', 'desarquivar_negocio', 'negocios_proteger_arquivamento',
  'proposta_versoes_validar_insercao', 'proteger_proposta_versao', 'proteger_proposta_versao_truncate', 'proposta_pendencias_definitiva',
  'proposta_montar_conteudo', 'proposta_recursos_do_conteudo', 'proposta_validar_recursos', 'proposta_gravar_versao',
  'emitir_proposta_versao', 'reconstruir_proposta_legada', 'cancelar_proposta_versao', 'proposta_versao_hash_confere',
  'obter_proposta_versao_publica', 'proposta_parametros_economicos_validados', 'negocios_arquivado_somente_leitura',
  'negocio_arquivado_bloquear_filho', 'arquivado_so_anulacao_automatica')
order by authenticated desc, service_role desc, 1;
select pg_temp.confere(count(*) = 20
         and bool_and(not has_function_privilege('anon', p.oid, 'execute'))
         and bool_and(has_function_privilege('authenticated', p.oid, 'execute') = (p.proname in ('arquivar_negocio', 'desarquivar_negocio',
               'emitir_proposta_versao', 'reconstruir_proposta_legada', 'cancelar_proposta_versao', 'proposta_versao_hash_confere')))
         and bool_and(has_function_privilege('service_role', p.oid, 'execute') = (p.proname = 'obter_proposta_versao_publica')),
       '2. matriz de EXECUTE: 6 funções para authenticated, leitura pública só service_role, resto negado')
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('arquivar_negocio', 'desarquivar_negocio', 'negocios_proteger_arquivamento',
  'proposta_versoes_validar_insercao', 'proteger_proposta_versao', 'proteger_proposta_versao_truncate', 'proposta_pendencias_definitiva',
  'proposta_montar_conteudo', 'proposta_recursos_do_conteudo', 'proposta_validar_recursos', 'proposta_gravar_versao',
  'emitir_proposta_versao', 'reconstruir_proposta_legada', 'cancelar_proposta_versao', 'proposta_versao_hash_confere',
  'obter_proposta_versao_publica', 'proposta_parametros_economicos_validados', 'negocios_arquivado_somente_leitura',
  'negocio_arquivado_bloquear_filho', 'arquivado_so_anulacao_automatica');

\echo '=== 3. service_role (chave de servidor)'
select set_config('request.jwt.claims', '{"role":"service_role"}', true) is not null as ok;
set local role service_role;
do $$ begin perform 1 from public.proposta_versoes limit 1; raise exception 'FALHA: service_role leu a tabela' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for table proposta_versoes', 'select direto'); end $$;
do $$ begin perform public.emitir_proposta_versao('{{NEG}}', 'preliminar'); raise exception 'FALHA: emitiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function emitir_proposta_versao', 'emitir'); end $$;
do $$ begin perform public.proposta_montar_conteudo('{{NEG}}', 'preliminar', 1, null); raise exception 'FALHA: montou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function proposta_montar_conteudo', 'montar conteúdo'); end $$;
select numero, r ->> 'situacao' as situacao, jsonb_typeof(r -> 'documento') = 'object' as tem_documento,
       r ? 'dados_internos' or r::text like '%tarifa_kwh%' or r::text like '%negocio_valor%' as vaza_interno,
       r ->> 'existe_mais_recente' as mais_recente
  from t_tokens, public.obter_proposta_versao_publica(token) r order by numero;
select pg_temp.confere(count(*) = 2 and bool_and(jsonb_typeof(r -> 'documento') = 'object'
         and not (r ? 'dados_internos' or r::text like '%tarifa_kwh%' or r::text like '%negocio_valor%' or r::text like '%calculo_parametros%')
         and r -> 'documento' -> 'calculo' -> 'economia_mensal' = 'null'::jsonb and r -> 'documento' -> 'calculo' -> 'conta_sem_solar' = 'null'::jsonb
         and r -> 'documento' -> 'calculo' -> 'conta_com_solar' = 'null'::jsonb and r -> 'documento' -> 'calculo' -> 'payback_meses' = 'null'::jsonb
         and r ->> 'existe_mais_recente' = case when numero = 1 then 'true' else 'false' end
         and r ->> 'situacao' = case when numero = 1 then 'substituida' else 'vigente' end),
       '3. leitura pública: documento sem dados internos nem os 4 resultados econômicos (preliminar); aviso de versão mais recente')
  from t_tokens, public.obter_proposta_versao_publica(token) r;
select pg_temp.confere(public.obter_proposta_versao_publica('token-que-nao-existe') is null, '3. token inválido não devolve nada');
reset role;

\echo '=== 4. anon'
set local role anon;
do $$ begin perform public.obter_proposta_versao_publica('x'); raise exception 'FALHA: anon chamou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function obter_proposta_versao_publica', 'anon leitura pública'); end $$;
do $$ begin perform 1 from public.proposta_versoes; raise exception 'FALHA: anon leu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for table proposta_versoes', 'anon select'); end $$;
reset role;

\echo '=== 5. isolamento: vendedor de OUTRA empresa (inclui helpers SECURITY DEFINER)'
select set_config('request.jwt.claims', json_build_object('sub', :outro, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select count(*) as outra_empresa_ve_versoes, pg_temp.confere(count(*) = 0, '5. outra empresa vê 0 versões') as confere from public.proposta_versoes;
select pg_temp.confere(public.proposta_versao_hash_confere((select id from public.proposta_versoes limit 1)) is null, '5. hash_confere não responde a outra empresa');
do $$ begin perform public.emitir_proposta_versao('{{NEG}}', 'preliminar'); raise exception 'FALHA: emitiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Você não pode emitir proposta deste negócio.', 'emitir'); end $$;
do $$ begin perform public.reconstruir_proposta_legada('{{NEG}}'); raise exception 'FALHA: reconstruiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Você não pode reconstruir a proposta deste negócio.', 'reconstruir'); end $$;
do $$ begin perform public.cancelar_proposta_versao('00000000-0000-0000-0000-000000000000', 'x'); raise exception 'FALHA: cancelou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Versão não encontrada.', 'cancelar'); end $$;
do $$ begin perform public.arquivar_negocio('{{NEG}}', 'x'); raise exception 'FALHA: arquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio não encontrado.', 'arquivar'); end $$;
do $$ begin perform public.proposta_pendencias_definitiva('{{NEG}}'); raise exception 'FALHA: pendências' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function proposta_pendencias_definitiva', 'helper pendências'); end $$;
do $$ begin perform public.proposta_recursos_do_conteudo('{}'); raise exception 'FALHA: recursos' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function proposta_recursos_do_conteudo', 'helper recursos'); end $$;
do $$ begin perform public.proposta_validar_recursos('{{EMPRESA}}', null, '[]', '[]'); raise exception 'FALHA: validar' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function proposta_validar_recursos', 'helper validar recursos'); end $$;
do $$ begin perform public.proposta_montar_conteudo('{{NEG}}', 'preliminar', 1, null); raise exception 'FALHA: montar' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for function proposta_montar_conteudo', 'helper montar'); end $$;
reset role;

\echo '=== 6. superadmin da aplicação, sem ser membro'
select set_config('request.jwt.claims', json_build_object('sub', (
  select a.user_id from public.plataforma_admins a
  where not exists (select 1 from public.empresa_membros m where m.user_id = a.user_id and m.empresa_id = '{{EMPRESA}}') limit 1),
  'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select public.e_plataforma_admin() as e_superadmin, count(*) as ve_versoes,
       pg_temp.confere(public.e_plataforma_admin() and count(*) = 0, '6. superadmin sem ser membro vê 0') as confere from public.proposta_versoes;
do $$ begin perform public.emitir_proposta_versao('{{NEG}}', 'preliminar'); raise exception 'FALHA: emitiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Você não pode emitir proposta deste negócio.', 'emitir'); end $$;
do $$ begin delete from public.empresas where id = '{{EMPRESA}}'; raise exception 'FALHA: apagou empresa com versões' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'update or delete on table "empresas" violates foreign key constraint "proposta_versoes_empresa_id_fkey" on table "proposta_versoes"', 'superadmin apaga empresa com versões'); end $$;
reset role;

\echo '=== 7. exclusões de negócio, proposta e empresa'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin delete from public.propostas where negocio_id = '{{NEG}}'; raise exception 'FALHA: vendedor apagou proposta' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'update or delete on table "propostas" violates foreign key constraint "proposta_versoes_proposta_id_negocio_id_empresa_id_fkey" on table "proposta_versoes"', 'vendedor apaga proposta'); end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :admin_teste, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin delete from public.negocios where id = '{{NEG}}'; raise exception 'FALHA: admin apagou negócio com versões' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'update or delete on table "negocios" violates foreign key constraint "proposta_versoes_negocio_id_empresa_id_fkey" on table "proposta_versoes"', 'admin apaga negócio com versões'); end $$;
savepoint s_neg;
do $$ declare n int; begin
  delete from public.negocios where id = '{{NEG_SEM_VERSAO}}'; get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if;
  raise notice 'sem regressão (admin apaga negócio SEM versão): % linha(s)', n; end $$;
rollback to savepoint s_neg;
reset role;
do $$ begin delete from public.empresas where id = '{{EMPRESA}}'; raise exception 'FALHA: dono apagou empresa com versões' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'update or delete on table "empresas" violates foreign key constraint "proposta_versoes_empresa_id_fkey" on table "proposta_versoes"', 'dono apaga empresa com versões'); end $$;
savepoint s_emp;
do $$ declare n int; begin
  delete from public.empresas where id = '{{EMPRESA_OUTRA}}'; get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if;
  raise notice 'sem regressão (empresa SEM versões apagada): % linha(s)', n; end $$;
rollback to savepoint s_emp;

\echo '=== 8. membro: desligamento e exclusão NÃO são bloqueados; a autoria fica'
select set_config('request.jwt.claims', json_build_object('sub', :admin_teste, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
update public.empresa_membros set status = 'desligado' where user_id = :vendedor and empresa_id = :empresa;
select pg_temp.confere(count(*) = 1 and bool_and(status = 'desligado'), '8. admin desliga o vendedor que emitiu')
  from public.empresa_membros where user_id = :vendedor and empresa_id = :empresa;
reset role;
savepoint s_membro;
do $$ begin
  delete from public.empresa_membros where user_id = '{{VENDEDOR}}' and empresa_id = '{{EMPRESA}}';
  raise notice 'exclusão do vendedor: ok';
exception when others then raise notice 'exclusão do vendedor bloqueada por regra JÁ EXISTENTE (não do P1): %', sqlerrm; end $$;
rollback to savepoint s_membro;
-- Membro criado só para o teste (o usuário da outra empresa entra como admin desta), emite e depois é APAGADO.
insert into public.empresa_membros (empresa_id, user_id, papel) values (:empresa, :outro, 'admin');
select set_config('request.jwt.claims', json_build_object('sub', :outro, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select numero as emitida_pelo_membro_temporario, pg_temp.confere(numero = 3, '8. membro temporário emite a v3') as confere from public.emitir_proposta_versao(:neg, 'preliminar');
reset role;
do $$ declare n int; begin
  delete from public.empresa_membros where user_id = '{{OUTRO}}' and empresa_id = '{{EMPRESA}}';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if; raise notice 'exclusão do membro que emitiu (P1 não bloqueia): % linha(s)', n; end $$;
select numero, emitida_por_user_id = :outro as user_preservado, emitida_por_nome is not null as nome_preservado,
       not exists (select 1 from public.empresa_membros m where m.id = v.emitida_por_membro_id) as membro_nao_existe_mais
  from public.proposta_versoes v where negocio_id = :neg and numero = 3;
select pg_temp.confere(count(*) = 1 and bool_and(emitida_por_user_id = :outro and emitida_por_nome is not null
         and not exists (select 1 from public.empresa_membros m where m.id = v.emitida_por_membro_id)), '8. autoria preservada após apagar o membro')
  from public.proposta_versoes v where negocio_id = :neg and numero = 3;
rollback to savepoint s_membro;
update public.empresa_membros set status = 'ativo' where user_id = :vendedor and empresa_id = :empresa;

\echo '=== 9. vínculos coerentes (mesmo o dono não grava versão incoerente)'
insert into public.propostas (empresa_id, negocio_id) values (:empresa, :neg_sem_versao);
do $$ begin
  insert into public.proposta_versoes (empresa_id, proposta_id, negocio_id, numero, tipo, origem, documento, dados_internos,
      conteudo_canonico, conteudo_hash, recursos_status, emitida_por_membro_id, emitida_por_user_id)
    select v.empresa_id, (select id from public.propostas where negocio_id = '{{NEG_SEM_VERSAO}}'), v.negocio_id, 99, v.tipo, v.origem,
           v.documento, v.dados_internos, v.conteudo_canonico, v.conteudo_hash, v.recursos_status, v.emitida_por_membro_id, v.emitida_por_user_id
    from public.proposta_versoes v where v.negocio_id = '{{NEG}}' and v.numero = 2;
  raise exception 'FALHA: versão com proposta de OUTRO negócio' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'insert or update on table "proposta_versoes" violates foreign key constraint "proposta_versoes_proposta_id_negocio_id_empresa_id_fkey"', 'proposta de outro negócio'); end $$;
do $$ begin
  insert into public.proposta_versoes (empresa_id, proposta_id, negocio_id, numero, tipo, origem, documento, dados_internos,
      conteudo_canonico, conteudo_hash, recursos_status, emitida_por_membro_id, emitida_por_user_id)
    select v.empresa_id, v.proposta_id, v.negocio_id, 99, v.tipo, v.origem, v.documento, v.dados_internos, v.conteudo_canonico,
           v.conteudo_hash, v.recursos_status, '{{OUTRO_MEMBRO}}', '{{OUTRO}}'
    from public.proposta_versoes v where v.negocio_id = '{{NEG}}' and v.numero = 2;
  raise exception 'FALHA: autor de OUTRA empresa' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Autor da versão não é membro desta empresa.', 'autor de outra empresa'); end $$;
do $$ begin
  insert into public.proposta_versoes (empresa_id, proposta_id, negocio_id, numero, tipo, origem, documento, dados_internos,
      conteudo_canonico, conteudo_hash, recursos_status, emitida_por_membro_id, emitida_por_user_id)
    -- proposta nova (sem vigente) do negócio 27dff0b0, mas declarada como da empresa ea806059, com autor válido dessa empresa
    select '{{EMPRESA_OUTRA}}', (select id from public.propostas where negocio_id = '{{NEG_SEM_VERSAO}}'),
           '{{NEG_SEM_VERSAO}}', 1, v.tipo, v.origem, v.documento, v.dados_internos,
           v.conteudo_canonico, v.conteudo_hash, v.recursos_status, '{{OUTRO_MEMBRO}}', '{{OUTRO}}'
    from public.proposta_versoes v where v.negocio_id = '{{NEG}}' and v.numero = 2;
  raise exception 'FALHA: empresa diferente da do negócio' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'insert or update on table "proposta_versoes" violates foreign key constraint "proposta_versoes_negocio_id_empresa_id_fkey"', 'empresa diferente da do negócio'); end $$;
do $$ begin
  insert into public.proposta_versoes (empresa_id, proposta_id, negocio_id, numero, tipo, origem, documento, dados_internos,
      conteudo_canonico, conteudo_hash, recursos_status, emitida_por_membro_id, emitida_por_user_id)
    select v.empresa_id, v.proposta_id, v.negocio_id, 99, v.tipo, v.origem, '{"forjado": true}', v.dados_internos, v.conteudo_canonico,
           v.conteudo_hash, v.recursos_status, v.emitida_por_membro_id, v.emitida_por_user_id
    from public.proposta_versoes v where v.negocio_id = '{{NEG}}' and v.numero = 2;
  raise exception 'FALHA: documento diferente do texto canônico' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'new row for relation "proposta_versoes" violates check constraint "proposta_versoes_canonico_confere"', 'documento ≠ canônico'); end $$;

\echo '=== 10. lista explícita de campos (documento comercial × dados internos)'
select (select array_agg(k order by k) from jsonb_object_keys(documento -> 'calculo') k) as campos_calculo_no_documento,
       documento::text like '%tarifa_kwh%' or documento::text like '%percentual_fio_b%' or documento::text like '%negocio_valor%'
         or documento::text like '%observacoes%' or documento::text like '%modelo_id%' as documento_tem_campo_interno,
       dados_internos -> 'calculo_parametros' ? 'tarifa_kwh' as interno_tem_tarifa
  from public.proposta_versoes where negocio_id = :neg and numero = 2;
select pg_temp.confere(count(*) = 1 and bool_and((select array_agg(k order by k) from jsonb_object_keys(documento -> 'calculo') k)
           = '{consumo_medio_kwh,conta_com_solar,conta_sem_solar,economia_mensal,geracao_estimada_kwh_mes,kit_nome,kit_potencia_kwp,kit_preco,payback_meses,tipo_ligacao}'
         and not (documento::text like '%tarifa_kwh%' or documento::text like '%percentual_fio_b%' or documento::text like '%negocio_valor%'
                  or documento::text like '%observacoes%' or documento::text like '%modelo_id%')
         and dados_internos -> 'calculo_parametros' ? 'tarifa_kwh'), '10. exatamente os 10 campos; nada interno no documento')
  from public.proposta_versoes where negocio_id = :neg and numero = 2;
update public.propostas set modo_preco = 'sem_preco' where negocio_id = :neg;
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select numero, documento -> 'calculo' -> 'kit_preco' as preco_no_documento_sem_preco,
       dados_internos -> 'calculo_parametros' ->> 'kit_preco' is not null as preco_guardado_so_no_interno,
       pg_temp.confere(documento -> 'calculo' -> 'kit_preco' = 'null'::jsonb and dados_internos -> 'calculo_parametros' ->> 'kit_preco' is not null,
                       '10. sem preço: preço só nos dados internos') as confere
  from public.emitir_proposta_versao(:neg, 'preliminar');
reset role;

\echo '=== 11. recursos: exigidos × congelados'
-- Imagem que vem dos BLOCOS JÁ CONGELADOS na proposta (empresa sem modelo publicado): a v3 não a contava.
-- Caminho interno da empresa, como ficará depois do upload privado do P1b.
update public.propostas set capa_variante = 'minimalista',
  blocos_emitidos = '[{"tipo":"layout_instalacao","ordem":1,"ativo":true,"quebra_pagina":"auto","config":{"imagemUrl":"{{EMPRESA}}/layout.png"}}]'
  where negocio_id = :neg;
insert into public.proposta_identidades (empresa_id, logo_url) values (:empresa, '{{EMPRESA}}/logo.png');
insert into storage.buckets (id, name, public) values ('proposta-emitidas', 'proposta-emitidas', false);
insert into storage.objects (bucket_id, name, metadata) values
  ('proposta-emitidas', '{{EMPRESA}}/11111111-1111-1111-1111-111111111111/logo.png', '{"size": 2048, "mimetype": "image/png", "eTag": "\"e1\""}'),
  ('proposta-emitidas', '{{EMPRESA}}/11111111-1111-1111-1111-111111111111/layout.png', '{"size": 4096, "mimetype": "image/png", "eTag": "\"e2\""}'),
  ('proposta-emitidas', '{{EMPRESA}}/22222222-2222-2222-2222-222222222222/logo.svg', '{"size": 900, "mimetype": "image/svg+xml", "eTag": "\"e3\""}'),
  ('proposta-emitidas', '{{EMPRESA}}/33333333-3333-3333-3333-333333333333/logo.png', '{"size": 20971520, "mimetype": "image/png", "eTag": "\"e4\""}'),
  ('proposta-emitidas', '{{EMPRESA_OUTRA}}/44444444-4444-4444-4444-444444444444/logo.png', '{"size": 2048, "mimetype": "image/png", "eTag": "\"e5\""}'),
  ('proposta-emitidas', '{{EMPRESA}}/55555555-5555-5555-5555-555555555555/logo.png', '{"size": 2048, "mimetype": "image/png", "eTag": "\"e6\""}'),
  ('proposta-emitidas', '{{EMPRESA}}/55555555-5555-5555-5555-555555555555/layout.png', '{"size": 4096, "mimetype": "image/jpeg", "eTag": "\"e7\""}'),
  ('proposta-emitidas', '{{EMPRESA}}/66666666-6666-6666-6666-666666666666/logo.png', '{"size": 2048, "mimetype": "image/png", "eTag": "\"e8\""}');
set local role authenticated;
select numero, recursos_status as sem_recursos_informados, pg_temp.confere(numero = 4 and recursos_status = 'pendente', '11. sem recursos informados: pendente') as confere
  from public.emitir_proposta_versao(:neg, 'preliminar');
reset role;
\echo '(lista das imagens exigidas, lida como dono só para exibir; para o usuário a função é negada — item 5)'
select (select array_agg(e ->> 'origem' order by 1) from jsonb_array_elements(public.proposta_recursos_do_conteudo(
          jsonb_build_object('documento', documento, 'interno', dados_internos))) e) as exigidos
  from public.proposta_versoes where negocio_id = :neg and numero = 4;
select pg_temp.confere(count(*) = 1 and bool_and((select array_agg(e ->> 'origem' order by 1) from jsonb_array_elements(public.proposta_recursos_do_conteudo(
          jsonb_build_object('documento', documento, 'interno', dados_internos))) e) = '{bloco.1.imagem,identidade.logo}'), '11. exigidos: logo e imagem do bloco congelado')
  from public.proposta_versoes where negocio_id = :neg and numero = 4;
set local role authenticated;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar', '11111111-1111-1111-1111-111111111111',
    '[{"origem":"identidade.foto_capa","caminho_original":"x","caminho_congelado":"x"}]');
  raise exception 'FALHA: aceitou recurso que a proposta não usa' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Recurso não corresponde a nenhuma imagem usada pela proposta: identidade.foto_capa.', 'recurso não usado'); end $$;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar', '11111111-1111-1111-1111-111111111111',
    '[{"origem":"identidade.logo","caminho_original":"{{EMPRESA}}/OUTRO.png","caminho_congelado":"{{EMPRESA}}/11111111-1111-1111-1111-111111111111/logo.png"}]');
  raise exception 'FALHA: aceitou caminho original diferente' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Recurso não corresponde a nenhuma imagem usada pela proposta: identidade.logo.', 'caminho original diferente'); end $$;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar', '11111111-1111-1111-1111-111111111111',
    '[{"origem":"identidade.logo","caminho_original":"{{EMPRESA}}/logo.png","caminho_congelado":"{{EMPRESA}}/11111111-1111-1111-1111-111111111111/logo.png"},
      {"origem":"identidade.logo","caminho_original":"{{EMPRESA}}/logo.png","caminho_congelado":"{{EMPRESA}}/11111111-1111-1111-1111-111111111111/logo.png"}]');
  raise exception 'FALHA: aceitou duplicidade' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Recurso informado em duplicidade.', 'duplicidade'); end $$;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar', '22222222-2222-2222-2222-222222222222',
    '[{"origem":"identidade.logo","caminho_original":"{{EMPRESA}}/logo.png","caminho_congelado":"{{EMPRESA}}/22222222-2222-2222-2222-222222222222/logo.svg"}]');
  raise exception 'FALHA: aceitou SVG' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Tipo de arquivo não permitido para identidade.logo: image/svg+xml.', 'SVG'); end $$;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar', '33333333-3333-3333-3333-333333333333',
    '[{"origem":"identidade.logo","caminho_original":"{{EMPRESA}}/logo.png","caminho_congelado":"{{EMPRESA}}/33333333-3333-3333-3333-333333333333/logo.png"}]');
  raise exception 'FALHA: aceitou arquivo de 20 MB' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Tamanho de arquivo inválido para identidade.logo.', 'tamanho'); end $$;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar', '44444444-4444-4444-4444-444444444444',
    '[{"origem":"identidade.logo","caminho_original":"{{EMPRESA}}/logo.png","caminho_congelado":"{{EMPRESA_OUTRA}}/44444444-4444-4444-4444-444444444444/logo.png"}]');
  raise exception 'FALHA: aceitou arquivo da pasta de OUTRA empresa' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Recurso não encontrado na pasta desta emissão: identidade.logo.', 'pasta de outra empresa'); end $$;
select numero, recursos_status as so_logo_preservado, pg_temp.confere(numero = 5 and recursos_status = 'pendente', '11. só o logo: pendente') as confere
  from public.emitir_proposta_versao(:neg, 'preliminar', '11111111-1111-1111-1111-111111111111',
    jsonb_build_array(jsonb_build_object('origem', 'identidade.logo', 'caminho_original', '{{EMPRESA}}/logo.png',
      'caminho_congelado', '{{EMPRESA}}/11111111-1111-1111-1111-111111111111/logo.png')));
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar', '11111111-1111-1111-1111-111111111111', '[]');
  raise exception 'FALHA: reutilizou o identificador de emissão' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'duplicate key value violates unique constraint "proposta_versoes_emissao_unica"', 'identificador de emissão reutilizado'); end $$;
select numero, recursos_status as logo_e_layout_preservados,
       (select array_agg(r ->> 'origem' order by 1) from jsonb_array_elements(documento -> 'recursos') r) as recursos_no_documento,
       pg_temp.confere(numero = 6 and recursos_status = 'congelados' and jsonb_array_length(documento -> 'recursos') = 2, '11. logo e layout: congelados') as confere
  from public.emitir_proposta_versao(:neg, 'preliminar', '55555555-5555-5555-5555-555555555555',
    jsonb_build_array(
      jsonb_build_object('origem', 'identidade.logo', 'caminho_original', '{{EMPRESA}}/logo.png',
        'caminho_congelado', '{{EMPRESA}}/55555555-5555-5555-5555-555555555555/logo.png'),
      jsonb_build_object('origem', 'bloco.1.imagem', 'caminho_original', '{{EMPRESA}}/layout.png',
        'caminho_congelado', '{{EMPRESA}}/55555555-5555-5555-5555-555555555555/layout.png')));
reset role;
\echo '--- bloco com URL EXTERNA (como hoje): não tem como ser preservado no P1a, segue pendente'
update public.propostas set blocos_emitidos = '[{"tipo":"layout_instalacao","ordem":1,"ativo":true,"quebra_pagina":"auto","config":{"imagemUrl":"https://exemplo.invalido/layout.png"}}]'
  where negocio_id = :neg;
set local role authenticated;
select numero, recursos_status as url_externa, pg_temp.confere(numero = 7 and recursos_status = 'pendente', '11. URL externa: pendente') as confere
  from public.emitir_proposta_versao(:neg, 'preliminar', '66666666-6666-6666-6666-666666666666',
    jsonb_build_array(jsonb_build_object('origem', 'identidade.logo', 'caminho_original', '{{EMPRESA}}/logo.png',
      'caminho_congelado', '{{EMPRESA}}/66666666-6666-6666-6666-666666666666/logo.png')));
reset role;

\echo '=== 12. arquivamento'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio('{{NEG}}', 'teste'); raise exception 'FALHA: vendedor arquivou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio não encontrado.', 'vendedor não arquiva'); end $$;
do $$ declare n int; begin
  update public.negocios set arquivado_em = now(), motivo_arquivamento = 'atalho' where id = '{{NEG}}';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'ok (atalho pela API): nenhuma linha (RLS)'; else raise exception 'FALHA: arquivou direto pela API' using errcode = 'TF001'; end if;
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'atalho pela API'); end $$;
do $$ declare n int; begin
  update public.negocios set descricao = coalesce(descricao, '') where id = '{{NEG}}';
  get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if; raise notice 'sem regressão (vendedor edita o negócio): % linha(s)', n; end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :admin_teste, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio('{{NEG}}', '   '); raise exception 'FALHA: sem motivo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Informe o motivo do arquivamento.', 'sem motivo'); end $$;
select public.arquivar_negocio(:neg, 'Cliente desistiu (teste)');
select count(*) as versoes_visiveis_apos_arquivar, pg_temp.confere(count(*) = 7, '12. 7 versões visíveis após arquivar') as confere
  from public.proposta_versoes where negocio_id = :neg;
do $$ begin perform public.emitir_proposta_versao('{{NEG}}', 'preliminar'); raise exception 'FALHA: emitiu arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado: desarquive antes de emitir.', 'emitir arquivado'); end $$;
reset role;
set local role service_role;
select numero, jsonb_typeof(r -> 'documento') = 'object' as link_continua_apos_arquivar
  from t_tokens, public.obter_proposta_versao_publica(token) r order by numero;
select pg_temp.confere(count(*) = 2 and bool_and(jsonb_typeof(r -> 'documento') = 'object'), '12. links continuam após arquivar')
  from t_tokens, public.obter_proposta_versao_publica(token) r;
reset role;
set local role authenticated;
select public.desarquivar_negocio(:neg, 'Cliente voltou (teste)');
reset role;

\echo '=== 13. cancelamento registra autor; link cancelado não devolve documento'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select numero, situacao, situacao_alterada_por_membro_id is not null as autor_do_cancelamento,
       pg_temp.confere(situacao = 'cancelada' and situacao_alterada_por_membro_id is not null, '13. cancelamento registra autor') as confere
  from public.cancelar_proposta_versao((select id from public.proposta_versoes where negocio_id = :neg and numero = 1), 'teste');
reset role;
set local role service_role;
select numero, r ->> 'situacao' as situacao, jsonb_typeof(r -> 'documento') = 'object' as tem_documento
  from t_tokens, public.obter_proposta_versao_publica(token) r where numero = 1;
select pg_temp.confere(count(*) = 1 and bool_and(r ->> 'situacao' = 'cancelada' and r -> 'documento' = 'null'::jsonb), '13. link cancelado sem documento')
  from t_tokens, public.obter_proposta_versao_publica(token) r where numero = 1;
reset role;

\echo '=== 14. histórico: dono das tabelas (postgres, NÃO superusuário)'
select rolsuper as postgres_e_superusuario, pg_temp.confere(not rolsuper, '14. dono das tabelas não é superusuário') as confere from pg_roles where rolname = current_user;
do $$ begin update public.proposta_versoes set documento = '{}'::jsonb; raise exception 'FALHA: alterou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Versão de proposta emitida é imutável: só a situação pode mudar.', 'update documento'); end $$;
do $$ begin update public.proposta_versoes set emitida_por_nome = 'outro'; raise exception 'FALHA: alterou autoria' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Versão de proposta emitida é imutável: só a situação pode mudar.', 'update autoria'); end $$;
do $$ begin update public.proposta_versoes set motivo_cancelamento = 'trocado' where situacao = 'cancelada'; raise exception 'FALHA: trocou motivo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Motivo, data e autor só mudam junto com a situação.', 'trocar motivo sem mudar situação'); end $$;
do $$ begin delete from public.proposta_versoes; raise exception 'FALHA: apagou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Versão de proposta emitida não pode ser apagada.', 'delete'); end $$;
do $$ begin truncate public.proposta_versoes; raise exception 'FALHA: truncate' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Versões de proposta emitidas não podem ser apagadas em massa.', 'truncate'); end $$;
alter table public.proposta_versoes disable trigger proposta_versoes_imutavel;
do $$ begin update public.proposta_versoes set documento = '{"adulterado": true}'::jsonb where negocio_id = '{{NEG}}';
  raise exception 'FALHA: adulteração parcial aceita' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'new row for relation "proposta_versoes" violates check constraint "proposta_versoes_canonico_confere"', 'gatilho desligado, adulteração parcial barrada pela constraint'); end $$;
update public.proposta_versoes set documento = '{"adulterado": true}'::jsonb,
  conteudo_canonico = jsonb_build_object('documento', '{"adulterado": true}'::jsonb, 'interno', dados_internos)::text,
  conteudo_hash = encode(extensions.digest(jsonb_build_object('documento', '{"adulterado": true}'::jsonb, 'interno', dados_internos)::text, 'sha256'), 'hex')
  where negocio_id = :neg and numero = 2;
select 'LIMITE: dono com gatilho desligado reescreve documento, texto e hash juntos' as limite, count(*) as linhas
  from public.proposta_versoes where documento = '{"adulterado": true}'::jsonb;
select pg_temp.confere(count(*) = 1, '14. LIMITE documentado reproduzido (dono com gatilho desligado reescreve tudo)') from public.proposta_versoes where documento = '{"adulterado": true}'::jsonb;
alter table public.proposta_versoes enable trigger proposta_versoes_imutavel;

\echo '=== 15. representação canônica: hash recalculável fora do banco'
\pset tuples_only on
\pset format unaligned
\o /tmp/p1-canonico.txt
select conteudo_canonico from public.proposta_versoes where negocio_id = :neg and numero = 3;
\o
\pset tuples_only off
\pset format aligned
select conteudo_hash as hash_guardado_versao_3, canonicalizacao, hash_algoritmo from public.proposta_versoes where negocio_id = :neg and numero = 3;
select pg_temp.confere(count(*) = 1 and bool_and(canonicalizacao = 'pg-jsonb-text-v1' and hash_algoritmo = 'sha256' and conteudo_hash ~ '^[0-9a-f]{64}$'),
       '15. forma canônica e hash da versão 3') from public.proposta_versoes where negocio_id = :neg and numero = 3;

rollback;
\echo '--- ROLLBACK feito: nada foi gravado'
