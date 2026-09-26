-- Entrega 8 (parte 1): plano e cobrança por empresa. O super-admin define o
-- plano de cada empresa (grátis ou pago, com um modelo de cobrança) e fecha
-- um resumo por mês, marcando manualmente quando foi pago (sem gateway
-- automático na V1). O fechamento é uma foto do mês: se o preço do plano
-- mudar depois, o histórico já fechado não muda.

create type public.tipo_plano as enum ('gratuito', 'pago');
create type public.modelo_cobranca as enum ('por_usuario', 'fixo', 'fixo_mais_usuario');

create table public.planos_empresa (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  tipo public.tipo_plano not null default 'gratuito',
  modelo_cobranca public.modelo_cobranca,
  valor_fixo numeric(10, 2),
  valor_por_usuario numeric(10, 2),
  dia_vencimento smallint check (dia_vencimento between 1 and 28),
  limite_usuarios integer check (limite_usuarios > 0),
  atualizado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fechamento mensal: uma linha por empresa por mês, criada pelo super-admin
-- ao "fechar o mês". Guarda os valores já calculados daquele momento, para
-- não depender mais do plano atual (que pode mudar depois).
create table public.fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  referencia date not null check (extract(day from referencia) = 1),
  usuarios_ativos integer not null default 0,
  valor_fixo numeric(10, 2) not null default 0,
  valor_por_usuario numeric(10, 2) not null default 0,
  valor_total numeric(10, 2) not null default 0,
  pago boolean not null default false,
  pago_em timestamptz,
  registrado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (empresa_id, referencia)
);
create index on public.fechamentos_mensais (empresa_id, referencia desc);

create trigger planos_empresa_updated_at before update on public.planos_empresa
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — cobrança é assunto do super-admin, nenhuma empresa enxerga seu plano
-- ou fechamentos por aqui na V1.
-- ---------------------------------------------------------------------------

alter table public.planos_empresa enable row level security;
alter table public.fechamentos_mensais enable row level security;

create policy "super-admin ve planos" on public.planos_empresa for select to authenticated
  using (public.e_plataforma_admin());
create policy "super-admin cria planos" on public.planos_empresa for insert to authenticated
  with check (public.e_plataforma_admin());
create policy "super-admin edita planos" on public.planos_empresa for update to authenticated
  using (public.e_plataforma_admin()) with check (public.e_plataforma_admin());
create policy "super-admin apaga planos" on public.planos_empresa for delete to authenticated
  using (public.e_plataforma_admin());

create policy "super-admin ve fechamentos" on public.fechamentos_mensais for select to authenticated
  using (public.e_plataforma_admin());
create policy "super-admin cria fechamentos" on public.fechamentos_mensais for insert to authenticated
  with check (public.e_plataforma_admin());
create policy "super-admin edita fechamentos" on public.fechamentos_mensais for update to authenticated
  using (public.e_plataforma_admin()) with check (public.e_plataforma_admin());
create policy "super-admin apaga fechamentos" on public.fechamentos_mensais for delete to authenticated
  using (public.e_plataforma_admin());
