-- Evandro achou (2026-09-30) que o cadastro de inversor em "Equipamentos
-- ativos" se comportava como o de módulo: os campos visíveis por padrão eram
-- idênticos e faltavam vários campos técnicos de inversor que ele espera
-- (tipo on-grid/híbrido, tensão de partida, entradas por MPPT, corrente AC
-- máxima, tensão AC, fases, eficiência). Os demais campos do pedido já
-- existiam (potência AC nominal reaproveita `potencia_w`; potência FV/DC
-- máxima é `potencia_dc_maxima_entrada_w`; tensão DC máxima, MPPT mín/máx,
-- corrente máx. por MPPT e Isc máx. por MPPT já vieram nas migrations
-- 20260930160000/20260930180000).
--
-- `tensao_fases_ac` (texto livre, ex.: "380V trifásico") fica como está, sem
-- uso nos formulários novos — os dois valores agora são campos estruturados
-- próprios (`tensao_ac_v`, `fases_ca`). Não removemos a coluna antiga pra não
-- arriscar apagar dado real já cadastrado por ele.
create type public.tipo_inversor_equipamento as enum ('on_grid', 'hibrido');
create type public.fases_ca_equipamento as enum ('monofasico', 'trifasico');

alter table public.equipamentos_empresa
  add column tipo_inversor public.tipo_inversor_equipamento,
  add column tensao_partida_v numeric(6, 2) check (tensao_partida_v is null or tensao_partida_v > 0),
  add column entradas_por_mppt integer check (entradas_por_mppt is null or entradas_por_mppt > 0),
  add column corrente_max_ac_a numeric(6, 2) check (corrente_max_ac_a is null or corrente_max_ac_a > 0),
  add column tensao_ac_v numeric(6, 2) check (tensao_ac_v is null or tensao_ac_v > 0),
  add column fases_ca public.fases_ca_equipamento,
  add column eficiencia_pct numeric(5, 4) check (eficiencia_pct is null or (eficiencia_pct > 0 and eficiencia_pct <= 1));
