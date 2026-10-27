-- Eletroposto: o SDR também abre negócio de eletroposto, e o eletroposto ganha regras de pontuação próprias.
--
-- 1. SDR no eletroposto (decisão do Evandro, 26/10/2026): o SDR cadastra o lead (cliente, local próprio e usina FV)
--    sem modelo, preço nem proposta; o vendedor escolhe os modelos depois e gera a proposta. Por isso:
--    - `negocios_eletroposto.modelos` passa a aceitar lista vazia (registro ainda sem proposta; preços `{}`).
--    - Policies do SDR: ele lê, cria e edita só o registro SEM modelos. Quando o vendedor escolhe os modelos, a
--      linha sai da visão do SDR (a regra "SDR não lê proposta" continua valendo).
--    - O token do link é sempre gerado pelo banco e trocado na primeira escolha de modelos: o token que o SDR
--      pôde ler antes nunca vira o link da proposta com preços. Depois disso o link não muda.
--
-- 2. Pontuação por tipo de negócio:
--    - `gamification_rules.tipo_negocio` (padrão `solar`): toda regra existente continua valendo só para o solar,
--      então negócio de eletroposto não pontua mais pelas regras do solar.
--    - Todo evento ligado a um negócio grava `tipo_negocio` no payload no momento em que acontece (o tipo do
--      negócio é imutável). Evento sem negócio, ou anterior a esta migration, conta como solar: nada do histórico
--      é reinterpretado e nenhum lançamento antigo muda.
--    - O motor só aplica a regra do mesmo tipo do evento.
--    - Regras padrão do eletroposto: cópia das regras ativas do solar (mesmos XP, moedas, condição e teto), com
--      " (eletroposto)" no nome, criadas quando o módulo é ligado na empresa (e agora para quem já o tem ligado).
--      O admin edita ou desativa em Gamificação › Regras de pontos.

-- ---------------------------------------------------------------------------
-- 1. negocios_eletroposto: registro sem modelos
-- ---------------------------------------------------------------------------

alter table public.negocios_eletroposto drop constraint negocios_eletroposto_modelos_check;
alter table public.negocios_eletroposto add constraint negocios_eletroposto_modelos_check
  check (cardinality(modelos) between 0 and 3 and modelos <@ array['basic', 'full', 'screen']);

-- Token: gerado pelo banco na criação; trocado na primeira escolha de modelos; imutável depois.
create or replace function public.proteger_token_eletroposto()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.token := gen_random_uuid()::text;
  elsif cardinality(old.modelos) = 0 and cardinality(new.modelos) > 0 then
    new.token := gen_random_uuid()::text;
  else
    new.token := old.token;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_token_eletroposto() from public, anon, authenticated, service_role;

create trigger negocios_eletroposto_proteger_token before insert or update on public.negocios_eletroposto
  for each row execute function public.proteger_token_eletroposto();

-- SDR: só o registro sem modelos (sem proposta), em negócio de eletroposto que ele vê.
create policy "sdr ve eletroposto sem proposta" on public.negocios_eletroposto for select to authenticated
  using (
    cardinality(modelos) = 0
    and public.tem_papel(empresa_id, '{sdr}')
    and public.pode_ver_negocio(negocio_id)
  );

create policy "sdr cria eletroposto sem proposta" on public.negocios_eletroposto for insert to authenticated
  with check (
    cardinality(modelos) = 0
    and precos = '{}'::jsonb
    and public.membro_ativo(empresa_id)
    and public.tem_papel(empresa_id, '{sdr}')
    and public.eletroposto_ativo(empresa_id)
    and public.pode_ver_negocio(negocio_id)
    and exists (
      select 1 from public.negocios n
      where n.id = negocios_eletroposto.negocio_id and n.empresa_id = negocios_eletroposto.empresa_id and n.tipo = 'eletroposto'
    )
  );

create policy "sdr edita eletroposto sem proposta" on public.negocios_eletroposto for update to authenticated
  using (
    cardinality(modelos) = 0
    and public.tem_papel(empresa_id, '{sdr}')
    and public.pode_ver_negocio(negocio_id)
  )
  with check (
    cardinality(modelos) = 0
    and precos = '{}'::jsonb
    and public.membro_ativo(empresa_id)
    and public.tem_papel(empresa_id, '{sdr}')
    and public.pode_ver_negocio(negocio_id)
    and exists (
      select 1 from public.negocios n
      where n.id = negocios_eletroposto.negocio_id and n.empresa_id = negocios_eletroposto.empresa_id and n.tipo = 'eletroposto'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Pontuação por tipo de negócio
-- ---------------------------------------------------------------------------

alter table public.gamification_rules add column tipo_negocio public.tipo_negocio not null default 'solar';

-- Tipo do negócio no payload do evento, no momento em que ele acontece. Lê como dono (o evento pode nascer de
-- quem não vê o negócio pela RLS, como o gatilho de outro membro).
create or replace function public.registrar_tipo_negocio_evento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_negocio_id uuid;
  v_tipo public.tipo_negocio;
begin
  if new.payload ? 'tipo_negocio' then
    return new;
  end if;

  if new.entidade = 'negocio' then
    v_negocio_id := new.entidade_id;
  elsif new.entidade = 'tarefa' and new.entidade_id is not null then
    select t.negocio_id into v_negocio_id from public.tarefas t where t.id = new.entidade_id;
  elsif new.payload ->> 'negocio_id' ~ '^[0-9a-fA-F-]{36}$' then
    v_negocio_id := (new.payload ->> 'negocio_id')::uuid;
  end if;

  if v_negocio_id is not null then
    select n.tipo into v_tipo from public.negocios n where n.id = v_negocio_id and n.empresa_id = new.empresa_id;
    if v_tipo is not null then
      new.payload := coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('tipo_negocio', v_tipo);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.registrar_tipo_negocio_evento() from public, anon, authenticated, service_role;

create trigger eventos_registrar_tipo_negocio before insert on public.eventos
  for each row execute function public.registrar_tipo_negocio_evento();

-- Motor: mesma função de 20261010100000_handoff_pontuacao_aceite.sql; a única mudança é o filtro por
-- `tipo_negocio` na seleção das regras (evento sem tipo conta como solar).
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
  v_tipo_negocio public.tipo_negocio := case when new.payload ->> 'tipo_negocio' = 'eletroposto' then 'eletroposto' else 'solar' end;
begin
  -- Estruturalmente inelegível: nenhuma regra (antiga ou nova) desses tipos credita.
  -- B1a (D1/D2): envio (handoff.created) e devolução (handoff.devolvido) continuam como
  -- eventos de histórico, mas não pontuam mais, mesmo com regra antiga ativa.
  if new.tipo = any (array['deal.created', 'deal.stage_changed', 'deal.owner_changed', 'task.created', 'note.created',
                           'handoff.created', 'handoff.devolvido']) then
    return new;
  end if;

  -- B1a (D6): só o primeiro aceite de um negócio pode pontuar, independente de
  -- unica_por_negocio. Todo aceite continua gerando seu evento (histórico); os seguintes
  -- só não creditam. A trava por negócio serializa aceites concorrentes: o segundo espera
  -- o primeiro terminar e então enxerga o evento dele.
  if new.tipo = 'oportunidade_aceita' and new.entidade = 'negocio' and new.entidade_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('gamificacao:oportunidade_aceita:' || new.entidade_id::text, 0));
    if exists (
      select 1 from public.eventos e
      where e.empresa_id = new.empresa_id and e.tipo = 'oportunidade_aceita'
        and e.entidade = 'negocio' and e.entidade_id = new.entidade_id and e.id <> new.id
    ) then
      return new;
    end if;
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
      and tipo_negocio = v_tipo_negocio
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

-- Regras padrão do eletroposto: cópia das regras ativas do solar. Só semeia se a empresa ainda não tem nenhuma
-- regra de eletroposto (ligar e desligar o módulo não duplica nem desfaz o que o admin ajustou).
create or replace function public.semear_regras_eletroposto(p_empresa_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.gamification_rules where empresa_id = p_empresa_id and tipo_negocio = 'eletroposto') then
    return;
  end if;
  insert into public.gamification_rules
    (empresa_id, nome, evento_tipo, condicao, limite_periodo, limite_quantidade, ativa, unica_por_negocio, perfil_aplicavel, xp, moedas, tipo_negocio)
  select empresa_id, left(nome, 66) || ' (eletroposto)', evento_tipo, condicao, limite_periodo, limite_quantidade, true, unica_por_negocio,
         perfil_aplicavel, xp, moedas, 'eletroposto'
    from public.gamification_rules
    where empresa_id = p_empresa_id and tipo_negocio = 'solar' and ativa
    order by created_at;
end;
$$;

revoke all on function public.semear_regras_eletroposto(uuid) from public, anon, authenticated, service_role;

create or replace function public.semear_regras_eletroposto_ao_ligar()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.eletroposto_ativo and not old.eletroposto_ativo then
    perform public.semear_regras_eletroposto(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.semear_regras_eletroposto_ao_ligar() from public, anon, authenticated, service_role;

create trigger empresas_semear_regras_eletroposto after update of eletroposto_ativo on public.empresas
  for each row execute function public.semear_regras_eletroposto_ao_ligar();

-- Empresas que já estão com o módulo ligado.
select public.semear_regras_eletroposto(id) from public.empresas where eletroposto_ativo;
