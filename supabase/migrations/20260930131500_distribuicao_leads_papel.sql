-- Distribuição de leads por papel (pedido do Evandro, 2026-09-30): a empresa escolhe como o
-- rodízio reparte leads entre vendedores e SDR. Hoje o rodízio (enviarCaptura) nem filtra por
-- papel — qualquer membro com recebe_leads=true entra na fila, então um SDR cadastrado já
-- cairia misturado sem querer; a seleção de pool passa a respeitar o modo escolhido (ver
-- src/lib/distribuicao-leads.ts).
create type public.modo_distribuicao_leads as enum ('somente_vendedores', 'somente_sdr', 'parcial', 'aleatorio');

alter table public.empresas
  add column modo_distribuicao_leads public.modo_distribuicao_leads not null default 'somente_vendedores',
  add column percentual_leads_sdr smallint not null default 50 check (percentual_leads_sdr between 0 and 100);
