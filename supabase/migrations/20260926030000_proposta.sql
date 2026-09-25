-- Entrega 5 (continuação): proposta com link de compartilhamento. A proposta
-- lê direto do cálculo do negócio (entrega 4), sem duplicar nem recalcular
-- nada. Cada negócio tem uma proposta (como o cálculo); o link público usa um
-- token e não exige login do cliente. Cada abertura do link fica registrada,
-- para o vendedor ver quando e quantas vezes o cliente abriu.

create type public.modo_preco_proposta as enum ('sem_preco', 'parcelado', 'avista', 'completo');

create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null unique references public.negocios (id) on delete cascade,
  -- Token do link público (ex.: raioncrm.com/proposta/<token>): não é
  -- sequencial nem previsível, então funciona como a própria autorização de
  -- leitura de quem recebe o link, sem precisar de login.
  token text not null unique default gen_random_uuid()::text,
  modo_preco public.modo_preco_proposta not null default 'completo',
  mensagem text,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.propostas (token);

-- Cada abertura do link público (o cliente vendo a proposta), para o
-- vendedor acompanhar data/hora e quantas vezes foi aberta. Só é escrita
-- pela rota pública, com a chave de serviço (sem RLS de usuário — o token já
-- é o controle de acesso da leitura pública).
create table public.propostas_aberturas (
  id bigint generated always as identity primary key,
  proposta_id uuid not null references public.propostas (id) on delete cascade,
  aberta_em timestamptz not null default now()
);
create index on public.propostas_aberturas (proposta_id, aberta_em);

create trigger propostas_updated_at before update on public.propostas
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.propostas enable row level security;
alter table public.propostas_aberturas enable row level security;

-- Proposta: mesma regra do cálculo — quem vê o negócio vê, gera e atualiza a
-- proposta; apagar fica para quem criou ou o admin.
create policy "ver proposta" on public.propostas for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
create policy "criar proposta" on public.propostas for insert to authenticated
  with check (public.membro_ativo(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "editar proposta" on public.propostas for update to authenticated
  using (public.pode_ver_negocio(negocio_id)) with check (public.pode_ver_negocio(negocio_id));
create policy "apagar proposta" on public.propostas for delete to authenticated
  using (
    public.pode_ver_negocio(negocio_id)
    and (criado_por = public.meu_membro_id(empresa_id) or public.tem_papel(empresa_id, '{admin}'))
  );

-- Aberturas: só quem vê o negócio da proposta enxerga o histórico. Nenhuma
-- política de insert/update/delete para usuários autenticados — a rota
-- pública grava com a chave de serviço, que ignora RLS.
create policy "ver aberturas" on public.propostas_aberturas for select to authenticated
  using (exists (
    select 1 from public.propostas p
    where p.id = proposta_id and public.pode_ver_negocio(p.negocio_id)
  ));
