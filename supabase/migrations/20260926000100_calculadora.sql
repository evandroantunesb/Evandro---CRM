-- Entrega 4: calculadora solar (modo comercial). Kits por catálogo, dimensionamento
-- a partir do consumo/fatura, economia com desconto de disponibilidade e Fio B
-- (Lei 14.300), payback. O cálculo fica preso ao negócio, pronto para a proposta
-- (entrega 5) consumir direto, sem precisar recalcular nada.

create type public.tipo_ligacao as enum ('monofasico', 'bifasico', 'trifasico');

-- ---------------------------------------------------------------------------
-- Parâmetros por empresa (ajustáveis pelo admin; usados como padrão no cálculo)
-- ---------------------------------------------------------------------------

-- Valores padrão são uma simplificação nacional para o modo comercial (sem
-- simulação horária/pvlib). O admin deve calibrar com o engenheiro responsável
-- antes de usar com clientes reais, principalmente a produtividade por estado.
create table public.parametros_calculadora (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  produtividade_kwh_kwp_mes numeric(6, 2) not null default 120 check (produtividade_kwh_kwp_mes > 0),
  percentual_fio_b numeric(4, 3) not null default 0.6 check (percentual_fio_b >= 0 and percentual_fio_b <= 1),
  disponibilidade_mono_kwh numeric(6, 2) not null default 30 check (disponibilidade_mono_kwh >= 0),
  disponibilidade_bi_kwh numeric(6, 2) not null default 50 check (disponibilidade_bi_kwh >= 0),
  disponibilidade_tri_kwh numeric(6, 2) not null default 100 check (disponibilidade_tri_kwh >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.criar_parametros_calculadora_padrao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.parametros_calculadora (empresa_id) values (new.id);
  return null;
end;
$$;
create trigger empresas_parametros_calculadora after insert on public.empresas
  for each row execute function public.criar_parametros_calculadora_padrao();

insert into public.parametros_calculadora (empresa_id)
select e.id from public.empresas e
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Kits (catálogo comercial, hoje mantido por planilha/cadastro manual)
-- ---------------------------------------------------------------------------

create table public.kits_solares (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  potencia_kwp numeric(6, 2) not null check (potencia_kwp > 0),
  preco numeric(12, 2) not null check (preco >= 0),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.kits_solares (empresa_id, ativo, potencia_kwp);

-- ---------------------------------------------------------------------------
-- Cálculo do negócio (um por negócio; a proposta lê direto daqui)
-- ---------------------------------------------------------------------------

create table public.calculos_solares (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null unique references public.negocios (id) on delete cascade,
  kit_id uuid references public.kits_solares (id) on delete set null,
  -- Preço e potência do kit no momento do cálculo, para a proposta não mudar
  -- sozinha se o catálogo for atualizado depois.
  kit_nome text not null,
  kit_potencia_kwp numeric(6, 2) not null check (kit_potencia_kwp > 0),
  kit_preco numeric(12, 2) not null check (kit_preco >= 0),
  tipo_ligacao public.tipo_ligacao not null default 'trifasico',
  consumo_medio_kwh numeric(10, 2) not null check (consumo_medio_kwh > 0),
  valor_fatura_medio numeric(12, 2),
  tarifa_kwh numeric(8, 4) not null check (tarifa_kwh > 0),
  produtividade_kwh_kwp_mes numeric(6, 2) not null check (produtividade_kwh_kwp_mes > 0),
  percentual_fio_b numeric(4, 3) not null check (percentual_fio_b >= 0 and percentual_fio_b <= 1),
  disponibilidade_kwh numeric(6, 2) not null check (disponibilidade_kwh >= 0),
  geracao_estimada_kwh_mes numeric(10, 2) not null,
  kwh_faturado numeric(10, 2) not null,
  kwh_compensado numeric(10, 2) not null,
  custo_fio_b numeric(12, 2) not null,
  conta_sem_solar numeric(12, 2) not null,
  conta_com_solar numeric(12, 2) not null,
  economia_mensal numeric(12, 2) not null,
  payback_meses numeric(6, 1),
  observacoes text,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger kits_solares_updated_at before update on public.kits_solares
  for each row execute function public.tocar_updated_at();
create trigger calculos_solares_updated_at before update on public.calculos_solares
  for each row execute function public.tocar_updated_at();
create trigger parametros_calculadora_updated_at before update on public.parametros_calculadora
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.parametros_calculadora enable row level security;
alter table public.kits_solares enable row level security;
alter table public.calculos_solares enable row level security;

create policy "ver parâmetros" on public.parametros_calculadora for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin edita parâmetros" on public.parametros_calculadora for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

create policy "ver kits" on public.kits_solares for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria kits" on public.kits_solares for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita kits" on public.kits_solares for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin apaga kits" on public.kits_solares for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));

-- Cálculo: quem vê o negócio vê, calcula e recalcula (é uma ferramenta de trabalho
-- do vendedor); apagar fica para quem calculou ou o admin.
create policy "ver cálculo" on public.calculos_solares for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
create policy "criar cálculo" on public.calculos_solares for insert to authenticated
  with check (public.membro_ativo(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "editar cálculo" on public.calculos_solares for update to authenticated
  using (public.pode_ver_negocio(negocio_id)) with check (public.pode_ver_negocio(negocio_id));
create policy "apagar cálculo" on public.calculos_solares for delete to authenticated
  using (
    public.pode_ver_negocio(negocio_id)
    and (criado_por = public.meu_membro_id(empresa_id) or public.tem_papel(empresa_id, '{admin}'))
  );
