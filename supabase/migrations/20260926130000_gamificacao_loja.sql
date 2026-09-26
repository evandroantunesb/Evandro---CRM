-- Fase 2 (gamificação) — loja de recompensas.
--
-- Admin cadastra itens que custam pontos (estoque e limite por colaborador
-- opcionais, validade opcional); o colaborador resgata gastando do próprio
-- saldo de `point_ledger`. Débito e checagens (saldo, estoque, limite,
-- validade) acontecem atomicamente em `solicitar_resgate`, já que inserir
-- direto em `point_ledger` é revogado de todo mundo (extrato imutável).

create type public.status_resgate as enum ('solicitado', 'aprovado', 'entregue', 'cancelado');

create table public.recompensas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  descricao text not null default '',
  custo_pontos integer not null check (custo_pontos > 0),
  estoque integer check (estoque is null or estoque >= 0),
  limite_por_membro integer check (limite_por_membro is null or limite_por_membro > 0),
  validade_ate date,
  ativa boolean not null default true,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resgates (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  recompensa_id uuid not null references public.recompensas (id) on delete restrict,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  status public.status_resgate not null default 'solicitado',
  pontos_debitados integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.resgates (empresa_id, membro_id, created_at desc);
create index on public.resgates (recompensa_id) where status <> 'cancelado';

create trigger recompensas_updated_at before update on public.recompensas
  for each row execute function public.tocar_updated_at();
create trigger resgates_updated_at before update on public.resgates
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- Resgate: checa regras de negócio e debita pontos atomicamente.
-- ---------------------------------------------------------------------------

create or replace function public.solicitar_resgate(p_recompensa_id uuid)
returns public.resgates
language plpgsql security definer set search_path = ''
as $$
declare
  v_recompensa public.recompensas;
  v_membro_id uuid;
  v_saldo integer;
  v_resgatados integer;
  v_resgate public.resgates;
begin
  select * into v_recompensa from public.recompensas where id = p_recompensa_id for update;
  if not found then
    raise exception 'Recompensa não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_membro_id := public.meu_membro_id(v_recompensa.empresa_id);
  if v_membro_id is null then
    raise exception 'Você não tem acesso a essa empresa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if not v_recompensa.ativa then
    raise exception 'Essa recompensa não está mais disponível.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_recompensa.validade_ate is not null and v_recompensa.validade_ate < current_date then
    raise exception 'Essa recompensa expirou.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if v_recompensa.estoque is not null then
    select count(*) into v_resgatados from public.resgates
      where recompensa_id = p_recompensa_id and status <> 'cancelado';
    if v_resgatados >= v_recompensa.estoque then
      raise exception 'Estoque esgotado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if v_recompensa.limite_por_membro is not null then
    select count(*) into v_resgatados from public.resgates
      where recompensa_id = p_recompensa_id and membro_id = v_membro_id and status <> 'cancelado';
    if v_resgatados >= v_recompensa.limite_por_membro then
      raise exception 'Você já atingiu o limite de resgates dessa recompensa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  select coalesce(sum(pontos), 0) into v_saldo from public.point_ledger
    where membro_id = v_membro_id and empresa_id = v_recompensa.empresa_id and not estornado;
  if v_saldo < v_recompensa.custo_pontos then
    raise exception 'Pontos insuficientes.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.resgates (empresa_id, recompensa_id, membro_id, pontos_debitados)
    values (v_recompensa.empresa_id, p_recompensa_id, v_membro_id, v_recompensa.custo_pontos)
    returning * into v_resgate;

  insert into public.point_ledger (empresa_id, membro_id, pontos, descricao, referencia_tipo, referencia_id)
    values (v_recompensa.empresa_id, v_membro_id, -v_recompensa.custo_pontos, 'Resgate: ' || v_recompensa.nome, 'resgate', v_resgate.id);

  return v_resgate;
end;
$$;

-- Admin avança o status do pedido; cancelar devolve os pontos (estorna o
-- lançamento de débito em vez de criar um novo, seguindo o mesmo mecanismo
-- de estorno que o extrato já tem).
create or replace function public.atualizar_status_resgate(p_resgate_id uuid, p_novo_status public.status_resgate)
returns public.resgates
language plpgsql security definer set search_path = ''
as $$
declare
  v_resgate public.resgates;
begin
  select * into v_resgate from public.resgates where id = p_resgate_id for update;
  if not found then
    raise exception 'Resgate não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not public.tem_papel(v_resgate.empresa_id, '{admin}') then
    raise exception 'Só o admin pode alterar o status do resgate.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  if v_resgate.status = 'cancelado' or v_resgate.status = p_novo_status then
    raise exception 'Transição de status inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_resgate.status = 'entregue' and p_novo_status <> 'entregue' then
    raise exception 'Transição de status inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_novo_status = 'cancelado' then
    update public.point_ledger
      set estornado = true, estornado_em = now(), estornado_por = public.meu_membro_id(v_resgate.empresa_id)
      where referencia_tipo = 'resgate' and referencia_id = v_resgate.id and not estornado;
  end if;

  update public.resgates set status = p_novo_status where id = p_resgate_id returning * into v_resgate;
  return v_resgate;
end;
$$;

revoke all on function public.solicitar_resgate(uuid) from public;
grant execute on function public.solicitar_resgate(uuid) to authenticated;
revoke all on function public.atualizar_status_resgate(uuid, public.status_resgate) from public;
grant execute on function public.atualizar_status_resgate(uuid, public.status_resgate) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.recompensas enable row level security;
alter table public.resgates enable row level security;

create policy "membro ve catalogo de recompensas" on public.recompensas for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria recompensa" on public.recompensas for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita recompensa" on public.recompensas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin apaga recompensa" on public.recompensas for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));

create policy "ver resgates" on public.resgates for select to authenticated
  using (public.pode_ver_responsavel(empresa_id, membro_id));

-- Resgates só mudam via solicitar_resgate/atualizar_status_resgate (security
-- definer), nunca por insert/update direto do cliente.
revoke insert, update, delete on public.resgates from anon, authenticated, service_role;
