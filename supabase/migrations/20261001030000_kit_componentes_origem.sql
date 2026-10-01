-- Fase 5 da reconciliação do motor de dimensionamento (Evandro, 2026-10-01):
-- motor automático e kit manual precisam coexistir. `salvarDimensionamento`
-- (src/lib/acoes/dimensionamento.ts) deixa de apagar o kit inteiro a cada
-- salvamento — precisa saber quais linhas de `kit_componentes` são dela
-- (módulo/inversor escolhidos pelo motor, substituídos a cada salvamento) e
-- quais são do vendedor (bateria, estrutura, override manual de
-- módulo/inversor via "Selecionar manualmente" no painel ou "Montar kit
-- manualmente", nunca apagadas por essa função).

create type public.origem_componente_kit as enum ('automatico', 'manual');

-- Default 'manual' é o mais seguro pra linhas já existentes: nenhuma delas foi
-- gravada por `salvarDimensionamento` com rastreamento de origem (a função
-- sempre reescreve suas próprias linhas 'automatico' no próximo salvamento,
-- então o pior caso é uma linha antiga de módulo/inversor automático ficar
-- temporariamente marcada como manual até o próximo recálculo).
alter table public.kit_componentes
  add column origem public.origem_componente_kit not null default 'manual';

-- ---------------------------------------------------------------------------
-- Origem da escolha de módulo/inversor no motor (automática ou override
-- manual do vendedor dentro do mesmo painel de dimensionamento) — mesmo
-- padrão de auditoria já usado pro overload (`registrar_overload_manual_dimensionamento`
-- em 20260930200000_dimensionamentos_solares.sql): a tabela guarda o estado
-- atual, o trigger registra a mudança na linha do tempo do negócio.
-- ---------------------------------------------------------------------------

alter table public.dimensionamentos_solares
  add column origem_selecao_equipamentos public.origem_componente_kit not null default 'automatico';

create or replace function public.registrar_override_manual_componente()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
begin
  if (
    tg_op = 'INSERT' and new.origem_selecao_equipamentos = 'manual'
  ) or (
    tg_op = 'UPDATE' and (
      old.origem_selecao_equipamentos is distinct from new.origem_selecao_equipamentos
      or (
        new.origem_selecao_equipamentos = 'manual' and (
          old.modulo_equipamento_id is distinct from new.modulo_equipamento_id
          or old.inversor_equipamento_id is distinct from new.inversor_equipamento_id
        )
      )
    )
  ) then
    insert into public.atividades (empresa_id, negocio_id, tipo, ator_id, dados)
      values (
        new.empresa_id, new.negocio_id, 'kit_componente_override_manual', v_ator,
        jsonb_build_object(
          'origem', new.origem_selecao_equipamentos,
          'modulo_equipamento_id', new.modulo_equipamento_id,
          'inversor_equipamento_id', new.inversor_equipamento_id,
          'quantidade_modulos', new.quantidade_modulos
        )
      );
  end if;
  return null;
end;
$$;

create trigger dimensionamentos_solares_registrar_override_componente
  after insert or update on public.dimensionamentos_solares
  for each row execute function public.registrar_override_manual_componente();
