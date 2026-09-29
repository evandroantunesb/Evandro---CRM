-- Prazo (em horas) sem nenhum contato registrado pra considerar um lead novo
-- "sem contato" — negócio ainda na etapa inicial do funil, sem nota nenhuma.
-- Configurável pelo gestor em Configurações > Funis e etapas; padrão 3 horas,
-- decidido por Evandro (PR do "check-in automático").

alter table public.empresas
  add column horas_considerado_sem_contato smallint not null default 3 check (horas_considerado_sem_contato > 0);
