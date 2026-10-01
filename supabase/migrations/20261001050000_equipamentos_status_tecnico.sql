-- Status técnico estruturado do catálogo de equipamentos (pedido do Evandro, 2026-10-01,
-- na reorganização da tela "Kits e calculadora"). Cada módulo/inversor passa a deixar claro
-- em que pé está: Completo | Incompleto | Em revisão | Verificado | Descontinuado.
--
-- Não confundir com `status_validacao` (texto livre vindo da planilha, ex.:
-- "VALIDADO_DATASHEET"), que continua sendo só metadado de procedência e não entra em cálculo.
--
-- Regra (espelhada em `statusTecnicoResultante`, `src/lib/equipamentos.ts`, usada no preview
-- da importação CSV e nos testes — o gatilho abaixo é a fonte autoritativa):
--   * "completo"/"incompleto" são DERIVADOS dos dados técnicos que o motor de dimensionamento
--     usa pra validar string/MPPT — mesma lista de `camposTecnicosFaltantes`
--     (`src/lib/dimensionamento.ts`):
--       módulo:   voc_v, vmp_v, isc_a, imp_a, coef_temp_voc_pct_c
--       inversor: tensao_max_dc_v, mppt_min_v, mppt_max_v, corrente_max_entrada_a, quantidade_mppt
--   * "em_revisao", "verificado" e "descontinuado" são escolhas manuais do admin e prevalecem
--     sobre o cálculo automático — exceto que "em_revisao"/"verificado" exigem os dados
--     técnicos completos: se faltar algum, o equipamento volta pra "incompleto" (não faz
--     sentido "verificado" sem os dados que o motor confere). "descontinuado" vale sempre.
--   * Quando os dados ficam completos, "incompleto" vira "completo" sozinho.
--
-- Participação no motor automático (filtro aplicado no carregamento do catálogo em
-- "Adicionar negócio" — `participaDoMotor` em `src/lib/equipamentos.ts`): entram
-- completo, verificado e em_revisao (este último sempre com dados completos, pela regra
-- acima — "em revisão" é só o admin conferindo metadado/datasheet). Ficam de fora
-- incompleto (falta dado técnico) e descontinuado (não deve mais ser vendido). O
-- equipamento continua existindo no catálogo em todos os casos.

create type public.status_tecnico_equipamento as enum (
  'completo',
  'incompleto',
  'em_revisao',
  'verificado',
  'descontinuado'
);

alter table public.equipamentos_empresa
  add column status_tecnico public.status_tecnico_equipamento not null default 'incompleto';

comment on column public.equipamentos_empresa.status_tecnico is
  'completo/incompleto: derivados dos dados técnicos (gatilho equipamentos_empresa_status_tecnico). em_revisao/verificado/descontinuado: escolha manual do admin. Só completo/verificado/em_revisao entram no motor automático.';

create or replace function public.ajustar_status_tecnico_equipamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  completo boolean;
begin
  if new.status_tecnico = 'descontinuado' then
    return new;
  end if;
  completo := case new.tipo
    when 'modulo' then
      new.voc_v is not null and new.vmp_v is not null and new.isc_a is not null
        and new.imp_a is not null and new.coef_temp_voc_pct_c is not null
    when 'inversor' then
      new.tensao_max_dc_v is not null and new.mppt_min_v is not null and new.mppt_max_v is not null
        and new.corrente_max_entrada_a is not null and new.quantidade_mppt is not null
    else false
  end;
  if not completo then
    new.status_tecnico := 'incompleto';
  elsif new.status_tecnico = 'incompleto' then
    new.status_tecnico := 'completo';
  end if;
  return new;
end;
$$;

create trigger equipamentos_empresa_status_tecnico before insert or update on public.equipamentos_empresa
  for each row execute function public.ajustar_status_tecnico_equipamento();

-- Preenche o status dos equipamentos que já existem: o `update` abaixo não muda nenhum dado
-- além de `status_tecnico` (e `updated_at`, pelo gatilho de sempre) — o gatilho novo recalcula
-- completo/incompleto a partir dos campos técnicos já cadastrados.
update public.equipamentos_empresa set status_tecnico = 'incompleto';

create index on public.equipamentos_empresa (empresa_id, tipo, status_tecnico);
