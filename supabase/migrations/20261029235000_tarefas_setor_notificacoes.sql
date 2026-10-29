-- Notificações das tarefas de setor no sininho (tabela `notificacoes` existente):
--   * concluída  → quem pediu ("Engenharia concluiu: …"), com link para o negócio (aba Atividades) ou a obra;
--   * cancelada por outra pessoa → quem pediu, com o motivo;
--   * atribuída  → quem passou a ser o responsável;
--   * reaberta   → o responsável (se houver e não for quem reabriu).
-- Nasce do histórico da tarefa (gatilho após inserir), então segue exatamente as RPCs que já existem; ninguém é
-- avisado da própria ação. Depende de: 20261029210000_tarefas_setor.sql.

set lock_timeout = '3s';

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'lead_atribuido', 'tarefa_atribuida', 'handoff_recebido', 'handoff_devolvido', 'conquista_desbloqueada',
    'tarefa_setor_concluida', 'tarefa_setor_cancelada', 'tarefa_setor_atribuida', 'tarefa_setor_reaberta'
  ));

create or replace function public.notificar_tarefa_setor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t public.tarefas_setor;
  v_setor text;
  v_link_pedido text;
  v_para uuid;
  v_tipo text;
  v_mensagem text;
  v_link text;
begin
  select * into t from public.tarefas_setor where id = new.tarefa_id;
  if not found then
    return null;
  end if;
  v_setor := case t.setor when 'compras' then 'Compras' when 'engenharia' then 'Engenharia' when 'operacional' then 'Operacional' else 'O setor' end;
  v_link_pedido := case when t.negocio_id is not null then '/negocios/' || t.negocio_id || '?aba=atividades' else '/obras/' || t.obra_id end;

  if new.tipo = 'concluida' then
    v_para := t.criado_por;
    v_tipo := 'tarefa_setor_concluida';
    v_mensagem := v_setor || ' concluiu: ' || t.titulo;
    v_link := v_link_pedido;
  elsif new.tipo = 'cancelada' then
    v_para := t.criado_por;
    v_tipo := 'tarefa_setor_cancelada';
    v_mensagem := 'Pedido cancelado (' || v_setor || '): ' || t.titulo || ' — ' || coalesce(t.motivo_cancelamento, '');
    v_link := v_link_pedido;
  elsif new.tipo = 'atribuida' then
    v_para := t.responsavel_id;
    v_tipo := 'tarefa_setor_atribuida';
    v_mensagem := 'Tarefa de ' || v_setor || ' atribuída a você: ' || t.titulo;
    v_link := '/tarefas/setores?ver=minhas';
  elsif new.tipo = 'reaberta' then
    v_para := t.responsavel_id;
    v_tipo := 'tarefa_setor_reaberta';
    v_mensagem := 'Tarefa reaberta: ' || t.titulo;
    v_link := '/tarefas/setores?ver=minhas';
  else
    return null;
  end if;

  -- Ninguém é avisado da própria ação; quem saiu da empresa ou ficou inativo não recebe.
  if v_para is null or v_para is not distinct from new.autor_membro_id then
    return null;
  end if;
  if not exists (select 1 from public.empresa_membros m where m.id = v_para and m.empresa_id = t.empresa_id and m.ativo) then
    return null;
  end if;

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  values (t.empresa_id, v_para, v_tipo, left(v_mensagem, 500), v_link);
  return null;
end;
$$;

create trigger tarefas_setor_historico_notificar after insert on public.tarefas_setor_historico
  for each row execute function public.notificar_tarefa_setor();

revoke all on function public.notificar_tarefa_setor() from public, anon, authenticated, service_role;

reset lock_timeout;
