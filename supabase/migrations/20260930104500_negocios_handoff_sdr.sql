-- Handoff SDR → vendedor (spec RAION_SDR_REGRAS_PERMISSOES, fase 5, §20-22).
-- Registro próprio em vez de depender só da troca de responsavel_id (a troca já loga
-- "responsavel_alterado" em atividades via gatilho existente; aqui fica o snapshot da
-- qualificação e quem entregou pra quem).
create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  contato_id uuid not null references public.contatos (id) on delete cascade,
  de_membro_id uuid references public.empresa_membros (id) on delete set null,
  para_membro_id uuid not null references public.empresa_membros (id) on delete restrict,
  status_qualificacao text not null,
  qualificacao_snapshot jsonb not null default '{}'::jsonb,
  observacoes text,
  created_at timestamptz not null default now()
);
create index on public.handoffs (negocio_id, created_at desc);

alter table public.handoffs enable row level security;

create policy "handoffs: ver quem vê o negócio" on public.handoffs for select to authenticated
  using (
    public.membro_ativo(empresa_id)
    and exists (
      select 1 from public.negocios n where n.id = negocio_id and public.pode_ver_responsavel(n.empresa_id, n.responsavel_id)
    )
  );

create policy "handoffs: criar quem vê o negócio" on public.handoffs for insert to authenticated
  with check (
    public.membro_ativo(empresa_id)
    and exists (
      select 1 from public.negocios n where n.id = negocio_id and public.pode_ver_responsavel(n.empresa_id, n.responsavel_id)
    )
  );
