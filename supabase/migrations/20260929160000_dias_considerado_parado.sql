-- Prazo (em dias) sem atividade pra considerar um negócio "parado" — usado
-- tanto pra leads parados quanto pra propostas paradas. Configurável pelo
-- gestor em Configurações > Funis e etapas; padrão 7, o mesmo já usado
-- quando esse conceito nasceu (PR #52), agora ajustável por empresa.

alter table public.empresas
  add column dias_considerado_parado smallint not null default 7 check (dias_considerado_parado > 0);
