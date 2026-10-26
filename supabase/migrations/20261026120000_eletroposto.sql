-- Eletroposto: segundo tipo de negócio, ao lado do solar. Ao criar um negócio, o vendedor escolhe entre
-- energia solar (fluxo atual, com a calculadora) e eletroposto (carregador veicular de 80 kW, modelos
-- Basic, Full e Full Screen, com preços fixos de catálogo definidos no código: src/lib/eletroposto.ts).
--
-- 1. `empresas.eletroposto_ativo`: o módulo só aparece para a empresa que o tiver ligado (só o super-admin
--    edita `empresas`, pela tela de super-admin). Padrão desligado: nenhuma empresa muda sozinha.
-- 2. `negocios.tipo` (`solar` | `eletroposto`): padrão `solar`, então todo negócio existente continua solar.
-- 3. `negocios_eletroposto`: um registro por negócio de eletroposto, com o que o vendedor precisa saber
--    (local próprio para a instalação, usina fotovoltaica para fornecer a energia) e a proposta: modelos
--    escolhidos, preços congelados no momento da proposta (cada modelo é uma alternativa, nunca soma) e o
--    token do link público. Mudar o catálogo depois não muda proposta já gerada.
--
-- Acesso: mesma regra da proposta solar emitida — quem vê o negócio e tem papel com acesso a proposta e
-- contrato (admin, gestor, vendedor; SDR não). Sem policy de DELETE: o registro sai junto com o negócio.

alter table public.empresas add column eletroposto_ativo boolean not null default false;

create type public.tipo_negocio as enum ('solar', 'eletroposto');
alter table public.negocios add column tipo public.tipo_negocio not null default 'solar';

-- Preços congelados: um número positivo para cada modelo escolhido, nenhuma chave a mais.
create or replace function public.precos_eletroposto_validos(p_modelos text[], p_precos jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p_precos) = 'object'
    and (select count(*) from jsonb_object_keys(p_precos)) = cardinality(p_modelos)
    and not exists (
      select 1 from unnest(p_modelos) m
      where coalesce(jsonb_typeof(p_precos -> m), '') <> 'number' or (p_precos ->> m)::numeric <= 0
    );
$$;

create table public.negocios_eletroposto (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  local_proprio boolean not null,
  usina_fv boolean not null,
  modelos text[] not null
    check (cardinality(modelos) between 1 and 3 and modelos <@ array['basic', 'full', 'screen']),
  precos jsonb not null,
  -- Token do link público da proposta (não sequencial nem previsível): é a autorização de leitura de quem
  -- recebe o link, como em `propostas`.
  token text not null unique default gen_random_uuid()::text,
  -- Data da proposta (validade conta daqui); renovada quando os modelos mudam.
  emitida_em timestamptz not null default now(),
  criado_por uuid references public.empresa_membros (id) on delete set null,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint precos_dos_modelos check (public.precos_eletroposto_validos(modelos, precos))
);
create index on public.negocios_eletroposto (empresa_id);

create trigger negocios_eletroposto_updated_at before update on public.negocios_eletroposto
  for each row execute function public.tocar_updated_at();

-- Módulo ligado na empresa (leitura de `empresas` sem depender da RLS de quem consulta).
create or replace function public.eletroposto_ativo(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select e.eletroposto_ativo from public.empresas e where e.id = p_empresa_id), false);
$$;

revoke all on function public.eletroposto_ativo(uuid) from public, anon, service_role;
grant execute on function public.eletroposto_ativo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.negocios_eletroposto enable row level security;

revoke all on public.negocios_eletroposto from anon;
revoke delete, truncate on public.negocios_eletroposto from authenticated;

create policy "ver eletroposto" on public.negocios_eletroposto for select to authenticated
  using (public.pode_ver_negocio(negocio_id) and public.tem_acesso_financeiro(empresa_id));

-- O negócio precisa ser de eletroposto e da mesma empresa, e o módulo precisa estar ligado.
create policy "criar eletroposto" on public.negocios_eletroposto for insert to authenticated
  with check (
    public.membro_ativo(empresa_id)
    and public.tem_acesso_financeiro(empresa_id)
    and public.eletroposto_ativo(empresa_id)
    and public.pode_ver_negocio(negocio_id)
    and exists (
      select 1 from public.negocios n
      where n.id = negocios_eletroposto.negocio_id and n.empresa_id = negocios_eletroposto.empresa_id and n.tipo = 'eletroposto'
    )
  );

create policy "editar eletroposto" on public.negocios_eletroposto for update to authenticated
  using (public.pode_ver_negocio(negocio_id) and public.tem_acesso_financeiro(empresa_id))
  with check (
    public.membro_ativo(empresa_id)
    and public.tem_acesso_financeiro(empresa_id)
    and public.pode_ver_negocio(negocio_id)
    and exists (
      select 1 from public.negocios n
      where n.id = negocios_eletroposto.negocio_id and n.empresa_id = negocios_eletroposto.empresa_id and n.tipo = 'eletroposto'
    )
  );

-- O tipo do negócio não muda depois de criado (a ficha, a proposta e as regras dependem dele).
create or replace function public.travar_tipo_negocio()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo then
    raise exception 'O tipo do negócio não pode ser alterado.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger negocios_travar_tipo before update of tipo on public.negocios
  for each row execute function public.travar_tipo_negocio();

-- Negócio de eletroposto só nasce em empresa com o módulo ligado. Lê `empresas` como dono (a captura
-- pública grava com a chave de serviço; ela sempre cria negócio solar e nem chega à consulta).
create or replace function public.exigir_eletroposto_ativo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.tipo = 'eletroposto' then
    if not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.eletroposto_ativo) then
      raise exception 'O módulo de eletroposto não está ativo nesta empresa.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.exigir_eletroposto_ativo() from public, anon, authenticated, service_role;

create trigger negocios_exigir_eletroposto_ativo before insert on public.negocios
  for each row execute function public.exigir_eletroposto_ativo();
