-- Fio B (Lei 14.300): o percentual escalonado do ano incide só sobre a componente Fio B da TUSD, que é uma
-- parte da tarifa, não ela inteira. O cálculo aplicava o percentual sobre a tarifa cheia (custo do Fio B
-- superestimado, economia subestimada, payback inflado).
--
-- parte_fio_b_tarifa = fração da tarifa (0 a 1) que corresponde ao Fio B na distribuidora da empresa.
-- Sem valor padrão: é um dado da distribuidora. Nulo em parametros_calculadora = "não configurado", e o
-- cálculo é recusado até o admin informar. Nulo em calculos_solares = cálculo feito antes desta mudança
-- (percentual aplicado sobre a tarifa inteira); nada é recalculado.

alter table public.parametros_calculadora
  add column parte_fio_b_tarifa numeric(4, 3)
  check (parte_fio_b_tarifa is null or (parte_fio_b_tarifa > 0 and parte_fio_b_tarifa <= 1));

alter table public.calculos_solares
  add column parte_fio_b_tarifa numeric(4, 3)
  check (parte_fio_b_tarifa is null or (parte_fio_b_tarifa > 0 and parte_fio_b_tarifa <= 1));

comment on column public.parametros_calculadora.parte_fio_b_tarifa is
  'Parte da tarifa (0 a 1) que é Fio B na distribuidora da empresa. Nulo = não configurado (cálculo recusado).';
comment on column public.parametros_calculadora.percentual_fio_b is
  'Percentual do Fio B cobrado no ano (cronograma da Lei 14.300), aplicado sobre a parte Fio B da tarifa.';
comment on column public.calculos_solares.parte_fio_b_tarifa is
  'Parte da tarifa que era Fio B quando o cálculo foi feito. Nulo = cálculo anterior, com o percentual sobre a tarifa inteira.';
