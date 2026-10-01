-- Fase 6 da reconciliação do motor de dimensionamento (Evandro, 2026-10-01): risco identificado
-- na Fase 5, detalhado em seguida pelo Evandro (substitui a sugestão inicial de "delete + insert"
-- do núcleo por um esquema de status ativo/substituído, preservando histórico pra auditoria).
--
-- Antes: `salvarDimensionamento` (src/lib/acoes/dimensionamento.ts) substituía só as linhas de
-- `kit_componentes` com `origem = 'automatico'` — um override manual (origem = 'manual') do
-- módulo/inversor do núcleo não era reconhecido no próximo salvamento como "a linha que esta
-- função deve substituir", então alternar automático → manual → automático em saves sucessivos
-- duplicava a linha. Isso ficou crítico agora que a tela de edição do sistema (Fase 6) chama
-- `salvarDimensionamento` repetidamente, não só uma vez na criação do negócio.
--
-- Esquema de slot:
-- - `eh_nucleo_motor`: identifica o PAPEL da linha (módulo ou inversor principal do sistema,
--   gerenciado pelo motor) — `true` seja a escolha automática ou um override manual feito dentro
--   do mesmo painel de dimensionamento; `false` são os itens avulsos (bateria, estrutura,
--   acessórios, ou um módulo/inversor extra do "Montar kit manualmente"), que nunca entram nessa
--   lógica de slot — sempre múltiplos permitidos, nunca tocados por `salvarDimensionamento`.
-- - `ativo`: identifica se a linha é a ATUAL pro seu papel. Trocar o módulo/inversor principal
--   (automático→manual, manual→automático, ou manual→outro manual) marca a linha anterior como
--   `ativo = false` em vez de apagá-la — preserva o histórico. No máximo 1 linha com
--   `eh_nucleo_motor = true` e `ativo = true` por `(negocio_id, tipo)`, garantido pelo índice único
--   parcial abaixo. Toda leitura de "o kit atual" (tela do negócio, PDF da proposta, tela de
--   editar) passa a filtrar `ativo = true`.

alter table public.kit_componentes
  add column eh_nucleo_motor boolean not null default false;

alter table public.kit_componentes
  add column ativo boolean not null default true;

-- Backfill: toda linha de módulo/inversor com `ordem` 0 ou 1 foi inserida pelo núcleo do motor —
-- `salvarDimensionamento` sempre grava o módulo em `ordem: 0` e o inversor em `ordem: 1` (ver
-- src/lib/acoes/dimensionamento.ts), tanto pra escolha automática quanto pra override manual.
-- Todas essas linhas pré-existentes também ficam `ativo = true` (default), já que antes desta
-- migration só existia uma linha de cada papel por negócio (o DELETE antigo não deixava histórico).
update public.kit_componentes
  set eh_nucleo_motor = true
  where tipo in ('modulo', 'inversor') and ordem < 2;

create unique index kit_componentes_nucleo_ativo_unico
  on public.kit_componentes (negocio_id, tipo)
  where eh_nucleo_motor and ativo;

-- ---------------------------------------------------------------------------
-- Auditoria do slot: substitui `registrar_override_manual_componente`
-- (20261001030000_kit_componentes_origem.sql) por uma versão que registra TODA troca de
-- módulo/inversor principal (não só quando a origem nova é "manual") — módulo anterior/novo,
-- inversor anterior/novo, origem anterior/nova, ator e data/hora (já cobertos por `atividades`).
-- Sem campo de justificativa na UI ainda — a chave fica no payload pronta pra uso futuro, sempre
-- `null` por ora (pedido do Evandro: não inventar UI nova só pra isso).
-- ---------------------------------------------------------------------------

create or replace function public.registrar_override_manual_componente()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_mudou boolean;
begin
  if tg_op = 'INSERT' then
    v_mudou := new.origem_selecao_equipamentos = 'manual';
  else
    v_mudou :=
      old.modulo_equipamento_id is distinct from new.modulo_equipamento_id
      or old.inversor_equipamento_id is distinct from new.inversor_equipamento_id
      or old.origem_selecao_equipamentos is distinct from new.origem_selecao_equipamentos;
  end if;

  if v_mudou then
    insert into public.atividades (empresa_id, negocio_id, tipo, ator_id, dados)
      values (
        new.empresa_id, new.negocio_id, 'kit_componente_override_manual', v_ator,
        jsonb_build_object(
          'origem', new.origem_selecao_equipamentos,
          'origem_anterior', case when tg_op = 'UPDATE' then old.origem_selecao_equipamentos else null end,
          'modulo_equipamento_id', new.modulo_equipamento_id,
          'modulo_equipamento_id_anterior', case when tg_op = 'UPDATE' then old.modulo_equipamento_id else null end,
          'inversor_equipamento_id', new.inversor_equipamento_id,
          'inversor_equipamento_id_anterior', case when tg_op = 'UPDATE' then old.inversor_equipamento_id else null end,
          'quantidade_modulos', new.quantidade_modulos,
          'justificativa', null
        )
      );
  end if;
  return null;
end;
$$;
-- O trigger `dimensionamentos_solares_registrar_override_componente` (criado em
-- 20261001030000_kit_componentes_origem.sql) já aponta pra esta função — `create or replace`
-- acima é suficiente, não precisa recriar o trigger.
