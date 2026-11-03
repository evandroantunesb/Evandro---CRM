-- Obras OPR: aviso no sininho da justificativa de atraso (decisão do Evandro em 03/11/2026).
--
--  * Pedido e cobrança: avisam quem recebeu o pedido (`pedido_a`) e o gestor da equipe dele (equipe ativa,
--    `e_gestor`). Resposta: avisa quem pediu (`pedido_por`).
--  * Ninguém é avisado da própria ação; quem está inativo ou fora da empresa não recebe.
--  * Gatilho na tabela (só as funções `pedir_justificativa_atraso` e `responder_justificativa_atraso` escrevem
--    nela): as funções não mudam.
--
-- Depende de: obra_justificativas_atraso (20261106100000), notificacoes_tipo_check (20261102200000), meu_membro_id.

set lock_timeout = '5s';

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'lead_atribuido', 'tarefa_atribuida', 'handoff_recebido', 'handoff_devolvido', 'conquista_desbloqueada',
    'tarefa_setor_concluida', 'tarefa_setor_cancelada', 'tarefa_setor_atribuida', 'tarefa_setor_reaberta',
    'desconto_solicitado', 'desconto_decidido',
    'justificativa_atraso_pedida', 'justificativa_atraso_cobrada', 'justificativa_atraso_respondida'
  ));

create or replace function public.avisar_justificativa_atraso()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
  v_obra public.obras;
  v_etapa text;
  v_tipo text;
  v_mensagem text;
  v_para uuid[];
begin
  if tg_op = 'INSERT' then
    v_tipo := 'justificativa_atraso_pedida';
  elsif old.respondido_em is null and new.respondido_em is not null then
    v_tipo := 'justificativa_atraso_respondida';
  elsif new.respondido_em is null and new.cobrado_em is distinct from old.cobrado_em then
    v_tipo := 'justificativa_atraso_cobrada';
  else
    return null;
  end if;

  select * into v_obra from public.obras where id = new.obra_id;
  v_etapa := case new.etapa
    when 'projeto' then 'Projeto'
    when 'homologacao' then 'Homologação'
    when 'compra' then 'Compra'
    when 'entrega_material' then 'Entrega do material'
    when 'instalacao' then 'Instalação'
    when 'vistoria' then 'Vistoria'
    when 'conexao' then 'Conexão'
  end;
  v_mensagem := format(
    case v_tipo
      when 'justificativa_atraso_pedida' then 'Justificativa de atraso pedida: %s na obra nº %s (%s).'
      when 'justificativa_atraso_cobrada' then 'Justificativa de atraso cobrada: %s na obra nº %s (%s).'
      else 'Justificativa de atraso respondida: %s na obra nº %s (%s).'
    end,
    v_etapa, v_obra.numero, v_obra.cliente_nome
  );

  if v_tipo = 'justificativa_atraso_respondida' then
    v_para := array[new.pedido_por];
  else
    v_para := array[new.pedido_a] || array(
      select g.membro_id
      from public.equipe_membros dele
      join public.equipes eq on eq.id = dele.equipe_id and eq.ativa
      join public.equipe_membros g on g.equipe_id = dele.equipe_id and g.e_gestor
      where dele.membro_id = new.pedido_a
    );
  end if;

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  select distinct new.empresa_id, m.id, v_tipo, left(v_mensagem, 500), format('/obras/%s#atrasos', new.obra_id)
  from public.empresa_membros m
  where m.id = any(v_para) and m.empresa_id = new.empresa_id and m.ativo and m.id is distinct from v_eu;
  return null;
end;
$$;
revoke all on function public.avisar_justificativa_atraso() from public, anon, authenticated, service_role;

create trigger avisar_justificativa_atraso after insert or update on public.obra_justificativas_atraso
  for each row execute function public.avisar_justificativa_atraso();

reset lock_timeout;
