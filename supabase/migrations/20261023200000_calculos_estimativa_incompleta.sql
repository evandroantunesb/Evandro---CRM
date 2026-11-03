-- Estimativa financeira incompleta persistida (M2 P0, calculadora; Evandro, 22/10/2026).
--
-- Até aqui, `calculos_solares` só aceitava a linha com TODOS os números financeiros (NOT NULL): a estimativa
-- incompleta não era gravada e o kit salvo ficava sem registro do resultado técnico. Esta migration permite gravar
-- o resultado técnico (kit, potência, ligação, consumo, tarifa informada, produtividade, geração) SEM economia, conta,
-- Fio B nem payback, com a lista de pendências que impede a parte financeira.
--
-- `estado_financeiro`:
--   legado     = linha gerada pela fórmula antiga (não validada). Todas as linhas existentes (default no ADD COLUMN,
--                sem reescrita de dados). Números financeiros presentes; sem método; nunca entram em proposta.
--   incompleto = resultado técnico sem parte financeira: os seis números financeiros e o payback são NULOS (ausência
--                nunca vira zero), `pendencias` é um array JSON não vazio e não há método.
--   completo   = parte financeira calculada pela regra validada: números presentes e `metodo_calculo` obrigatório.
--                Nenhum código grava este estado ainda (só depois do aceite da regra e dos dados de Fio B).
--
-- Aditiva e compatível: colunas novas com default constante (sem reescrita), DROP NOT NULL e CHECKs criados NOT VALID
-- e validados em seguida (as linhas existentes já cumprem a regra de `legado`). Leitores antigos continuam lendo as
-- linhas legadas iguais; os tipos gerados passam a marcar os números financeiros como anuláveis.

alter table public.calculos_solares
  add column estado_financeiro text not null default 'legado',
  add column metodo_calculo text,
  add column pendencias jsonb;

alter table public.calculos_solares
  alter column kwh_faturado drop not null,
  alter column kwh_compensado drop not null,
  alter column custo_fio_b drop not null,
  alter column conta_sem_solar drop not null,
  alter column conta_com_solar drop not null,
  alter column economia_mensal drop not null;

alter table public.calculos_solares
  add constraint calculos_solares_estado_financeiro_ck
    check (estado_financeiro in ('legado', 'incompleto', 'completo')) not valid,
  add constraint calculos_solares_estado_coerente_ck check (
    case estado_financeiro
      when 'incompleto' then
        kwh_faturado is null and kwh_compensado is null and custo_fio_b is null
        and conta_sem_solar is null and conta_com_solar is null and economia_mensal is null
        and payback_meses is null and metodo_calculo is null
        and coalesce(jsonb_typeof(pendencias) = 'array' and pendencias <> '[]'::jsonb, false)
      when 'legado' then
        kwh_faturado is not null and kwh_compensado is not null and custo_fio_b is not null
        and conta_sem_solar is not null and conta_com_solar is not null and economia_mensal is not null
        and metodo_calculo is null and pendencias is null
      when 'completo' then
        kwh_faturado is not null and kwh_compensado is not null and custo_fio_b is not null
        and conta_sem_solar is not null and conta_com_solar is not null and economia_mensal is not null
        and length(btrim(coalesce(metodo_calculo, ''))) > 0 and pendencias is null
      else false
    end
  ) not valid;

alter table public.calculos_solares validate constraint calculos_solares_estado_financeiro_ck;
alter table public.calculos_solares validate constraint calculos_solares_estado_coerente_ck;

comment on column public.calculos_solares.estado_financeiro is
  'legado = fórmula antiga (não validada, nunca entra em proposta); incompleto = resultado técnico sem parte financeira (números nulos + pendências); completo = regra validada (exige metodo_calculo).';
comment on column public.calculos_solares.pendencias is
  'Só no estado incompleto: array JSON de {codigo, mensagem} com o que impede a parte financeira.';
comment on column public.calculos_solares.metodo_calculo is
  'Só no estado completo: identificador da regra validada que gerou os números financeiros.';
