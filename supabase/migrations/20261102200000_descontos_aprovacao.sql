-- Condições de pagamento — aprovação de desconto acima do limite (PR 2 do plano; regras do Evandro em 01/11/2026).
--
-- O que faz:
--  * `descontos_solicitacoes`: pedido de desconto à vista acima do limite de quem pede (percentual e motivo), com a
--    decisão (aprovado/recusado, por quem, quando e o motivo). Um pedido pendente por negócio; um pedido novo cancela
--    o anterior. A aprovação vale para aquele negócio (a PR 3 usa na emissão da proposta).
--  * Limites (`condicoes_pagamento_preferencias`, PR 1): vendedor e gestor têm o seu; admin não tem limite.
--  * Quem aprova: admin, ou gestor da equipe do responsável pelo negócio até o limite do próprio gestor (vendedor com
--    5% e gestor com 10%: o gestor aprova até 10%; acima, só o admin). Pedido do gestor acima do limite dele: só o
--    admin. Ninguém decide o próprio pedido.
--  * Notificações: quem pode aprovar recebe "desconto_solicitado"; quem pediu recebe "desconto_decidido".
--  * Escrita só pelas RPCs `solicitar_desconto` e `decidir_desconto`; leitura por quem vê o negócio.
-- O que NÃO faz: não muda proposta, contrato nem valor do negócio (PRs 3 e 4).

set lock_timeout = '5s';

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'lead_atribuido', 'tarefa_atribuida', 'handoff_recebido', 'handoff_devolvido', 'conquista_desbloqueada',
    'tarefa_setor_concluida', 'tarefa_setor_cancelada', 'tarefa_setor_atribuida', 'tarefa_setor_reaberta',
    'desconto_solicitado', 'desconto_decidido'
  ));

create table public.descontos_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  solicitado_por uuid not null references public.empresa_membros (id),
  percentual numeric(5, 2) not null check (percentual > 0 and percentual <= 100),
  motivo text not null check (length(trim(motivo)) between 3 and 500),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  decidido_por uuid references public.empresa_membros (id),
  decidido_em timestamptz,
  motivo_decisao text check (motivo_decisao is null or length(motivo_decisao) <= 500),
  created_at timestamptz not null default now(),
  check ((status = 'pendente') = (decidido_em is null))
);
create unique index descontos_solicitacoes_um_pendente on public.descontos_solicitacoes (negocio_id) where status = 'pendente';
create index on public.descontos_solicitacoes (negocio_id, created_at desc);
create index on public.descontos_solicitacoes (empresa_id);

create trigger auditar_descontos_solicitacoes after insert or update or delete on public.descontos_solicitacoes
  for each row execute function public.auditar();

alter table public.descontos_solicitacoes enable row level security;
create policy "quem vê o negócio vê os pedidos de desconto" on public.descontos_solicitacoes for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
revoke all on public.descontos_solicitacoes from anon;
revoke insert, update, delete on public.descontos_solicitacoes from authenticated;

-- ---------------------------------------------------------------------------
-- Limite de desconto sem aprovação
-- ---------------------------------------------------------------------------

/** Limite à vista sem aprovação de um membro: admin 100; gestor e vendedor pela configuração (padrão 0); outros 0. */
create or replace function public.limite_desconto_membro(p_membro_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case m.papel
    when 'admin' then 100::numeric
    when 'gestor' then coalesce(p.desconto_max_gestor, 0)
    when 'vendedor' then coalesce(p.desconto_max_vendedor, 0)
    else 0::numeric
  end
  from public.empresa_membros m
  left join public.condicoes_pagamento_preferencias p on p.empresa_id = m.empresa_id
  where m.id = p_membro_id;
$$;
revoke all on function public.limite_desconto_membro(uuid) from public, anon, authenticated;

/** Limite de quem está logado nesta empresa (a tela mostra "você dá até X% sem aprovação"). */
create or replace function public.meu_limite_desconto(p_empresa_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.limite_desconto_membro(public.meu_membro_id(p_empresa_id)), 0);
$$;
revoke all on function public.meu_limite_desconto(uuid) from public, anon, authenticated;
grant execute on function public.meu_limite_desconto(uuid) to authenticated;

/**
 * O membro pode decidir o pedido: ativo, admin; ou gestor ativo de uma equipe ativa do responsável pelo negócio,
 * com limite >= percentual. Nunca quem pediu.
 */
create or replace function public.pode_decidir_desconto(p_membro_id uuid, p_solicitacao public.descontos_solicitacoes)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_membro_id is distinct from p_solicitacao.solicitado_por
    and exists (
      select 1 from public.empresa_membros m
      where m.id = p_membro_id and m.empresa_id = p_solicitacao.empresa_id and m.ativo
        and (
          m.papel = 'admin'
          or (
            m.papel = 'gestor'
            and public.limite_desconto_membro(m.id) >= p_solicitacao.percentual
            and exists (
              select 1
              from public.negocios n
              join public.equipe_membros dele on dele.membro_id = n.responsavel_id
              join public.equipe_membros minha on minha.equipe_id = dele.equipe_id and minha.membro_id = m.id and minha.e_gestor
              join public.equipes eq on eq.id = dele.equipe_id and eq.ativa
              where n.id = p_solicitacao.negocio_id
            )
          )
        )
    );
$$;
revoke all on function public.pode_decidir_desconto(uuid, public.descontos_solicitacoes) from public, anon, authenticated;

/** Quem está logado pode decidir este pedido (a tela mostra Aprovar/Recusar). */
create or replace function public.posso_decidir_desconto(p_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select s.status = 'pendente' and public.pode_decidir_desconto(public.meu_membro_id(s.empresa_id), s)
    from public.descontos_solicitacoes s where s.id = p_id
  ), false);
$$;
revoke all on function public.posso_decidir_desconto(uuid) from public, anon, authenticated;
grant execute on function public.posso_decidir_desconto(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pedir e decidir
-- ---------------------------------------------------------------------------

create or replace function public.solicitar_desconto(p_negocio_id uuid, p_percentual numeric, p_motivo text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_eu uuid;
  v_limite numeric;
  v_pedido public.descontos_solicitacoes;
  v_nome text;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  v_eu := case when found then public.meu_membro_id(v_negocio.empresa_id) end;
  if v_eu is null or not public.pode_ver_negocio(p_negocio_id) or not public.tem_papel(v_negocio.empresa_id, '{admin,gestor,vendedor}') then
    raise exception 'Você não pode pedir desconto neste negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if p_percentual is null or p_percentual <= 0 or p_percentual > 100 then
    raise exception 'Informe um desconto entre 0 e 100%%.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Explique o motivo do desconto.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_limite := public.limite_desconto_membro(v_eu);
  if p_percentual <= v_limite then
    raise exception using
      message = format('Esse desconto está dentro do seu limite (%s%%): não precisa de aprovação.', replace(trim_scale(v_limite)::text, '.', ',')),
      errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.descontos_solicitacoes
    set status = 'cancelado', decidido_por = v_eu, decidido_em = now(), motivo_decisao = 'Substituído por um pedido novo.'
    where negocio_id = p_negocio_id and status = 'pendente';

  insert into public.descontos_solicitacoes (empresa_id, negocio_id, solicitado_por, percentual, motivo)
  values (v_negocio.empresa_id, p_negocio_id, v_eu, round(p_percentual, 2), trim(p_motivo))
  returning * into v_pedido;

  select coalesce(nullif(trim(p.nome), ''), 'Alguém da equipe') into v_nome
    from public.empresa_membros m left join public.perfis p on p.id = m.user_id where m.id = v_eu;
  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  select v_negocio.empresa_id, m.id, 'desconto_solicitado',
         left(format('%s pediu %s%% de desconto em "%s".', v_nome, replace(trim_scale(v_pedido.percentual)::text, '.', ','), v_negocio.titulo), 500),
         format('/negocios/%s?aba=proposta#desconto', p_negocio_id)
  from public.empresa_membros m
  where m.empresa_id = v_negocio.empresa_id and public.pode_decidir_desconto(m.id, v_pedido);

  return v_pedido.id;
end;
$$;
revoke all on function public.solicitar_desconto(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.solicitar_desconto(uuid, numeric, text) to authenticated;

create or replace function public.decidir_desconto(p_id uuid, p_aprovar boolean, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pedido public.descontos_solicitacoes;
  v_eu uuid;
  v_titulo text;
begin
  select * into v_pedido from public.descontos_solicitacoes where id = p_id for update;
  v_eu := case when found then public.meu_membro_id(v_pedido.empresa_id) end;
  -- Mesma resposta para "não existe" e "sem permissão".
  if v_eu is null or not public.pode_ver_negocio(v_pedido.negocio_id) then
    raise exception 'Pedido de desconto não encontrado.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_pedido.status <> 'pendente' then
    raise exception 'Este pedido já foi decidido ou cancelado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_eu = v_pedido.solicitado_por then
    raise exception 'Você não pode decidir o seu próprio pedido de desconto.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not public.pode_decidir_desconto(v_eu, v_pedido) then
    raise exception 'Este desconto passa do seu limite de aprovação: só o admin pode decidir.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not coalesce(p_aprovar, false) and length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Explique o motivo da recusa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.descontos_solicitacoes
    set status = case when p_aprovar then 'aprovado' else 'recusado' end,
        decidido_por = v_eu, decidido_em = now(), motivo_decisao = nullif(left(trim(coalesce(p_motivo, '')), 500), '')
    where id = p_id;

  select titulo into v_titulo from public.negocios where id = v_pedido.negocio_id;
  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  values (
    v_pedido.empresa_id, v_pedido.solicitado_por, 'desconto_decidido',
    left(format('Desconto de %s%% em "%s" %s.', replace(trim_scale(v_pedido.percentual)::text, '.', ','), v_titulo,
      case when p_aprovar then 'aprovado' else 'recusado' end), 500),
    format('/negocios/%s?aba=proposta#desconto', v_pedido.negocio_id)
  );
end;
$$;
revoke all on function public.decidir_desconto(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.decidir_desconto(uuid, boolean, text) to authenticated;

reset lock_timeout;
