-- Fase 2 (gamificação): metas por colaborador — conceito separado de pontos
-- (não usa point_ledger nem gamification_rules), calculado em cima dos dados
-- que já existem em negócios e tarefas.

create type public.metrica_meta as enum ('receita', 'negocios_ganhos', 'reunioes', 'conversao', 'tarefas_concluidas');

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  metrica public.metrica_meta not null,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null check (periodo_fim >= periodo_inicio),
  valor_alvo numeric(14, 2) not null check (valor_alvo > 0),
  ativa boolean not null default true,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.metas (empresa_id, membro_id, periodo_fim);

create trigger metas_tocar_updated_at
  before update on public.metas
  for each row execute function public.tocar_updated_at();

alter table public.metas enable row level security;

-- Mesma regra de visibilidade já usada em negócios/tarefas: admin vê tudo,
-- gestor vê a própria equipe, colaborador vê as próprias metas.
create policy "metas_select" on public.metas for select to authenticated
  using (public.pode_ver_responsavel(empresa_id, membro_id));

create policy "metas_insert" on public.metas for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));

create policy "metas_update" on public.metas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));

create policy "metas_delete" on public.metas for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
