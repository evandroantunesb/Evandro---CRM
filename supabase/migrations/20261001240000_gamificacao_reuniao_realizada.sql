-- Evento "reunião realizada" / "visita realizada" (tabela de pontos do Evandro,
-- +6 e +4 respectivamente conforme o spec consultado) — auditoria de 2026-10-01
-- confirmou que o sinal ficou confiável depois da #109 (`tarefas.resultado`,
-- com `realizada` só liberado depois do horário previsto).
--
-- `avaliar_condicao_regra()` só compara 1 campo por regra, e "realizada" exige
-- tipo (reunião/visita) *e* resultado (realizada) ao mesmo tempo — por isso um
-- evento genérico `task.completed` filtrado por `tipo` não bastaria. Solução:
-- dois eventos dedicados, no mesmo padrão já usado por `handoff.won`/`deal.
-- first_contact_done` — `reuniao.realizada` e `visita.realizada`, emitidos só
-- quando `tipo` e `resultado = 'realizada'` batem ao mesmo tempo. Dois tipos
-- (não um genérico) porque o spec atribui pontuação diferente a cada um.
--
-- Beneficiário: o próprio `ator_id` (quem concluiu a tarefa) — reunião/visita é
-- autoatribuída por quem a realizou, sem intermediário a validar (diferente do
-- aceite de handoff). Sem guarda extra de "uma vez por negócio" aqui: múltiplas
-- reuniões reais no mesmo negócio pontuam cada uma (mesmo comportamento que
-- `task.completed` já tem hoje); quem quiser limitar usa `unica_por_negocio`
-- na regra.
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

    if new.tipo in ('reuniao', 'visita') and new.resultado = 'realizada' then
      insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
        values (new.empresa_id, new.tipo::text || '.realizada', v_ator, 'tarefa', new.id,
                jsonb_build_object('negocio_id', new.negocio_id, 'responsavel_id', new.responsavel_id));
    end if;
  end if;
  return null;
end;
$$;
