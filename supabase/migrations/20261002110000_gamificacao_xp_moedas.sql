-- Separação de XP x moedas na Gamificação (Evandro, 2026-10-02), depois da
-- fundação/antifraude (#115) já validada.
--
-- Problema: hoje existe um único `point_ledger.pontos` (e `gamification_rules.pontos`)
-- que é, ao mesmo tempo, progressão (ranking/nível/conquistas) e moeda de troca da
-- loja. Comprar uma recompensa reduz o mesmo número que mede progressão — um
-- colaborador que gasta pontos "perde" nível/ranking, o que não faz sentido.
--
-- Solução (desenho aprovado por Evandro): um único `point_ledger`, com DUAS
-- colunas por lançamento — `xp` (progressão, nunca gasta, só perde efeito por
-- estorno formal do evento que a gerou) e `moedas` (saldo gastável da loja,
-- resgate debita, cancelamento de resgate restaura). Uma regra pode conceder
-- XP+moedas, só XP ou só moedas. Sem `pontos` residual, sem ledger paralelo,
-- sem segunda linha por evento.
--
-- Escopo desta migration: schema + backfill histórico + motor
-- (aplicar_regras_gamificacao) + conquistas (avaliar_conquistas_pontos) +
-- ranking (ranking_gamificacao) + loja (solicitar_resgate/atualizar_status_resgate,
-- renomeia custo_pontos/pontos_debitados). Telas e `database.types.ts` são
-- ajustados fora desta migration, no mesmo PR. Redesign visual da Gamificação
-- fica fora do escopo.

-- ---------------------------------------------------------------------------
-- 1. Novas colunas (xp/moedas) em gamification_rules e point_ledger, com
--    backfill não destrutivo — nenhum lançamento antigo é apagado.
-- ---------------------------------------------------------------------------

alter table public.gamification_rules add column xp integer not null default 0;
alter table public.gamification_rules add column moedas integer not null default 0;

-- Regra existente concedia um único "pontos" que valia como XP e como moeda ao
-- mesmo tempo (era a mesma unidade) — preserva o comportamento atual
-- replicando o valor nas duas dimensões. Divergir XP de moedas numa regra é
-- decisão administrativa de aqui pra frente (tela de Configurações passa a
-- pedir os dois campos separados).
update public.gamification_rules set xp = pontos, moedas = pontos;

alter table public.point_ledger add column xp integer not null default 0;
alter table public.point_ledger add column moedas integer not null default 0;

-- Backfill histórico (decisão de Evandro, não inventado):
--  - lançamento de resgate (referencia_tipo = 'resgate', pontos já negativo):
--    xp = 0, moedas = pontos — uma compra antiga nunca reduz XP retroativo.
--  - qualquer outro lançamento, incluindo bônus de conquista histórico
--    (referencia_tipo = 'conquista'): xp = pontos, moedas = pontos — preserva
--    o comportamento observado até aqui (o valor já contava como XP e como
--    moeda disponível), sem reinterpretar sem evidência. A nova regra "bônus
--    de conquista concede só XP" vale só pra lançamentos novos, gerados pela
--    versão nova de avaliar_conquistas_pontos() abaixo.
update public.point_ledger set
  moedas = pontos,
  xp = case when referencia_tipo = 'resgate' then 0 else pontos end;

-- ---------------------------------------------------------------------------
-- 2. Motor: grava xp/moedas da regra em vez de pontos. Nenhuma outra mudança
--    de comportamento (unica_por_negocio, perfis, limite_periodo intocados).
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
begin
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

    insert into public.point_ledger
      (empresa_id, membro_id, regra_id, evento_id, xp, moedas, descricao, referencia_tipo, referencia_id, profile_at_event)
      values (new.empresa_id, v_membro_id, v_regra.id, new.id, v_regra.xp, v_regra.moedas, v_regra.nome, new.entidade, new.entidade_id, v_perfil);
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Conquistas: critério passa a se chamar "xp_acumulado" (era
--    "pontos_acumulados", mesma métrica, nome correto agora que existe
--    moedas separado) e soma só XP ativo — nunca moedas, nunca lançamento
--    estornado. Bônus concede só XP (moedas = 0): decisão de Evandro, uma
--    futura conquista que premie em moedas precisa de configuração própria,
--    nunca automática. profile_at_event do bônus herda o do lançamento que
--    disparou a avaliação (checagem de determinismo feita antes de codar:
--    o trigger roda AFTER INSERT FOR EACH ROW, então `new` É o lançamento
--    que cruzou o limiar — sem inferência do perfil atual do membro).
--
--    Cascata preservada intencionalmente: o insert do bônus é ele mesmo um
--    insert em point_ledger, reaciona este gatilho recursivamente, e pode
--    legitimamente desbloquear uma segunda conquista na mesma transação se
--    o bônus cruzar outro limiar — travado só pela constraint
--    unique(conquista_id, membro_id), sem risco de recursão infinita
--    (bounded pelo nº de conquistas da empresa). Comportamento já existia
--    antes do split; só passou a somar xp em vez de pontos.
-- ---------------------------------------------------------------------------

update public.conquistas set criterio = jsonb_set(criterio, '{metrica}', '"xp_acumulado"')
  where criterio->>'metrica' = 'pontos_acumulados';

create or replace function public.avaliar_conquistas_pontos()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric;
  v_conquista record;
begin
  if new.estornado then
    return new;
  end if;

  select coalesce(sum(xp), 0) into v_total
    from public.point_ledger
    where membro_id = new.membro_id and not estornado;

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
      values (new.empresa_id, v_conquista.id, new.membro_id);

    if v_conquista.xp_bonus > 0 then
      insert into public.point_ledger (empresa_id, membro_id, descricao, referencia_tipo, referencia_id, xp, moedas, profile_at_event)
        values (new.empresa_id, new.membro_id, 'Conquista: ' || v_conquista.nome, 'conquista', v_conquista.id, v_conquista.xp_bonus, 0, new.profile_at_event);
    end if;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ranking: soma só XP ativo (nunca moedas). Continua separado por perfil
--    e por período — isso não muda, só a dimensão somada. Coluna de retorno
--    renomeada de total_pontos pra total_xp (sem "pontos" residual).
-- ---------------------------------------------------------------------------

-- Postgres não permite "create or replace" quando o nome de uma coluna do
-- retorno muda (total_pontos -> total_xp conta como mudança de tipo de
-- retorno) — precisa dropar a função antes de recriar.
drop function if exists public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz);

create function public.ranking_gamificacao(p_empresa_id uuid, p_perfil public.perfil_gamificacao, p_desde timestamptz default null)
returns table (membro_id uuid, total_xp bigint)
language sql stable security definer set search_path = ''
as $$
  select l.membro_id, sum(l.xp)::bigint as total_xp
  from public.point_ledger l
  where l.empresa_id = p_empresa_id
    and l.profile_at_event = p_perfil
    and not l.estornado
    and (p_desde is null or l.created_at >= p_desde)
    and public.membro_ativo(p_empresa_id)
  group by l.membro_id
  order by total_xp desc;
$$;

revoke all on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz) from public;
grant execute on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Loja: recompensa custa moedas (renomeia custo_pontos -> custo_moedas),
--    resgate debita só moedas (xp = 0) e grava moedas_debitadas (renomeia
--    pontos_debitados). Cancelamento continua estornando a própria linha de
--    débito (mecanismo intocado) — nunca mexe em XP, por construção (xp já
--    sai 0 nessas linhas).
-- ---------------------------------------------------------------------------

alter table public.recompensas rename column custo_pontos to custo_moedas;
alter table public.resgates rename column pontos_debitados to moedas_debitadas;

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

-- atualizar_status_resgate() não lê nem grava pontos/xp/moedas diretamente
-- (só marca point_ledger.estornado = true via referencia_tipo/referencia_id),
-- então o mecanismo de cancelamento não muda — recriada aqui só pra manter a
-- assinatura/corpo no mesmo arquivo de referência do cutover.
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

  if v_resgate.status = 'cancelado' or v_resgate.status = p_novo_status then
    raise exception 'Transição de status inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_resgate.status = 'entregue' and p_novo_status <> 'entregue' then
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

-- ---------------------------------------------------------------------------
-- 6. Remove a coluna unificada depois que motor/conquistas/ranking/loja já
--    foram migrados pra xp/moedas — sem campo "pontos" paralelo, como pedido.
-- ---------------------------------------------------------------------------

alter table public.gamification_rules drop column pontos;
alter table public.point_ledger drop column pontos;
