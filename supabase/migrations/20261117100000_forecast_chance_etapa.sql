-- Forecast: chance de fechamento por etapa do funil.
--
-- O que faz:
--  * `etapas.chance_fechamento` (0 a 100, opcional): chance base de um negócio aberto nesta etapa fechar. O admin
--    edita em Configurações › Funis e etapas. Etapa sem chance não entra no Forecast (aparece em "Fora do forecast").
--  * `chance_padrao_etapa(nome, marca_negociacao)`: padrão pelo nome (decisão do Evandro, 04/11/2026): etapa marcada
--    como negociação 80; "proposta" 60; "visita" 40; "qualifica" ou "contato" 20; "novo lead" 10; outro nome, nenhuma.
--  * Etapas existentes recebem o padrão; etapa nova recebe o padrão no insert quando a chance não vem informada.
-- O que NÃO faz: não grava chance em negócio (o Forecast calcula na leitura), não gera evento, ponto nem comissão.

set lock_timeout = '3s';

alter table public.etapas
  add column chance_fechamento smallint
    constraint etapas_chance_fechamento_faixa check (chance_fechamento between 0 and 100);

comment on column public.etapas.chance_fechamento is
  'Chance base (%) de um negócio aberto nesta etapa fechar; usada pelo Forecast. Nula: a etapa não entra no Forecast.';

create or replace function public.chance_padrao_etapa(p_nome text, p_marca_negociacao boolean)
returns smallint
language sql immutable set search_path = ''
as $$
  select case
    when p_marca_negociacao then 80
    when lower(p_nome) like '%negocia%' then 80
    when lower(p_nome) like '%proposta%' then 60
    when lower(p_nome) like '%visita%' then 40
    when lower(p_nome) like '%qualifica%' or lower(p_nome) like '%contato%' then 20
    when lower(p_nome) like '%novo lead%' then 10
  end::smallint;
$$;

create or replace function public.etapa_chance_padrao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Etapa que encerra o negócio (ganho/perdido) não tem chance: o negócio já não está aberto.
  if new.chance_fechamento is null and new.fecha_como is null then
    new.chance_fechamento := public.chance_padrao_etapa(new.nome, new.marca_negociacao);
  end if;
  return new;
end;
$$;

create trigger etapas_chance_padrao before insert on public.etapas
  for each row execute function public.etapa_chance_padrao();

update public.etapas
  set chance_fechamento = public.chance_padrao_etapa(nome, marca_negociacao)
  where fecha_como is null;
