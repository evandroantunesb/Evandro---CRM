-- Entrega 5 (reestruturação): a potência/consumo/tarifa ficam no negócio (o
-- contato é só dado pessoal/residência), com mais dados de instalação
-- (unidade consumidora, padrão do cliente, tipo do telhado). O kit deixa de
-- vir só do catálogo: o vendedor monta um kit personalizado (módulos,
-- inversor, baterias, outros itens) por negócio, e os anexos ganham
-- categoria (CNH, fatura do gerador, fatura dos beneficiários).

-- ---------------------------------------------------------------------------
-- Dados de instalação no negócio
-- ---------------------------------------------------------------------------

alter table public.negocios add column tipo_telhado text;
alter table public.negocios add column unidade_consumidora text;
alter table public.negocios add column padrao_cliente text;
alter table public.negocios add column estrutura_telhado text;

-- ---------------------------------------------------------------------------
-- Kit personalizado (por negócio, substitui a escolha de kit do catálogo)
-- ---------------------------------------------------------------------------

create type public.tipo_componente_kit as enum ('modulo', 'inversor', 'bateria', 'outro');

create table public.kit_componentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  tipo public.tipo_componente_kit not null,
  descricao text not null check (length(trim(descricao)) > 0),
  potencia_w numeric(8, 2) check (potencia_w is null or potencia_w > 0),
  quantidade integer not null default 1 check (quantidade > 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.kit_componentes (negocio_id, ordem);

alter table public.kit_componentes enable row level security;

create policy "ver componentes do kit" on public.kit_componentes for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
create policy "gerenciar componentes do kit" on public.kit_componentes for insert to authenticated
  with check (public.membro_ativo(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "editar componentes do kit" on public.kit_componentes for update to authenticated
  using (public.pode_ver_negocio(negocio_id)) with check (public.pode_ver_negocio(negocio_id));
create policy "apagar componentes do kit" on public.kit_componentes for delete to authenticated
  using (public.pode_ver_negocio(negocio_id));

-- ---------------------------------------------------------------------------
-- Categoria do anexo (CNH, faturas) — permite anexar já na criação do negócio
-- ---------------------------------------------------------------------------

alter table public.anexos add column categoria text not null default 'geral'
  check (categoria in ('geral', 'cnh', 'fatura_gerador', 'fatura_beneficiario'));
