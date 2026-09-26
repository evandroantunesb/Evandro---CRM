-- Entrega 6 (itens 1-3): formulário público de captura de leads, com
-- distribuição automática por rodízio entre os vendedores que recebem leads.
-- A fila de aprovação do gestor (item 4) e as notificações (item 5) ficam
-- para depois — por enquanto o lead cai direto no responsável sorteado.

alter table public.empresa_membros add column recebeu_lead_em timestamptz;
comment on column public.empresa_membros.recebeu_lead_em is
  'Quando recebeu o último lead do rodízio. Usado para escolher o próximo (o mais antigo, ou nunca recebeu, entra primeiro).';

create table public.formularios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  funil_id uuid not null references public.funis (id) on delete restrict,
  origem_id uuid not null references public.origens (id) on delete restrict,
  -- Token do link público (ex.: raioncrm.com/captura/<token>): não é
  -- sequencial nem previsível, então funciona como a própria autorização de
  -- envio de quem recebe o link, sem precisar de login.
  token text not null unique default gen_random_uuid()::text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.formularios (empresa_id);
create index on public.formularios (token);

create trigger formularios_updated_at before update on public.formularios
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.formularios enable row level security;

create policy "ver formularios" on public.formularios for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria formularios" on public.formularios for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita formularios" on public.formularios for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

-- O formulário público (sem login) é lido e gravado pelo cliente com a
-- service role, depois de validar o token no servidor — mesmo padrão da
-- proposta pública (ver propostas.token). Não precisa de política para
-- "anon"/"authenticated" aqui.
