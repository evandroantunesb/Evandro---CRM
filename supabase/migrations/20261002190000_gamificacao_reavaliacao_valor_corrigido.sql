-- Reavaliação de crédito condicionado após correção de valor pós-ganho (Evandro,
-- 2026-10-02, PR seguinte à #123/fechamento antifraude). `corrigir_valor_negocio()` já
-- registra `deal.value_corrected`; esta migration fecha a ponta que faltava: quando o
-- novo valor deixa de satisfazer a condição congelada em `point_ledger.condicao_avaliada`
-- de um lançamento ainda ativo do `deal.won` daquele ciclo, o lançamento é estornado pelo
-- mecanismo imutável já existente (`estornado`/`estornado_em`/`estornado_por`).
--
-- Regras (pedido explícito, não inventar nada além disso):
-- - Reavalia usando a condição CONGELADA no próprio lançamento (`condicao_avaliada.condicao`),
--   nunca `gamification_rules.condicao` atual — edição posterior da regra nunca afeta
--   créditos já concedidos.
-- - Só toca lançamentos ATIVOS (`not estornado`) com `condicao_avaliada` cujo campo
--   congelado é 'valor' — nada além disso: sem condicao_avaliada, não reinterpreta nem
--   estorna por inferência (filtro `condicao_avaliada is not null`).
-- - Se a condição deixar de ser satisfeita: estorna (não deleta, não altera xp/moedas).
-- - Se continuar satisfeita: não faz nada.
-- - NUNCA concede crédito retroativo: lançamentos já estornados (pela correção anterior,
--   ou por qualquer outro motivo) não são re-avaliados nem reativados aqui — o loop já
--   filtra `not estornado`, então um valor que volta a satisfazer a condição depois de uma
--   correção anterior já ter estornado o lançamento simplesmente não é tocado de novo.
-- - Correções sucessivas no mesmo ciclo continuam funcionando: `corrigir_valor_negocio`
--   sempre resolve o mesmo `deal.won` mais recente do negócio (nunca há mais de um por
--   ciclo, documentado na própria função), então cada nova correção reavalia exatamente os
--   lançamentos que ainda estão ativos naquele momento, com o valor novo mais recente.

create or replace function public.reavaliar_credito_condicionado_valor(p_evento_won_id bigint, p_novo_valor numeric, p_estornado_por uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_lancamento record;
begin
  for v_lancamento in
    select id, condicao_avaliada from public.point_ledger
    where evento_id = p_evento_won_id
      and not estornado
      and condicao_avaliada is not null
      and condicao_avaliada -> 'condicao' ->> 'campo' = 'valor'
  loop
    if not public.avaliar_condicao_regra(
      jsonb_build_object('valor', p_novo_valor::text),
      v_lancamento.condicao_avaliada -> 'condicao'
    ) then
      update public.point_ledger
        set estornado = true, estornado_em = now(), estornado_por = p_estornado_por
        where id = v_lancamento.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.reavaliar_credito_condicionado_valor(bigint, numeric, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- corrigir_valor_negocio: mesmo corpo da migration anterior, só acrescentando a chamada
-- de reavaliação logo depois do UPDATE autorizado (mesmo v_evento_won_id já resolvido ali,
-- o deal.won mais recente do negócio — nunca mais de um por ciclo).
-- ---------------------------------------------------------------------------

create or replace function public.corrigir_valor_negocio(p_negocio_id uuid, p_novo_valor numeric, p_motivo text)
returns public.eventos
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio public.negocios;
  v_ator uuid := (select auth.uid());
  v_evento_won_id bigint;
  v_beneficiario uuid;
  v_perfil public.perfil_gamificacao;
  v_evento public.eventos;
  v_meu_membro_id uuid;
begin
  select * into v_negocio from public.negocios where id = p_negocio_id for update;
  if not found then
    raise exception 'Negócio não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if not public.tem_papel(v_negocio.empresa_id, '{admin,gestor}') then
    raise exception 'Só gestor ou admin pode corrigir o valor de um negócio ganho.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not public.pode_ver_negocio(p_negocio_id) then
    raise exception 'Você não tem acesso a este negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  if v_negocio.status <> 'ganho' then
    raise exception 'Só é possível corrigir valor de negócio ganho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo da correção.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_novo_valor is null or p_novo_valor < 0 then
    raise exception 'Informe um valor válido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_novo_valor = v_negocio.valor then
    raise exception 'O novo valor precisa ser diferente do valor atual.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- deal.won ativo do ciclo atual: sempre o mais recente do negócio — nunca há mais de um
  -- deal.won sem uma transição de status entre eles (cada deal.won nasce de uma mudança de
  -- status, e o negócio está 'ganho' agora, então nenhuma transição aconteceu depois dele).
  select id, beneficiario_id, profile_at_event into v_evento_won_id, v_beneficiario, v_perfil
    from public.eventos
    where entidade = 'negocio' and entidade_id = p_negocio_id and tipo = 'deal.won'
    order by created_at desc limit 1;
  if v_evento_won_id is null then
    raise exception 'Nenhum deal.won encontrado pra este negócio — não é possível corrigir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  perform set_config('raion.permitir_correcao_valor', 'on', true);
  update public.negocios set valor = p_novo_valor where id = p_negocio_id;
  perform set_config('raion.permitir_correcao_valor', 'off', true);

  v_meu_membro_id := public.meu_membro_id(v_negocio.empresa_id);
  perform public.reavaliar_credito_condicionado_valor(v_evento_won_id, p_novo_valor, v_meu_membro_id);

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
    values (v_negocio.empresa_id, 'deal.value_corrected', v_ator, v_beneficiario, 'negocio', p_negocio_id,
            jsonb_build_object('de', v_negocio.valor, 'para', p_novo_valor, 'delta', p_novo_valor - v_negocio.valor,
                                'motivo', p_motivo, 'evento_original_id', v_evento_won_id),
            v_perfil)
    returning * into v_evento;

  return v_evento;
end;
$$;

revoke all on function public.corrigir_valor_negocio(uuid, numeric, text) from public, anon;
grant execute on function public.corrigir_valor_negocio(uuid, numeric, text) to authenticated;
