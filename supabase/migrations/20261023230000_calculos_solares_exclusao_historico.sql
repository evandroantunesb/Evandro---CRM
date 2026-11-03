-- Exclusão do cálculo solar com histórico e autoria (M2 P0, revisão final da calculadora GD II; Evandro, 23/10/2026).
--
-- Até aqui, apagar a linha de `calculos_solares` (policy "apagar cálculo": quem criou ou o admin; ação `apagarCalculo`)
-- não deixava rastro, e o histórico (`calculos_solares_historico`, só no UPDATE) não dizia quem arquivou.
--
--   1) `arquivado_por` (membro) e `arquivado_por_papel` (papel do banco que executou) no histórico.
--   2) UPDATE (substituição pelo servidor, R6.1): autoria = `atualizado_por` da linha NOVA, que o servidor preenche com o
--      membro da autorização (`autorizar_gravacao_calculo`).
--   3) DELETE: BEFORE DELETE grava a linha inteira com motivo `apagado` na MESMA transação. Usuário autenticado sem
--      membro identificado na empresa da linha é recusado (a RLS já exige o criador ou o admin). Única exceção: a
--      cascata da exclusão do próprio negócio (o negócio já não existe), cujo histórico também sai pela FK.

alter table public.calculos_solares_historico
  add column arquivado_por uuid references public.empresa_membros (id) on delete set null,
  add column arquivado_por_papel text;

alter table public.calculos_solares_historico drop constraint calculos_solares_historico_motivo_check;
alter table public.calculos_solares_historico
  add constraint calculos_solares_historico_motivo_check
    check (motivo in ('desatualizado_por_entradas', 'substituido_por_recalculo', 'apagado'));

comment on column public.calculos_solares_historico.arquivado_por is
  'Membro responsável: no UPDATE, o atualizado_por da linha nova (autorização do servidor); no DELETE, o membro da sessão.';
comment on column public.calculos_solares_historico.arquivado_por_papel is
  'Papel do banco que executou (authenticated, service_role, postgres...).';

-- 2) UPDATE: mesma regra de antes, agora com a autoria.
create or replace function public.calculos_solares_arquivar_historico()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ignorar text[] := array[
    'updated_at', 'atualizado_por', 'observacoes', 'kit_preco', 'payback_meses',
    'financeiro_desatualizado_em', 'financeiro_desatualizado_motivo'
  ];
begin
  if old.estado_financeiro in ('legado', 'completo')
     and (to_jsonb(old) - v_ignorar) is distinct from (to_jsonb(new) - v_ignorar) then
    insert into public.calculos_solares_historico (calculo_id, empresa_id, negocio_id, motivo, linha, arquivado_por, arquivado_por_papel)
    values (
      old.id, old.empresa_id, old.negocio_id,
      case when new.estado_financeiro = 'incompleto' then 'desatualizado_por_entradas' else 'substituido_por_recalculo' end,
      to_jsonb(old),
      new.atualizado_por,
      coalesce(auth.role(), session_user::text)
    );
  end if;
  return new;
end;
$$;
revoke execute on function public.calculos_solares_arquivar_historico() from public, anon, authenticated;

-- 3) DELETE: arquiva a linha inteira com o autor, antes de apagar.
create or replace function public.calculos_solares_arquivar_exclusao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_papel text := coalesce(auth.role(), session_user::text);
  v_autor uuid;
begin
  -- Cascata da exclusão do negócio: ele já não existe e o histórico dele sai junto (FK on delete cascade).
  if not exists (select 1 from public.negocios n where n.id = old.negocio_id) then
    return old;
  end if;
  v_autor := public.meu_membro_id(old.empresa_id);
  if v_papel in ('authenticated', 'anon') and v_autor is null then
    raise exception 'Sem permissão para apagar este cálculo.' using errcode = '42501', hint = 'mensagem_usuario';
  end if;
  insert into public.calculos_solares_historico (calculo_id, empresa_id, negocio_id, motivo, linha, arquivado_por, arquivado_por_papel)
  values (old.id, old.empresa_id, old.negocio_id, 'apagado', to_jsonb(old), v_autor, v_papel);
  return old;
end;
$$;
revoke all on function public.calculos_solares_arquivar_exclusao() from public, anon, authenticated, service_role;

create trigger calculos_solares_historico_exclusao before delete on public.calculos_solares
  for each row execute function public.calculos_solares_arquivar_exclusao();
