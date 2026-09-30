-- Fase 2 do kit automático: cache de dado solar por localização (geocoding +
-- irradiância PVGIS/NASA), pra não bater na API externa toda vez que alguém
-- abre "Adicionar negócio" no mesmo bairro/cidade. Não é dado de negócio (é
-- dado público de geografia/clima), por isso não tem empresa_id nem RLS por
-- empresa — só authenticated pode ler e gravar (qualquer usuário logado de
-- qualquer empresa aproveita o mesmo cache).
--
-- Chave: lat/lon arredondados a 2 casas decimais (~1,1 km de resolução —
-- suficiente pra irradiância solar, que não varia bruscamente nessa escala).
create table public.dados_solares_cache (
  id uuid primary key default gen_random_uuid(),
  lat_arredondado numeric(5, 2) not null,
  lon_arredondado numeric(5, 2) not null,
  produtividade_kwh_kwp_mes numeric(6, 2) not null check (produtividade_kwh_kwp_mes > 0),
  fonte text not null check (fonte in ('pvgis', 'nasa')),
  atualizado_em timestamptz not null default now(),
  unique (lat_arredondado, lon_arredondado)
);

alter table public.dados_solares_cache enable row level security;

create policy "dados_solares_cache_select" on public.dados_solares_cache
  for select to authenticated using (true);

create policy "dados_solares_cache_insert" on public.dados_solares_cache
  for insert to authenticated with check (true);

create policy "dados_solares_cache_update" on public.dados_solares_cache
  for update to authenticated using (true) with check (true);
