-- Integridade de `negocios.handoff_origem_id` (revisão do Evandro e do Claude Opus em 2026-10-15).
--
-- `handoff_origem_id` é a referência causal write-once que decide qual SDR recebe os bônus
-- `handoff.won` (registrar_negocio) e `handoff.contrato_assinado` (registrar_contrato), e qual
-- SDR entra na Obra (garantir_obra). Quem a grava é `aceitar_handoff()`, com
-- `coalesce(handoff_origem_id, v_handoff.id)`; esta migration garante isso no banco.
--
-- Regra, no banco:
--   - Papel de API (qualquer papel fora da lista de privilegiados): não grava a coluna — nem no
--     INSERT, nem trocando, nem anulando. Edição das demais colunas do negócio segue igual.
--   - Qualquer papel, quando o valor muda para não nulo: o handoff precisa ser DESTE negócio,
--     DESTA empresa e estar aceito. É o que `aceitar_handoff()` grava (ela marca o handoff como
--     aceito antes de atualizar o negócio).
--   - Valor já gravado só muda por papel privilegiado (reparo), ainda sujeito à regra acima.
--
-- Por gatilho, independente de grants de coluna. Nenhum dado é alterado. A checagem só roda quando a coluna muda, então negócio
-- legado com valor inconsistente continua editável no resto (auditoria SELECT em
-- docs/auditorias/handoff-origem-divergente.sql).

-- INVOKER de propósito: `current_user` é o papel da requisição (PostgREST faz SET ROLE). Em
-- `aceitar_handoff()` (security definer) e nas ações referenciais da FK (`on delete set null`),
-- `current_user` é o dono das tabelas, que está na lista de privilegiados.
create or replace function public.proteger_handoff_origem()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.handoff_origem_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.handoff_origem_id is not distinct from old.handoff_origem_id then
    return new;
  end if;

  -- Lista positiva: papel novo ou desconhecido fica restrito.
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'A origem do repasse é definida pelo sistema no aceite da oportunidade.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.handoff_origem_id is not null and not exists (
    select 1 from public.handoffs h
    where h.id = new.handoff_origem_id
      and h.negocio_id = new.id
      and h.empresa_id = new.empresa_id
      and h.status = 'aceito'
  ) then
    raise exception 'A origem do repasse precisa ser um repasse aceito deste negócio e desta empresa.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.proteger_handoff_origem() from public, anon, authenticated;

-- Nome escolhido para rodar antes dos demais BEFORE de `negocios` (ordem alfabética); nenhum
-- deles lê ou grava `handoff_origem_id`.
create trigger negocios_handoff_origem
  before insert or update on public.negocios
  for each row execute function public.proteger_handoff_origem();
