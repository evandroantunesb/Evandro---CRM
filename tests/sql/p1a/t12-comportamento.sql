-- v6 (conjunto P1a-0 + P1a-1, fail-closed: cada resultado é conferido): mesmo teste da v4, com os IDs fixos trocados por marcadores {{...}} que o
-- executor (executar-testes.sh) preenche com o cenário do banco local (cenario.sql).
-- Teste de comportamento do SQL do P1 no banco LOCAL, inteiro dentro de uma transação revertida.
-- Nada é gravado: a última linha é ROLLBACK.
\set ON_ERROR_STOP 1
begin;
\i /tmp/p1v10-assercoes.sql
\i /tmp/p1v10-01.sql
\i /tmp/p1v10-02.sql
\i /tmp/p1v10-emissao-fechada.sql

-- Cenário (dados fictícios da base local de teste)
\set neg '''{{NEG}}'''
\set vendedor '''{{VENDEDOR}}'''
\set sdr '''{{SDR}}'''
\set outro '''{{OUTRO}}'''

\echo '--- 1. vendedor emite v1 (preliminar)'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select numero, tipo, origem, situacao, recursos_status, length(conteudo_hash) as tam_hash,
       pg_temp.confere(numero = 1 and tipo = 'preliminar' and origem = 'emitida' and situacao = 'vigente'
                       and recursos_status = 'nenhum_necessario' and length(conteudo_hash) = 64, '1. v1 preliminar emitida e vigente') as confere
  from public.emitir_proposta_versao(:neg, 'preliminar');

\echo '--- 2. definitiva é recusada (pendências reais ainda não validadas)'
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'definitiva');
  raise exception 'FALHA: definitiva aceita' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Emissão definitiva indisponível: parâmetros econômicos (tarifa, Fio B e enquadramento) não validados; compatibilidade técnica do kit não verificada.', 'ok'); end $$;

\echo '--- 3. v2 substitui v1 na mesma transação'
select numero, situacao, pg_temp.confere(numero = 2 and situacao = 'vigente', '3. v2 emitida vigente') as confere from public.emitir_proposta_versao(:neg, 'preliminar');
select numero, situacao, situacao_alterada_em is not null as data_marcada from public.proposta_versoes where negocio_id = :neg order by numero;
select pg_temp.confere(count(*) = 2 and bool_and((numero = 1 and situacao = 'substituida' and situacao_alterada_em is not null)
                       or (numero = 2 and situacao = 'vigente' and situacao_alterada_em is null)), '3. v1 substituída com data; v2 vigente')
  from public.proposta_versoes where negocio_id = :neg;

\echo '--- 4. escrita direta pelo usuário é recusada'
do $$ begin
  update public.proposta_versoes set documento = '{}'::jsonb where negocio_id = '{{NEG}}';
  raise exception 'FALHA: update direto aceito' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for table proposta_versoes', 'authenticated update'); end $$;
do $$ begin
  insert into public.proposta_versoes (empresa_id, proposta_id, negocio_id, numero, tipo, documento, conteudo_hash, recursos_status)
    select empresa_id, proposta_id, negocio_id, 99, 'preliminar', '{}'::jsonb, repeat('0', 64), 'nenhum_necessario'
    from public.proposta_versoes where negocio_id = '{{NEG}}' limit 1;
  raise exception 'FALHA: insert direto aceito' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for table proposta_versoes', 'authenticated insert'); end $$;

\echo '--- 5. hash confere'
select numero, public.proposta_versao_hash_confere(id) as hash_confere from public.proposta_versoes where negocio_id = :neg order by numero;
select pg_temp.confere(count(*) = 2 and bool_and(public.proposta_versao_hash_confere(id)), '5. hash das 2 versões confere')
  from public.proposta_versoes where negocio_id = :neg;

\echo '--- 6. cancelar a v1 (substituída) com motivo'
select numero, situacao, motivo_cancelamento, pg_temp.confere(situacao = 'cancelada' and motivo_cancelamento is not null, '6. v1 cancelada com motivo') as confere
  from public.cancelar_proposta_versao(
  (select id from public.proposta_versoes where negocio_id = :neg and numero = 1), 'Enviada ao contato errado (teste)');

\echo '--- 7. SDR da mesma empresa e vendedor de outra empresa não emitem'
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar');
  raise exception 'FALHA: SDR emitiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Você não pode emitir proposta deste negócio.', 'SDR'); end $$;
select count(*) as versoes_visiveis_ao_sdr, pg_temp.confere(count(*) = 0, '7. SDR não vê versões') as confere from public.proposta_versoes where negocio_id = :neg;
select set_config('request.jwt.claims', json_build_object('sub', :outro, 'role', 'authenticated')::text, true) is not null as ok;
do $$ begin
  perform public.emitir_proposta_versao('{{NEG}}', 'preliminar');
  raise exception 'FALHA: outra empresa emitiu' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Você não pode emitir proposta deste negócio.', 'outra empresa'); end $$;
select count(*) as versoes_visiveis_outra_empresa, pg_temp.confere(count(*) = 0, '7. outra empresa não vê versões') as confere from public.proposta_versoes where negocio_id = :neg;
reset role;

\echo '--- 8. mudar cálculo, kit e exibição NÃO muda a versão emitida'
update public.calculos_solares set economia_mensal = economia_mensal + 1000, kit_preco = kit_preco + 5000 where negocio_id = :neg;
update public.propostas set modo_preco = 'sem_preco', mostrar_economia = false where negocio_id = :neg;
-- v6: com parâmetros econômicos não validados, a economia não sai no documento; a versão guarda o valor da
-- emissão nos dados internos (auditoria), e é ele que não pode mudar.
select v.numero,
       v.dados_internos -> 'resultados_economicos' ->> 'economia_mensal' as economia_na_versao,
       c.economia_mensal as economia_atual,
       v.documento -> 'exibicao' ->> 'modo_preco' as preco_na_versao,
       p.modo_preco as preco_atual,
       public.proposta_versao_hash_confere(v.id) is null as hash_so_para_quem_ve,
       pg_temp.confere((v.dados_internos -> 'resultados_economicos' ->> 'economia_mensal')::numeric = c.economia_mensal - 1000
                       and v.documento -> 'exibicao' ->> 'modo_preco' = 'completo' and p.modo_preco::text = 'sem_preco'
                       and public.proposta_versao_hash_confere(v.id) is null, '8. versão ' || v.numero || ' inalterada') as confere
from public.proposta_versoes v
join public.calculos_solares c on c.negocio_id = v.negocio_id
join public.propostas p on p.id = v.proposta_id
where v.negocio_id = :neg order by v.numero;
select pg_temp.confere(count(*) = 2, '8. as 2 versões conferidas') from public.proposta_versoes where negocio_id = :neg;
\echo '--- 8b. v7: preliminar sem parâmetros econômicos validados não expõe conta sem solar, conta com solar, economia nem payback'
select pg_temp.confere(count(*) = 2 and bool_and(
         documento -> 'calculo' -> 'economia_mensal' = 'null'::jsonb and documento -> 'calculo' -> 'conta_com_solar' = 'null'::jsonb
         and documento -> 'calculo' -> 'conta_sem_solar' = 'null'::jsonb
         and dados_internos -> 'resultados_economicos' ->> 'situacao' = 'nao_validados'
         and dados_internos -> 'resultados_economicos' ->> 'conta_sem_solar' is not null
         and documento -> 'calculo' -> 'payback_meses' = 'null'::jsonb
         and documento -> 'emissao' ->> 'resultados_economicos' = 'pendentes'
         and documento -> 'emissao' ->> 'aviso_economico' like 'Estimativa preliminar:%'
         and dados_internos -> 'resultados_economicos' ->> 'economia_mensal' is not null
         and dados_internos -> 'resultados_economicos' ->> 'conta_com_solar' is not null
         and dados_internos -> 'resultados_economicos' ->> 'payback_meses' is not null),
       '8b. documento sem os 4 resultados, com aviso; valores guardados nos dados internos como não validados')
  from public.proposta_versoes where negocio_id = :neg;

\echo '--- 9. com o gatilho ligado, nem o dono das tabelas (postgres, que NÃO é superusuário) nem o service_role alteram conteúdo ou ressuscitam versão'
do $$ begin
  update public.proposta_versoes set documento = '{}'::jsonb where negocio_id = '{{NEG}}';
  raise exception 'FALHA: postgres alterou conteúdo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Versão de proposta emitida é imutável: só a situação pode mudar.', 'postgres update conteúdo'); end $$;
do $$ begin
  update public.proposta_versoes set situacao = 'vigente' where negocio_id = '{{NEG}}' and numero = 1;
  raise exception 'FALHA: cancelada voltou a vigente' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Transição de situação não permitida (cancelada -> vigente).', 'cancelada -> vigente'); end $$;
do $$ begin
  delete from public.proposta_versoes where negocio_id = '{{NEG}}';
  raise exception 'FALHA: delete direto aceito' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Versão de proposta emitida não pode ser apagada.', 'delete direto'); end $$;
set local role service_role;
do $$ begin
  update public.proposta_versoes set documento = '{}'::jsonb;
  raise exception 'FALHA: service_role alterou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'permission denied for table proposta_versoes', 'service_role update'); end $$;
reset role;

\echo '--- 10. reconstrução legada: recusada aqui (já há versões); rótulo visível quando permitida'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin
  perform public.reconstruir_proposta_legada('{{NEG}}');
  raise exception 'FALHA: reconstruiu com versões existentes' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Esta proposta já tem versões emitidas.', 'já tem versões'); end $$;
reset role;

\echo '--- 11. exclusão do negócio com versões é RECUSADA (v4: sem cascata; o caminho é arquivar)'
do $$ begin
  delete from public.negocios where id = '{{NEG}}';
  raise exception 'FALHA: negócio com versões apagado; versões restantes = %', (select count(*) from public.proposta_versoes where negocio_id = '{{NEG}}') using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'update or delete on table "negocios" violates foreign key constraint "proposta_versoes_negocio_id_empresa_id_fkey" on table "proposta_versoes"', 'exclusão recusada'); end $$;

rollback;
\echo '--- ROLLBACK feito: nada foi gravado'
