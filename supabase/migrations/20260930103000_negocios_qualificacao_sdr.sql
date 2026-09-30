-- Bloco "Qualificação SDR" (spec RAION_SDR_REGRAS_PERMISSOES, fase 4). Evandro confirmou
-- reaproveitar os dados técnicos que já existem em negocios (valor_conta_energia,
-- consumo_medio_kwh, tipo_telhado, padrao_cliente, unidade_consumidora, desde 20260926040000)
-- em vez de duplicar — "Tipo de imóvel" e "Tipo de instalação" da spec caem em tipo_telhado, e
-- "Conta anexada?" é derivado dos anexos categoria fatura_gerador já existentes. Só os campos
-- que não têm equivalente hoje entram como coluna nova.
alter table public.negocios
  add column qualif_tipo_cliente text check (
    qualif_tipo_cliente is null or qualif_tipo_cliente in ('residencial', 'comercial', 'industrial', 'rural', 'outro')
  ),
  add column qualif_possui_conta_energia boolean,
  add column qualif_distribuidora text,
  add column qualif_imovel_proprio boolean,
  add column qualif_objetivo text,
  add column qualif_prazo_instalacao text check (
    qualif_prazo_instalacao is null
    or qualif_prazo_instalacao in ('imediatamente', 'ate_30_dias', '1_3_meses', '3_6_meses', 'somente_pesquisando')
  ),
  add column qualif_busca_financiamento boolean,
  add column qualif_orcamento_outra_empresa boolean,
  add column qualif_e_decisor boolean,
  add column qualif_outro_decisor boolean,
  add column qualif_participantes_decisao text,
  add column qualif_observacoes text;
