-- Fase 4 do kit automático: sync de tarifa homologada da ANEEL por
-- distribuidora, pra pré-preencher "Valor da tarifa (R$/kWh)" em "Adicionar
-- negócio" (hoje só digitado à mão). O gestor configura a sigla da
-- distribuidora (SigAgente na ANEEL) uma vez em Parâmetros; o cache é
-- global (dado público regulatório, não de negócio) — sem empresa_id, RLS
-- só exige usuário autenticado, mesmo padrão de `dados_solares_cache`.
alter table public.parametros_calculadora
  add column sigla_distribuidora_aneel text;

create table public.tarifas_aneel_cache (
  id uuid primary key default gen_random_uuid(),
  sigla_distribuidora text not null,
  sub_grupo text not null default 'B1',
  vlr_tusd numeric(10, 6) not null check (vlr_tusd >= 0),
  vlr_te numeric(10, 6) not null check (vlr_te >= 0),
  modalidade_tarifaria text,
  vigencia_inicio date,
  vigencia_fim date,
  atualizado_em timestamptz not null default now(),
  unique (sigla_distribuidora, sub_grupo)
);

alter table public.tarifas_aneel_cache enable row level security;

create policy "tarifas_aneel_cache_select" on public.tarifas_aneel_cache
  for select to authenticated using (true);

create policy "tarifas_aneel_cache_insert" on public.tarifas_aneel_cache
  for insert to authenticated with check (true);

create policy "tarifas_aneel_cache_update" on public.tarifas_aneel_cache
  for update to authenticated using (true) with check (true);
