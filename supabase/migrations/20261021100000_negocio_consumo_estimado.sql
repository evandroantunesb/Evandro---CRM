-- Consumo estimado pela fatura e tarifa efetiva do negócio.
--
-- Hoje, quando só o valor da conta (R$) é informado, o consumo (kWh) é uma ESTIMATIVA (conta ÷ tarifa efetiva).
-- Essa estimativa e a tarifa efetiva não eram gravadas: se perdiam ao reabrir um kit sem cálculo, e a origem do
-- consumo do cálculo salvo era inferida. Duas colunas separadas, para nunca misturar estimativa com kWh informado:
--
--   consumo_medio_kwh    (já existe)  kWh INFORMADO (digitado/lido da fatura). Não muda de significado.
--   consumo_estimado_kwh (nova)       kWh ESTIMADO = valor da conta ÷ tarifa efetiva.
--   tarifa_efetiva_kwh   (nova)       R$/kWh efetivo (com impostos) usado só para estimar o consumo. Não é a tarifa
--                                     base (TE + TUSD) do cálculo financeiro, que continua em calculos_solares.tarifa_kwh.
--
-- Aditiva: colunas nulas, sem valor padrão, sem preenchimento retroativo. Linhas existentes ficam com ambas nulas
-- ("sem estimativa registrada"). Nenhuma política de acesso muda (as colunas herdam as da tabela negocios).

alter table public.negocios
  add column consumo_estimado_kwh numeric(10, 2),
  add column tarifa_efetiva_kwh numeric(8, 4);

-- Valores válidos quando existem.
alter table public.negocios
  add constraint negocios_consumo_estimado_positivo
    check (consumo_estimado_kwh is null or consumo_estimado_kwh > 0),
  add constraint negocios_tarifa_efetiva_positiva
    check (tarifa_efetiva_kwh is null or tarifa_efetiva_kwh > 0);

-- A estimativa só existe com a tarifa que a produziu (e vice-versa).
alter table public.negocios
  add constraint negocios_estimativa_completa
    check ((consumo_estimado_kwh is null) = (tarifa_efetiva_kwh is null));

-- Um negócio tem consumo informado OU estimado, nunca os dois: informar kWh descarta a estimativa.
alter table public.negocios
  add constraint negocios_consumo_informado_ou_estimado
    check (consumo_medio_kwh is null or consumo_estimado_kwh is null);

comment on column public.negocios.consumo_estimado_kwh is
  'Consumo mensal ESTIMADO (valor da conta / tarifa efetiva). Nulo = sem estimativa. Exclusivo com consumo_medio_kwh (kWh informado).';
comment on column public.negocios.tarifa_efetiva_kwh is
  'Tarifa efetiva (R$/kWh, com impostos) usada só para estimar o consumo. Não é a tarifa base do cálculo financeiro (calculos_solares.tarifa_kwh).';
