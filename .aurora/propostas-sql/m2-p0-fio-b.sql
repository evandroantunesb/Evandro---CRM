-- RASCUNHO PARA APRESENTAR AO EVANDRO. NÃO APLICAR. Fica fora de supabase/migrations de propósito.
-- Ao aprovar: renomear para AAAAMMDDHHMMSS_fio_b_estimativa.sql conferindo o prefixo contra as PRs abertas.
--
-- Escolha: DUAS peças, ambas ADITIVAS.
--  1) tabela nova `parametros_fio_b` (empresa_id + RLS): o valor do Fio B muda por distribuidora e por vigência e tem
--     origem/fonte/justificativa; não cabe como coluna única de `parametros_calculadora` (1 linha por empresa).
--     Não carrega nenhum valor: não existe valor oficial vigente confirmado (Copel inclusive). Nasce vazia.
--  2) colunas NULÁVEIS em `calculos_solares`: o "retrato" do que foi usado em cada cálculo, para não recalcular
--     propostas emitidas. Cálculo antigo = tudo NULL = método anterior; nada é recalculado nem apagado.
--
-- Impacto: sem default, sem backfill, sem reescrita de linhas; tabela nova vazia. Código atual não é afetado.
-- Nenhuma coluna usa NOT NULL; os checks só valem quando o campo vem preenchido.

-- 1) Parâmetros de Fio B por empresa/distribuidora/vigência
create table public.parametros_fio_b (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  distribuidora text not null check (length(btrim(distribuidora)) > 0),
  classe text not null,
  modalidade text not null,
  gd text not null,
  fio_b_rs_kwh numeric(10,6) not null check (fio_b_rs_kwh > 0 and fio_b_rs_kwh < 10),
  base_tributaria text not null check (base_tributaria in ('com_tributos', 'sem_tributos')),
  origem text not null check (origem in ('oficial_aneel', 'manual_justificado')),
  fonte text,
  justificativa text,
  vigencia_inicio date not null,
  vigencia_fim date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vigencia_fim >= vigencia_inicio),
  -- manual exige fonte e justificativa preenchidas
  check (
    origem <> 'manual_justificado'
    or (length(btrim(coalesce(fonte, ''))) > 0 and length(btrim(coalesce(justificativa, ''))) > 0)
  )
);
-- Sem sobreposição de vigência (empresa/distribuidora/enquadramento). MANTIDA COMENTADA: exige a extensão btree_gist e decisão do Evandro antes de ativar:
-- create extension if not exists btree_gist;
-- alter table public.parametros_fio_b add constraint parametros_fio_b_sem_sobreposicao
--   exclude using gist (empresa_id with =, distribuidora with =, classe with =, modalidade with =, gd with =,
--                       daterange(vigencia_inicio, vigencia_fim, '[]') with &&);
create index parametros_fio_b_empresa_idx on public.parametros_fio_b (empresa_id, distribuidora, vigencia_inicio);
create trigger parametros_fio_b_updated_at before update on public.parametros_fio_b
  for each row execute function public.tocar_updated_at();

alter table public.parametros_fio_b enable row level security;
create policy "ver parâmetros fio b" on public.parametros_fio_b for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria parâmetros fio b" on public.parametros_fio_b for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita parâmetros fio b" on public.parametros_fio_b for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin apaga parâmetros fio b" on public.parametros_fio_b for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));

-- 2) Retrato por cálculo (todas NULL para cálculos existentes)
alter table public.calculos_solares
  add column distribuidora text check (distribuidora is null or length(btrim(distribuidora)) > 0),
  add column enquadramento_classe text,
  add column enquadramento_modalidade text,
  add column enquadramento_gd text,
  add column ano_referencia smallint check (ano_referencia is null or ano_referencia between 2023 and 2045),
  add column fio_b_rs_kwh numeric(10,6) check (fio_b_rs_kwh is null or (fio_b_rs_kwh > 0 and fio_b_rs_kwh < 10)),
  add column fio_b_base_tributaria text check (fio_b_base_tributaria is null or fio_b_base_tributaria in ('com_tributos', 'sem_tributos')),
  add column percentual_legal_fio_b numeric(5,4) check (percentual_legal_fio_b is null or (percentual_legal_fio_b >= 0 and percentual_legal_fio_b <= 1)),
  add column fio_b_origem text check (fio_b_origem is null or fio_b_origem in ('oficial_aneel', 'manual_justificado')),
  add column fio_b_fonte text,
  add column fio_b_vigencia_inicio date,
  add column fio_b_vigencia_fim date,
  add column fio_b_justificativa text,
  -- versão do método; NULL = método anterior (não recalcular)
  add column metodo_calculo text,
  add column estado_estimativa text check (estado_estimativa is null or estado_estimativa in ('completa', 'incompleta')),
  add constraint calculos_solares_fio_b_vigencia_ck check (
    fio_b_vigencia_inicio is null or fio_b_vigencia_fim is null or fio_b_vigencia_fim >= fio_b_vigencia_inicio
  ),
  add constraint calculos_solares_fio_b_manual_ck check (
    fio_b_origem is distinct from 'manual_justificado'
    or (length(btrim(coalesce(fio_b_fonte, ''))) > 0 and length(btrim(coalesce(fio_b_justificativa, ''))) > 0)
  );
-- RLS de calculos_solares já existe (por negócio/empresa) e cobre as colunas novas.
-- Observação: as colunas consumo_estimado_kwh/tarifa_efetiva_kwh (outra migration, não aplicada) NÃO são usadas aqui.

-- Sequência segura de aplicação:
--  1. PR contendo SÓ a migration (sem código que dependa dela).
--  2. Incluir o conjunto em MIGRATIONS_AUTORIZADAS (ci/banco-producao).
--  3. Evandro dispara e aprova o modo `conferir` (dry-run) e confere a lista de migrations pendentes.
--  4. Evandro dispara e aprova o modo `aplicar`.
--  5. Só então abrir/mesclar a PR de código (o preview da Vercel usa o banco de produção).
--
-- Reversão (só enquanto nenhuma linha usar as colunas/tabela; depois exige decisão do Evandro, pois apaga dados):
--   alter table public.calculos_solares
--     drop constraint calculos_solares_fio_b_manual_ck, drop constraint calculos_solares_fio_b_vigencia_ck,
--     drop column estado_estimativa, drop column metodo_calculo, drop column fio_b_justificativa,
--     drop column fio_b_vigencia_fim, drop column fio_b_vigencia_inicio, drop column fio_b_fonte,
--     drop column fio_b_origem, drop column percentual_legal_fio_b, drop column fio_b_base_tributaria,
--     drop column fio_b_rs_kwh, drop column ano_referencia, drop column enquadramento_gd,
--     drop column enquadramento_modalidade, drop column enquadramento_classe, drop column distribuidora;
--   drop table public.parametros_fio_b;
