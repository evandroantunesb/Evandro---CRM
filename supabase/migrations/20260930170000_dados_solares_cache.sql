-- Fase 2 do kit automático: cache de dado solar por localização (geocoding +
-- irradiância PVGIS/NASA), pra não bater na API externa toda vez que alguém
-- abre "Adicionar negócio" no mesmo bairro/cidade. Não é dado de negócio (é
-- dado público de geografia/clima), por isso não tem empresa_id nem RLS por
-- empresa.
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

-- Leitura liberada pra qualquer usuário autenticado: é cache de referência
-- (geografia/clima), não dado sensível, e todas as empresas se beneficiam do
-- mesmo cache compartilhado.
create policy "dados_solares_cache_select" on public.dados_solares_cache
  for select to authenticated using (true);

-- Escrita restrita a `e_plataforma_admin()` (revisão de segurança, Evandro,
-- 2026-10-01: a versão original da #96 liberava insert/update pra qualquer
-- usuário autenticado, o que permitia um usuário comum de qualquer empresa
-- adulterar o cache compartilhado entre TODAS as empresas do sistema — ex.:
-- gravar uma produtividade falsa pra uma coordenada e inflar a economia
-- estimada de todo mundo que calcular perto dali). Mesmo padrão já usado
-- pelas tabelas globais em `20260925000100_fundacao.sql` (ex.: `empresas`).
-- O preenchimento automático do cache (ao buscar PVGIS/NASA pela primeira
-- vez numa coordenada) continua funcionando: a action grava usando o client
-- admin (service role, que já ignora RLS) em vez do client do usuário —
-- ver `src/lib/acoes/geodados.ts`.
create policy "dados_solares_cache_insert" on public.dados_solares_cache
  for insert to authenticated with check (public.e_plataforma_admin());

create policy "dados_solares_cache_update" on public.dados_solares_cache
  for update to authenticated using (public.e_plataforma_admin()) with check (public.e_plataforma_admin());
