-- Fase 1 do kit automático (spec V2): a empresa passa a ter um catálogo
-- próprio de módulos e inversores ativos (hoje o vendedor buscava direto no
-- catálogo da OpenSolar e montava o kit à mão). O motor de dimensionamento
-- automático escolhe só entre os equipamentos marcados como ativos aqui.
--
-- Validação elétrica nesta fase: só overload (relação DC/AC), com a potência
-- (Wp/W AC) que já existe hoje. Stringing/MPPT/tensão ficam para quando o
-- catálogo ganhar os campos elétricos completos (fase seguinte).

create table public.equipamentos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo public.tipo_componente_kit not null check (tipo in ('modulo', 'inversor')),
  -- Id do componente no catálogo da OpenSolar, quando veio de lá (busca por
  -- fabricante/código); nulo se cadastrado manualmente no futuro.
  opensolar_id bigint,
  fabricante text not null check (length(trim(fabricante)) > 0),
  modelo text not null check (length(trim(modelo)) > 0),
  potencia_w numeric(8, 2) not null check (potencia_w > 0),
  ativo boolean not null default true,
  -- Maior = mais prioridade no ranking do dimensionamento automático.
  prioridade integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.equipamentos_empresa (empresa_id, tipo, ativo);

create trigger equipamentos_empresa_updated_at before update on public.equipamentos_empresa
  for each row execute function public.tocar_updated_at();

alter table public.equipamentos_empresa enable row level security;

create policy "ver equipamentos" on public.equipamentos_empresa for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria equipamentos" on public.equipamentos_empresa for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita equipamentos" on public.equipamentos_empresa for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin apaga equipamentos" on public.equipamentos_empresa for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));

-- ---------------------------------------------------------------------------
-- Parâmetros do dimensionamento automático
-- ---------------------------------------------------------------------------

alter table public.parametros_calculadora
  add column margem_dimensionamento_pct numeric(4, 3) not null default 0.20
    check (margem_dimensionamento_pct >= 0 and margem_dimensionamento_pct <= 1),
  add column overload_maximo_pct numeric(4, 3) not null default 0.30
    check (overload_maximo_pct >= 0 and overload_maximo_pct <= 1);
