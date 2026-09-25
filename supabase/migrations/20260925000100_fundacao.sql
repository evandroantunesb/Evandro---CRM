-- Entrega 1: fundação multiempresa.
-- Todo dado operacional pertence a uma empresa. O isolamento é garantido
-- pelas políticas de RLS abaixo, não pelo código da aplicação.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.papel_membro as enum ('admin', 'gestor', 'vendedor');
create type public.tipo_vendedor as enum ('interno', 'representante');
create type public.situacao_empresa as enum ('ativa', 'suspensa', 'cancelada');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- Donos da plataforma (super-admin). Gerenciam empresas e cobrança,
-- mas não enxergam os dados comerciais (contatos, negócios) das empresas.
create table public.plataforma_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email citext not null,
  telefone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  cnpj text,
  situacao public.situacao_empresa not null default 'ativa',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.empresa_membros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- Aponta para perfis (que cascateia de auth.users) para a API conseguir juntar nome e e-mail.
  user_id uuid not null references public.perfis (id) on delete cascade,
  papel public.papel_membro not null default 'vendedor',
  tipo_vendedor public.tipo_vendedor,
  recebe_leads boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);
create index on public.empresa_membros (user_id);

create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.equipe_membros (
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  e_gestor boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (equipe_id, membro_id)
);

-- Auditoria: somente inserção, preenchida por gatilhos.
create table public.logs_auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid references public.empresas (id) on delete cascade,
  user_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id text,
  dados_antes jsonb,
  dados_depois jsonb,
  created_at timestamptz not null default now()
);
create index on public.logs_auditoria (empresa_id, created_at desc);

-- Eventos de domínio: a base da gamificação (Fase 2). Somente inserção.
create table public.eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo text not null,
  ator_id uuid,
  entidade text,
  entidade_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.eventos (empresa_id, tipo, created_at desc);

-- ---------------------------------------------------------------------------
-- Funções auxiliares de permissão
-- (security definer para não entrar em recursão com as próprias políticas)
-- ---------------------------------------------------------------------------

create or replace function public.e_plataforma_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.plataforma_admins where user_id = (select auth.uid())
  );
$$;

create or replace function public.membro_ativo(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros m
    join public.empresas e on e.id = m.empresa_id
    where m.empresa_id = p_empresa_id
      and m.user_id = (select auth.uid())
      and m.ativo
      and e.situacao = 'ativa'
  );
$$;

create or replace function public.tem_papel(p_empresa_id uuid, p_papeis public.papel_membro[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros m
    join public.empresas e on e.id = m.empresa_id
    where m.empresa_id = p_empresa_id
      and m.user_id = (select auth.uid())
      and m.ativo
      and e.situacao = 'ativa'
      and m.papel = any (p_papeis)
  );
$$;

create or replace function public.compartilha_empresa(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_membros meu
    join public.empresa_membros outro on outro.empresa_id = meu.empresa_id
    where meu.user_id = (select auth.uid())
      and meu.ativo
      and outro.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger empresas_updated_at before update on public.empresas
  for each row execute function public.tocar_updated_at();
create trigger perfis_updated_at before update on public.perfis
  for each row execute function public.tocar_updated_at();
create trigger empresa_membros_updated_at before update on public.empresa_membros
  for each row execute function public.tocar_updated_at();
create trigger equipes_updated_at before update on public.equipes
  for each row execute function public.tocar_updated_at();

-- Cria o perfil assim que o usuário é criado no Auth (cadastro ou convite).
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Vendedor precisa ter tipo (interno ou representante); admin e gestor não.
create or replace function public.validar_membro()
returns trigger
language plpgsql
as $$
begin
  if new.papel = 'vendedor' and new.tipo_vendedor is null then
    new.tipo_vendedor := 'interno';
  end if;
  return new;
end;
$$;

create trigger empresa_membros_validar before insert or update on public.empresa_membros
  for each row execute function public.validar_membro();

-- A empresa nunca pode ficar sem um admin ativo.
create or replace function public.garantir_admin_ativo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := coalesce(old.empresa_id, new.empresa_id);
begin
  -- Se a própria empresa está sendo apagada, não há o que proteger.
  if not exists (select 1 from public.empresas where id = v_empresa) then
    return null;
  end if;
  if old.papel = 'admin' and old.ativo and not exists (
    select 1 from public.empresa_membros
    where empresa_id = v_empresa and papel = 'admin' and ativo
  ) then
    raise exception 'A empresa precisa ter pelo menos um admin ativo'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger empresa_membros_admin_ativo after update or delete on public.empresa_membros
  for each row execute function public.garantir_admin_ativo();

-- equipe_membros.empresa_id precisa bater com a equipe e com o membro.
create or replace function public.validar_equipe_membro()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.equipes where id = new.equipe_id and empresa_id = new.empresa_id)
     or not exists (select 1 from public.empresa_membros where id = new.membro_id and empresa_id = new.empresa_id) then
    raise exception 'Equipe e membro precisam ser da mesma empresa'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger equipe_membros_validar before insert or update on public.equipe_membros
  for each row execute function public.validar_equipe_membro();

-- Auditoria genérica.
create or replace function public.auditar()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_linha jsonb := coalesce(v_depois, v_antes);
  v_empresa uuid;
begin
  v_empresa := case
    when tg_table_name = 'empresas' then (v_linha ->> 'id')::uuid
    else (v_linha ->> 'empresa_id')::uuid
  end;
  -- Ao apagar uma empresa, os filhos vêm em cascata e a referência não existe mais.
  if v_empresa is not null and not exists (select 1 from public.empresas where id = v_empresa) then
    v_empresa := null;
  end if;
  insert into public.logs_auditoria (empresa_id, user_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (
    v_empresa,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(v_linha ->> 'id', v_linha ->> 'equipe_id' || ':' || (v_linha ->> 'membro_id')),
    v_antes,
    v_depois
  );
  return null;
end;
$$;

create trigger auditar_empresas after insert or update or delete on public.empresas
  for each row execute function public.auditar();
create trigger auditar_empresa_membros after insert or update or delete on public.empresa_membros
  for each row execute function public.auditar();
create trigger auditar_equipes after insert or update or delete on public.equipes
  for each row execute function public.auditar();
create trigger auditar_equipe_membros after insert or update or delete on public.equipe_membros
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.plataforma_admins enable row level security;
alter table public.perfis enable row level security;
alter table public.empresas enable row level security;
alter table public.empresa_membros enable row level security;
alter table public.equipes enable row level security;
alter table public.equipe_membros enable row level security;
alter table public.logs_auditoria enable row level security;
alter table public.eventos enable row level security;

-- plataforma_admins: cada um só descobre se ele mesmo é admin.
create policy "ver o próprio registro" on public.plataforma_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- perfis
create policy "ver perfis da mesma empresa" on public.perfis
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.compartilha_empresa(id)
    or public.e_plataforma_admin()
  );
create policy "editar o próprio perfil" on public.perfis
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- empresas: só o super-admin cria, edita e apaga.
create policy "ver empresas das quais participo" on public.empresas
  for select to authenticated
  using (public.membro_ativo(id) or public.e_plataforma_admin());
create policy "super-admin cria empresas" on public.empresas
  for insert to authenticated with check (public.e_plataforma_admin());
create policy "super-admin edita empresas" on public.empresas
  for update to authenticated
  using (public.e_plataforma_admin()) with check (public.e_plataforma_admin());
create policy "super-admin apaga empresas" on public.empresas
  for delete to authenticated using (public.e_plataforma_admin());

-- empresa_membros
create policy "ver membros da empresa" on public.empresa_membros
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.membro_ativo(empresa_id)
    or public.e_plataforma_admin()
  );
create policy "admin adiciona membros" on public.empresa_membros
  for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}') or public.e_plataforma_admin());
create policy "admin edita membros" on public.empresa_membros
  for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}') or public.e_plataforma_admin())
  with check (public.tem_papel(empresa_id, '{admin}') or public.e_plataforma_admin());
create policy "admin remove membros" on public.empresa_membros
  for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}') or public.e_plataforma_admin());

-- equipes
create policy "ver equipes da empresa" on public.equipes
  for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria equipes" on public.equipes
  for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita equipes" on public.equipes
  for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin apaga equipes" on public.equipes
  for delete to authenticated using (public.tem_papel(empresa_id, '{admin}'));

-- equipe_membros
create policy "ver composição das equipes" on public.equipe_membros
  for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin monta equipes" on public.equipe_membros
  for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin altera equipes" on public.equipe_membros
  for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin tira da equipe" on public.equipe_membros
  for delete to authenticated using (public.tem_papel(empresa_id, '{admin}'));

-- logs_auditoria: leitura para o admin da empresa e para o super-admin.
-- Nenhuma política de escrita: só os gatilhos (security definer) inserem.
create policy "admin lê auditoria" on public.logs_auditoria
  for select to authenticated
  using (
    (empresa_id is not null and public.tem_papel(empresa_id, '{admin}'))
    or public.e_plataforma_admin()
  );

-- eventos: leitura para admin e gestor da empresa. Escrita só pelo servidor.
create policy "admin e gestor leem eventos" on public.eventos
  for select to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'));

-- Auditoria e eventos são imutáveis, inclusive para o service role.
revoke update, delete on public.logs_auditoria from anon, authenticated, service_role;
revoke update, delete on public.eventos from anon, authenticated, service_role;
