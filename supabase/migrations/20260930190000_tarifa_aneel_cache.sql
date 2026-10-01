-- Fase 4 do kit automático: sync de tarifa homologada da ANEEL por
-- distribuidora, pra pré-preencher "Valor da tarifa (R$/kWh)" em "Adicionar
-- negócio" (hoje só digitado à mão). O gestor configura a sigla da
-- distribuidora (SigAgente na ANEEL) uma vez em Parâmetros; o cache é
-- global (dado público regulatório, não de negócio) — sem empresa_id.
alter table public.parametros_calculadora
  add column sigla_distribuidora_aneel text;

-- Guarda TUSD/TE separados (unidade original, ver `unidade_terciaria`), a
-- tarifa final já convertida pra R$/kWh, a resolução homologatória (REH) e
-- `atualizado_em` como data da própria consulta à ANEEL.
create table public.tarifas_aneel_cache (
  id uuid primary key default gen_random_uuid(),
  sigla_distribuidora text not null,
  sub_grupo text not null default 'B1',
  vlr_tusd numeric(12, 6) not null check (vlr_tusd >= 0),
  vlr_te numeric(12, 6) not null check (vlr_te >= 0),
  unidade_terciaria text,
  tarifa_final_kwh numeric(10, 6) not null check (tarifa_final_kwh >= 0),
  modalidade_tarifaria text,
  resolucao_homologatoria text,
  vigencia_inicio date,
  vigencia_fim date,
  atualizado_em timestamptz not null default now(),
  unique (sigla_distribuidora, sub_grupo)
);

alter table public.tarifas_aneel_cache enable row level security;

-- Leitura liberada pra qualquer usuário autenticado (dado público regulatório).
create policy "tarifas_aneel_cache_select" on public.tarifas_aneel_cache
  for select to authenticated using (true);

-- Escrita restrita a `e_plataforma_admin()` — mesma revisão de segurança de
-- `dados_solares_cache` (ver 20260930170000): a versão original da #96
-- liberava insert/update pra qualquer usuário autenticado, permitindo
-- adulterar a tarifa compartilhada entre todas as empresas. O sync
-- automático (ao consultar a ANEEL pela primeira vez pra uma distribuidora)
-- continua funcionando porque a action grava usando o client admin (service
-- role, que já ignora RLS) — ver `src/lib/acoes/aneel.ts`.
create policy "tarifas_aneel_cache_insert" on public.tarifas_aneel_cache
  for insert to authenticated with check (public.e_plataforma_admin());

create policy "tarifas_aneel_cache_update" on public.tarifas_aneel_cache
  for update to authenticated using (public.e_plataforma_admin()) with check (public.e_plataforma_admin());
