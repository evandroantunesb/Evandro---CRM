-- Fase 2 do kit técnico, item 5: custos internos configuráveis (material CA,
-- instalação por módulo, engenharia, comissão), somados automaticamente ao
-- preço sugerido do negócio junto com o preço estimado dos componentes do
-- catálogo (ver src/lib/calculadora.ts). Continuam editáveis pelo vendedor
-- depois de calculados — é só um ponto de partida, não trava nada.

alter table public.parametros_calculadora
  add column custo_instalacao_por_modulo numeric(10, 2) not null default 0
    check (custo_instalacao_por_modulo >= 0),
  add column custo_material_ca_por_kwp numeric(10, 2) not null default 0
    check (custo_material_ca_por_kwp >= 0),
  add column custo_engenharia numeric(10, 2) not null default 0
    check (custo_engenharia >= 0),
  add column comissao_percentual numeric(5, 4) not null default 0
    check (comissao_percentual >= 0 and comissao_percentual <= 1);
