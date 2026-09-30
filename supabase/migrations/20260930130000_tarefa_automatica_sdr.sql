-- Fase 6 da spec RAION_SDR_REGRAS_PERMISSOES (§9): cria automaticamente a tarefa "Realizar
-- primeiro contato" (prazo de 15 minutos) quando um negócio passa a ter um SDR como responsável.
-- Um trigger em negocios cobre todos os pontos de entrada de uma vez (criação manual, edição,
-- rodízio automático de leads via atribuicoes_leads) sem duplicar a checagem em cada Server Action.
create or replace function public.criar_tarefa_primeiro_contato_sdr()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_responsavel_mudou boolean;
begin
  if tg_op = 'INSERT' then
    v_responsavel_mudou := true;
  else
    v_responsavel_mudou := new.responsavel_id is distinct from old.responsavel_id;
  end if;

  if v_responsavel_mudou and new.responsavel_id is not null and exists (
    select 1 from public.empresa_membros
    where id = new.responsavel_id and empresa_id = new.empresa_id and papel = 'sdr'
  ) then
    insert into public.tarefas (empresa_id, negocio_id, titulo, tipo, vence_em, responsavel_id)
      values (new.empresa_id, new.id, 'Realizar primeiro contato', 'ligacao', now() + interval '15 minutes', new.responsavel_id);
  end if;
  return null;
end;
$$;

create trigger negocios_tarefa_primeiro_contato_sdr after insert or update of responsavel_id on public.negocios
  for each row execute function public.criar_tarefa_primeiro_contato_sdr();
