-- Obras: tarefas automáticas de setor (T3).
--
-- Decisões do Evandro (30/10/2026): cada empresa monta regras "quando o setor X da obra chegar ao status Y, abrir
-- uma tarefa para o setor Z", disparadas uma vez por obra e regra. Exemplos passados por ele, que já nascem
-- cadastrados: Operacional `instalacao_concluida` → Engenharia "Cadastro do cliente no app e pedido de vistoria";
-- Compras `faturado_fornecedor` → Operacional "Agendar instalação com o cliente".
--
-- O que faz:
--  * `tarefas_automaticas_regras`: regras da empresa (gatilho = setor + status; destino = setor, título, descrição,
--    prazo em dias úteis). Admin cria e edita; qualquer membro ativo lê. Sem DELETE: regra desativada para de
--    disparar e as tarefas já criadas continuam apontando para ela.
--  * `tarefas_setor.regra_id`: regra que criou a tarefa. Única por obra e regra: a mesma regra nunca abre uma segunda
--    tarefa na obra, mesmo se a primeira for cancelada ou o status voltar e chegar de novo.
--  * Trigger em `obra_fluxos` (insert e mudança de status): pega todos os caminhos que mudam o status (RPCs dos
--    setores, protocolos, vistoria, criação da obra). Obra cancelada não recebe tarefa. Obras que já passaram do
--    status antes desta migration não recebem nada (só a transição dispara).
--  * A tarefa nasce como as manuais (`origem = 'automatica'`, sem `criado_por`): na fila do setor de destino ou com o
--    responsável principal ativo desse setor na obra, se ele ainda atua no setor. Prazo: N dias úteis a partir de hoje
--    (`somar_dias_uteis`, com feriados da empresa). O histórico registra 'criada' com a regra e o gatilho; o autor é
--    quem mudou o status.
--  * `notificar_tarefa_setor`: passa a avisar o responsável de uma tarefa automática criada já com ele.
-- O que NÃO faz: não gera pontos nem eventos de gamificação; não muda status, travas ou etapas.
-- Depende de: membro_ativo, tem_papel, auditar, tocar_updated_at, somar_dias_uteis, membro_atua_no_setor,
-- registrar_historico_tarefa_setor (já existentes).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Regras da empresa
-- ---------------------------------------------------------------------------

create table public.tarefas_automaticas_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  gatilho_setor public.setor_obra not null check (gatilho_setor <> 'comercial'),
  gatilho_status text not null,
  setor public.setor_obra not null check (setor <> 'comercial'),
  titulo text not null check (length(btrim(titulo)) between 2 and 160),
  descricao text check (length(descricao) <= 2000),
  prazo_dias_uteis integer not null default 2 check (prazo_dias_uteis between 1 and 60),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mesmos status de `obra_fluxos` (obra_fluxos_status_valido).
  constraint tarefas_automaticas_regras_gatilho_valido check (
    (gatilho_setor = 'compras' and gatilho_status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor'))
    or (gatilho_setor = 'engenharia' and gatilho_status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
    or (gatilho_setor = 'operacional' and gatilho_status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
  )
);
create unique index tarefas_automaticas_regras_unica
  on public.tarefas_automaticas_regras (empresa_id, gatilho_setor, gatilho_status, setor, lower(btrim(titulo)));
create index on public.tarefas_automaticas_regras (empresa_id, gatilho_setor, gatilho_status) where ativa;

-- A empresa da regra não muda (as tarefas apontam para ela).
create or replace function public.proteger_tarefas_automaticas_regras()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa da regra não muda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger tarefas_automaticas_regras_proteger before update on public.tarefas_automaticas_regras
  for each row execute function public.proteger_tarefas_automaticas_regras();
create trigger tarefas_automaticas_regras_updated_at before update on public.tarefas_automaticas_regras
  for each row execute function public.tocar_updated_at();
create trigger auditar_tarefas_automaticas_regras after insert or update or delete on public.tarefas_automaticas_regras
  for each row execute function public.auditar();

alter table public.tarefas_automaticas_regras enable row level security;
create policy "ver regras de tarefas automáticas" on public.tarefas_automaticas_regras for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria regra de tarefa automática" on public.tarefas_automaticas_regras for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita regra de tarefa automática" on public.tarefas_automaticas_regras for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
revoke delete, truncate on public.tarefas_automaticas_regras from anon, authenticated;
revoke all on public.tarefas_automaticas_regras from anon;

-- Regras iniciais (passadas pelo Evandro em 30/10/2026). Cada empresa edita ou desativa; empresas novas recebem as
-- mesmas.
create or replace function public.inserir_tarefas_automaticas_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.tarefas_automaticas_regras (empresa_id, gatilho_setor, gatilho_status, setor, titulo) values
    (p_empresa_id, 'operacional', 'instalacao_concluida', 'engenharia', 'Cadastro do cliente no app e pedido de vistoria'),
    (p_empresa_id, 'compras', 'faturado_fornecedor', 'operacional', 'Agendar instalação com o cliente')
  on conflict (empresa_id, gatilho_setor, gatilho_status, setor, lower(btrim(titulo))) do nothing;
$$;
revoke all on function public.inserir_tarefas_automaticas_padrao(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_tarefas_automaticas_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.inserir_tarefas_automaticas_padrao(new.id);
  return null;
end;
$$;
revoke all on function public.criar_tarefas_automaticas_empresa() from public, anon, authenticated, service_role;
create trigger empresas_tarefas_automaticas after insert on public.empresas
  for each row execute function public.criar_tarefas_automaticas_empresa();

select public.inserir_tarefas_automaticas_padrao(id) from public.empresas;

-- ---------------------------------------------------------------------------
-- Vínculo da tarefa com a regra
-- ---------------------------------------------------------------------------

alter table public.tarefas_setor
  add column regra_id uuid references public.tarefas_automaticas_regras (id),
  add constraint tarefas_setor_regra_automatica check (regra_id is null or (origem = 'automatica' and obra_id is not null));
-- Uma tarefa por obra e regra (nulos não conflitam: tarefas manuais ficam de fora).
create unique index tarefas_setor_uma_por_obra_e_regra on public.tarefas_setor (obra_id, regra_id);

-- ---------------------------------------------------------------------------
-- Disparo
-- ---------------------------------------------------------------------------

create or replace function public.disparar_tarefas_automaticas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r public.tarefas_automaticas_regras;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_responsavel uuid;
  v_prazo date;
  v_id uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  if exists (select 1 from public.obras o where o.id = new.obra_id and o.cancelada_em is not null) then
    return null;
  end if;

  for r in
    select * from public.tarefas_automaticas_regras g
    where g.empresa_id = new.empresa_id and g.ativa and g.gatilho_setor = new.setor and g.gatilho_status = new.status
    order by g.created_at, g.id
  loop
    -- Responsável principal ativo do setor de destino na obra, se ainda atua no setor; senão, fila do setor.
    select p.membro_id into v_responsavel
    from public.obra_participantes p
    where p.obra_id = new.obra_id and p.setor = r.setor and p.principal and p.fim is null
      and public.membro_atua_no_setor(new.empresa_id, p.membro_id, r.setor);
    v_prazo := coalesce(public.somar_dias_uteis(new.empresa_id, v_hoje, r.prazo_dias_uteis), v_hoje + r.prazo_dias_uteis);

    v_id := null;
    insert into public.tarefas_setor (empresa_id, obra_id, setor, titulo, descricao, prazo, responsavel_id, origem, regra_id)
    values (new.empresa_id, new.obra_id, r.setor, btrim(r.titulo), nullif(btrim(coalesce(r.descricao, '')), ''), v_prazo, v_responsavel, 'automatica', r.id)
    on conflict (obra_id, regra_id) do nothing
    returning id into v_id;

    if v_id is not null then
      perform public.registrar_historico_tarefa_setor(v_id, new.empresa_id, 'criada', jsonb_build_object(
        'setor', r.setor, 'responsavel_id', v_responsavel, 'prazo', v_prazo, 'regra_id', r.id,
        'gatilho', jsonb_build_object('setor', new.setor, 'status', new.status)));
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.disparar_tarefas_automaticas() from public, anon, authenticated, service_role;

create trigger obra_fluxos_tarefas_automaticas after insert or update of status on public.obra_fluxos
  for each row execute function public.disparar_tarefas_automaticas();

-- ---------------------------------------------------------------------------
-- Notificação: tarefa automática criada já com responsável
-- ---------------------------------------------------------------------------

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
  elsif new.tipo = 'atribuida' or (new.tipo = 'criada' and t.origem = 'automatica') then
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
revoke all on function public.notificar_tarefa_setor() from public, anon, authenticated, service_role;
