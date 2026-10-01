-- Resultado estruturado de tarefas (pedido do Evandro, 2026-10-01): hoje concluir uma
-- tarefa não distingue "o cliente respondeu" de "o vendedor tentou e não teve resposta" —
-- levantamento prévio mostrou que isso também vale pra reunião/visita (realizada vs
-- no-show vs cancelada). Funcionalidade operacional, SEM pontuação automática: a coluna
-- só fica disponível pro motor de gamificação decidir depois (ex.: regra de "reunião
-- realizada" filtrando payload.resultado = 'realizada'), mas nenhuma regra é criada aqui.
--
-- Escopo (vale só pra ligação/WhatsApp e reunião/visita; e-mail/outro continuam como hoje):
--   - ligação/WhatsApp exigem resultado ao concluir: contato_realizado, sem_resposta,
--     numero_invalido, retornar_depois, sem_interesse.
--   - reunião/visita exigem resultado ao concluir: realizada, no_show, cancelada.
--   - realizada/no_show só valem depois do horário previsto (vence_em); cancelada pode
--     acontecer antes.
--   - resultado é limpo automaticamente se a tarefa for reaberta (volta a pendente).
--
-- "retornar_depois" criar automaticamente a próxima tarefa foi avaliado e ficou de fora
-- desta PR pra não ampliar demais o escopo — ver PROGRESS.md.

create type public.resultado_tarefa as enum (
  'contato_realizado', 'sem_resposta', 'numero_invalido', 'retornar_depois', 'sem_interesse',
  'realizada', 'no_show', 'cancelada'
);

alter table public.tarefas add column resultado public.resultado_tarefa;

create or replace function public.preparar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
  v_concluindo_agora boolean;
begin
  if tg_op = 'INSERT' then
    new.criado_por := v_eu;
    new.responsavel_id := coalesce(new.responsavel_id, v_eu);
    new.concluida_por := case when new.concluida_em is null then null else v_eu end;
    v_concluindo_agora := new.concluida_em is not null;
  else
    new.empresa_id := old.empresa_id;
    new.criado_por := old.criado_por;
    if new.concluida_em is distinct from old.concluida_em then
      new.concluida_por := case when new.concluida_em is null then null else v_eu end;
    else
      new.concluida_por := old.concluida_por;
    end if;
    v_concluindo_agora := new.concluida_em is not null and old.concluida_em is null;
  end if;

  -- Reabrir (ou nunca ter concluído) sempre limpa o resultado — só faz sentido junto da conclusão.
  if new.concluida_em is null then
    new.resultado := null;
  end if;

  if v_concluindo_agora then
    if new.tipo in ('ligacao', 'whatsapp') then
      if new.resultado is null or new.resultado not in ('contato_realizado', 'sem_resposta', 'numero_invalido', 'retornar_depois', 'sem_interesse') then
        raise exception 'Informe o resultado do contato para concluir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    elsif new.tipo in ('reuniao', 'visita') then
      if new.resultado is null or new.resultado not in ('realizada', 'no_show', 'cancelada') then
        raise exception 'Informe o resultado para concluir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
      if new.resultado in ('realizada', 'no_show') and now() < new.vence_em then
        raise exception 'Só é possível marcar como realizada ou sem comparecimento depois do horário previsto.' using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    end if;
  end if;

  if new.negocio_id is not null and not exists (
    select 1 from public.negocios where id = new.negocio_id and empresa_id = new.empresa_id
  ) then
    raise exception 'Negócio de outra empresa' using errcode = 'check_violation';
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.empresa_membros where id = new.responsavel_id and empresa_id = new.empresa_id and ativo
  ) then
    raise exception 'Responsável precisa ser um usuário ativo da empresa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- registrar_tarefa(): só acrescenta `resultado` na timeline e no evento de conclusão
-- (campo novo pro motor de regras poder filtrar no futuro) — nenhuma regra é criada aqui.
create or replace function public.registrar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_contato uuid;
begin
  if new.negocio_id is not null then
    select contato_id into v_contato from public.negocios where id = new.negocio_id;
  end if;
  if tg_op = 'INSERT' then
    if new.negocio_id is not null then
      insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
        values (new.empresa_id, new.negocio_id, v_contato, 'tarefa_criada', v_ator,
                jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo, 'vence_em', new.vence_em,
                                   'responsavel_id', new.responsavel_id));
    end if;
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'task.created', v_ator, 'tarefa', new.id,
              jsonb_build_object('negocio_id', new.negocio_id, 'tipo', new.tipo, 'responsavel_id', new.responsavel_id));
  elsif new.concluida_em is not null and old.concluida_em is null then
    if new.negocio_id is not null then
      insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
        values (new.empresa_id, new.negocio_id, v_contato, 'tarefa_concluida', v_ator,
                jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo,
                                   'atrasada', new.concluida_em > new.vence_em, 'resultado', new.resultado));
    end if;
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'task.completed', v_ator, 'tarefa', new.id,
              jsonb_build_object('negocio_id', new.negocio_id, 'tipo', new.tipo, 'responsavel_id', new.responsavel_id,
                                 'no_prazo', new.concluida_em <= new.vence_em, 'resultado', new.resultado));
  end if;
  return null;
end;
$$;
