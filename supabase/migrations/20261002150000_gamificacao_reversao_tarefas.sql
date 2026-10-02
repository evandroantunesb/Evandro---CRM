-- Reversibilidade causal de tarefas/reuniões/visitas (pedido do Evandro, 2026-10-02,
-- depois da reconciliação das stacks de perfis/XP e tarefas/reunião): reabrir uma tarefa
-- já concluída limpa `resultado` (`preparar_tarefa()`), mas até aqui não existia
-- contrapartida causal — o crédito de `task.completed`/`reuniao.realizada`/`visita.realizada`
-- continuava ativo pra sempre, e recompletar gerava um evento novo que podia acumular com
-- o anterior. Regra obrigatória: no máximo 1 ocorrência ativa por ciclo de conclusão
-- (concluir → +4, reabrir → -4, concluir de novo → +4, líquido = +4 — nunca acumula).
--
-- Padrão reaproveitado (auditoria confirmou que já existe e é o certo): o mesmo de
-- `estornar_confirmacao_pagamento()` (#113) — insere um evento de reversão dedicado
-- (ator = quem reabriu, beneficiário = quem tinha sido creditado, payload aponta pro
-- evento original) e SÓ DEPOIS chama `estornar_lancamentos_do_evento(evento_id, ...)`,
-- que reverte por evento_id específico (não por tipo+entidade genérico como
-- `estornar_lancamentos_evento`, que é o mecanismo errado aqui: uma tarefa pode ter
-- vários `task.completed` ao longo da vida, um por ciclo de conclusão, e só o ativo no
-- momento da reabertura pode ser revertido).
--
-- Nenhum evento, lançamento de point_ledger, XP ou moeda é apagado ou editado — a
-- reversão é só `point_ledger.estornado = true` (mesma coluna genérica já usada em todo
-- o projeto), e todas as agregações (ranking, saldo de moedas, XP total, conquistas por
-- marco) já somam só `where not estornado`, então o reflexo é automático.
--
-- Identificação do evento ativo: NUNCA só "o mais recente daquele tipo" (ordenação não é
-- verdade causal). O evento ativo é o mais recente `task.completed`/`<tipo>.realizada`
-- desta tarefa que ainda não tem uma reversão apontando pra ele (`not exists` contra
-- `payload->>'evento_original_id'` dos próprios eventos de reversão) — a verdade causal
-- vem da cadeia evento→reversão, não da existência de lançamento em `point_ledger` (um
-- evento pode legitimamente não ter gerado ponto nenhum, se nenhuma regra estava
-- configurada pra ele; `estornar_lancamentos_do_evento` é um no-op seguro nesse caso,
-- não falha). Isso garante, num histórico "conclusão A → reversão A → conclusão B →
-- reversão B → conclusão C", que reversão A aponte sempre pra A e reversão B sempre pra
-- B, nunca reaproveitando uma ocorrência já revertida. `reuniao.realizada`/
-- `visita.realizada` só é revertido se a conclusão que está sendo desfeita tinha
-- `resultado = 'realizada'` (ex.: uma reunião concluída como `no_show` nunca teve esse
-- evento, não há o que reverter).
--
-- Novos tipos de evento (mesmo padrão de `pagamento.confirmacao_estornada`, não entram no
-- catálogo `EVENTOS_GAMIFICACAO` da UI — são reversão, não geram pontos novos):
-- `task.completed_revertido`, `reuniao.realizada_revertida`, `visita.realizada_revertida`.

create or replace function public.registrar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_contato uuid;
  v_membro_id uuid;
  v_evento_completed_id bigint;
  v_evento_realizada_id bigint;
  v_beneficiario_completed uuid;
  v_beneficiario_realizada uuid;
  v_tipo_realizada text;
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

    if new.tipo in ('reuniao', 'visita') and new.resultado = 'realizada' then
      insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
        values (new.empresa_id, new.tipo::text || '.realizada', v_ator, 'tarefa', new.id,
                jsonb_build_object('negocio_id', new.negocio_id, 'responsavel_id', new.responsavel_id));
    end if;
  elsif new.concluida_em is null and old.concluida_em is not null then
    if new.negocio_id is not null then
      insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
        values (new.empresa_id, new.negocio_id, v_contato, 'tarefa_reaberta', v_ator,
                jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo));
    end if;

    -- Reverte o task.completed ativo: o mais recente desta tarefa que ainda não tem uma
    -- reversão apontando pra ele (não "o mais recente" por si só — ver comentário acima).
    select e.id, e.ator_id into v_evento_completed_id, v_beneficiario_completed
      from public.eventos e
      where e.entidade = 'tarefa' and e.entidade_id = new.id and e.tipo = 'task.completed'
        and not exists (
          select 1 from public.eventos r
          where r.entidade = 'tarefa' and r.entidade_id = new.id and r.tipo = 'task.completed_revertido'
            and (r.payload->>'evento_original_id')::bigint = e.id
        )
      order by e.created_at desc limit 1;

    if v_evento_completed_id is not null then
      v_membro_id := public.meu_membro_id(new.empresa_id);
      insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload)
        values (new.empresa_id, 'task.completed_revertido', v_ator, v_beneficiario_completed, 'tarefa', new.id,
                jsonb_build_object('negocio_id', new.negocio_id, 'evento_original_id', v_evento_completed_id));
      perform public.estornar_lancamentos_do_evento(v_evento_completed_id, v_membro_id);
    end if;

    -- Só reverte reuniao.realizada/visita.realizada se a conclusão desfeita realmente
    -- tinha resultado = 'realizada' (old.resultado, que preparar_tarefa() já limpou em
    -- new.resultado antes deste trigger AFTER rodar). Uma reunião concluída como
    -- no_show/cancelada nunca teve esse evento — nada a reverter.
    if old.tipo in ('reuniao', 'visita') and old.resultado = 'realizada' then
      v_tipo_realizada := old.tipo::text || '.realizada';
      select e.id, e.ator_id into v_evento_realizada_id, v_beneficiario_realizada
        from public.eventos e
        where e.entidade = 'tarefa' and e.entidade_id = new.id and e.tipo = v_tipo_realizada
          and not exists (
            select 1 from public.eventos r
            where r.entidade = 'tarefa' and r.entidade_id = new.id and r.tipo = v_tipo_realizada || '_revertida'
              and (r.payload->>'evento_original_id')::bigint = e.id
          )
        order by e.created_at desc limit 1;

      if v_evento_realizada_id is not null then
        v_membro_id := coalesce(v_membro_id, public.meu_membro_id(new.empresa_id));
        insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload)
          values (new.empresa_id, v_tipo_realizada || '_revertida', v_ator, v_beneficiario_realizada, 'tarefa', new.id,
                  jsonb_build_object('negocio_id', new.negocio_id, 'evento_original_id', v_evento_realizada_id));
        perform public.estornar_lancamentos_do_evento(v_evento_realizada_id, v_membro_id);
      end if;
    end if;
  end if;
  return null;
end;
$$;
