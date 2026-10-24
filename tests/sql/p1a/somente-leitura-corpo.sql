-- v9 (fail-closed). Somente leitura do negócio arquivado, rotinas do M1 e ausência de efeitos indiretos.
-- Incluído por t01 (só a P1a-0) e por t12-arquivamento (P1a-0 + P1a-1). Requer cenario.sql e assercoes.sql.

-- Retrato de TODAS as tabelas de public, menos `negocios` (conferida à parte), `logs_auditoria` (recebe o registro)
-- e as tabelas de `p_excluir` (as que o caso testado deve mudar).
create function pg_temp.retrato_public(p_excluir text[] default '{}') returns jsonb
language plpgsql as $$
declare
  v_tabela text;
  v_hash text;
  v_saida jsonb := '{}';
begin
  for v_tabela in select tablename from pg_tables where schemaname = 'public' and tablename not in ('negocios', 'logs_auditoria')
                    and tablename <> all (p_excluir) order by 1 loop
    execute format('select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from public.%I t', v_tabela) into v_hash;
    v_saida := v_saida || jsonb_build_object(v_tabela, v_hash);
  end loop;
  return v_saida;
end;
$$;

update public.empresa_membros set papel = 'admin' where user_id = :sdr and empresa_id = :empresa;

\echo '=== S1. arquivar e desarquivar não geram evento, ponto, comissão, meta, atividade, tarefa nem marca de obra'
-- Gatilhos diferidos (ex.: venda alterada da obra) rodam já, dentro do teste, e não só no commit.
set constraints all immediate;
create temp table t_antes on commit drop as
  select pg_temp.retrato_public() as retrato, (select to_jsonb(n) from public.negocios n where n.id = :neg) as negocio,
         (select count(*) from public.logs_auditoria) as logs;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select pg_temp.confere(public.arquivar_negocio(:neg, 'Teste de efeitos')::text = '', 'S1. arquivou');
reset role;
select pg_temp.confere((select retrato from t_antes) = pg_temp.retrato_public(), 'S1. arquivar: nenhuma outra tabela de public mudou (eventos, pontos, comissões, metas, atividades, tarefas, obras...)');
select pg_temp.confere((to_jsonb(n) - array['updated_at', 'arquivado_em', 'arquivado_por', 'motivo_arquivamento'])
                       = ((select negocio from t_antes) - array['updated_at', 'arquivado_em', 'arquivado_por', 'motivo_arquivamento']),
                       'S1. arquivar: no negócio só mudaram as colunas de arquivamento') from public.negocios n where n.id = :neg;
set local role authenticated;
select pg_temp.confere(public.desarquivar_negocio(:neg, 'Teste de efeitos')::text = '', 'S1. desarquivou');
reset role;
select pg_temp.confere((select retrato from t_antes) = pg_temp.retrato_public(), 'S1. desarquivar: nenhuma outra tabela de public mudou');
select pg_temp.confere((to_jsonb(n) - 'updated_at') = ((select negocio from t_antes) - 'updated_at'), 'S1. desarquivar: negócio igual ao original')
  from public.negocios n where n.id = :neg;
select pg_temp.confere((select count(*) from public.logs_auditoria) = (select logs from t_antes) + 2
         and (select count(*) from public.logs_auditoria where entidade = 'negocios' and entidade_id = (select neg::text from cen)
              and acao in ('arquivar', 'desarquivar') and created_at = now()) >= 2,
       'S1. em logs_auditoria entraram exatamente os 2 registros (arquivar e desarquivar)');

\echo '=== S2. negócio arquivado é somente leitura por qualquer caminho; notas continuam'
\echo '--- S2a. v7: tarefas abertas impedem o arquivamento; a mensagem diz quantas; nada é concluído nem cancelado sozinho'
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
with x as (insert into public.tarefas (empresa_id, negocio_id, titulo, vence_em, responsavel_id)
           select empresa, neg, t, now() + interval '1 day', vendedor_membro from cen, unnest(array['Retornar ao cliente (teste)', 'Enviar documentos (teste)']) t
           returning id)
select pg_temp.confere(count(*) = 2, 'S2a. 2 tarefas abertas criadas pelo vendedor') from x;
reset role;
create temp table t_tarefas on commit drop as select id from public.tarefas where negocio_id = :neg and concluida_em is null;
grant select on t_tarefas to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: arquivou com 2 tarefas abertas' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Há 2 tarefas abertas neste negócio: conclua ou exclua as tarefas antes de arquivar.', '2 tarefas abertas'); end $$;
reset role;
select pg_temp.confere(count(*) = 2 and bool_and(concluida_em is null), 'S2a. recusa não concluiu nem cancelou as tarefas')
  from public.tarefas where id in (select id from t_tarefas);
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
with x as (update public.tarefas set concluida_em = now() where id = (select min(id::text)::uuid from t_tarefas) returning id)
select pg_temp.confere(count(*) = 1, 'S2a. vendedor conclui 1 das 2 tarefas') from x;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: arquivou com 1 tarefa aberta' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Há 1 tarefa aberta neste negócio: conclua ou exclua a tarefa antes de arquivar.', '1 tarefa aberta'); end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
with x as (update public.tarefas set concluida_em = now() where id in (select id from t_tarefas) and concluida_em is null returning id)
select pg_temp.confere(count(*) = 1, 'S2a. vendedor conclui a outra tarefa') from x;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select pg_temp.confere(public.arquivar_negocio(:neg, 'Teste somente leitura')::text = '', 'S2. arquivou (sem tarefas abertas)');
reset role;
-- vendedor responsável, pela API
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin update public.negocios set valor = coalesce(valor, 0) + 1 where id = (select neg from cen); raise exception 'FALHA: vendedor alterou valor' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'vendedor altera valor'); end $$;
do $$ begin update public.negocios set titulo = titulo || ' x' where id = (select neg from cen); raise exception 'FALHA: vendedor alterou título' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'vendedor altera título'); end $$;
do $$ begin update public.negocios set etapa_id = (select e.id from public.etapas e join public.negocios n on n.funil_id = e.funil_id
                                                    where n.id = (select neg from cen) and e.id <> n.etapa_id and e.ativa limit 1)
            where id = (select neg from cen); raise exception 'FALHA: vendedor mudou etapa' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'vendedor muda etapa'); end $$;
do $$ begin update public.negocios set responsavel_id = null where id = (select neg from cen); raise exception 'FALHA: anulou responsável pela API' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'anular responsável pela API'); end $$;
do $$ begin update public.calculos_solares set economia_mensal = economia_mensal + 1 where negocio_id = (select neg from cen); raise exception 'FALHA: alterou cálculo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'altera cálculo'); end $$;
do $$ begin delete from public.calculos_solares where negocio_id = (select neg from cen); raise exception 'FALHA: apagou cálculo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'apaga cálculo'); end $$;
do $$ begin update public.kit_componentes set quantidade = quantidade + 1 where negocio_id = (select neg from cen); raise exception 'FALHA: alterou kit' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'altera kit'); end $$;
do $$ begin insert into public.kit_componentes (empresa_id, negocio_id, tipo, descricao) select empresa, neg, 'outro', 'teste' from cen; raise exception 'FALHA: incluiu item no kit' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'inclui item no kit'); end $$;
do $$ begin insert into public.propostas (empresa_id, negocio_id) select empresa, neg from cen; raise exception 'FALHA: criou proposta' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'cria proposta'); end $$;
do $$ begin insert into public.tarefas (empresa_id, negocio_id, titulo, vence_em) select empresa, neg, 'teste', now() + interval '1 day' from cen; raise exception 'FALHA: criou tarefa' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'cria tarefa'); end $$;
do $$ begin update public.tarefas set concluida_em = null where id in (select id from t_tarefas);
  if not found then raise exception 'FALHA: tarefa do cenário não encontrada' using errcode = 'TF001'; end if;
  raise exception 'FALHA: reabriu tarefa' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'reabre tarefa'); end $$;
do $$ begin insert into public.anexos (empresa_id, negocio_id, nome, caminho, tamanho) select empresa, neg, 'x.pdf', empresa || '/x.pdf', 1 from cen; raise exception 'FALHA: incluiu anexo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'inclui anexo'); end $$;
with x as (insert into public.notas (empresa_id, negocio_id, texto) select empresa, neg, 'Observação no arquivado (teste)' from cen returning id)
select pg_temp.confere(count(*) = 1, 'S2. nota (observação administrativa) continua permitida') from x;
reset role;
-- admin, pela API
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin delete from public.negocios where id = (select neg from cen); raise exception 'FALHA: admin apagou arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado não pode ser apagado: desarquive antes.', 'admin apaga arquivado'); end $$;
do $$ begin update public.negocios set valor = coalesce(valor, 0) + 1 where id = (select neg from cen); raise exception 'FALHA: admin alterou valor' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'admin altera valor'); end $$;
reset role;
-- service_role (chave de servidor; ignora RLS)
set local role service_role;
do $$ begin update public.negocios set titulo = titulo || ' x' where id = (select neg from cen); raise exception 'FALHA: service_role alterou' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'service_role altera negócio'); end $$;
do $$ begin update public.kit_componentes set quantidade = quantidade + 1 where negocio_id = (select neg from cen); raise exception 'FALHA: service_role alterou kit' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'service_role altera kit'); end $$;
reset role;
-- dono (o mesmo papel das funções SECURITY DEFINER do M1)
do $$ begin update public.negocios set valor = coalesce(valor, 0) + 1 where id = (select neg from cen); raise exception 'FALHA: dono alterou valor' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'dono altera valor'); end $$;
do $$ begin update public.tarefas set titulo = titulo || ' x' where negocio_id = (select neg from cen);
  if not found then raise exception 'FALHA: tarefa do cenário não encontrada' using errcode = 'TF001'; end if;
  raise exception 'FALHA: dono alterou tarefa' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'dono altera tarefa'); end $$;
do $$ begin delete from public.empresas where id = (select empresa from cen); raise exception 'FALHA: apagou empresa com negócio arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm,
  -- Apagar a empresa dispara cascatas em ordem que depende dos OIDs das FKs: ou o DELETE do negócio arquivado chega primeiro
  -- (mensagem de exclusão), ou um SET NULL anula uma referência dele antes (mensagem de somente leitura). Os dois recusam.
  case when sqlerrm = 'Negócio arquivado é somente leitura: desarquive antes de alterar.' then sqlerrm
       else 'Negócio arquivado não pode ser apagado: desarquive antes.' end,
  'apagar empresa com negócio arquivado'); end $$;
\echo '--- S2e. v7: etiquetas seguem editáveis no arquivado, sem nenhum efeito indireto'
insert into public.etiquetas (empresa_id, nome) select empresa, 'Etiqueta de teste P1 v7' from cen;
create temp table t_etq on commit drop as
  select (select id from public.etiquetas where empresa_id = :empresa and nome = 'Etiqueta de teste P1 v7') as etiqueta,
         pg_temp.retrato_public(array['negocio_etiquetas']) as retrato,
         (select to_jsonb(n) from public.negocios n where n.id = :neg) as negocio,
         (select count(*) from public.logs_auditoria) as logs;
grant select on t_etq to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
with x as (insert into public.negocio_etiquetas (negocio_id, etiqueta_id, empresa_id) select neg, (select etiqueta from t_etq), empresa from cen returning negocio_id)
select pg_temp.confere(count(*) = 1, 'S2e. vendedor marca etiqueta no negócio arquivado') from x;
with x as (delete from public.negocio_etiquetas where negocio_id = (select neg from cen) and etiqueta_id = (select etiqueta from t_etq) returning negocio_id)
select pg_temp.confere(count(*) = 1, 'S2e. vendedor desmarca a etiqueta') from x;
with x as (insert into public.negocio_etiquetas (negocio_id, etiqueta_id, empresa_id) select neg, (select etiqueta from t_etq), empresa from cen returning negocio_id)
select pg_temp.confere(count(*) = 1, 'S2e. vendedor marca de novo (fica marcada)') from x;
reset role;
select pg_temp.confere((select retrato from t_etq) = pg_temp.retrato_public(array['negocio_etiquetas']),
       'S2e. etiqueta: nenhuma outra tabela mudou (eventos, pontos, comissões, metas, atividades, tarefas, notificações...)');
select pg_temp.confere(to_jsonb(n) = (select negocio from t_etq), 'S2e. etiqueta: o negócio não mudou (nem updated_at)') from public.negocios n where n.id = :neg;
select pg_temp.confere((select count(*) from public.logs_auditoria) = (select logs from t_etq), 'S2e. etiqueta: nada na auditoria');
select pg_temp.confere(count(*) = 1, 'S2e. etiqueta marcada no arquivado') from public.negocio_etiquetas where negocio_id = :neg and etiqueta_id = (select etiqueta from t_etq);

\echo '--- S2n. v7: nota administrativa no arquivado não gera recompensa, mesmo com regra ATIVA para note.created'
insert into public.gamification_rules (empresa_id, nome, evento_tipo, xp, moedas) select empresa, 'Teste P1 v7: nota', 'note.created', 10, 10 from cen;
create temp table t_nota on commit drop as
  select (select count(*) from public.point_ledger) as pontos, pg_temp.retrato_public(array['notas', 'eventos']) as retrato;
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
with x as (insert into public.notas (empresa_id, negocio_id, texto) select empresa, neg, 'Nota administrativa no arquivado (teste v7)' from cen returning id)
select pg_temp.confere(count(*) = 1, 'S2n. vendedor registra nota no negócio arquivado') from x;
reset role;
select pg_temp.confere((select count(*) from public.point_ledger) = (select pontos from t_nota), 'S2n. nota no arquivado: 0 XP e 0 moedas');
select pg_temp.confere((select retrato from t_nota) = pg_temp.retrato_public(array['notas', 'eventos']),
       'S2n. nota no arquivado: nenhuma outra tabela mudou (pontos, conquistas, comissões, metas, tarefas...)');
select pg_temp.confere(exists (select 1 from public.eventos e join public.notas n on n.id = e.entidade_id
                               where e.tipo = 'note.created' and n.negocio_id = :neg and n.texto = 'Nota administrativa no arquivado (teste v7)'),
       'S2n. histórico do M1 preservado: evento note.created registrado');

\echo '--- S2c. CONTROLE POSITIVO (v8: por ação real) — no mesmo cenário, pontuação comercial legítima CONTINUA creditando'
-- Prova que os "0 pontos" acima vêm da exclusão estrutural do M1, e não de um motor parado ou de um cenário que
-- nunca pontuaria. Regra do repositório: nada é inserido à mão em eventos/point_ledger — o evento deal.won nasce do
-- gatilho do M1 quando outro negócio (não arquivado) da empresa é ganho. Tudo revertido no savepoint.
savepoint s_controle;
insert into public.gamification_rules (empresa_id, nome, evento_tipo, xp, moedas) select empresa, 'Teste P1 v8: controle', 'deal.won', 7, 3 from cen;
create temp table t_controle on commit drop as select count(*) as pontos from public.point_ledger;
update public.negocios set responsavel_id = (select vendedor_membro from cen), valor = 1000, status = 'ganho' where id = :neg_sem_versao;
select pg_temp.confere(exists (select 1 from public.eventos where entidade_id = (select neg_sem_versao from cen) and tipo = 'deal.won'),
       'S2c. o ganho gerou deal.won pelo gatilho do M1');
select pg_temp.confere(exists (select 1 from public.point_ledger l join public.gamification_rules r on r.id = l.regra_id
                               where r.nome = 'Teste P1 v8: controle' and l.xp = 7 and l.moedas = 3
                                 and l.membro_id = (select vendedor_membro from cen) and l.referencia_id = (select neg_sem_versao from cen)),
       'S2c. pontuação legítima intacta: o ganho credita 7 XP e 3 moedas ao responsável');
rollback to savepoint s_controle;

\echo '--- S2p. v8: pendências que o arquivar confere não nascem em negócio arquivado'
do $$ begin insert into public.atribuicoes_leads (empresa_id, negocio_id, membro_sugerido_id, expira_em) select empresa, neg, vendedor_membro, now() + interval '1 hour' from cen;
  raise exception 'FALHA: distribuição criada no arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'distribuição de lead no arquivado'); end $$;
do $$ begin insert into public.contratos (empresa_id, negocio_id, conteudo) select empresa, neg, 'Contrato no arquivado (teste)' from cen;
  raise exception 'FALHA: contrato criado no arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'contrato no arquivado'); end $$;
-- v9: distribuição, contrato e obra em INSERT e UPDATE; registro e confirmação de pagamento só INSERT (imutáveis no M1).
select pg_temp.confere(count(*) = 5 and bool_and(t.tgenabled = 'O' and p.proname = 'negocio_arquivado_bloquear_filho' and (t.tgtype & 4) <> 0 and (t.tgtype & 8) = 0
                         and ((t.tgtype & 16) <> 0) = (t.tgname in ('atribuicoes_leads_arquivado_somente_leitura', 'contratos_arquivado_somente_leitura', 'obras_arquivado_somente_leitura'))),
       'S2p. gatilhos: distribuição, contrato e obra em INSERT+UPDATE; registro e confirmação de pagamento só INSERT')
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where t.tgname in ('atribuicoes_leads_arquivado_somente_leitura', 'contratos_arquivado_somente_leitura', 'registros_pagamento_arquivado_somente_leitura',
                    'confirmacoes_pagamento_arquivado_somente_leitura', 'obras_arquivado_somente_leitura');

\echo '--- S2q. v9: distribuição, contrato e obra não ENTRAM no arquivado por UPDATE (service_role e dono)'
savepoint s_vinculos;
create temp table vinc on commit drop as
select (select n.id from public.negocios n where n.empresa_id = (select empresa from cen) and n.id <> (select neg from cen) and n.arquivado_em is null order by n.id limit 1) as outro,
       (select c.id from public.contratos c order by c.id limit 1) as contrato,
       (select o.id from public.obras o order by o.id limit 1) as obra;
grant select on vinc to service_role;
select pg_temp.confere(outro is not null and contrato is not null and obra is not null, 'S2q. cenário: outro negócio ativo, um contrato e uma obra') from vinc;
insert into public.atribuicoes_leads (empresa_id, negocio_id, membro_sugerido_id, expira_em)
select (select empresa from cen), outro, (select vendedor_membro from cen), now() + interval '1 hour' from vinc;
set local role service_role;
do $$ begin update public.atribuicoes_leads set negocio_id = (select neg from cen) where negocio_id = (select outro from vinc) and status = 'pendente';
  raise exception 'FALHA: service_role transferiu distribuição pendente para o arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'service_role: distribuição → arquivado'); end $$;
do $$ begin update public.contratos set negocio_id = (select neg from cen) where id = (select contrato from vinc);
  raise exception 'FALHA: service_role transferiu contrato para o arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'service_role: contrato → arquivado'); end $$;
reset role;
do $$ begin update public.obras set negocio_id = (select neg from cen) where id = (select obra from vinc);
  raise exception 'FALHA: dono transferiu obra para o arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'dono: obra → arquivado'); end $$;
select pg_temp.confere(not exists (select 1 from public.atribuicoes_leads where negocio_id = (select neg from cen) and status = 'pendente')
                       and not exists (select 1 from public.contratos where negocio_id = (select neg from cen))
                       and not exists (select 1 from public.obras where negocio_id = (select neg from cen)),
       'S2q. arquivado segue sem distribuição pendente, contrato ou obra') ;
rollback to savepoint s_vinculos;

\echo '--- S2r. v10: arquivamento só pelas funções (até o dono) e arquivado sem toque (updated_at isolado, UPDATE sem mudança)'
savepoint s_dono;
select pg_temp.confere(exists (select 1 from public.calculos_solares where negocio_id = (select neg from cen)), 'S2r. cenário: arquivado com cálculo');
do $$ begin update public.negocios set arquivado_em = null, arquivado_por = null, motivo_arquivamento = null where id = (select neg from cen);
  raise exception 'FALHA: dono desarquivou direto, sem auditoria' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'dono: desarquivar direto'); end $$;
do $$ begin update public.negocios set arquivado_em = now(), motivo_arquivamento = 'direto' where id = (select n.id from public.negocios n where n.empresa_id = (select empresa from cen) and n.arquivado_em is null order by n.id limit 1);
  raise exception 'FALHA: dono arquivou direto, sem auditoria' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'dono: arquivar direto'); end $$;
do $$ begin insert into public.negocios (empresa_id, titulo, contato_id, funil_id, etapa_id, arquivado_em, motivo_arquivamento) select empresa_id, 'Nasce arquivado (teste)', contato_id, funil_id, etapa_id, now(), 'direto' from public.negocios where id = (select neg from cen);
  raise exception 'FALHA: dono criou negócio já arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'dono: INSERT já arquivado'); end $$;
do $$ begin update public.negocios set updated_at = now() - interval '1 day' where id = (select neg from cen);
  raise exception 'FALHA: dono mudou só o updated_at do arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'dono: updated_at do negócio'); end $$;
do $$ begin update public.calculos_solares set updated_at = now() - interval '1 day' where negocio_id = (select neg from cen);
  raise exception 'FALHA: dono mudou só o updated_at do cálculo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'dono: updated_at do cálculo'); end $$;
do $$ begin update public.calculos_solares set economia_mensal = economia_mensal where negocio_id = (select neg from cen);
  raise exception 'FALHA: dono fez UPDATE sem mudança (toque) no cálculo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'dono: UPDATE sem mudança no cálculo'); end $$;
set local role service_role;
do $$ begin insert into public.negocios (empresa_id, titulo, contato_id, funil_id, etapa_id, arquivado_em, motivo_arquivamento) select empresa_id, 'Nasce arquivado (teste)', contato_id, funil_id, etapa_id, now(), 'direto' from public.negocios where id = (select neg from cen);
  raise exception 'FALHA: service_role criou negócio já arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Use arquivar ou desarquivar para mudar o arquivamento.', 'service_role: INSERT já arquivado'); end $$;
do $$ begin update public.negocios set updated_at = now() - interval '1 day' where id = (select neg from cen);
  raise exception 'FALHA: service_role mudou só o updated_at do arquivado' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'service_role: updated_at do negócio'); end $$;
do $$ begin update public.calculos_solares set updated_at = now() - interval '1 day' where negocio_id = (select neg from cen);
  raise exception 'FALHA: service_role mudou só o updated_at do cálculo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio arquivado é somente leitura: desarquive antes de alterar.', 'service_role: updated_at do cálculo'); end $$;
reset role;
select pg_temp.confere(current_setting('raion.arquivamento_negocio', true) is distinct from (select neg from cen)::text, 'S2r. a marca das funções não fica valendo para o negócio');
rollback to savepoint s_dono;
-- desarquivado, volta a ser editável
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select pg_temp.confere(public.desarquivar_negocio(:neg, 'Teste somente leitura')::text = '', 'S2. desarquivou');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :vendedor, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ declare n int; begin
  update public.calculos_solares set economia_mensal = economia_mensal where negocio_id = (select neg from cen); get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA: esperada 1 linha, veio %', n using errcode = 'TF001'; end if;
  raise notice 'sem regressão (desarquivado: cálculo editável de novo): 1 linha'; end $$;
reset role;

\echo '=== S3. arquivar recusa o que uma rotina do M1 ainda alteraria'
create temp table cen_m1 on commit drop as
select (select h.negocio_id from public.handoffs h where h.status = 'pendente'
          and exists (select 1 from public.empresa_membros m where m.empresa_id = h.empresa_id and m.papel = 'admin' and m.ativo)
        order by h.negocio_id limit 1) as neg_repasse,
       (select c.negocio_id from public.contratos c
          where exists (select 1 from public.empresa_membros m where m.empresa_id = c.empresa_id and m.papel = 'admin' and m.ativo)
        order by c.negocio_id limit 1) as neg_contrato;
grant select on cen_m1 to authenticated;
select pg_temp.confere(neg_repasse is not null and neg_contrato is not null, 'S3. cenário com repasse pendente e contrato') from cen_m1;
select quote_literal((select m.user_id from public.empresa_membros m join public.negocios n on n.empresa_id = m.empresa_id
                      where n.id = (select neg_repasse from cen_m1) and m.papel = 'admin' and m.ativo order by m.id limit 1)) as admin_repasse,
       quote_literal((select m.user_id from public.empresa_membros m join public.negocios n on n.empresa_id = m.empresa_id
                      where n.id = (select neg_contrato from cen_m1) and m.papel = 'admin' and m.ativo order by m.id limit 1)) as admin_contrato \gset
-- distribuição de lead pendente (o cron expirar_atribuicoes_leads trocaria o responsável)
savepoint s_atrib;
insert into public.atribuicoes_leads (empresa_id, negocio_id, membro_sugerido_id, expira_em)
  select empresa, neg, vendedor_membro, now() + interval '1 hour' from cen;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: arquivou com distribuição pendente' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Há uma distribuição de lead pendente para este negócio: conclua antes de arquivar.', 'distribuição de lead pendente'); end $$;
reset role;
rollback to savepoint s_atrib;
-- repasse pendente (o aceite trocaria o responsável)
select set_config('request.jwt.claims', json_build_object('sub', :admin_repasse, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg_repasse from cen_m1), 'teste'); raise exception 'FALHA: arquivou com repasse pendente' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Há um repasse pendente para este negócio: conclua antes de arquivar.', 'repasse pendente'); end $$;
reset role;
-- contrato (pagamentos, comissões e obra continuam vivos)
select set_config('request.jwt.claims', json_build_object('sub', :admin_contrato, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg_contrato from cen_m1), 'teste'); raise exception 'FALHA: arquivou com contrato' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'Negócio com contrato, pagamento ou obra não pode ser arquivado.', 'contrato'); end $$;
reset role;

\echo '=== S4. responsável que não está ativo (preparar_negocio do M1 recusa qualquer alteração do negócio)'
savepoint s_resp;
update public.empresa_membros set status = 'desligado' where user_id = :vendedor and empresa_id = :empresa;
select pg_temp.confere(not ativo, 'S4. vendedor desligado fica inativo') from public.empresa_membros where user_id = :vendedor and empresa_id = :empresa;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
do $$ begin perform public.arquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: arquivou com responsável inativo' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'O responsável deste negócio não está ativo: reatribua antes de arquivar.', 'responsável inativo ao arquivar'); end $$;
reset role;
rollback to savepoint s_resp;
-- responsável desligado DEPOIS do arquivamento: desarquivar exige novo responsável
savepoint s_resp2;
select set_config('request.jwt.claims', json_build_object('sub', :sdr, 'role', 'authenticated')::text, true) is not null as ok;
set local role authenticated;
select pg_temp.confere(public.arquivar_negocio(:neg, 'Teste responsável')::text = '', 'S4. arquivou com responsável ativo');
reset role;
update public.empresa_membros set status = 'desligado' where user_id = :vendedor and empresa_id = :empresa;
set local role authenticated;
do $$ begin perform public.desarquivar_negocio((select neg from cen), 'teste'); raise exception 'FALHA: desarquivou sem novo responsável' using errcode = 'TF001';
exception when sqlstate 'TF001' then raise; when others then perform pg_temp.erro_esperado(sqlerrm, 'O responsável deste negócio não está mais ativo: informe o novo responsável para desarquivar.', 'responsável saiu depois do arquivamento'); end $$;
reset role;
-- v7: regra ATIVA de pontos para troca de responsável nesta empresa, para provar que a reatribuição não pontua.
insert into public.gamification_rules (empresa_id, nome, evento_tipo, xp, moedas) select empresa, 'Teste P1 v7: troca de responsável', 'deal.owner_changed', 10, 10 from cen;
create temp table t_eventos_antes on commit drop as
  select count(*) as n, pg_temp.retrato_public(array['eventos', 'atividades']) as retrato,
         (select count(*) from public.point_ledger) as pontos, (select count(*) from public.atividades where negocio_id = (select neg from cen)) as atividades
  from public.eventos where entidade_id = (select neg from cen);
set local role authenticated;
select pg_temp.confere(public.desarquivar_negocio(:neg, 'Retomado por outro vendedor (teste)',
         (select id from public.empresa_membros where user_id = :sdr and empresa_id = :empresa))::text = '', 'S4. desarquivou com novo responsável');
reset role;
select pg_temp.confere(count(*) = 1 and bool_and(arquivado_em is null and responsavel_id = (select id from public.empresa_membros where user_id = :sdr and empresa_id = :empresa)),
       'S4. negócio desarquivado com o novo responsável') from public.negocios where id = :neg;
select pg_temp.confere((select count(*) from public.eventos where entidade_id = (select neg from cen)) = (select n from t_eventos_antes) + 1
         and exists (select 1 from public.eventos where entidade_id = (select neg from cen) and tipo = 'deal.owner_changed'),
       'S4. a reatribuição gera só o evento do M1 de troca de responsável (deal.owner_changed), como qualquer reatribuição');
select pg_temp.confere((select count(*) from public.point_ledger) = (select pontos from t_eventos_antes),
       'S4. v7: reatribuição administrativa não gera XP nem moedas, mesmo com regra ativa para deal.owner_changed');
select pg_temp.confere((select retrato from t_eventos_antes) = pg_temp.retrato_public(array['eventos', 'atividades']),
       'S4. v7: nenhuma outra tabela mudou (pontos, conquistas, comissões, metas, tarefas, notificações...)');
select pg_temp.confere((select count(*) from public.atividades where negocio_id = (select neg from cen)) = (select atividades from t_eventos_antes) + 1
         and exists (select 1 from public.atividades where negocio_id = (select neg from cen) and tipo = 'responsavel_alterado'),
       'S4. histórico do M1: 1 atividade responsavel_alterado');
select pg_temp.confere(count(*) = 1 and bool_and(dados_antes ->> 'responsavel_id' = (select vendedor_membro::text from cen)
         and (dados_depois ->> 'responsavel_id')::uuid = (select id from public.empresa_membros where user_id = :sdr and empresa_id = :empresa)
         and dados_depois ->> 'motivo' = 'Retomado por outro vendedor (teste)'),
       'S4. auditoria do desarquivamento registra o responsável anterior e o novo')
  from public.logs_auditoria where entidade = 'negocios' and acao = 'desarquivar' and entidade_id = (select neg::text from cen)
   and dados_depois ->> 'motivo' = 'Retomado por outro vendedor (teste)';
rollback to savepoint s_resp2;
update public.empresa_membros set papel = 'sdr' where user_id = :sdr and empresa_id = :empresa;
