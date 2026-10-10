-- PR B1a — pontuação do repasse SDR → vendedor (decisões D1–D7 do Evandro, 2026-10-09).
--
-- D1/D2: handoff.created (envio) e handoff.devolvido (devolução) continuam como eventos de
--   histórico, mas o motor não credita mais nada para eles, mesmo com regra antiga ativa.
--   A recompensa do repasse fica só no aceite (oportunidade_aceita).
-- D3: aceite já creditado não é estornado se o negócio for perdido (nada muda aqui).
--   handoff.won, handoff.contrato_assinado e handoff_origem_id ficam como estão.
-- D4/D5: validar_handoff_empresa passa a exigir, para todo envio novo: remetente ≠
--   destinatário; remetente SDR ativo e responsável atual do negócio; destinatário vendedor
--   ativo; mesma empresa; e quem executa = o próprio SDR, admin ativo ou gestor ativo de
--   equipe ativa do SDR. Negócio e vínculos travados (FOR SHARE) durante o envio.
-- D5: handoff.created separa ator (quem executou) de beneficiário/perfil (SDR remetente).
--   oportunidade_aceita já credita o SDR remetente com o perfil congelado no aceite.
-- D6: só o primeiro aceite de cada negócio pontua (no motor, independente de
--   unica_por_negocio), com trava por negócio contra aceites concorrentes. Envio passa a
--   gerar um handoff.created por handoff (antes, só o primeiro do negócio).
-- D7: nenhum dado existente é alterado (eventos, point_ledger, regras, estornos). Vale só
--   para acontecimentos novos.
-- Aceite desatualizado (decisão do Evandro, revisão da B1a): aceitar_handoff recusa o aceite
--   quando o responsável atual do negócio não é mais o SDR remetente (mudou depois do envio).
--   Também recusa se houve qualquer troca efetiva de responsável depois do envio, mesmo que
--   tenha voltado ao SDR remetente (A → C → A), pelo histórico imutável de atividades.
--   Devolução não muda: segue permitida (motivo obrigatório) e não mexe no responsável.
--
-- Funções: cópia literal das versões vigentes, só com as mudanças acima
--   aplicar_regras_gamificacao: 20261002180000_gamificacao_antifraude_fechamento
--   registrar_handoff: 20261001200000_gamificacao_handoff_fechamento
--   validar_handoff_empresa: 20261007100100_blindagem_comercial (reescrita das checagens)
--   aceitar_handoff: 20261009110000_handoff_resposta_gestor_equipe (+ checagem do responsável)
-- Reversão: migration nova com o texto anterior das quatro funções.

create or replace function public.validar_handoff_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_contato uuid;
  v_responsavel uuid;
  v_de_papel public.papel_membro;
  v_de_ativo boolean;
  v_para_papel public.papel_membro;
  v_para_ativo boolean;
  v_ator uuid := (select auth.uid());
  v_meu_membro_id uuid;
begin
  -- FOR SHARE: troca de responsável concorrente espera este envio terminar (e vice-versa).
  select contato_id, responsavel_id into v_contato, v_responsavel
    from public.negocios where id = new.negocio_id and empresa_id = new.empresa_id
    for share;
  if not found then
    raise exception 'Negócio de outra empresa.' using errcode = 'check_violation';
  end if;
  if new.contato_id is distinct from v_contato then
    raise exception 'O contato do handoff precisa ser o contato do negócio.' using errcode = 'check_violation';
  end if;

  if new.de_membro_id is null or new.de_membro_id = new.para_membro_id then
    raise exception 'O remetente e o destinatário da oportunidade precisam ser pessoas diferentes.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Vínculos travados (FOR SHARE) até o fim do envio: desativação concorrente espera.
  select papel, ativo into v_de_papel, v_de_ativo
    from public.empresa_membros where id = new.de_membro_id and empresa_id = new.empresa_id
    for share;
  if not found or not v_de_ativo or v_de_papel <> 'sdr' then
    raise exception 'O remetente precisa ser um SDR ativo da empresa.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_responsavel is distinct from new.de_membro_id then
    raise exception 'Só o SDR responsável pelo negócio pode ser o remetente da oportunidade.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select papel, ativo into v_para_papel, v_para_ativo
    from public.empresa_membros where id = new.para_membro_id and empresa_id = new.empresa_id
    for share;
  if not found or not v_para_ativo or v_para_papel <> 'vendedor' then
    raise exception 'O destinatário precisa ser um membro ativo da empresa com papel vendedor.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Quem executa: o próprio SDR remetente, admin ativo da empresa ou gestor ativo de uma
  -- equipe ativa do SDR (delegação). Sem usuário (auth.uid() nulo) só a conexão direta de
  -- banco (superusuário/migration): authenticated é o único papel da API com INSERT aqui.
  if v_ator is not null then
    v_meu_membro_id := public.meu_membro_id(new.empresa_id);
    if v_meu_membro_id is null or not (
      v_meu_membro_id = new.de_membro_id
      or public.tem_papel(new.empresa_id, '{admin}')
      or (
        public.tem_papel(new.empresa_id, '{gestor}')
        and exists (
          select 1
          from public.equipe_membros minha
          join public.equipe_membros dele on dele.equipe_id = minha.equipe_id
          join public.equipes eq on eq.id = minha.equipe_id and eq.ativa
          where minha.membro_id = v_meu_membro_id
            and minha.e_gestor
            and dele.membro_id = new.de_membro_id
        )
      )
    ) then
      raise exception 'Você não pode enviar esta oportunidade em nome desse SDR.'
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.registrar_handoff()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_sdr_user_id uuid;
  v_sdr_perfil public.perfil_gamificacao;
begin
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (new.empresa_id, new.negocio_id, new.contato_id, 'handoff_enviado', v_ator,
            jsonb_build_object('handoff_id', new.id, 'para_membro_id', new.para_membro_id));
  -- B1a: um handoff.created por envio (histórico; não pontua — ver aplicar_regras_gamificacao).
  -- Ator = quem executou (SDR, ou gestor/admin por delegação); beneficiário e perfil = SDR
  -- remetente (responsável pelo negócio, validado em validar_handoff_empresa).
  select user_id, perfil_gamificacao into v_sdr_user_id, v_sdr_perfil
    from public.empresa_membros where id = new.de_membro_id;
  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
    values (new.empresa_id, 'handoff.created', v_ator, v_sdr_user_id, 'negocio', new.negocio_id,
            jsonb_build_object('handoff_id', new.id, 'de_membro_id', new.de_membro_id, 'para_membro_id', new.para_membro_id,
                               'por_delegacao', v_ator is distinct from v_sdr_user_id),
            v_sdr_perfil);

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
    values (new.empresa_id, new.para_membro_id, 'handoff_recebido', 'Você tem uma oportunidade aguardando seu aceite.',
            '/negocios/' || new.negocio_id);

  return null;
end;
$$;

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
  v_envio_atividade bigint;
begin
  select * into v_handoff from public.handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_meu_membro_id := public.meu_membro_id(v_handoff.empresa_id);
  if v_meu_membro_id is null or not public.pode_responder_handoff(p_handoff_id) then
    raise exception 'Você não pode aceitar essa oportunidade.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_handoff.status <> 'pendente' then
    raise exception 'Essa oportunidade já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- B1a (aceite desatualizado): o repasse só vale se o responsável não mudou desde o envio.
  -- 1) O SDR remetente continua o responsável atual. FOR UPDATE no negócio (que este aceite
  --    atualiza logo abaixo), antes de qualquer escrita: troca já gravada é vista aqui; troca
  --    em andamento espera este aceite terminar. Ordem de travas: handoff → negócio → vínculo
  --    do destinatário (o envio usa negócio → vínculos), sem ciclo.
  -- 2) Nenhuma troca efetiva de responsável depois do envio, mesmo que tenha voltado ao SDR
  --    (A → C → A). Prova: histórico imutável de atividades (sem escrita pela API; só
  --    registrar_handoff grava 'handoff_enviado' e só registrar_negocio grava
  --    'responsavel_alterado', e só quando o responsável muda de fato). Compara pelo id
  --    (identidade, atribuído na inserção), não por created_at (início da transação): o envio
  --    grava a atividade depois de travar o negócio (FOR SHARE) e a troca grava a dela depois
  --    do UPDATE do negócio; as duas travas conflitam, então a ordem dos ids segue a ordem real.
  --    Lida depois da trava acima (novo instantâneo), enxerga toda troca já confirmada.
  --    Sem a atividade do envio deste handoff não há como provar: recusa (só devolução).
  perform 1 from public.negocios
    where id = v_handoff.negocio_id and empresa_id = v_handoff.empresa_id
      and responsavel_id is not distinct from v_handoff.de_membro_id
    for update;
  if found then
    select max(a.id) into v_envio_atividade from public.atividades a
      where a.negocio_id = v_handoff.negocio_id and a.empresa_id = v_handoff.empresa_id
        and a.tipo = 'handoff_enviado' and a.dados ->> 'handoff_id' = v_handoff.id::text;
  end if;
  -- v_envio_atividade fica nulo se o responsável não confere (1) ou não há atividade do envio.
  if v_envio_atividade is null or exists (
    select 1 from public.atividades a
    where a.negocio_id = v_handoff.negocio_id and a.empresa_id = v_handoff.empresa_id
      and a.tipo = 'responsavel_alterado' and a.id > v_envio_atividade
  ) then
    raise exception 'A oportunidade mudou de responsável após o envio. Este repasse não pode mais ser aceito. Devolva a oportunidade informando o motivo.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Destinatário precisa estar ativo no momento do aceite (pode ter sido desativado depois do
  -- envio). FOR SHARE trava o vínculo até o fim da transação: uma desativação concorrente
  -- espera este aceite terminar ou, se já gravada, é vista aqui e o aceite é recusado.
  perform 1 from public.empresa_membros
    where id = v_handoff.para_membro_id and empresa_id = v_handoff.empresa_id and ativo
    for share;
  if not found then
    raise exception 'O vendedor destinatário está inativo e não pode receber a oportunidade. Devolva ao SDR informando o motivo.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
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

  -- Retorno sanitizado (só a variável local; o registro gravado não muda): quem responde pode
  -- ser o gestor do destinatário sem acesso ao negócio, então campos livres e o snapshot da
  -- qualificação não saem por aqui (mesmo critério de oportunidades_pendentes_equipe).
  v_handoff.qualificacao_snapshot := '{}'::jsonb;
  v_handoff.observacoes := null;
  return v_handoff;
end;
$$;
