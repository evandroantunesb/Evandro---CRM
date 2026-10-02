-- Notificação de conquista desbloqueada (Evandro, 2026-10-02), reaproveitando 100% a
-- infraestrutura de `notificacoes` já existente (sininho, lida_em, link) — sem
-- Supabase Realtime, sem polling, sem segundo sistema. Feedback instantâneo fora da
-- navegação (toast enquanto o usuário está no Kanban) fica para uma evolução futura
-- do sistema de notificações como um todo, não só gamificação.

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('lead_atribuido', 'tarefa_atribuida', 'handoff_recebido', 'handoff_devolvido', 'conquista_desbloqueada'));

-- Gera a notificação só quando o desbloqueio realmente aconteceu agora (nunca no
-- ON CONFLICT DO NOTHING da migration anterior, que indica que outra transação já
-- tinha desbloqueado — aí a notificação dela mesma já existe).
create or replace function public.avaliar_conquistas_pontos()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric;
  v_conquista record;
  v_desbloqueio_id uuid;
begin
  if new.estornado then
    return new;
  end if;

  select coalesce(sum(xp), 0) into v_total
    from public.point_ledger
    where membro_id = new.membro_id and not estornado and referencia_tipo <> 'conquista';

  for v_conquista in
    select * from public.conquistas
    where empresa_id = new.empresa_id
      and ativa
      and criterio->>'metrica' = 'xp_acumulado'
      and v_total >= (criterio->>'valor')::numeric
      and not exists (
        select 1 from public.conquistas_desbloqueadas cd
        where cd.conquista_id = conquistas.id and cd.membro_id = new.membro_id
      )
  loop
    insert into public.conquistas_desbloqueadas (empresa_id, conquista_id, membro_id)
      values (new.empresa_id, v_conquista.id, new.membro_id)
      on conflict (conquista_id, membro_id) do nothing
      returning id into v_desbloqueio_id;

    if v_desbloqueio_id is null then
      continue;
    end if;

    if v_conquista.xp_bonus > 0 then
      insert into public.point_ledger (empresa_id, membro_id, descricao, referencia_tipo, referencia_id, xp, moedas, profile_at_event)
        values (new.empresa_id, new.membro_id, 'Conquista: ' || v_conquista.nome, 'conquista', v_conquista.id, v_conquista.xp_bonus, 0, new.profile_at_event);
    end if;

    insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
      values (new.empresa_id, new.membro_id, 'conquista_desbloqueada', 'Nova conquista desbloqueada: ' || v_conquista.nome, '/gamificacao/jornada');
  end loop;

  return new;
end;
$$;
