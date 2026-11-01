-- Engenharia: "Iniciar atuação" e fila de Novas obras (novo fluxo do card, protótipo aprovado em 01/11).
--
-- 1. Quem atua na Engenharia (papel `operacao` com o setor `engenharia`, executor ou coordenador) passa a VER as obras
--    em curso que ainda não têm responsável principal na Engenharia: é a fila "Novas obras". A visibilidade continua
--    toda em `pode_ver_obra_operacao` (policies das tabelas filhas e `obras_operacao`); os dados de contato do cliente
--    seguem só para participantes ativos (`obras_operacao` olha a participação, não esta função).
-- 2. `iniciar_atuacao_engenharia(p_obra_id)`: quem atua na Engenharia assume a obra sem responsável. Vira responsável
--    principal e a etapa sai de "A iniciar" para "Projeto em elaboração" (Documentação), com histórico. Dois cliques
--    ao mesmo tempo: a obra fica travada e o índice de um principal ativo por setor garante um só; o segundo recebe
--    "já foi iniciada". Admin e coordenador continuam atribuindo pela `atribuir_participante_obra` (sem mudança).
--
-- Depende de: pode_ver_obra_operacao, tem_papel, meu_membro_id, gravar_status_fluxo_obra, registrar_historico_obra
-- (já existentes).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Quem vê a obra (caminho de operação): + fila de Novas obras da Engenharia
-- ---------------------------------------------------------------------------

create or replace function public.pode_ver_obra_operacao(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{operacao}')
      and (
        exists (
          select 1 from public.obra_participantes p
          where p.obra_id = o.id
            and p.membro_id = public.meu_membro_id(o.empresa_id)
            and p.fim is null
        )
        or exists (
          select 1 from public.membro_setores_obra s
          where s.empresa_id = o.empresa_id
            and s.membro_id = public.meu_membro_id(o.empresa_id)
            and s.capacidade = 'coordenar'
        )
        -- Novas obras: em curso, sem responsável principal na Engenharia, para quem atua nela.
        or (
          o.cancelada_em is null
          and exists (
            select 1 from public.membro_setores_obra s
            where s.empresa_id = o.empresa_id
              and s.membro_id = public.meu_membro_id(o.empresa_id)
              and s.setor = 'engenharia'
          )
          and exists (
            select 1 from public.obra_fluxos f
            where f.obra_id = o.id and f.setor = 'engenharia' and f.status <> 'concluido'
          )
          and not exists (
            select 1 from public.obra_participantes p
            where p.obra_id = o.id and p.setor = 'engenharia' and p.principal and p.fim is null
          )
        )
      )
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

revoke all on function public.pode_ver_obra_operacao(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_obra_operacao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Iniciar atuação
-- ---------------------------------------------------------------------------

create or replace function public.iniciar_atuacao_engenharia(p_obra_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_meu uuid;
  v_status text;
  v_id uuid;
begin
  -- Trava a obra: dois "Iniciar" ao mesmo tempo passam um de cada vez.
  select * into v_obra from public.obras where id = p_obra_id for update;
  v_meu := case when found then public.meu_membro_id(v_obra.empresa_id) end;
  -- Mesma resposta para "não existe" e "sem permissão": não revela obras de outros.
  if v_meu is null
    or not public.tem_papel(v_obra.empresa_id, '{operacao}')
    or not exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = v_obra.empresa_id and s.membro_id = v_meu and s.setor = 'engenharia'
    )
  then
    raise exception 'Só quem atua na Engenharia pode iniciar a obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obra.pausada_em is not null then
    raise exception 'Esta obra está pausada: fale com o coordenador antes de iniciar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (
    select 1 from public.obra_participantes p
    where p.obra_id = p_obra_id and p.setor = 'engenharia' and p.principal and p.fim is null
  ) then
    raise exception 'Esta obra já foi iniciada por outra pessoa da Engenharia.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select f.status into v_status from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'engenharia';
  if v_status is null or v_status = 'concluido' then
    raise exception 'A Engenharia desta obra já foi concluída.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Quem já ajudava na obra (apoio/substituto) continua; a participação de responsável principal é nova.
  insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, principal, criado_por_user_id)
  values (p_obra_id, v_obra.empresa_id, v_meu, 'engenharia', 'responsavel', true, (select auth.uid()))
  returning id into v_id;

  perform public.registrar_historico_obra(p_obra_id, 'participante_atribuido', 'engenharia', jsonb_build_object(
    'participante_id', v_id,
    'membro_id', v_meu,
    'funcao', 'responsavel',
    'principal', true,
    'substitui_id', null,
    'autorizacao', 'executar',
    'origem', 'iniciar_atuacao'
  ));

  if v_status = 'a_iniciar' then
    perform public.gravar_status_fluxo_obra(p_obra_id, 'engenharia', 'projeto_em_elaboracao', 'executar', 'iniciar_atuacao');
  end if;
  return v_id;
exception
  -- Já é responsável (não principal) nesta obra: a mesma função ativa não pode repetir.
  when unique_violation then
    raise exception 'Você já está nesta obra como responsável: peça ao coordenador para torná-lo o principal.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
end;
$$;

revoke all on function public.iniciar_atuacao_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.iniciar_atuacao_engenharia(uuid) to authenticated;

reset lock_timeout;
