-- Fase 2 (gamificação): comissões — conceito diferente de pontos e de metas
-- (não usa point_ledger, gamification_rules nem a tabela metas). Cada
-- colaborador tem um plano com salário-base opcional, faixas de resultado
-- (percentual ou multiplicador) e OTE opcional; o cálculo por período fica
-- guardado como uma "foto" (não muda se o plano for editado depois).

create type public.tipo_calculo_comissao as enum ('percentual', 'multiplicador');

create table public.planos_comissao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  salario_base numeric(12, 2) check (salario_base is null or salario_base >= 0),
  meta_ote numeric(12, 2) check (meta_ote is null or meta_ote >= 0),
  tipo_calculo public.tipo_calculo_comissao not null default 'percentual',
  -- Faixas de resultado, ex.: [{"resultado_minimo": 0, "resultado_maximo": 10000, "valor": 3}, ...]
  -- "valor" é percentual (ex.: 3 = 3%) ou multiplicador direto, conforme tipo_calculo.
  faixas jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.planos_comissao (empresa_id, membro_id);
-- Só um plano ativo por colaborador de cada vez (histórico fica preservado, só desativado).
create unique index planos_comissao_um_ativo_por_membro on public.planos_comissao (membro_id) where ativo;

create trigger planos_comissao_tocar_updated_at
  before update on public.planos_comissao
  for each row execute function public.tocar_updated_at();

-- Histórico de cálculo: uma linha por colaborador por mês, uma "foto" do resultado
-- apurado e do valor calculado naquele momento (mesmo raciocínio já usado no
-- fechamento mensal de cobrança).
create table public.comissoes_calculadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  plano_id uuid references public.planos_comissao (id) on delete set null,
  referencia date not null check (extract(day from referencia) = 1),
  resultado_apurado numeric(14, 2) not null default 0,
  salario_base numeric(12, 2) not null default 0,
  valor_comissao numeric(14, 2) not null default 0,
  valor_total numeric(14, 2) not null default 0,
  faixa_aplicada jsonb,
  calculado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (empresa_id, membro_id, referencia)
);
create index on public.comissoes_calculadas (empresa_id, membro_id, referencia desc);

alter table public.planos_comissao enable row level security;
alter table public.comissoes_calculadas enable row level security;

-- Mesma regra de visibilidade já usada em negócios/tarefas/metas: admin vê tudo,
-- gestor vê a própria equipe, colaborador vê o que é seu.
create policy "planos_comissao_select" on public.planos_comissao for select to authenticated
  using (public.pode_ver_responsavel(empresa_id, membro_id));
create policy "planos_comissao_insert" on public.planos_comissao for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "planos_comissao_update" on public.planos_comissao for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "planos_comissao_delete" on public.planos_comissao for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));

create policy "comissoes_calculadas_select" on public.comissoes_calculadas for select to authenticated
  using (public.pode_ver_responsavel(empresa_id, membro_id));
create policy "comissoes_calculadas_insert" on public.comissoes_calculadas for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "comissoes_calculadas_update" on public.comissoes_calculadas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "comissoes_calculadas_delete" on public.comissoes_calculadas for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
