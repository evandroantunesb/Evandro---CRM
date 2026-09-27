-- Consumo médio passa a ser um dado do negócio (não só um input transitório
-- do formulário), pra ficar editável e visível mesmo antes de montar o kit
-- personalizado. Valor da fatura já existe em negocios.valor_conta_energia
-- (adicionado pela captura de leads, PR #20) — reaproveitado aqui em vez de
-- criar uma segunda coluna com o mesmo significado.
alter table public.negocios
  add column consumo_medio_kwh numeric(10,2) check (consumo_medio_kwh is null or consumo_medio_kwh >= 0);
