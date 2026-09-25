-- Consumo médio e valor da fatura passam a ser dados do negócio (não só um
-- input transitório do formulário), pra ficarem editáveis e visíveis mesmo
-- antes de montar o kit personalizado.
alter table public.negocios
  add column consumo_medio_kwh numeric(10,2) check (consumo_medio_kwh is null or consumo_medio_kwh >= 0),
  add column valor_fatura_medio numeric(12,2) check (valor_fatura_medio is null or valor_fatura_medio >= 0);
