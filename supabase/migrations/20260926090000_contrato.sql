-- Entrega 9 (início): contrato a partir de modelo da empresa. A leitura
-- automática de CNH/fatura por IA e a assinatura via gov.br ficam de fora
-- desta migration — dependem de uma chave de API de IA com visão e de uma
-- integração externa que o Evandro ainda vai decidir (ver memória do
-- projeto). Aqui entra só o que já dá pra fazer com o que o CRM já tem: o
-- admin escreve um modelo de contrato com campos entre chaves duplas (ex.:
-- {{cliente_nome}}), e o vendedor gera o contrato de um negócio preenchendo
-- esses campos automaticamente.

create type public.status_contrato as enum ('rascunho', 'aguardando_assinatura', 'assinado');

-- Um modelo por empresa (o admin edita o texto-base com os campos).
create table public.modelos_contrato (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  conteudo text not null default '',
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um contrato por negócio, como a proposta. O conteúdo é uma foto do modelo
-- já preenchido no momento da geração — assim, editar o modelo depois não
-- muda um contrato já gerado (mesmo raciocínio do fechamento mensal de
-- cobrança). Token público nos mesmos moldes da proposta, para o cliente
-- conseguir ver/baixar sem login (a assinatura em si ainda é manual/externa
-- na V1 — o status é ajustado à mão pelo vendedor).
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null unique references public.negocios (id) on delete cascade,
  token text not null unique default gen_random_uuid()::text,
  conteudo text not null,
  status public.status_contrato not null default 'rascunho',
  criado_por uuid references public.empresa_membros (id) on delete set null,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.contratos (token);

create trigger modelos_contrato_updated_at before update on public.modelos_contrato
  for each row execute function public.tocar_updated_at();
create trigger contratos_updated_at before update on public.contratos
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.modelos_contrato enable row level security;
alter table public.contratos enable row level security;

-- Modelo: todo mundo da empresa vê (o vendedor precisa saber o que vai sair
-- no contrato), só admin edita.
create policy "ver modelo de contrato" on public.modelos_contrato for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria modelo de contrato" on public.modelos_contrato for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita modelo de contrato" on public.modelos_contrato for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

-- Contrato: mesma regra da proposta — quem vê o negócio vê, gera e
-- atualiza; apagar fica para quem criou ou o admin.
create policy "ver contrato" on public.contratos for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
create policy "criar contrato" on public.contratos for insert to authenticated
  with check (public.membro_ativo(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "editar contrato" on public.contratos for update to authenticated
  using (public.pode_ver_negocio(negocio_id)) with check (public.pode_ver_negocio(negocio_id));
create policy "apagar contrato" on public.contratos for delete to authenticated
  using (
    public.pode_ver_negocio(negocio_id)
    and (criado_por = public.meu_membro_id(empresa_id) or public.tem_papel(empresa_id, '{admin}'))
  );
