-- Estimativa financeira GD II pela regra aceita (M2 P0, calculadora; contrato .aurora/contratos/m2-p0-decisao-fio-b-copel.md).
--
-- Três peças, todas aditivas:
--  1) `tarifas_gd_aneel`: referência GLOBAL e só de leitura com a tarifa oficial (TE, TUSD e TUSD_FioB em R$/MWh, sem
--     tributos) por distribuidora e vigência, com a fonte (recurso e linhas da ANEEL, data de extração, hash da resposta).
--     É dado público da ANEEL, não da empresa: ninguém grava pelo app (sem política de escrita); a carga é por migration.
--     `pendencias_fonte` guarda o que ainda não foi lido na fonte (ex.: Tabela 4 da REH), sem declarar conferido.
--  2) `calculos_solares`: retrato do que cada cálculo usou (data de referência, tarifa e base tributária declarada, origem,
--     linha oficial, Fio B, percentual legal, vigência, autoconsumo, energia não compensada, ressalvas) e a marca de
--     desatualização (R6.2). `tarifa_kwh` passa de 4 para 5 casas (a tarifa oficial em R$/kWh tem 5: 0,76802).
--     O estado `completo` exige o retrato inteiro, base da tarifa = base do Fio B e payback nulo (indisponível no P0).
--  3) `calculos_solares_historico`: cópia imutável da linha `legado`/`completo` substituída (R6.1), gravada por trigger
--     na mesma instrução do upsert; motivo `desatualizado_por_entradas` quando o resultado novo é incompleto (R6.2).
--
-- Linhas existentes: nada é reescrito além da mudança de escala de `tarifa_kwh` (valores preservados) e as colunas novas
-- nascem nulas. Linhas `legado` continuam válidas.

-- 1) Tarifa oficial de referência -------------------------------------------------------------------------------------
create table public.tarifas_gd_aneel (
  id uuid primary key default gen_random_uuid(),
  distribuidora text not null check (length(btrim(distribuidora)) > 0), -- SigNomeAgente da ANEEL (ex.: COPEL-DIS)
  nomes_aceitos text[] not null check (cardinality(nomes_aceitos) > 0), -- formas normalizadas (minúsculas, sem acento)
  cnpj text not null,
  ato text not null, -- REH que homologou a tarifa
  subgrupo text not null, -- B1
  subclasse text not null, -- residencial
  modalidade text not null, -- convencional
  base_tributaria text not null check (base_tributaria in ('com_tributos', 'sem_tributos')),
  te_rs_mwh numeric(18, 9) not null check (te_rs_mwh > 0),
  tusd_rs_mwh numeric(18, 9) not null check (tusd_rs_mwh > 0),
  tusd_fio_b_rs_mwh numeric(18, 9) not null check (tusd_fio_b_rs_mwh > 0),
  vigencia_inicio date not null,
  vigencia_fim date not null,
  fonte_recurso_id text not null,
  fonte_linhas jsonb not null, -- _id das linhas usadas, por componente
  fonte_extraida_em timestamptz not null,
  fonte_resposta_sha256 text not null check (fonte_resposta_sha256 ~ '^[0-9a-f]{64}$'),
  pendencias_fonte text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (vigencia_fim >= vigencia_inicio),
  unique (distribuidora, subgrupo, subclasse, modalidade, vigencia_inicio)
);

alter table public.tarifas_gd_aneel enable row level security;
create policy "ver tarifas oficiais" on public.tarifas_gd_aneel for select to authenticated using (true);
-- Sem política de insert/update/delete: só migration (ou service role) altera a referência.
revoke insert, update, delete, truncate on public.tarifas_gd_aneel from anon, authenticated;

comment on table public.tarifas_gd_aneel is
  'Tarifa oficial (ANEEL, sem tributos, R$/MWh) por distribuidora/vigência, com a fonte. Só leitura pelo app.';
comment on column public.tarifas_gd_aneel.pendencias_fonte is
  'O que ainda não foi lido na fonte oficial (ex.: tabela4_nao_conferida). Nunca removido sem a leitura do documento.';

-- Copel, REH 3.592/2026 (.aurora/fontes/aneel-componentes-2026-copel-reh3592-b1.json). TE e TUSD: detalhe "Não se
-- aplica"; TUSD_FioB: detalhe SCEE (mesmo valor no "Não se aplica"). Valores do campo numeric(18,9) da ANEEL, sem o
-- ruído de ponto flutuante do JSON ("214,53560037400001" = 214,535600374).
insert into public.tarifas_gd_aneel (
  distribuidora, nomes_aceitos, cnpj, ato, subgrupo, subclasse, modalidade, base_tributaria,
  te_rs_mwh, tusd_rs_mwh, tusd_fio_b_rs_mwh, vigencia_inicio, vigencia_fim,
  fonte_recurso_id, fonte_linhas, fonte_extraida_em, fonte_resposta_sha256, pendencias_fonte
) values (
  'COPEL-DIS',
  array['copel', 'copel-dis', 'copel dis', 'copel distribuicao', 'copel distribuicao s.a.', 'copel distribuicao sa'],
  '04368898000106', 'REH 3.592/2026', 'B1', 'residencial', 'convencional', 'sem_tributos',
  310.85, 457.17, 214.535600374, date '2026-06-24', date '2027-06-23',
  'e8717aa8-2521-453f-bf16-fbb9a16eea39',
  '{"TE": [924996, 925000], "TUSD": [892207, 892275], "TUSD_FioB_SCEE": [887694, 923614]}'::jsonb,
  timestamptz '2026-10-22 20:58:09-03',
  '6f0c3eff81fdac782250b27c121c1c29447d05915dcf4f56c44cadca20a02eef',
  array['tabela4_nao_conferida']
);

-- 2) Retrato por cálculo ------------------------------------------------------------------------------------------------
alter table public.calculos_solares alter column tarifa_kwh type numeric(9, 5);

alter table public.calculos_solares
  add column data_referencia date,
  add column tarifa_base_tributaria text check (tarifa_base_tributaria is null or tarifa_base_tributaria in ('com_tributos', 'sem_tributos')),
  add column tarifa_origem text check (tarifa_origem is null or tarifa_origem in ('oficial_aneel', 'informada_vendedor')),
  add column tarifa_gd_id uuid references public.tarifas_gd_aneel (id) on delete restrict,
  add column distribuidora text,
  add column enquadramento text, -- ex.: B1/residencial/convencional/GD_II
  add column fio_b_rs_mwh numeric(18, 9) check (fio_b_rs_mwh is null or fio_b_rs_mwh > 0),
  add column fio_b_base_tributaria text check (fio_b_base_tributaria is null or fio_b_base_tributaria in ('com_tributos', 'sem_tributos')),
  add column percentual_legal_fio_b numeric(4, 3) check (percentual_legal_fio_b is null or (percentual_legal_fio_b > 0 and percentual_legal_fio_b <= 1)),
  add column fio_b_vigencia_inicio date,
  add column fio_b_vigencia_fim date,
  add column autoconsumo_kwh numeric(10, 2) check (autoconsumo_kwh is null or autoconsumo_kwh >= 0),
  add column kwh_nao_compensado numeric(10, 2) check (kwh_nao_compensado is null or kwh_nao_compensado >= 0),
  add column ressalvas text[],
  add column financeiro_desatualizado_em timestamptz,
  add column financeiro_desatualizado_motivo text;

create index calculos_solares_tarifa_gd_idx on public.calculos_solares (tarifa_gd_id) where tarifa_gd_id is not null;

alter table public.calculos_solares drop constraint calculos_solares_estado_coerente_ck;
alter table public.calculos_solares
  add constraint calculos_solares_estado_coerente_ck check (
    case estado_financeiro
      when 'incompleto' then
        kwh_faturado is null and kwh_compensado is null and custo_fio_b is null
        and conta_sem_solar is null and conta_com_solar is null and economia_mensal is null
        and payback_meses is null and metodo_calculo is null and kwh_nao_compensado is null
        and financeiro_desatualizado_em is null
        and coalesce(jsonb_typeof(pendencias) = 'array' and pendencias <> '[]'::jsonb, false)
      when 'legado' then
        kwh_faturado is not null and kwh_compensado is not null and custo_fio_b is not null
        and conta_sem_solar is not null and conta_com_solar is not null and economia_mensal is not null
        and metodo_calculo is null and pendencias is null
      when 'completo' then
        kwh_faturado is not null and kwh_compensado is not null and custo_fio_b is not null
        and conta_sem_solar is not null and conta_com_solar is not null and economia_mensal is not null
        and length(btrim(coalesce(metodo_calculo, ''))) > 0 and pendencias is null
        -- payback indisponível no P0 (contrato, seção 4)
        and payback_meses is null
        -- retrato completo, com a base da tarifa igual à do Fio B (contrato, seção 5)
        and data_referencia is not null and tarifa_origem is not null and tarifa_gd_id is not null
        and distribuidora is not null and enquadramento is not null and fio_b_rs_mwh is not null and percentual_legal_fio_b is not null
        and fio_b_vigencia_inicio is not null and fio_b_vigencia_fim is not null
        and data_referencia between fio_b_vigencia_inicio and fio_b_vigencia_fim
        and autoconsumo_kwh is not null and kwh_nao_compensado is not null
        and tarifa_base_tributaria is not null and tarifa_base_tributaria = fio_b_base_tributaria
      else false
    end
  ),
  add constraint calculos_solares_desatualizado_ck check (
    (financeiro_desatualizado_em is null) = (financeiro_desatualizado_motivo is null)
  );

comment on column public.calculos_solares.tarifa_base_tributaria is
  'Base declarada da tarifa usada como T (sem_tributos | com_tributos). Nula = não declarada (linha legada ou entrada sem declaração).';
comment on column public.calculos_solares.tarifa_origem is
  'oficial_aneel = igual à TE+TUSD da linha oficial vigente; informada_vendedor = valor digitado diferente dela.';
comment on column public.calculos_solares.ressalvas is
  'Limitações declaradas da estimativa (ex.: autoconsumo_zero, tabela4_nao_conferida, payback_indisponivel).';
comment on column public.calculos_solares.financeiro_desatualizado_em is
  'R6.2: entradas mudaram depois deste resultado sem resultado novo gravado. Bloqueia proposta e preço; sai ao recalcular.';

-- 3) Histórico imutável ------------------------------------------------------------------------------------------------
create table public.calculos_solares_historico (
  id uuid primary key default gen_random_uuid(),
  calculo_id uuid not null,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  arquivado_em timestamptz not null default now(),
  motivo text not null check (motivo in ('desatualizado_por_entradas', 'substituido_por_recalculo')),
  linha jsonb not null
);
create index calculos_solares_historico_negocio_idx on public.calculos_solares_historico (negocio_id, arquivado_em desc);
create index calculos_solares_historico_empresa_idx on public.calculos_solares_historico (empresa_id);

alter table public.calculos_solares_historico enable row level security;
create policy "ver histórico do cálculo" on public.calculos_solares_historico for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
-- Sem política de escrita: só o trigger abaixo (security definer) grava; ninguém altera nem apaga pelo app.
revoke insert, update, delete, truncate on public.calculos_solares_historico from anon, authenticated;

comment on table public.calculos_solares_historico is
  'Cópia imutável (R6.1) de cada linha legado/completo substituída em calculos_solares. Nunca é resultado atual.';

-- Arquiva a linha legado/completo quando o conteúdo do cálculo muda (preço do kit, payback, observações e a própria marca
-- de desatualização não contam: não alteram o resultado). Roda depois da trava de negócio arquivado (ordem alfabética).
create or replace function public.calculos_solares_arquivar_historico()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ignorar text[] := array[
    'updated_at', 'atualizado_por', 'observacoes', 'kit_preco', 'payback_meses',
    'financeiro_desatualizado_em', 'financeiro_desatualizado_motivo'
  ];
begin
  if old.estado_financeiro in ('legado', 'completo')
     and (to_jsonb(old) - v_ignorar) is distinct from (to_jsonb(new) - v_ignorar) then
    insert into public.calculos_solares_historico (calculo_id, empresa_id, negocio_id, motivo, linha)
    values (
      old.id, old.empresa_id, old.negocio_id,
      case when new.estado_financeiro = 'incompleto' then 'desatualizado_por_entradas' else 'substituido_por_recalculo' end,
      to_jsonb(old)
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.calculos_solares_arquivar_historico() from public, anon, authenticated;

create trigger calculos_solares_historico before update on public.calculos_solares
  for each row execute function public.calculos_solares_arquivar_historico();
