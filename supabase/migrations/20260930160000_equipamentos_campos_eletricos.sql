-- Fase 1 do kit automático, parte 2: campos elétricos do catálogo, pra validar
-- string/MPPT além do overload (que já existia desde 20260930150000). Todos
-- nuláveis: equipamento sem esses dados continua funcionando no motor, só
-- sem a validação elétrica extra (fica marcado como "não verificado").

alter table public.equipamentos_empresa
  -- Módulo.
  add column voc_v numeric(6, 2) check (voc_v is null or voc_v > 0),
  add column isc_a numeric(6, 2) check (isc_a is null or isc_a > 0),
  add column vmp_v numeric(6, 2) check (vmp_v is null or vmp_v > 0),
  add column imp_a numeric(6, 2) check (imp_a is null or imp_a > 0),
  -- Coeficiente de temperatura do Voc, em %/°C (negativo — datasheet costuma dar algo perto de -0,29).
  add column coef_temp_voc_pct_c numeric(5, 3),
  -- Inversor.
  add column tensao_max_dc_v numeric(6, 2) check (tensao_max_dc_v is null or tensao_max_dc_v > 0),
  add column mppt_min_v numeric(6, 2) check (mppt_min_v is null or mppt_min_v > 0),
  add column mppt_max_v numeric(6, 2) check (mppt_max_v is null or mppt_max_v > 0),
  add column corrente_max_entrada_a numeric(5, 2) check (corrente_max_entrada_a is null or corrente_max_entrada_a > 0),
  add column quantidade_mppt integer check (quantidade_mppt is null or quantidade_mppt > 0);

-- Temperatura mínima de projeto (pro Voc em frio — a tensão de circuito aberto
-- sobe no frio, e é o pior caso pra não estourar a tensão máxima do inversor).
-- Padrão nacional conservador; o admin pode ajustar por região/telhado.
alter table public.parametros_calculadora
  add column temperatura_minima_projeto_c numeric(4, 1) not null default 0
    check (temperatura_minima_projeto_c >= -30 and temperatura_minima_projeto_c <= 30);
