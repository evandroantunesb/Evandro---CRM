-- Segurança e correção (revisão de 01/11), sem mudar o que o app faz.
--
-- 1. Tabelas de public: anon e authenticated perdem TRUNCATE, REFERENCES, TRIGGER e MAINTAIN, que o app nunca usa.
--    TRUNCATE apaga a tabela de todas as empresas sem passar pelo RLS nem pelos triggers por linha (imutabilidade de
--    point_ledger, eventos e atividades). Hoje não há caminho até ele (a API não emite TRUNCATE, nenhuma função
--    security invoker monta SQL dinâmico, anon e authenticated não criam objetos), mas um erro futuro bastaria. As
--    tabelas criadas pelas próximas migrations (dono postgres) já nascem assim. SELECT/INSERT/UPDATE/DELETE seguem
--    com o RLS, como estão.
-- 2. service_role perde TRUNCATE nas tabelas de histórico que são imutáveis até para ele (AGENTS.md); o servidor
--    nunca as trunca.
-- 3. iniciar_atuacao_engenharia: o "exception when unique_violation" cobria a função inteira e devolvia "Você já está
--    nesta obra como responsável" para qualquer chave duplicada (histórico, status do fluxo). Agora só a inserção do
--    participante traduz, pelo nome do índice; qualquer outra violação sobe como veio.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. anon e authenticated sem TRUNCATE, REFERENCES, TRIGGER e MAINTAIN
-- ---------------------------------------------------------------------------

do $$
declare
  v_tabela regclass;
begin
  for v_tabela in
    select c.oid::regclass
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      -- Tabelas de extensão são da extensão: não mexe.
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_catalog.pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke truncate, references, trigger, maintain on table %s from anon, authenticated', v_tabela);
  end loop;
end;
$$;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Histórico imutável: nem service_role trunca
-- ---------------------------------------------------------------------------

revoke truncate on table
  public.point_ledger,
  public.eventos,
  public.atividades,
  public.logs_auditoria,
  public.historico_etapas,
  public.calculos_solares_historico,
  public.propostas_emissoes
from service_role;

-- ---------------------------------------------------------------------------
-- 3. iniciar_atuacao_engenharia: só a inserção do participante traduz chave duplicada
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
  v_restricao text;
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
  begin
    insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, principal, criado_por_user_id)
    values (p_obra_id, v_obra.empresa_id, v_meu, 'engenharia', 'responsavel', true, (select auth.uid()))
    returning id into v_id;
  exception
    -- Só a inserção traduz chave duplicada, e só pelos dois índices de obra_participantes; o resto segue como veio.
    when unique_violation then
      get stacked diagnostics v_restricao = constraint_name;
      if v_restricao = 'obra_participantes_sem_duplicata_ativa' then
        raise exception 'Você já está nesta obra como responsável: peça ao coordenador para torná-lo o principal.'
          using errcode = 'check_violation', hint = 'mensagem_usuario';
      elsif v_restricao = 'obra_participantes_um_principal_ativo' then
        raise exception 'Esta obra já foi iniciada por outra pessoa da Engenharia.' using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
      raise;
  end;

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
end;
$$;

reset lock_timeout;
