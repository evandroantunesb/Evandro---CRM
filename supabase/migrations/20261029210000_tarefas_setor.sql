-- Tarefas de setor (Compras, Engenharia, Operacional): pedidos do comercial durante a venda e tarefas da obra.
--
-- Decisões do Evandro (29/10/2026):
--  * A tarefa é PARA UM SETOR e fica ligada a uma obra OU a um negócio. O vendedor pede ao setor durante a venda
--    (ex.: orçamento para Compras, 3D para a Engenharia); quem está na obra pede a qualquer setor dela.
--  * Responsável opcional: sem responsável, a tarefa fica na fila do setor. Qualquer pessoa do setor de destino
--    assume, conclui (com uma resposta para quem pediu) e reabre; coordenador e admin também atribuem.
--  * Visibilidade: quem executa vê as tarefas do seu setor nas obras em que participa e os pedidos de negócio para
--    o seu setor; o coordenador vê tudo do setor; quem pediu vê o próprio pedido; vendedor/gestor veem os pedidos
--    dos negócios que já enxergam; admin vê tudo. Tarefas internas da obra não aparecem para o comercial.
--  * Ninguém apaga: quem pediu, o coordenador do setor ou o admin cancela, com motivo. Histórico imutável.
--  * Não gera evento nem ponto de gamificação (tabela própria, fora de `tarefas`).
--  * A Operação recebe do negócio só o número, o nome do cliente e a cidade (`contexto_tarefas_setor`).
--
-- Escrita só por RPC (security definer); leitura pela policy com `pode_ver_tarefa_setor`.
-- Regras automáticas (gatilho no andamento da obra) ficam para a etapa T3.
-- Depende de: obras, negocios, contatos, empresa_membros, membro_setores_obra, obra_participantes, tem_papel,
-- tem_acesso_comercial, meu_membro_id, pode_ver_negocio, pode_ver_obra, autorizacao_setor_obra (já existentes).

set lock_timeout = '3s';

create table public.tarefas_setor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  obra_id uuid,
  negocio_id uuid references public.negocios (id) on delete cascade,
  setor public.setor_obra not null check (setor <> 'comercial'),
  titulo text not null check (length(btrim(titulo)) between 2 and 160),
  descricao text check (length(descricao) <= 2000),
  prazo date not null,
  responsavel_id uuid,
  status text not null default 'aberta' check (status in ('aberta', 'concluida', 'cancelada')),
  resposta text check (length(resposta) <= 2000),
  motivo_cancelamento text check (length(motivo_cancelamento) <= 500),
  origem text not null default 'manual' check (origem in ('manual', 'automatica')),
  criado_por uuid,
  concluida_em timestamptz,
  concluida_por uuid,
  cancelada_em timestamptz,
  cancelada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ligada a exatamente uma: obra ou negócio.
  check (num_nonnulls(obra_id, negocio_id) = 1),
  check ((status = 'concluida') = (concluida_em is not null)),
  check ((status = 'cancelada') = (cancelada_em is not null and length(btrim(coalesce(motivo_cancelamento, ''))) > 0)),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, responsavel_id) references public.empresa_membros (empresa_id, id),
  foreign key (empresa_id, criado_por) references public.empresa_membros (empresa_id, id),
  foreign key (empresa_id, concluida_por) references public.empresa_membros (empresa_id, id),
  foreign key (empresa_id, cancelada_por) references public.empresa_membros (empresa_id, id)
);
create index on public.tarefas_setor (empresa_id, setor, status, prazo);
create index on public.tarefas_setor (obra_id) where obra_id is not null;
create index on public.tarefas_setor (negocio_id) where negocio_id is not null;
create index on public.tarefas_setor (responsavel_id) where responsavel_id is not null;

create trigger tarefas_setor_updated_at before update on public.tarefas_setor
  for each row execute function public.tocar_updated_at();

create table public.tarefas_setor_historico (
  id bigint generated always as identity primary key,
  tarefa_id uuid not null references public.tarefas_setor (id) on delete cascade,
  empresa_id uuid not null,
  tipo text not null check (tipo in ('criada', 'assumida', 'atribuida', 'concluida', 'reaberta', 'cancelada')),
  dados jsonb not null default '{}'::jsonb,
  -- Autor real no momento da ação; sem FK nas colunas de autor (um `set null` reescreveria o fato).
  autor_user_id uuid,
  autor_membro_id uuid,
  created_at timestamptz not null default now()
);
create index on public.tarefas_setor_historico (tarefa_id, id);

-- ---------------------------------------------------------------------------
-- Quem atua e quem vê
-- ---------------------------------------------------------------------------

-- Membro ativo de Operação que atua no setor (executar ou coordenar).
create or replace function public.membro_atua_no_setor(p_empresa_id uuid, p_membro_id uuid, p_setor public.setor_obra)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros m
    join public.membro_setores_obra s on s.empresa_id = m.empresa_id and s.membro_id = m.id and s.setor = p_setor
    where m.id = p_membro_id and m.empresa_id = p_empresa_id and m.ativo and m.papel = 'operacao'
  );
$$;

-- Autorização para AGIR na tarefa (assumir, concluir, reabrir): 'admin', 'coordenar' ou 'executar'; nulo = não age.
--  * obra: a mesma de `autorizacao_setor_obra` (coordenador do setor ou participante ativo dele);
--  * negócio: quem atua no setor (ainda não há participantes);
--  * em ambos: o responsável que continua no setor.
create or replace function public.autorizacao_tarefa_setor(p_tarefa_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when public.tem_papel(t.empresa_id, '{admin}') then 'admin'
    when not public.tem_papel(t.empresa_id, '{operacao}') then null
    when t.obra_id is not null and public.autorizacao_setor_obra(t.obra_id, t.setor) is not null
      then public.autorizacao_setor_obra(t.obra_id, t.setor)
    when exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = t.empresa_id and s.membro_id = public.meu_membro_id(t.empresa_id)
        and s.setor = t.setor and s.capacidade = 'coordenar'
    ) then 'coordenar'
    when t.negocio_id is not null
      and public.membro_atua_no_setor(t.empresa_id, public.meu_membro_id(t.empresa_id), t.setor) then 'executar'
    when t.responsavel_id = public.meu_membro_id(t.empresa_id)
      and public.membro_atua_no_setor(t.empresa_id, t.responsavel_id, t.setor) then 'executar'
  end
  from public.tarefas_setor t where t.id = p_tarefa_id;
$$;

create or replace function public.pode_ver_tarefa_setor(p_tarefa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.autorizacao_tarefa_setor(t.id) is not null
      or t.criado_por = public.meu_membro_id(t.empresa_id)
      or t.responsavel_id = public.meu_membro_id(t.empresa_id)
      or (t.negocio_id is not null and public.tem_acesso_comercial(t.empresa_id) and public.pode_ver_negocio(t.negocio_id))
    from public.tarefas_setor t where t.id = p_tarefa_id
  ), false);
$$;

alter table public.tarefas_setor enable row level security;
alter table public.tarefas_setor_historico enable row level security;
create policy "ver tarefas de setor" on public.tarefas_setor for select to authenticated
  using (public.pode_ver_tarefa_setor(id));
create policy "ver histórico das tarefas de setor" on public.tarefas_setor_historico for select to authenticated
  using (public.pode_ver_tarefa_setor(tarefa_id));
revoke all on public.tarefas_setor, public.tarefas_setor_historico from anon;
revoke insert, update, delete, truncate on public.tarefas_setor, public.tarefas_setor_historico
  from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Escrita (só por estas funções)
-- ---------------------------------------------------------------------------

create or replace function public.registrar_historico_tarefa_setor(p_tarefa_id uuid, p_empresa_id uuid, p_tipo text, p_dados jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.tarefas_setor_historico (tarefa_id, empresa_id, tipo, dados, autor_user_id, autor_membro_id)
  values (p_tarefa_id, p_empresa_id, p_tipo, coalesce(p_dados, '{}'::jsonb), (select auth.uid()), public.meu_membro_id(p_empresa_id));
$$;

-- Trava a tarefa e devolve a linha; mesma resposta para "não existe" e "não pode ver".
create or replace function public.travar_tarefa_setor(p_tarefa_id uuid)
returns public.tarefas_setor
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas_setor;
begin
  select * into v from public.tarefas_setor where id = p_tarefa_id for update;
  if not found or not public.pode_ver_tarefa_setor(p_tarefa_id) then
    raise exception 'Tarefa não encontrada.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  return v;
end;
$$;

create or replace function public.criar_tarefa_setor(
  p_setor public.setor_obra,
  p_titulo text,
  p_prazo date,
  p_obra_id uuid default null,
  p_negocio_id uuid default null,
  p_descricao text default null,
  p_responsavel_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_eu uuid;
  v_pode boolean;
  v_aut text;
  v_id uuid;
begin
  if num_nonnulls(p_obra_id, p_negocio_id) <> 1 then
    raise exception 'Informe a obra ou o negócio da tarefa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_setor is null or p_setor = 'comercial' then
    raise exception 'Escolha Compras, Engenharia ou Operacional.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_titulo, ''))) < 2 then
    raise exception 'Informe o título da tarefa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_prazo is null or p_prazo < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O prazo não pode ser no passado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_obra_id is not null then
    select o.empresa_id into v_empresa from public.obras o where o.id = p_obra_id and o.cancelada_em is null;
    -- Na obra: admin, quem atua em algum setor dela, ou o comercial que já vê a obra.
    v_pode := v_empresa is not null and (
      public.tem_papel(v_empresa, '{admin}')
      or exists (
        select 1 from unnest(array['compras', 'engenharia', 'operacional']::public.setor_obra[]) s
        where public.autorizacao_setor_obra(p_obra_id, s) is not null
      )
      or (public.tem_acesso_comercial(v_empresa) and public.pode_ver_obra(p_obra_id))
    );
  else
    select n.empresa_id into v_empresa from public.negocios n where n.id = p_negocio_id and n.arquivado_em is null;
    -- No negócio: quem tem acesso comercial e vê o negócio.
    v_pode := v_empresa is not null and public.tem_acesso_comercial(v_empresa) and public.pode_ver_negocio(p_negocio_id);
  end if;
  if not coalesce(v_pode, false) then
    raise exception 'Você não pode criar tarefa aqui.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  v_eu := public.meu_membro_id(v_empresa);
  if p_responsavel_id is not null then
    -- Escolher a pessoa: admin ou coordenador do setor; a pessoa precisa atuar no setor.
    v_aut := case
      when public.tem_papel(v_empresa, '{admin}') then 'admin'
      when exists (
        select 1 from public.membro_setores_obra s
        where s.empresa_id = v_empresa and s.membro_id = v_eu and s.setor = p_setor and s.capacidade = 'coordenar'
      ) then 'coordenar'
      when p_responsavel_id = v_eu then 'executar'
    end;
    if v_aut is null then
      raise exception 'Só o coordenador do setor ou o admin escolhe o responsável.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
    if not public.membro_atua_no_setor(v_empresa, p_responsavel_id, p_setor) then
      raise exception 'O responsável precisa atuar nesse setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  insert into public.tarefas_setor (empresa_id, obra_id, negocio_id, setor, titulo, descricao, prazo, responsavel_id, criado_por)
  values (v_empresa, p_obra_id, p_negocio_id, p_setor, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), p_prazo, p_responsavel_id, v_eu)
  returning id into v_id;

  perform public.registrar_historico_tarefa_setor(v_id, v_empresa, 'criada',
    jsonb_build_object('setor', p_setor, 'responsavel_id', p_responsavel_id, 'prazo', p_prazo));
  return v_id;
end;
$$;

create or replace function public.assumir_tarefa_setor(p_tarefa_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas_setor;
  v_eu uuid;
begin
  v := public.travar_tarefa_setor(p_tarefa_id);
  v_eu := public.meu_membro_id(v.empresa_id);
  if v.status <> 'aberta' then
    raise exception 'Só tarefa aberta pode ser assumida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if public.autorizacao_tarefa_setor(p_tarefa_id) is null or not public.membro_atua_no_setor(v.empresa_id, v_eu, v.setor) then
    raise exception 'Só quem atua no setor assume a tarefa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v.responsavel_id is not distinct from v_eu then
    return;
  end if;
  update public.tarefas_setor set responsavel_id = v_eu where id = p_tarefa_id;
  perform public.registrar_historico_tarefa_setor(p_tarefa_id, v.empresa_id, 'assumida',
    jsonb_build_object('de', v.responsavel_id, 'para', v_eu));
end;
$$;

-- Atribui a outra pessoa do setor ou devolve à fila (nulo). Só admin ou coordenador do setor.
create or replace function public.atribuir_tarefa_setor(p_tarefa_id uuid, p_membro_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas_setor;
  v_aut text;
begin
  v := public.travar_tarefa_setor(p_tarefa_id);
  if v.status <> 'aberta' then
    raise exception 'Só tarefa aberta pode ser atribuída.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_aut := public.autorizacao_tarefa_setor(p_tarefa_id);
  if v_aut is null or v_aut not in ('admin', 'coordenar') then
    raise exception 'Só o coordenador do setor ou o admin atribui a tarefa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if p_membro_id is not null and not public.membro_atua_no_setor(v.empresa_id, p_membro_id, v.setor) then
    raise exception 'O responsável precisa atuar nesse setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v.responsavel_id is not distinct from p_membro_id then
    return;
  end if;
  update public.tarefas_setor set responsavel_id = p_membro_id where id = p_tarefa_id;
  perform public.registrar_historico_tarefa_setor(p_tarefa_id, v.empresa_id, 'atribuida',
    jsonb_build_object('de', v.responsavel_id, 'para', p_membro_id));
end;
$$;

create or replace function public.concluir_tarefa_setor(p_tarefa_id uuid, p_resposta text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas_setor;
  v_resposta text := nullif(btrim(coalesce(p_resposta, '')), '');
begin
  v := public.travar_tarefa_setor(p_tarefa_id);
  if v.status <> 'aberta' then
    raise exception 'Só tarefa aberta pode ser concluída.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if public.autorizacao_tarefa_setor(p_tarefa_id) is null then
    raise exception 'Só quem atua no setor conclui a tarefa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  update public.tarefas_setor
  set status = 'concluida', resposta = v_resposta, concluida_em = now(), concluida_por = public.meu_membro_id(v.empresa_id)
  where id = p_tarefa_id;
  perform public.registrar_historico_tarefa_setor(p_tarefa_id, v.empresa_id, 'concluida',
    jsonb_build_object('resposta', v_resposta));
end;
$$;

-- Reabre uma concluída: quem atua no setor ou quem pediu (a resposta não resolveu). A resposta anterior fica no
-- histórico.
create or replace function public.reabrir_tarefa_setor(p_tarefa_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas_setor;
begin
  v := public.travar_tarefa_setor(p_tarefa_id);
  if v.status <> 'concluida' then
    raise exception 'Só tarefa concluída pode ser reaberta.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if public.autorizacao_tarefa_setor(p_tarefa_id) is null and v.criado_por is distinct from public.meu_membro_id(v.empresa_id) then
    raise exception 'Só quem atua no setor ou quem pediu reabre a tarefa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  update public.tarefas_setor
  set status = 'aberta', resposta = null, concluida_em = null, concluida_por = null
  where id = p_tarefa_id;
  perform public.registrar_historico_tarefa_setor(p_tarefa_id, v.empresa_id, 'reaberta',
    jsonb_build_object('resposta_anterior', v.resposta));
end;
$$;

-- Cancela uma aberta, com motivo: quem pediu, o coordenador do setor ou o admin.
create or replace function public.cancelar_tarefa_setor(p_tarefa_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas_setor;
  v_eu uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  v := public.travar_tarefa_setor(p_tarefa_id);
  v_eu := public.meu_membro_id(v.empresa_id);
  if v.status <> 'aberta' then
    raise exception 'Só tarefa aberta pode ser cancelada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not (
    v.criado_por is not distinct from v_eu
    or coalesce(public.autorizacao_tarefa_setor(p_tarefa_id), '') in ('admin', 'coordenar')
  ) then
    raise exception 'Só quem pediu, o coordenador do setor ou o admin cancela a tarefa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.tarefas_setor
  set status = 'cancelada', motivo_cancelamento = v_motivo, cancelada_em = now(), cancelada_por = v_eu
  where id = p_tarefa_id;
  perform public.registrar_historico_tarefa_setor(p_tarefa_id, v.empresa_id, 'cancelada', jsonb_build_object('motivo', v_motivo));
end;
$$;

-- Contexto mínimo para listar as tarefas visíveis: referência (obra ou negócio), nome do cliente e cidade.
-- A Operação não lê `negocios`/`contatos`; aqui recebe só isso, e só das tarefas que pode ver.
create or replace function public.contexto_tarefas_setor(p_ids uuid[])
returns table (tarefa_id uuid, obra_numero integer, negocio_numero integer, cliente_nome text, cidade text, uf text)
language sql stable security definer set search_path = ''
as $$
  select t.id, o.numero, n.numero, coalesce(o.cliente_nome, c.nome), coalesce(o.cidade, c.cidade), coalesce(o.uf, c.uf)
  from public.tarefas_setor t
  left join public.obras o on o.id = t.obra_id
  left join public.negocios n on n.id = t.negocio_id
  left join public.contatos c on c.id = n.contato_id
  where t.id = any(p_ids) and public.pode_ver_tarefa_setor(t.id);
$$;

-- Quem atua no setor (para escolher o responsável): só o admin ou o coordenador do setor recebe a lista; os
-- setores dos colegas continuam fechados (`membro_setores_obra` só mostra a própria linha). Nomes vêm de
-- `identidade_membros`.
create or replace function public.membros_do_setor(p_empresa_id uuid, p_setor public.setor_obra)
returns table (membro_id uuid, capacidade public.capacidade_obra)
language sql stable security definer set search_path = ''
as $$
  select s.membro_id, s.capacidade
  from public.membro_setores_obra s
  join public.empresa_membros m on m.id = s.membro_id and m.empresa_id = s.empresa_id and m.ativo and m.papel = 'operacao'
  where s.empresa_id = p_empresa_id and s.setor = p_setor
    and (
      public.tem_papel(p_empresa_id, '{admin}')
      or exists (
        select 1 from public.membro_setores_obra eu
        where eu.empresa_id = p_empresa_id and eu.membro_id = public.meu_membro_id(p_empresa_id)
          and eu.setor = p_setor and eu.capacidade = 'coordenar'
      )
    )
  order by s.membro_id;
$$;

-- Funções internas: ninguém executa pela API.
revoke all on function public.membro_atua_no_setor(uuid, uuid, public.setor_obra) from public, anon, authenticated, service_role;
revoke all on function public.autorizacao_tarefa_setor(uuid) from public, anon, authenticated, service_role;
revoke all on function public.registrar_historico_tarefa_setor(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.travar_tarefa_setor(uuid) from public, anon, authenticated, service_role;
-- Usada na policy: só `authenticated`.
revoke all on function public.pode_ver_tarefa_setor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_tarefa_setor(uuid) to authenticated;
-- RPCs de cliente: só `authenticated`.
revoke all on function public.criar_tarefa_setor(public.setor_obra, text, date, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.criar_tarefa_setor(public.setor_obra, text, date, uuid, uuid, text, uuid) to authenticated;
revoke all on function public.assumir_tarefa_setor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.assumir_tarefa_setor(uuid) to authenticated;
revoke all on function public.atribuir_tarefa_setor(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.atribuir_tarefa_setor(uuid, uuid) to authenticated;
revoke all on function public.concluir_tarefa_setor(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.concluir_tarefa_setor(uuid, text) to authenticated;
revoke all on function public.reabrir_tarefa_setor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reabrir_tarefa_setor(uuid) to authenticated;
revoke all on function public.cancelar_tarefa_setor(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cancelar_tarefa_setor(uuid, text) to authenticated;
revoke all on function public.contexto_tarefas_setor(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.contexto_tarefas_setor(uuid[]) to authenticated;
revoke all on function public.membros_do_setor(uuid, public.setor_obra) from public, anon, authenticated, service_role;
grant execute on function public.membros_do_setor(uuid, public.setor_obra) to authenticated;

reset lock_timeout;
