-- Fechamento do antifraude da Gamificação (Evandro, 2026-10-02, depois da auditoria
-- read-only que seguiu a consolidação das #119-#122). Três frentes, cada uma estrutural
-- (banco), nunca dependente só da UI:
--
-- 1. Eventos "atividade" sem nenhuma guarda natural (deal.created, deal.stage_changed,
--    deal.owner_changed, task.created, note.created) ficam estruturalmente inelegíveis
--    pra XP/moedas: o evento continua existindo e nenhum histórico é apagado, só o motor
--    passa a ignorar qualquer regra desses tipos, mesmo antiga e `ativa` (a UI também
--    deixa de oferecê-los pra regra nova, ver EVENTOS_NAO_PONTUAVEIS em gamificacao.ts).
--
-- 2. Atividades repetíveis que continuam pontuáveis (task.completed, reuniao.realizada,
--    visita.realizada) passam a exigir limite_periodo + limite_quantidade pra pontuar —
--    sem teto, o motor ignora a regra, igual ao item 1. Não usamos unica_por_negocio
--    pra reunião/visita (pedido explícito do Evandro: um negócio pode legitimamente ter
--    várias reuniões/visitas) — o teto obrigatório é a própria proteção.
--
-- 3. Snapshot da condição no point_ledger: regra com condição (ex. deal.won valor >= X)
--    passa a congelar, no momento do crédito, a condição avaliada + o valor do payload
--    comparado + o resultado — pra que editar a regra depois nunca mude o que já foi
--    creditado. Sem versionar gamification_rules inteira (decisão explícita: solução
--    mínima), sem backfill (lançamentos antigos ficam com condicao_avaliada = null).

-- ---------------------------------------------------------------------------
-- 1 e 2: motor passa a ignorar eventos não-pontuáveis e exigir teto nas atividades
--        repetíveis, antes de qualquer outra checagem.
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_regras_gamificacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_beneficiario uuid := coalesce(new.beneficiario_id, new.ator_id);
  v_membro_id uuid;
  v_perfil_membro public.perfil_gamificacao;
  v_perfil public.perfil_gamificacao;
  v_regra record;
  v_qtd integer;
  v_desde timestamptz;
  v_condicao_avaliada jsonb;
begin
  -- Estruturalmente inelegível: nenhuma regra (antiga ou nova) desses tipos credita.
  if new.tipo = any (array['deal.created', 'deal.stage_changed', 'deal.owner_changed', 'task.created', 'note.created']) then
    return new;
  end if;

  if v_beneficiario is null then
    return new;
  end if;

  select id, perfil_gamificacao into v_membro_id, v_perfil_membro from public.empresa_membros
    where empresa_id = new.empresa_id and user_id = v_beneficiario and ativo
    limit 1;
  if v_membro_id is null then
    return new;
  end if;

  v_perfil := coalesce(new.profile_at_event, v_perfil_membro);

  for v_regra in
    select * from public.gamification_rules
    where empresa_id = new.empresa_id and evento_tipo = new.tipo and ativa
      and (perfil_aplicavel is null or perfil_aplicavel = v_perfil)
  loop
    -- Atividade repetível sem teto configurado: ignora, independente da UI ter
    -- permitido salvar assim (regra antiga, ou criada direto no banco).
    if new.tipo = any (array['task.completed', 'reuniao.realizada', 'visita.realizada'])
       and (v_regra.limite_periodo is null or v_regra.limite_quantidade is null) then
      continue;
    end if;

    if not public.avaliar_condicao_regra(new.payload, v_regra.condicao) then
      continue;
    end if;

    if v_regra.unica_por_negocio and new.entidade = 'negocio' then
      if exists (
        select 1 from public.point_ledger
          where regra_id = v_regra.id and referencia_tipo = 'negocio' and referencia_id = new.entidade_id and not estornado
      ) then
        continue;
      end if;
    end if;

    if v_regra.limite_periodo is not null then
      v_desde := case v_regra.limite_periodo
        when 'dia' then date_trunc('day', now())
        when 'mes' then date_trunc('month', now())
      end;
      select count(*) into v_qtd from public.point_ledger
        where regra_id = v_regra.id and membro_id = v_membro_id
          and not estornado and created_at >= v_desde;
      if v_qtd >= v_regra.limite_quantidade then
        continue;
      end if;
    end if;

    -- Snapshot da condição no momento do crédito (item 3) — null quando a regra não
    -- tem condição. Congela a condição em si + o valor do payload que foi comparado +
    -- o resultado (sempre true aqui: avaliar_condicao_regra já confirmou acima).
    v_condicao_avaliada := case when v_regra.condicao is not null then
      jsonb_build_object(
        'condicao', v_regra.condicao,
        'valor_payload', new.payload ->> (v_regra.condicao ->> 'campo'),
        'resultado', true
      )
    else null end;

    insert into public.point_ledger
      (empresa_id, membro_id, regra_id, evento_id, xp, moedas, descricao, referencia_tipo, referencia_id, profile_at_event, condicao_avaliada)
      values (new.empresa_id, v_membro_id, v_regra.id, new.id, v_regra.xp, v_regra.moedas, v_regra.nome, new.entidade, new.entidade_id, v_perfil, v_condicao_avaliada);
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3: coluna de snapshot — nullable, sem default, sem backfill (histórico antigo
--    fica null; não há como reconstruir a condição vigente em cada crédito passado
--    sem inventar dado).
-- ---------------------------------------------------------------------------

alter table public.point_ledger add column condicao_avaliada jsonb;
