-- PR S: quem aceita ou devolve um handoff pendente (aprovado pelo Evandro em 2026-10-08).
-- Até aqui, aceitar_handoff/devolver_handoff liberavam qualquer gestor da empresa
-- (tem_papel admin/gestor), sem olhar equipe. Agora podem responder:
--   - o próprio destinatário;
--   - admin ativo da empresa;
--   - gestor ativo que gerencia uma equipe ativa da qual o destinatário faz parte.
-- O gestor que acompanha só o SDR remetente (sem gerenciar o destinatário) não responde.
--
-- Única mudança nas duas funções: a checagem de permissão passa a usar
-- pode_responder_handoff(). O resto é cópia literal das versões vigentes
-- (aceitar_handoff: 20261001220000_gamificacao_contrato_sdr; devolver_handoff:
-- 20261001200000_gamificacao_handoff_fechamento) — histórico, notificações, eventos,
-- perfil congelado, handoff_origem_id e troca de responsável ficam iguais.
-- Também cria oportunidades_pendentes_equipe(): lista restrita (colunas explícitas) para o
-- gestor/admin encontrar e responder as pendências da equipe sem ampliar a RLS de negócios,
-- contatos, propostas ou contratos.
-- Sem alteração de dados. Reversão: migration nova com o texto anterior das duas funções
-- e drop function de pode_responder_handoff e oportunidades_pendentes_equipe.

-- Regra única, usada pelas duas funções e pela tela (botões só para quem pode responder).
-- Só devolve um booleano sobre o próprio usuário logado.
create or replace function public.pode_responder_handoff(p_handoff_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.handoffs h
    where h.id = p_handoff_id
      and (
        h.para_membro_id = public.meu_membro_id(h.empresa_id)
        or public.tem_papel(h.empresa_id, '{admin}')
        or (
          public.tem_papel(h.empresa_id, '{gestor}')
          and exists (
            select 1
            from public.equipe_membros minha
            join public.equipe_membros dele on dele.equipe_id = minha.equipe_id
            join public.equipes eq on eq.id = minha.equipe_id and eq.ativa
            where minha.membro_id = public.meu_membro_id(h.empresa_id)
              and minha.e_gestor
              and dele.membro_id = h.para_membro_id
          )
        )
      )
  );
$$;

revoke all on function public.pode_responder_handoff(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_responder_handoff(uuid) to authenticated;

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
  if v_meu_membro_id is null or not public.pode_responder_handoff(p_handoff_id) then
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

create or replace function public.devolver_handoff(p_handoff_id uuid, p_motivo text)
returns public.handoffs
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.handoffs;
  v_meu_membro_id uuid;
  v_ator uuid := (select auth.uid());
  v_motivo text := nullif(trim(p_motivo), '');
  v_por_delegacao boolean;
begin
  if v_motivo is null then
    raise exception 'Informe o motivo da devolução.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select * into v_handoff from public.handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_meu_membro_id := public.meu_membro_id(v_handoff.empresa_id);
  if v_meu_membro_id is null or not public.pode_responder_handoff(p_handoff_id) then
    raise exception 'Você não pode devolver essa oportunidade.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_handoff.status <> 'pendente' then
    raise exception 'Essa oportunidade já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_por_delegacao := v_meu_membro_id <> v_handoff.para_membro_id;

  update public.handoffs
    set status = 'devolvido', respondido_por = v_meu_membro_id, respondido_em = now(), motivo_devolucao = v_motivo
    where id = p_handoff_id
    returning * into v_handoff;

  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_handoff.empresa_id, v_handoff.negocio_id, v_handoff.contato_id, 'handoff_devolvido', v_ator,
            jsonb_build_object('handoff_id', v_handoff.id, 'motivo', v_motivo, 'por_delegacao', v_por_delegacao));
  insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
    values (v_handoff.empresa_id, 'handoff.devolvido', v_ator, 'negocio', v_handoff.negocio_id,
            jsonb_build_object('handoff_id', v_handoff.id, 'motivo', v_motivo, 'por_delegacao', v_por_delegacao));

  if v_handoff.de_membro_id is not null then
    insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
      values (v_handoff.empresa_id, v_handoff.de_membro_id, 'handoff_devolvido',
              'Sua oportunidade foi devolvida: ' || v_motivo, '/negocios/' || v_handoff.negocio_id);
  end if;

  return v_handoff;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lista restrita de oportunidades pendentes para o Painel (gestor e admin)
-- ---------------------------------------------------------------------------

-- Só leitura, colunas explícitas. Linhas: handoffs pendentes da empresa informada que o
-- usuário pode responder (pode_responder_handoff: empresa ativa, vínculo ativo, papel e
-- equipe ativa do destinatário), e só para admin ou gestor (o destinatário já vê na ficha).
-- Fica de fora de propósito: valor e dados financeiros, telefone, e-mail, documento,
-- endereço, proposta, contrato, anexos, notas, tarefas, as observações livres do envio e
-- "quem participa da decisão" (texto livre com nomes de terceiros). Do contato, só nome,
-- cidade e UF; o telefone aparece apenas como "informado" (critério da qualificação).
create or replace function public.oportunidades_pendentes_equipe(p_empresa_id uuid)
returns table (
  handoff_id uuid,
  negocio_id uuid,
  negocio_numero integer,
  negocio_titulo text,
  contato_nome text,
  contato_cidade text,
  contato_uf text,
  telefone_informado boolean,
  sdr_nome text,
  destinatario_nome text,
  enviado_em timestamptz,
  status_qualificacao text,
  tipo_cliente text,
  possui_conta_energia boolean,
  distribuidora text,
  imovel_proprio boolean,
  objetivo text,
  prazo_instalacao text,
  busca_financiamento boolean,
  orcamento_outra_empresa boolean,
  e_decisor boolean,
  outro_decisor boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    h.id,
    n.id,
    n.numero,
    n.titulo,
    c.nome,
    c.cidade,
    c.uf,
    nullif(c.telefone, '') is not null,
    ps.nome,
    pd.nome,
    h.created_at,
    h.status_qualificacao,
    h.qualificacao_snapshot ->> 'tipo_cliente',
    (h.qualificacao_snapshot ->> 'possui_conta_energia')::boolean,
    h.qualificacao_snapshot ->> 'distribuidora',
    (h.qualificacao_snapshot ->> 'imovel_proprio')::boolean,
    h.qualificacao_snapshot ->> 'objetivo',
    h.qualificacao_snapshot ->> 'prazo_instalacao',
    (h.qualificacao_snapshot ->> 'busca_financiamento')::boolean,
    (h.qualificacao_snapshot ->> 'orcamento_outra_empresa')::boolean,
    (h.qualificacao_snapshot ->> 'e_decisor')::boolean,
    (h.qualificacao_snapshot ->> 'outro_decisor')::boolean
  from public.handoffs h
  join public.negocios n on n.id = h.negocio_id and n.empresa_id = h.empresa_id
  join public.contatos c on c.id = h.contato_id and c.empresa_id = h.empresa_id
  join public.empresa_membros md on md.id = h.para_membro_id
  left join public.perfis pd on pd.id = md.user_id
  left join public.empresa_membros ms on ms.id = h.de_membro_id
  left join public.perfis ps on ps.id = ms.user_id
  where h.empresa_id = p_empresa_id
    and h.status = 'pendente'
    and public.tem_papel(p_empresa_id, '{admin,gestor}')
    and public.pode_responder_handoff(h.id)
  order by h.created_at;
$$;

revoke all on function public.oportunidades_pendentes_equipe(uuid) from public, anon, authenticated, service_role;
grant execute on function public.oportunidades_pendentes_equipe(uuid) to authenticated;
