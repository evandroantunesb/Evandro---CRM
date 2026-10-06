-- Bônus "Contrato originado pelo SDR" (+10 na tabela de pontos do Evandro) — PR separada
-- depois da auditoria de eventos SDR/Closer (2026-10-01). Hoje `contrato.assinado` credita
-- só o responsável atual (closer); falta o bônus pro SDR que originou a oportunidade.
--
-- Pedido explícito do Evandro: NÃO escolher o SDR procurando "qualquer handoff histórico"
-- do negócio (é exatamente o que `handoff.won` já faz hoje, via "order by created_at desc
-- limit 1" — funciona na prática porque não existe reenvio depois do aceite, mas é uma
-- escolha arbitrária em tese; mantido como está, fora do escopo desta PR, já que ele não
-- pediu pra mexer nisso agora). Para o bônus de contrato, a referência precisa ser
-- inequívoca e persistida, nunca recalculada por busca.
--
-- Solução: `negocios.handoff_origem_id`, gravado uma única vez em `aceitar_handoff()`
-- (nunca sobrescrito — `coalesce(handoff_origem_id, ...)`) no exato momento em que o
-- handoff que originou a responsabilidade do closer é aceito. Isso garante:
--   - nunca escolha arbitrária entre múltiplos handoffs (é o handoff do aceite, ponto);
--   - nunca dois SDRs ganhando pelo mesmo contrato (uma coluna, um valor, travado);
--   - nunca SDR errado (é literalmente o handoff que levou ao closer responsável).
-- Backfill cobre negócios que já tinham handoff aceito antes desta migration, usando o
-- primeiro handoff aceito de cada um (mesma regra do "nunca sobrescrito" daqui pra frente).
--
-- Perfil congelado: reaproveita `handoffs.perfil_sdr_credito`, já gravado no aceite
-- (mesmo padrão do `handoff.won`) — o bônus sempre paga como 'sdr', nunca pelo perfil atual.
-- Pontua uma vez (guarda por `not exists`) e tem estorno automático (mesmo mecanismo do
-- `contrato.assinado`, que já reverte quando o contrato sai de 'assinado').

alter table public.negocios add column handoff_origem_id uuid references public.handoffs (id) on delete set null;

update public.negocios n
set handoff_origem_id = h.id
from (
  select distinct on (negocio_id) id, negocio_id
  from public.handoffs
  where status = 'aceito'
  order by negocio_id, respondido_em asc nulls last, created_at asc
) h
where h.negocio_id = n.id and n.handoff_origem_id is null;

-- aceitar_handoff(): único ajuste é gravar a referência causal (write-once) junto da
-- transferência de responsável — o resto é idêntico à versão da #108.
create or replace function public.aceitar_handoff(p_handoff_id uuid)
returns public.handoffs
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.handoffs;
  v_meu_membro_id uuid;
  v_ator uuid := (select auth.uid());
  v_perfil_sdr public.perfil_gamificacao;
  v_sdr_user_id uuid;
  v_por_delegacao boolean;
begin
  select * into v_handoff from public.handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_meu_membro_id := public.meu_membro_id(v_handoff.empresa_id);
  if v_meu_membro_id is null or
     (v_meu_membro_id <> v_handoff.para_membro_id and not public.tem_papel(v_handoff.empresa_id, '{admin,gestor}'))
  then
    raise exception 'Você não pode aceitar essa oportunidade.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_handoff.status <> 'pendente' then
    raise exception 'Essa oportunidade já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_por_delegacao := v_meu_membro_id <> v_handoff.para_membro_id;

  select perfil_gamificacao, user_id into v_perfil_sdr, v_sdr_user_id from public.empresa_membros where id = v_handoff.de_membro_id;

  update public.handoffs
    set status = 'aceito', respondido_por = v_meu_membro_id, respondido_em = now(), perfil_sdr_credito = v_perfil_sdr
    where id = p_handoff_id
    returning * into v_handoff;

  update public.negocios
    set responsavel_id = v_handoff.para_membro_id, handoff_origem_id = coalesce(handoff_origem_id, v_handoff.id)
    where id = v_handoff.negocio_id;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_handoff.empresa_id, v_handoff.negocio_id, v_handoff.contato_id, 'handoff_aceito', v_ator,
            jsonb_build_object('handoff_id', v_handoff.id, 'de_membro_id', v_handoff.de_membro_id, 'por_delegacao', v_por_delegacao));

  if v_sdr_user_id is not null then
    insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
      values (v_handoff.empresa_id, 'oportunidade_aceita', v_ator, v_sdr_user_id, 'negocio', v_handoff.negocio_id,
              jsonb_build_object('handoff_id', v_handoff.id, 'de_membro_id', v_handoff.de_membro_id, 'por_delegacao', v_por_delegacao),
              v_perfil_sdr);
  end if;

  return v_handoff;
end;
$$;

-- registrar_contrato(): mantém o crédito existente ao responsável (closer) e acrescenta o
-- bônus ao SDR de origem via `negocios.handoff_origem_id` — nunca por busca. `ator_id` do
-- novo evento é quem efetivamente mudou o status do contrato (`auth.uid()`); o crédito
-- (`beneficiario_id`) é sempre o SDR, nunca quem clicou.
create or replace function public.registrar_contrato()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_empresa_id uuid;
  v_responsavel_id uuid;
  v_responsavel_user_id uuid;
  v_handoff_origem_id uuid;
  v_sdr_user_id uuid;
  v_sdr_perfil public.perfil_gamificacao;
begin
  if new.status is distinct from old.status then
    select empresa_id, responsavel_id, handoff_origem_id into v_empresa_id, v_responsavel_id, v_handoff_origem_id
      from public.negocios where id = new.negocio_id;

    if new.status = 'assinado' and v_responsavel_id is not null then
      select user_id into v_responsavel_user_id from public.empresa_membros where id = v_responsavel_id;
      if v_responsavel_user_id is not null then
        insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
          values (v_empresa_id, 'contrato.assinado', v_responsavel_user_id, 'negocio', new.negocio_id, '{}'::jsonb);
      end if;
    end if;

    if new.status = 'assinado' and v_handoff_origem_id is not null and not exists (
      select 1 from public.eventos
      where empresa_id = v_empresa_id and tipo = 'handoff.contrato_assinado' and entidade_id = new.negocio_id
    ) then
      select p.user_id, h.perfil_sdr_credito into v_sdr_user_id, v_sdr_perfil
        from public.handoffs h
        join public.empresa_membros p on p.id = h.de_membro_id
        where h.id = v_handoff_origem_id;
      if v_sdr_user_id is not null then
        insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
          values (v_empresa_id, 'handoff.contrato_assinado', v_ator, v_sdr_user_id, 'negocio', new.negocio_id, '{}'::jsonb, v_sdr_perfil);
      end if;
    end if;

    if old.status = 'assinado' and new.status is distinct from 'assinado' then
      perform public.estornar_lancamentos_evento(new.negocio_id, array['contrato.assinado', 'handoff.contrato_assinado']);
    end if;
  end if;

  return null;
end;
$$;
