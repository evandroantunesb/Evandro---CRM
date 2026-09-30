-- Etapa 1 do wizard "Adicionar negócio" (pedido do Evandro, 2026-09-30):
-- resolver a distribuidora automaticamente a partir de cidade/UF, em vez de
-- o vendedor digitar a tarifa à mão. Fluxo: cidade/UF -> município (IBGE)
-- -> distribuidora(s) que atendem esse município -> tarifa homologada
-- (reaproveita `buscarTarifaHomologada`, já existente em `src/lib/aneel.ts`).
--
-- Dado público de referência (não é por empresa, sem `empresa_id` — mesmo
-- padrão de `tarifas_aneel_cache`). IMPORTANTE: esta sessão não tem acesso à
-- internet, então as duas tabelas abaixo nascem vazias — precisam ser
-- importadas com o dataset de municípios do IBGE e o de áreas de concessão
-- da ANEEL num ambiente com rede (local do Evandro, preview ou produção).
-- Até lá, toda resolução automática cai em "não encontrada" e o vendedor
-- usa a seleção manual (rede de segurança do fluxo, não um bug).
create table public.municipios_ibge (
  codigo_ibge text primary key,
  nome text not null,
  -- Maiúsculas, sem acento (mesma normalização de `normalizarTexto` em
  -- src/lib/distribuidoras.ts) — comparar com o texto livre que o vendedor
  -- digita em "Cidade" sem depender de acento/caixa bater exatamente.
  nome_normalizado text not null,
  uf text not null check (length(uf) = 2),
  unique (nome_normalizado, uf)
);
create index on public.municipios_ibge (uf);

-- Uma linha por (município, distribuidora) — municípios na fronteira entre
-- áreas de concessão têm mais de uma linha aqui, e a resolução automática
-- vira "ambígua" nesse caso (ver `resolverDistribuidora`).
create table public.municipios_distribuidoras (
  id uuid primary key default gen_random_uuid(),
  codigo_ibge text not null references public.municipios_ibge (codigo_ibge) on delete cascade,
  -- SigAgente da ANEEL — mesmo valor usado em `buscarTarifaHomologada`/`tarifas_aneel_cache`.
  sigla_distribuidora text not null,
  nome_distribuidora text not null,
  fonte text not null default 'aneel',
  versao_base text not null,
  created_at timestamptz not null default now(),
  unique (codigo_ibge, sigla_distribuidora)
);
create index on public.municipios_distribuidoras (codigo_ibge);

alter table public.municipios_ibge enable row level security;
alter table public.municipios_distribuidoras enable row level security;

-- Mesmo padrão de `tarifas_aneel_cache`: dado público regulatório, sem
-- isolamento por empresa — só exige usuário autenticado. Insert/update
-- liberados pra permitir reimportar a base (fonte/versão) sem migration nova.
create policy "municipios_ibge_select" on public.municipios_ibge for select to authenticated using (true);
create policy "municipios_ibge_insert" on public.municipios_ibge for insert to authenticated with check (true);
create policy "municipios_ibge_update" on public.municipios_ibge for update to authenticated using (true) with check (true);

create policy "municipios_distribuidoras_select" on public.municipios_distribuidoras for select to authenticated using (true);
create policy "municipios_distribuidoras_insert" on public.municipios_distribuidoras for insert to authenticated with check (true);
create policy "municipios_distribuidoras_update" on public.municipios_distribuidoras for update to authenticated using (true) with check (true);
create policy "municipios_distribuidoras_delete" on public.municipios_distribuidoras for delete to authenticated using (true);
