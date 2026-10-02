-- Fecha o bloco Níveis e Conquistas (Evandro, 2026-10-02), depois da auditoria
-- read-only e das decisões de produto sobre ela. Decisões aplicadas aqui:
--
-- NÍVEIS
--  1. Nível continua estado dinâmico derivado do XP ativo (sem histórico de
--     level-up) — já era assim, nenhuma mudança de comportamento.
--  2. XP ativo caindo por estorno pode derrubar o nível — já era assim
--     (cálculo sempre ao vivo), nenhuma mudança.
--  3. Mudar um threshold reinterpreta o nível atual na hora, sem tocar no
--     ledger — já era assim, nenhuma mudança.
--  4. Nova trava: xp_minimo deve crescer estritamente junto com nivel.
--  5. Nova coluna `ativa`: desativar um nível não apaga configuração nem
--     afeta histórico; só deixa de contar no cálculo de nível (ver abaixo).
--
-- CONQUISTAS
--  6/7. Conquista desbloqueada e o xp_bonus que ela gerou são marco
--       permanente — estorno do XP de origem nunca os remove. Isso já era
--       verdade (avaliar_conquistas_pontos só roda em insert, nunca reavalia
--       em update/estorno) — nenhuma mudança de schema, só confirmado.
--  8. Nova trava: XP de bônus de conquista não conta para xp_acumulado de
--     outra conquista — elimina a cascata.
--  9. Bônus continua contando pra nível/ranking normalmente (eles somam todo
--     xp ativo, bônus incluso) e continua xp>0/moedas=0 — nenhuma mudança.
-- 10/11. Conquista desativada não pode ser desbloqueada por quem ainda não
--        tem, mas quem já desbloqueou continua vendo — já valia no banco (o
--        loop de avaliação já filtra `ativa`); o que precisava de correção
--        era a tela (Jornada escondia a conquista inteira), ajustado no
--        mesmo PR fora desta migration.
-- 12. Desbloqueio concurrency-safe: conflito na unique(conquista_id,
--     membro_id) nunca pode abortar a transação do evento comercial que
--     disparou a avaliação.

-- ---------------------------------------------------------------------------
-- 1. Níveis: ativa + ordem estrita de xp_minimo vs nivel.
-- ---------------------------------------------------------------------------

alter table public.niveis_gamificacao add column ativa boolean not null default true;

-- Sem isso, nada impede cadastrar nível 3 com XP mínimo menor que o nível 2 —
-- calcularNivel() itera em ordem de xp_minimo, então a numeração exibida
-- ficaria incoerente com a ordem real de progressão.
create or replace function public.verificar_ordem_niveis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.niveis_gamificacao n
    where n.empresa_id = new.empresa_id and n.nivel <> new.nivel
      and ((n.nivel < new.nivel and n.xp_minimo >= new.xp_minimo)
        or (n.nivel > new.nivel and n.xp_minimo <= new.xp_minimo))
  ) then
    raise exception 'O XP mínimo precisa crescer junto com o nível: maior que o dos níveis anteriores e menor que o dos seguintes.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;

create trigger niveis_verificar_ordem before insert or update on public.niveis_gamificacao
  for each row execute function public.verificar_ordem_niveis();

-- ---------------------------------------------------------------------------
-- 2. Conquistas: sem cascata de bônus + desbloqueio concurrency-safe.
-- ---------------------------------------------------------------------------

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

  -- XP vindo de bônus de conquista (referencia_tipo = 'conquista') não conta
  -- pra desbloquear outra conquista por xp_acumulado — elimina a cascata
  -- (decisão 8). O próprio insert do bônus ainda reaciona este gatilho
  -- recursivamente, mas como o total abaixo ignora linhas de bônus, a
  -- recursão não encontra nenhum novo limiar cruzado e termina sozinha.
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
    -- Concurrency-safe (decisão 12): dois lançamentos de XP cruzando o mesmo
    -- limiar quase ao mesmo tempo não podem fazer um conflito de unique
    -- abortar a transação do evento comercial que gerou o XP. Se outra
    -- transação já desbloqueou primeiro, só pula o bônus (evita bônus
    -- duplicado) sem levantar erro.
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
  end loop;

  return new;
end;
$$;
