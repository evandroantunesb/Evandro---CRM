-- Loja de recompensas: fecha 2 gaps da auditoria read-only (Evandro, 2026-10-02) —
-- corrida de saldo entre recompensas diferentes, e máquina de estados mais permissiva
-- do que deveria. Semântica de saldo negativo decidida pelo Evandro depois de um
-- cenário adicional que ele mesmo levantou (moedas já gastas cuja origem é revertida
-- depois): saldo negativo é um estado VÁLIDO, nunca bloqueado, nunca corrigido
-- artificialmente (não restaura crédito, não recolhe recompensa já entregue) — ganhos
-- futuros compensam naturalmente. Não é tratado como dívida financeira; é só o saldo
-- gastável (moedas) podendo ficar temporariamente negativo, igual a XP permanece
-- completamente intocado por esse cenário (continuam dimensões independentes desde a
-- migration de XP×moedas).
--
-- 1. Concorrência: hoje `solicitar_resgate` trava só a linha da `recompensa` (serializa
--    2 resgates da MESMA recompensa, mas não 2 resgates de recompensas DIFERENTES pelo
--    mesmo colaborador — cada um lê o saldo antes do outro comitar e os dois passam).
--    Trava também a linha do colaborador em `empresa_membros` antes de ler o saldo,
--    serializando qualquer par de resgates concorrentes do mesmo colaborador,
--    independente da recompensa. Ordem de locks (recompensa, depois empresa_membros)
--    é sempre a mesma — sem risco de deadlock. Validações de recompensa (ativa,
--    validade, estoque, limite por membro) continuam intocadas, só a leitura do saldo
--    passa a vir depois do lock do colaborador.
--
-- 2. Máquina de estados: só permite solicitado→aprovado, solicitado→cancelado,
--    aprovado→entregue, aprovado→cancelado. `entregue`/`cancelado` continuam
--    terminais. Antes disso só bloqueava sair de entregue/cancelado e repetir o mesmo
--    status — permitia solicitado→entregue direto (pula aprovação) e aprovado→
--    solicitado (volta atrás); os dois agora são bloqueados.

create or replace function public.solicitar_resgate(p_recompensa_id uuid)
returns public.resgates
language plpgsql security definer set search_path = ''
as $$
declare
  v_recompensa public.recompensas;
  v_membro_id uuid;
  v_saldo integer;
  v_resgatados integer;
  v_resgate public.resgates;
begin
  select * into v_recompensa from public.recompensas where id = p_recompensa_id for update;
  if not found then
    raise exception 'Recompensa não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_membro_id := public.meu_membro_id(v_recompensa.empresa_id);
  if v_membro_id is null then
    raise exception 'Você não tem acesso a essa empresa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if not v_recompensa.ativa then
    raise exception 'Essa recompensa não está mais disponível.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_recompensa.validade_ate is not null and v_recompensa.validade_ate < current_date then
    raise exception 'Essa recompensa expirou.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if v_recompensa.estoque is not null then
    select count(*) into v_resgatados from public.resgates
      where recompensa_id = p_recompensa_id and status <> 'cancelado';
    if v_resgatados >= v_recompensa.estoque then
      raise exception 'Estoque esgotado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if v_recompensa.limite_por_membro is not null then
    select count(*) into v_resgatados from public.resgates
      where recompensa_id = p_recompensa_id and membro_id = v_membro_id and status <> 'cancelado';
    if v_resgatados >= v_recompensa.limite_por_membro then
      raise exception 'Você já atingiu o limite de resgates dessa recompensa.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  -- Trava a linha do colaborador antes de ler o saldo: serializa 2 resgates
  -- concorrentes do mesmo colaborador mesmo quando são de recompensas diferentes
  -- (o lock acima, na recompensa, só serializa resgates da MESMA recompensa).
  perform 1 from public.empresa_membros where id = v_membro_id for update;

  select coalesce(sum(moedas), 0) into v_saldo from public.point_ledger
    where membro_id = v_membro_id and empresa_id = v_recompensa.empresa_id and not estornado;
  if v_saldo < v_recompensa.custo_moedas then
    raise exception 'Moedas insuficientes.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.resgates (empresa_id, recompensa_id, membro_id, moedas_debitadas)
    values (v_recompensa.empresa_id, p_recompensa_id, v_membro_id, v_recompensa.custo_moedas)
    returning * into v_resgate;

  insert into public.point_ledger (empresa_id, membro_id, xp, moedas, descricao, referencia_tipo, referencia_id)
    values (v_recompensa.empresa_id, v_membro_id, 0, -v_recompensa.custo_moedas, 'Resgate: ' || v_recompensa.nome, 'resgate', v_resgate.id);

  return v_resgate;
end;
$$;

create or replace function public.atualizar_status_resgate(p_resgate_id uuid, p_novo_status public.status_resgate)
returns public.resgates
language plpgsql security definer set search_path = ''
as $$
declare
  v_resgate public.resgates;
begin
  select * into v_resgate from public.resgates where id = p_resgate_id for update;
  if not found then
    raise exception 'Resgate não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not public.tem_papel(v_resgate.empresa_id, '{admin}') then
    raise exception 'Só o admin pode alterar o status do resgate.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  if not (
    (v_resgate.status = 'solicitado' and p_novo_status in ('aprovado', 'cancelado'))
    or (v_resgate.status = 'aprovado' and p_novo_status in ('entregue', 'cancelado'))
  ) then
    raise exception 'Transição de status inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_novo_status = 'cancelado' then
    update public.point_ledger
      set estornado = true, estornado_em = now(), estornado_por = public.meu_membro_id(v_resgate.empresa_id)
      where referencia_tipo = 'resgate' and referencia_id = v_resgate.id and not estornado;
  end if;

  update public.resgates set status = p_novo_status where id = p_resgate_id returning * into v_resgate;
  return v_resgate;
end;
$$;
