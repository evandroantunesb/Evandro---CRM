-- Fase 2: níveis (XP) e conquistas, lendo do mesmo extrato de pontos da
-- migration anterior (pontos = XP, como diz a especificação). V1 das
-- conquistas cobre só o critério "pontos acumulados" (o mesmo mostrado na
-- referência visual do Groner: "Veterano — acumule 5.000 pontos"); outros
-- critérios (negócios ganhos, faturamento, sequência de dias etc.) podem
-- entrar depois sem quebrar o que já existe, só ampliando o `criterio`.

create table public.niveis_gamificacao (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nivel integer not null check (nivel >= 1),
  nome text,
  xp_minimo integer not null check (xp_minimo >= 0),
  primary key (empresa_id, nivel)
);
create unique index on public.niveis_gamificacao (empresa_id, xp_minimo);

create table public.conquistas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  descricao text not null default '',
  icone text not null default '🏆',
  criterio jsonb not null,
  xp_bonus integer not null default 0 check (xp_bonus >= 0),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conquistas (empresa_id) where ativa;

create table public.conquistas_desbloqueadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  conquista_id uuid not null references public.conquistas (id) on delete cascade,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  desbloqueada_em timestamptz not null default now(),
  unique (conquista_id, membro_id)
);
create index on public.conquistas_desbloqueadas (empresa_id, membro_id);

create trigger conquistas_updated_at before update on public.conquistas
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- Gatilho: todo lançamento de pontos reavalia as conquistas por pontos
-- acumulados do membro. Desbloquear uma conquista com XP bônus lança um novo
-- ponto no extrato (referenciando a própria conquista), o que reaciona este
-- mesmo gatilho — termina sozinho porque cada conquista só desbloqueia uma
-- vez (unique em conquista_id+membro_id).
-- ---------------------------------------------------------------------------

create or replace function public.avaliar_conquistas_pontos()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric;
  v_conquista record;
begin
  if new.estornado then
    return new;
  end if;

  select coalesce(sum(pontos), 0) into v_total
    from public.point_ledger
    where membro_id = new.membro_id and not estornado;

  for v_conquista in
    select * from public.conquistas
    where empresa_id = new.empresa_id
      and ativa
      and criterio->>'metrica' = 'pontos_acumulados'
      and v_total >= (criterio->>'valor')::numeric
      and not exists (
        select 1 from public.conquistas_desbloqueadas cd
        where cd.conquista_id = conquistas.id and cd.membro_id = new.membro_id
      )
  loop
    insert into public.conquistas_desbloqueadas (empresa_id, conquista_id, membro_id)
      values (new.empresa_id, v_conquista.id, new.membro_id);

    if v_conquista.xp_bonus > 0 then
      insert into public.point_ledger (empresa_id, membro_id, descricao, referencia_tipo, referencia_id, pontos)
        values (new.empresa_id, new.membro_id, 'Conquista: ' || v_conquista.nome, 'conquista', v_conquista.id, v_conquista.xp_bonus);
    end if;
  end loop;

  return new;
end;
$$;

create trigger point_ledger_avaliar_conquistas after insert on public.point_ledger
  for each row execute function public.avaliar_conquistas_pontos();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.niveis_gamificacao enable row level security;
alter table public.conquistas enable row level security;
alter table public.conquistas_desbloqueadas enable row level security;

-- Níveis e conquistas: todo mundo da empresa vê (precisa saber o que falta
-- pra subir de nível ou desbloquear), só admin configura.
create policy "ver niveis" on public.niveis_gamificacao for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin gerencia niveis" on public.niveis_gamificacao for all to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

create policy "ver conquistas" on public.conquistas for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin gerencia conquistas" on public.conquistas for all to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

-- Conquistas desbloqueadas: mesma visibilidade do extrato de pontos.
create policy "ver conquistas desbloqueadas" on public.conquistas_desbloqueadas for select to authenticated
  using (public.pode_ver_responsavel(empresa_id, membro_id));

revoke insert, update, delete on public.conquistas_desbloqueadas from anon, authenticated, service_role;
