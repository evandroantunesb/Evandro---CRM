-- Sonda: (1) dono mexendo direto nas colunas de arquivamento (sem RPC) e auditoria; (2) UPDATE isolado de
-- updated_at em negócio e filhos arquivados (service_role e dono); (3) controles legítimos (SET NULL por membro
-- apagado, nota). Tudo numa transação que termina em ROLLBACK. Só na cópia isolada.
\set ON_ERROR_STOP 1
\pset footer off
begin;

-- Executa como `p_papel` e desfaz. Devolve 'ALTEROU n', '0 linhas' ou 'RECUSADO: msg'; com `p_audit`, informa
-- quantas linhas novas de logs_auditoria a operação gerou para o negócio.
create function pg_temp.tenta(p_papel text, p_sql text, p_negocio uuid default null) returns text language plpgsql as $$
declare v_n bigint; v_a bigint; v_antes bigint;
begin
  select count(*) into v_antes from public.logs_auditoria where entidade = 'negocios' and entidade_id = p_negocio::text;
  begin
    perform set_config('role', p_papel, true);
    execute p_sql;
    get diagnostics v_n = row_count;
    perform set_config('role', 'postgres', true);
    select count(*) - v_antes into v_a from public.logs_auditoria where entidade = 'negocios' and entidade_id = p_negocio::text;
    raise exception using errcode = 'TF999', message = v_n::text || '|' || v_a::text;
  exception
    when sqlstate 'TF999' then
      return case when split_part(sqlerrm, '|', 1) = '0' then '0 linhas'
                  else 'ALTEROU ' || split_part(sqlerrm, '|', 1) || ' linha(s)' end
             || case when p_negocio is not null then '; auditoria nova: ' || split_part(sqlerrm, '|', 2) else '' end;
    when others then return 'RECUSADO: ' || sqlerrm;
  end;
end $$;

create temp table r (ordem serial, grupo text, cenario text, papel text, resultado text);
create temp table f (k text primary key, v uuid);
insert into f values ('arq', '86c22c3d-437b-457d-9fc6-7bafdb675cdc');
insert into f select 'empresa', empresa_id from public.negocios where id = (select v from f where k = 'arq');
insert into f select 'admin_user', user_id from public.empresa_membros where empresa_id = (select v from f where k = 'empresa') and papel = 'admin' and ativo order by id limit 1;
insert into f select 'admin_m', id from public.empresa_membros where user_id = (select v from f where k = 'admin_user') and empresa_id = (select v from f where k = 'empresa');
insert into f select 'resp', responsavel_id from public.negocios where id = (select v from f where k = 'arq');
-- negócio ativo novo, na mesma empresa, para o arquivamento direto
with n as (insert into public.negocios (empresa_id, titulo, contato_id, funil_id, etapa_id, responsavel_id)
           select empresa_id, 'Sonda ativo', contato_id, funil_id, etapa_id, responsavel_id from public.negocios where id = (select v from f where k = 'arq') returning id)
insert into f select 'ativo', id from n;
update public.tarefas set concluida_em = now(), resultado = 'contato_realizado' where negocio_id = (select v from f where k = 'ativo') and concluida_em is null;

-- Membro descartável (para o controle de SET NULL) e filhos extras no negócio que será arquivado.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sonda-e1@teste.raion', now(), now());
with m as (insert into public.empresa_membros (empresa_id, user_id, papel) select v, '00000000-0000-0000-0000-0000000000e1', 'vendedor' from f where k = 'empresa' returning id)
insert into f select 'descartavel', id from m;
-- admin descartável: é quem arquiva (controle: apagá-lo anula negocios.arquivado_por)
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sonda-e2@teste.raion', now(), now());
with m as (insert into public.empresa_membros (empresa_id, user_id, papel) select v, '00000000-0000-0000-0000-0000000000e2', 'admin' from f where k = 'empresa' returning id)
insert into f select 'admin_descartavel', id from m;
with t as (insert into public.tarefas (empresa_id, negocio_id, titulo, vence_em, responsavel_id, criado_por)
           select (select v from f where k = 'empresa'), (select v from f where k = 'arq'), 'Tarefa da sonda', now() + interval '1 day',
                  (select v from f where k = 'resp'), (select v from f where k = 'descartavel') returning id)
insert into f select 'tarefa', id from t;
update public.tarefas set concluida_em = now(), resultado = 'contato_realizado' where id = (select v from f where k = 'tarefa');
with a as (insert into public.atribuicoes_leads (empresa_id, negocio_id, membro_sugerido_id, expira_em)
           select (select v from f where k = 'empresa'), (select v from f where k = 'arq'), (select v from f where k = 'resp'), now() + interval '1 day' returning id)
insert into f select 'atrib', id from a;
select set_config('request.jwt.claims', json_build_object('sub', (select v from f where k = 'admin_user'), 'role', 'authenticated')::text, true) is not null as claims;
select public.decidir_atribuicao_lead((select v from f where k = 'atrib'), (select v from f where k = 'resp'), false);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000e2', 'role', 'authenticated')::text, true) is not null as claims_e2;
select public.arquivar_negocio((select v from f where k = 'arq'), 'Sonda dono/updated_at');
select set_config('request.jwt.claims', '', true) is not null as limpo;
insert into f select 'calculo', id from public.calculos_solares where negocio_id = (select v from f where k = 'arq') limit 1;
insert into f select 'kit', id from public.kit_componentes where negocio_id = (select v from f where k = 'arq') limit 1;
insert into f select 'proposta', id from public.propostas where negocio_id = (select v from f where k = 'arq') limit 1;
select count(*) filter (where v is not null) as fixtures, (select arquivado_em is not null from public.negocios where id = (select v from f where k = 'arq')) as arquivado from f;
create function pg_temp.id(p text) returns text language sql as $$ select quote_literal(v) from f where k = p $$;

-- (1) colunas de arquivamento sem RPC
insert into r (grupo, cenario, papel, resultado)
select '1. arquivamento sem RPC', c.cenario, p.papel, pg_temp.tenta(p.papel, c.sql, c.neg)
  from (values
    ('arquivar direto (arquivado_em, motivo, arquivado_por)', format('update public.negocios set arquivado_em = now(), motivo_arquivamento = %L, arquivado_por = %s where id = %s', 'direto', pg_temp.id('admin_m'), pg_temp.id('ativo')), (select v from f where k = 'ativo')),
    ('desarquivar direto (as 3 colunas nulas)', format('update public.negocios set arquivado_em = null, motivo_arquivamento = null, arquivado_por = null where id = %s', pg_temp.id('arq')), (select v from f where k = 'arq')),
    ('trocar só o motivo do arquivado', format('update public.negocios set motivo_arquivamento = %L where id = %s', 'motivo reescrito', pg_temp.id('arq')), (select v from f where k = 'arq')),
    ('trocar o autor (arquivado_por) do arquivado', format('update public.negocios set arquivado_por = %s where id = %s', pg_temp.id('descartavel'), pg_temp.id('arq')), (select v from f where k = 'arq')),
    ('trocar a data (arquivado_em) do arquivado', format('update public.negocios set arquivado_em = arquivado_em - interval %L where id = %s', '30 days', pg_temp.id('arq')), (select v from f where k = 'arq')),
    ('INSERT de negócio já arquivado', format('insert into public.negocios (empresa_id, titulo, contato_id, funil_id, etapa_id, responsavel_id, arquivado_em, motivo_arquivamento) select empresa_id, %L, contato_id, funil_id, etapa_id, responsavel_id, now(), %L from public.negocios where id = %s', 'Nasce arquivado', 'direto', pg_temp.id('ativo')), null::uuid)
  ) c(cenario, sql, neg)
  cross join (values ('service_role'), ('postgres')) p(papel);

-- (2) updated_at isolado no arquivado
insert into r (grupo, cenario, papel, resultado)
select '2. updated_at isolado', t.tabela, p.papel,
       pg_temp.tenta(p.papel, format('update public.%I set updated_at = now() - interval %L where id = %s', t.tabela, '1 hour', pg_temp.id(t.k)))
  from (values ('negocios', 'arq'), ('calculos_solares', 'calculo'), ('propostas', 'proposta'), ('tarefas', 'tarefa')) t(tabela, k)
  cross join (values ('service_role'), ('postgres')) p(papel);
-- kit_componentes e atribuicoes_leads não têm updated_at: UPDATE que não muda nada (set col = col)
insert into r (grupo, cenario, papel, resultado)
select '2. sem updated_at (no-op)', t.tabela || ' (set ' || t.col || ' = ' || t.col || ')', p.papel,
       pg_temp.tenta(p.papel, format('update public.%I set %I = %I where id = %s', t.tabela, t.col, t.col, pg_temp.id(t.k)))
  from (values ('kit_componentes', 'quantidade', 'kit'), ('atribuicoes_leads', 'status', 'atrib')) t(tabela, col, k)
  cross join (values ('service_role'), ('postgres')) p(papel);

-- (3) controles legítimos
insert into r (grupo, cenario, papel, resultado)
values ('3. legítimo', 'nota no arquivado', 'postgres',
        pg_temp.tenta('postgres', format('insert into public.notas (empresa_id, negocio_id, texto) values (%s, %s, %L)', pg_temp.id('empresa'), pg_temp.id('arq'), 'nota da sonda'))),
       ('3. legítimo', 'membro apagado (SET NULL em tarefas.criado_por do arquivado)', 'postgres',
        pg_temp.tenta('postgres', format('delete from public.empresa_membros where id = %s', pg_temp.id('descartavel')))),
       ('3. legítimo', 'membro que arquivou apagado (SET NULL em negocios.arquivado_por)', 'postgres',
        pg_temp.tenta('postgres', format('delete from public.empresa_membros where id = %s', pg_temp.id('admin_descartavel')))),
       ('3. legítimo', 'arquivar pela RPC (admin) num negócio ativo', 'postgres',
        pg_temp.tenta('postgres', format('select set_config(%L, %L, true), public.arquivar_negocio(%s, %L)', 'request.jwt.claims', json_build_object('sub', (select v from f where k = 'admin_user'), 'role', 'authenticated')::text, pg_temp.id('ativo'), 'via RPC'), (select v from f where k = 'ativo'))),
       ('3. legítimo', 'desarquivar pela RPC (admin)', 'postgres',
        pg_temp.tenta('postgres', format('select set_config(%L, %L, true), public.desarquivar_negocio(%s, %L)', 'request.jwt.claims', json_build_object('sub', (select v from f where k = 'admin_user'), 'role', 'authenticated')::text, pg_temp.id('arq'), 'via RPC'), (select v from f where k = 'arq')));

select grupo, cenario, papel, resultado from r order by ordem;
-- Controles de anulação feitos de verdade (as tentativas acima desfazem o próprio efeito):
delete from public.empresa_membros where id in ((select v from f where k = 'descartavel'), (select v from f where k = 'admin_descartavel'));
select 'depois dos controles' as conferencia,
       (select criado_por is null from public.tarefas where id = (select v from f where k = 'tarefa')) as tarefa_criado_por_anulado,
       (select arquivado_em is not null and arquivado_por is null from public.negocios where id = (select v from f where k = 'arq')) as negocio_segue_arquivado_sem_autor,
       current_setting('raion.arquivamento_negocio', true) as marca_ao_fim;
rollback;
