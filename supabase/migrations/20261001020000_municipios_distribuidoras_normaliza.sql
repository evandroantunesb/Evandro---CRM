-- Fase 2 da reconciliação do motor de dimensionamento (pedido do Evandro,
-- 2026-10-01): ajusta o schema de `municipios_ibge`/`municipios_distribuidoras`
-- (criadas na Fase 1 pela migration 20260930220000, ainda vazias e sem
-- nenhuma delas ter rodado em produção) pra bater com o formato real das
-- duas bases públicas da ANEEL que vão alimentá-las no futuro, quando houver
-- acesso de rede pra importar:
--
-- - ANEEL IndQual Município: CodMunicipio (código IBGE, 7 dígitos),
--   NomMunicipio, SigUF, IdeConjUndConsumidoras.
-- - ANEEL Indicadores Coletivos de Continuidade (DEC/FEC):
--   IdeConjUndConsumidoras, SigAgente, NumCNPJ, DscConjUndConsumidoras.
--
-- Relação: CodMunicipio -> IdeConjUndConsumidoras -> SigAgente/NumCNPJ. Essa
-- relação NÃO é 1:1 — um município pode ser atendido por mais de uma
-- distribuidora (área de fronteira entre concessões) — por isso
-- `municipios_distribuidoras` continua com uma linha por (município,
-- distribuidora) e a resolução (`resolverDistribuidora`, em
-- src/lib/distribuidoras.ts) sempre pode devolver "ambígua".
--
-- Cria uma migration nova (ao invés de reescrever a 20260930220000, que já
-- foi commitada/enviada na Fase 1) pra não reabrir um trabalho já fechado
-- sem necessidade, mesmo nenhuma das duas tendo rodado em produção ainda.
--
-- Nenhum dado real é carregado aqui (sandbox sem acesso de rede) — as
-- tabelas continuam vazias; toda resolução automática cai em "não
-- encontrada" até uma carga futura via `importarMunicipiosDistribuidoras`
-- (src/lib/acoes/distribuidoras.ts), o que é o comportamento esperado, não
-- um erro.

-- `municipios_ibge`: "nome" -> "municipio", pra bater com o nome de coluna
-- combinado com o Evandro (mesmo valor de NomMunicipio da ANEEL/IBGE).
alter table public.municipios_ibge rename column nome to municipio;

-- `municipios_distribuidoras`: sai o nome "comercial" da distribuidora (que
-- nunca tivemos de forma confiável — DscConjUndConsumidoras descreve o
-- conjunto de unidades consumidoras, não o agente) e a coluna solta
-- "versao_base"; entram as colunas combinadas com o Evandro pra registrar a
-- carga de forma rastreável e permitir desativar uma linha sem apagar
-- histórico.
alter table public.municipios_distribuidoras rename column sigla_distribuidora to distribuidora_sigla;
alter table public.municipios_distribuidoras drop column nome_distribuidora;
alter table public.municipios_distribuidoras drop column versao_base;

alter table public.municipios_distribuidoras
  add column distribuidora_cnpj text,
  add column data_referencia date,
  add column imported_at timestamptz not null default now(),
  add column ativo boolean not null default true;

comment on column public.municipios_distribuidoras.distribuidora_sigla is
  'SigAgente da ANEEL (Indicadores Coletivos de Continuidade) — mesmo valor usado em buscarTarifaHomologada/tarifas_aneel_cache.';
comment on column public.municipios_distribuidoras.distribuidora_cnpj is
  'NumCNPJ da ANEEL (Indicadores Coletivos de Continuidade).';
comment on column public.municipios_distribuidoras.fonte is
  'Identifica a base de origem da linha (ex.: aneel-indqual+aneel-dec-fec); quem prepara o CSV de importação decide o valor — ver importarMunicipiosDistribuidoras.';
comment on column public.municipios_distribuidoras.data_referencia is
  'Vigência/competência do indicador de onde a linha veio (ex.: ano-base do DEC/FEC da ANEEL). Pode ser nula quando a carga não traz essa informação.';
comment on column public.municipios_distribuidoras.imported_at is
  'Preenchido pela action de importação em lote a cada carga (now() no momento do upsert).';
comment on column public.municipios_distribuidoras.ativo is
  'false marca uma linha substituída/descontinuada numa carga mais nova sem apagar o histórico; a resolução automática (resolverDistribuidoraPorIbge/resolverDistribuidoraPorCidadeUf) só considera ativo = true.';

-- Índice de apoio à resolução automática (sempre filtra por codigo_ibge +
-- ativo = true) — complementa o índice simples em codigo_ibge já criado na
-- Fase 1.
create index on public.municipios_distribuidoras (codigo_ibge) where ativo;

-- RLS (policies já criadas na Fase 1) continua valendo sem alteração:
-- leitura liberada pra autenticado, escrita (insert/update/delete) restrita
-- a `e_plataforma_admin()`. As novas colunas não mudam esse comportamento.
