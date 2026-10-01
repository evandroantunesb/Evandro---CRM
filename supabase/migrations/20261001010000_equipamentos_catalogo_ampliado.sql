-- Catálogo ampliado (pedido do Evandro, 2026-10-01), pra já deixar o schema
-- pronto pra importação em massa (planilha com catálogo real de módulos e
-- inversores): campos de identificação/físicos que faltavam, e os campos de
-- "procedência" do nível avançado/interno da tela de Equipamentos — status de
-- validação do datasheet, fonte(s) de onde veio o dado, observações.
--
-- Nenhum desses campos entra na validação elétrica do motor
-- (`src/lib/dimensionamento.ts`): são só identificação, dados físicos e
-- metadados. Todos nuláveis — importar/cadastrar sem eles continua
-- funcionando normalmente.
alter table public.equipamentos_empresa
  -- Comuns aos dois tipos.
  add column categoria text,
  add column tecnologia text,
  add column status_validacao text,
  add column fonte_primaria text,
  add column fonte_secundaria text,
  add column observacoes text,
  -- Módulo: elétricos adicionais, físicos e de identificação.
  add column bifacial boolean,
  add column bifacialidade_pct numeric(5, 2) check (bifacialidade_pct is null or (bifacialidade_pct >= 0 and bifacialidade_pct <= 100)),
  add column coef_temp_pmax_pct_c numeric(5, 3),
  add column coef_temp_isc_pct_c numeric(5, 3),
  add column nmot_c numeric(5, 2),
  add column tensao_max_sistema_v numeric(6, 2) check (tensao_max_sistema_v is null or tensao_max_sistema_v > 0),
  add column fusivel_max_serie_a numeric(5, 2) check (fusivel_max_serie_a is null or fusivel_max_serie_a > 0),
  add column eficiencia_modulo_pct numeric(5, 4) check (eficiencia_modulo_pct is null or (eficiencia_modulo_pct > 0 and eficiencia_modulo_pct <= 1)),
  add column comprimento_mm numeric(7, 1) check (comprimento_mm is null or comprimento_mm > 0),
  add column largura_mm numeric(7, 1) check (largura_mm is null or largura_mm > 0),
  add column espessura_mm numeric(6, 1) check (espessura_mm is null or espessura_mm > 0),
  add column peso_kg numeric(6, 2) check (peso_kg is null or peso_kg > 0),
  -- Inversor: capacidade/proteção adicionais.
  add column potencia_aparente_max_va numeric(8, 2) check (potencia_aparente_max_va is null or potencia_aparente_max_va > 0),
  add column grau_protecao text;

comment on column public.equipamentos_empresa.categoria is 'Ex.: "modulo_fv" (módulo) ou "on-grid"/"hibrido" (inversor, texto livre — a validação elétrica usa tipo_inversor, não esta coluna).';
comment on column public.equipamentos_empresa.status_validacao is 'Ex.: "VALIDADO_DATASHEET" — nível avançado/interno, não entra em nenhum cálculo.';

-- Pra importação em massa (planilha) poder fazer upsert por fabricante+modelo em vez de
-- duplicar o equipamento a cada reimportação do mesmo catálogo.
alter table public.equipamentos_empresa
  add constraint equipamentos_empresa_empresa_tipo_fabricante_modelo_key
    unique (empresa_id, tipo, fabricante, modelo);
