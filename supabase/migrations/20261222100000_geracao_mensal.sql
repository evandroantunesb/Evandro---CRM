-- Proposta comercial completa, PR 4: geração e consumo mês a mês (desenho aprovado pelo Evandro em 25/11/2026,
-- docs/superpowers/specs/2026-11-25-geracao-mensal-design.md). Só acrescenta duas colunas opcionais; nenhuma linha
-- existente muda.
--
--  1) `parametros_calculadora.curva_geracao_mensal`: os 12 valores da região da empresa, em qualquer unidade (por
--     exemplo a irradiação de cada mês do SunData). Só a proporção entre os meses é usada, para repartir a geração do
--     ano no gráfico da proposta (src/lib/geracao-mensal.ts); o total do ano continua sendo a produtividade × 12.
--     Quem altera segue a política da tabela (só o admin). Não entra na confirmação da produtividade.
--  2) `negocios.consumo_mensal_kwh`: o consumo dos 12 meses da fatura (janeiro a dezembro), opcional. Só alimenta o
--     gráfico; o consumo médio, a economia e o cálculo do kit continuam como estão. Política e `empresa_id` da tabela.
--
-- Os dois são "12 ou nenhum": nulo, ou exatamente 12 elementos sem nulos (curva > 0; consumo >= 0).

alter table public.parametros_calculadora
  add column curva_geracao_mensal numeric(8, 3)[],
  add constraint parametros_calculadora_curva_geracao_mensal_ck check (
    curva_geracao_mensal is null
    or (
      cardinality(curva_geracao_mensal) = 12
      and array_ndims(curva_geracao_mensal) = 1
      and array_position(curva_geracao_mensal, null) is null
      and 0 < all (curva_geracao_mensal)
    )
  );

comment on column public.parametros_calculadora.curva_geracao_mensal is
  'Curva de geração da região (janeiro a dezembro, qualquer unidade). Só a proporção entre os meses é usada para repartir a geração do ano no gráfico da proposta. Nulo = sem gráfico mês a mês.';

alter table public.negocios
  add column consumo_mensal_kwh numeric(10, 2)[],
  add constraint negocios_consumo_mensal_kwh_ck check (
    consumo_mensal_kwh is null
    or (
      cardinality(consumo_mensal_kwh) = 12
      and array_ndims(consumo_mensal_kwh) = 1
      and array_position(consumo_mensal_kwh, null) is null
      and 0 <= all (consumo_mensal_kwh)
    )
  );

comment on column public.negocios.consumo_mensal_kwh is
  'Consumo dos 12 meses da fatura (janeiro a dezembro, kWh), opcional. Só para o gráfico da proposta; não muda o consumo médio nem o cálculo.';
