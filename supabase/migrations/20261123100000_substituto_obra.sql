-- Substituto por obra (etapa A3 dos Perfis e setores).
--
-- Decisões do Evandro (05/11/2026):
--  1. Vale para todos os setores operacionais (Compras, Engenharia, Operacional e Administrativo).
--  2. No máximo UM substituto ativo por setor em cada obra (como o responsável principal). Trocar = substituir o
--     atual (p_substitui_id), como já acontece com o principal.
--  3. Tarefas: a tarefa continua com um único responsável (o principal). O substituto recebe no sininho o mesmo aviso
--     (atribuída, reaberta) e a tarefa aparece em "Minhas tarefas" dele (o app usa `minhas_substituicoes`).
--  4. Justificativa de atraso: o pedido continua no nome do principal; o substituto recebe o aviso (pedida e cobrada)
--     e pode responder no lugar dele. O histórico guarda quem respondeu (`respondido_por`).
--
-- O substituto já AGE na obra desde a 3b-3: é participante ativo do setor, então `autorizacao_setor_obra` lhe dá
-- 'executar' (enquanto ele atuar no setor). Esta migration cuida de quem é avisado e de quem responde.
--
-- Trava: se alguma obra já tiver mais de um substituto ativo no mesmo setor, a migration para (nada é aplicado) e
-- diz quantos casos há; o coordenador encerra o excedente e a migration roda de novo.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Um substituto ativo por setor na obra
-- ---------------------------------------------------------------------------

do $$
declare
  v_casos integer;
begin
  select count(*) into v_casos from (
    select 1 from public.obra_participantes
    where funcao = 'substituto' and fim is null
    group by obra_id, setor
    having count(*) > 1
  ) x;
  if v_casos > 0 then
    raise exception 'Há % setor(es) de obra com mais de um substituto ativo: encerre o excedente antes de aplicar esta migration.', v_casos;
  end if;
end;
$$;

create unique index obra_participantes_um_substituto_ativo
  on public.obra_participantes (obra_id, setor)
  where funcao = 'substituto' and fim is null;

-- Substituto ativo do setor na obra que ainda atua no setor (interno).
create or replace function public.substituto_ativo_obra(p_obra_id uuid, p_setor public.setor_obra)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.membro_id
  from public.obra_participantes p
  where p.obra_id = p_obra_id and p.setor = p_setor and p.funcao = 'substituto' and p.fim is null
    and public.membro_atua_no_setor(p.empresa_id, p.membro_id, p_setor)
  limit 1;
$$;
revoke all on function public.substituto_ativo_obra(uuid, public.setor_obra) from public, anon, authenticated, service_role;

-- Onde a sessão é substituta hoje: obra, setor e o responsável principal ativo (pode não haver). Só as próprias
-- linhas; quem não está ativo na empresa recebe vazio.
create or replace function public.minhas_substituicoes(p_empresa_id uuid)
returns table (obra_id uuid, setor public.setor_obra, principal_id uuid)
language sql stable security definer set search_path = ''
as $$
  select s.obra_id, s.setor, (
    select pr.membro_id from public.obra_participantes pr
    where pr.obra_id = s.obra_id and pr.setor = s.setor and pr.principal and pr.fim is null
    limit 1
  )
  from public.obra_participantes s
  join public.obras o on o.id = s.obra_id and o.empresa_id = p_empresa_id and o.cancelada_em is null
  where s.empresa_id = p_empresa_id
    and s.membro_id = public.meu_membro_id(p_empresa_id)
    and s.funcao = 'substituto' and s.fim is null
    and public.membro_atua_no_setor(p_empresa_id, s.membro_id, s.setor)
  order by s.obra_id, s.setor;
$$;
revoke all on function public.minhas_substituicoes(uuid) from public, anon, authenticated, service_role;
grant execute on function public.minhas_substituicoes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Atribuir participante (corpo de 20261008100000 + regras do substituto)
-- ---------------------------------------------------------------------------

create or replace function public.atribuir_participante_obra(
  p_obra_id uuid,
  p_membro_id uuid,
  p_setor public.setor_obra,
  p_funcao public.funcao_participante_obra default 'apoio',
  p_principal boolean default false,
  p_substitui_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_empresa uuid;
  v_meu uuid;
  v_alvo public.empresa_membros;
  v_ant public.obra_participantes;
  v_principal public.obra_participantes;
  v_substituto public.obra_participantes;
  v_id uuid;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, false);
  if v_aut not in ('admin', 'coordenar') then
    raise exception 'Você não pode atribuir participantes neste setor.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  select o.empresa_id into v_empresa from public.obras o where o.id = p_obra_id;
  v_meu := public.meu_membro_id(v_empresa);

  if p_funcao is null or p_funcao not in ('responsavel', 'apoio', 'substituto') then
    raise exception 'Função inválida para a obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce(p_principal, false) and p_funcao <> 'responsavel' then
    raise exception 'O responsável principal precisa ter a função Responsável.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Trava o alvo: não é desativado nem muda de papel no meio da atribuição.
  select * into v_alvo from public.empresa_membros where id = p_membro_id for update;
  if not found or v_alvo.empresa_id <> v_empresa or not v_alvo.ativo or v_alvo.papel <> 'operacao' then
    raise exception 'O colaborador precisa estar ativo, ser da mesma empresa e ter o papel Operação.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (
    select 1 from public.membro_setores_obra s
    where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.setor = p_setor
  ) then
    raise exception 'O colaborador não tem este setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_aut = 'coordenar' then
    if p_membro_id = v_meu then
      raise exception 'Você não pode se atribuir a uma obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
    if exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.capacidade = 'coordenar'
    ) then
      raise exception 'Só o admin atribui um coordenador a uma obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  end if;

  if p_substitui_id is not null then
    select * into v_ant from public.obra_participantes where id = p_substitui_id for update;
    if not found or v_ant.obra_id <> p_obra_id or v_ant.setor <> p_setor or v_ant.fim is not null then
      raise exception 'A participação substituída precisa estar ativa nesta obra e neste setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_ant.membro_id = v_meu then
      raise exception 'Você não pode encerrar a própria participação.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
    end if;
  end if;

  if coalesce(p_principal, false) then
    select * into v_principal from public.obra_participantes
    where obra_id = p_obra_id and setor = p_setor and principal and fim is null
    for update;
    if found and v_principal.id is distinct from p_substitui_id then
      raise exception 'Este setor já tem um responsável principal: informe a substituição.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    -- O principal não pode ser também o substituto do setor.
    if exists (
      select 1 from public.obra_participantes p
      where p.obra_id = p_obra_id and p.setor = p_setor and p.membro_id = p_membro_id
        and p.funcao = 'substituto' and p.fim is null and p.id is distinct from p_substitui_id
    ) then
      raise exception 'Esta pessoa é o substituto do setor: encerre a substituição antes de torná-la principal.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if p_funcao = 'substituto' then
    if exists (
      select 1 from public.obra_participantes p
      where p.obra_id = p_obra_id and p.setor = p_setor and p.membro_id = p_membro_id
        and p.principal and p.fim is null and p.id is distinct from p_substitui_id
    ) then
      raise exception 'O responsável principal não pode ser o próprio substituto.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    -- Um substituto por setor na obra: havendo outro, só entra substituindo-o.
    select * into v_substituto from public.obra_participantes
    where obra_id = p_obra_id and setor = p_setor and funcao = 'substituto' and fim is null
    for update;
    if found and v_substituto.id is distinct from p_substitui_id then
      raise exception 'Este setor já tem um substituto: informe a substituição.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  if exists (
    select 1 from public.obra_participantes p
    where p.obra_id = p_obra_id and p.membro_id = p_membro_id and p.setor = p_setor
      and p.funcao = p_funcao and p.fim is null and p.id is distinct from p_substitui_id
  ) then
    raise exception 'O colaborador já participa deste setor da obra com essa função.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_substitui_id is not null then
    update public.obra_participantes set fim = now() where id = p_substitui_id;
    perform public.registrar_historico_obra(p_obra_id, 'participante_encerrado', p_setor, jsonb_build_object(
      'participante_id', v_ant.id,
      'membro_id', v_ant.membro_id,
      'funcao', v_ant.funcao,
      'principal', v_ant.principal,
      'origem', 'substituicao',
      'motivo', 'Substituído',
      'autorizacao', v_aut
    ));
  end if;

  insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, principal, substitui_id, criado_por_user_id)
  values (p_obra_id, v_empresa, p_membro_id, p_setor, p_funcao, coalesce(p_principal, false), p_substitui_id, (select auth.uid()))
  returning id into v_id;

  perform public.registrar_historico_obra(p_obra_id, 'participante_atribuido', p_setor, jsonb_build_object(
    'participante_id', v_id,
    'membro_id', p_membro_id,
    'funcao', p_funcao,
    'principal', coalesce(p_principal, false),
    'substitui_id', p_substitui_id,
    'autorizacao', v_aut
  ));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Avisos de tarefa (corpo de 20261119100100 + o substituto)
-- ---------------------------------------------------------------------------

-- Tarefa da obra atribuída ao (ou reaberta para o) responsável principal do setor: o substituto do setor na obra
-- recebe o mesmo aviso. Ninguém é avisado da própria ação; inativo ou fora da empresa não recebe.
create or replace function public.notificar_tarefa_setor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t public.tarefas_setor;
  v_setor text;
  v_link_pedido text;
  v_para uuid;
  v_tipo text;
  v_mensagem text;
  v_link text;
  v_substituto uuid;
begin
  select * into t from public.tarefas_setor where id = new.tarefa_id;
  if not found then
    return null;
  end if;
  v_setor := case t.setor when 'compras' then 'Compras' when 'engenharia' then 'Engenharia' when 'operacional' then 'Operacional' when 'administrativo' then 'Administrativo' else 'O setor' end;
  v_link_pedido := case when t.negocio_id is not null then '/negocios/' || t.negocio_id || '?aba=atividades' else '/obras/' || t.obra_id end;
  if new.tipo = 'concluida' then
    v_para := t.criado_por;
    v_tipo := 'tarefa_setor_concluida';
    v_mensagem := v_setor || ' concluiu: ' || t.titulo;
    v_link := v_link_pedido;
  elsif new.tipo = 'cancelada' then
    v_para := t.criado_por;
    v_tipo := 'tarefa_setor_cancelada';
    v_mensagem := 'Pedido cancelado (' || v_setor || '): ' || t.titulo || ' — ' || coalesce(t.motivo_cancelamento, '');
    v_link := v_link_pedido;
  elsif new.tipo = 'atribuida' or (new.tipo = 'criada' and t.origem = 'automatica') then
    v_para := t.responsavel_id;
    v_tipo := 'tarefa_setor_atribuida';
    v_mensagem := 'Tarefa de ' || v_setor || ' atribuída a você: ' || t.titulo;
    v_link := '/tarefas/setores?ver=minhas';
  elsif new.tipo = 'reaberta' then
    v_para := t.responsavel_id;
    v_tipo := 'tarefa_setor_reaberta';
    v_mensagem := 'Tarefa reaberta: ' || t.titulo;
    v_link := '/tarefas/setores?ver=minhas';
  else
    return null;
  end if;

  if v_para is not null and v_para is distinct from new.autor_membro_id
    and exists (select 1 from public.empresa_membros m where m.id = v_para and m.empresa_id = t.empresa_id and m.ativo) then
    insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
    values (t.empresa_id, v_para, v_tipo, left(v_mensagem, 500), v_link);
  end if;

  -- Substituto: só nos avisos do responsável, e só se ele é o principal do setor na obra.
  if v_tipo in ('tarefa_setor_atribuida', 'tarefa_setor_reaberta') and t.obra_id is not null and v_para is not null
    and exists (
      select 1 from public.obra_participantes p
      where p.obra_id = t.obra_id and p.setor = t.setor and p.principal and p.fim is null and p.membro_id = v_para
    ) then
    v_substituto := public.substituto_ativo_obra(t.obra_id, t.setor);
    if v_substituto is not null and v_substituto is distinct from v_para and v_substituto is distinct from new.autor_membro_id
      and exists (select 1 from public.empresa_membros m where m.id = v_substituto and m.empresa_id = t.empresa_id and m.ativo) then
      insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
      values (
        t.empresa_id, v_substituto, v_tipo,
        left(case v_tipo
          when 'tarefa_setor_atribuida' then 'Tarefa de ' || v_setor || ' na obra em que você é substituto: ' || t.titulo
          else 'Tarefa reaberta na obra em que você é substituto: ' || t.titulo
        end, 500),
        v_link
      );
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Justificativa de atraso: o substituto recebe o aviso e responde
-- ---------------------------------------------------------------------------

-- Corpo de 20261107100000 + o substituto do setor da etapa no pedido e na cobrança.
create or replace function public.avisar_justificativa_atraso()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
  v_obra public.obras;
  v_etapa text;
  v_tipo text;
  v_mensagem text;
  v_para uuid[];
begin
  if tg_op = 'INSERT' then
    v_tipo := 'justificativa_atraso_pedida';
  elsif old.respondido_em is null and new.respondido_em is not null then
    v_tipo := 'justificativa_atraso_respondida';
  elsif new.respondido_em is null and new.cobrado_em is distinct from old.cobrado_em then
    v_tipo := 'justificativa_atraso_cobrada';
  else
    return null;
  end if;

  select * into v_obra from public.obras where id = new.obra_id;
  v_etapa := case new.etapa
    when 'projeto' then 'Projeto'
    when 'homologacao' then 'Homologação'
    when 'compra' then 'Compra'
    when 'entrega_material' then 'Entrega do material'
    when 'instalacao' then 'Instalação'
    when 'vistoria' then 'Vistoria'
    when 'conexao' then 'Conexão'
  end;
  v_mensagem := format(
    case v_tipo
      when 'justificativa_atraso_pedida' then 'Justificativa de atraso pedida: %s na obra nº %s (%s).'
      when 'justificativa_atraso_cobrada' then 'Justificativa de atraso cobrada: %s na obra nº %s (%s).'
      else 'Justificativa de atraso respondida: %s na obra nº %s (%s).'
    end,
    v_etapa, v_obra.numero, v_obra.cliente_nome
  );

  if v_tipo = 'justificativa_atraso_respondida' then
    v_para := array[new.pedido_por];
  else
    v_para := array[new.pedido_a, public.substituto_ativo_obra(new.obra_id, public.setor_etapa_obra(new.etapa))] || array(
      select g.membro_id
      from public.equipe_membros dele
      join public.equipes eq on eq.id = dele.equipe_id and eq.ativa
      join public.equipe_membros g on g.equipe_id = dele.equipe_id and g.e_gestor
      where dele.membro_id = new.pedido_a
    );
  end if;

  insert into public.notificacoes (empresa_id, membro_id, tipo, mensagem, link)
  select distinct new.empresa_id, m.id, v_tipo, left(v_mensagem, 500), format('/obras/%s#atrasos', new.obra_id)
  from public.empresa_membros m
  where m.id = any(v_para) and m.empresa_id = new.empresa_id and m.ativo and m.id is distinct from v_eu;
  return null;
end;
$$;

-- Corpo de 20261106100000 + o substituto do setor da etapa. Responde quem recebeu o pedido, o substituto dele, o
-- admin ou quem coordena o setor (o gestor, desde 20261122100000).
create or replace function public.responder_justificativa_atraso(p_justificativa_id uuid, p_texto text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_just public.obra_justificativas_atraso;
  v_setor public.setor_obra;
  v_aut text;
  v_eu uuid;
  v_texto text := nullif(btrim(p_texto), '');
begin
  select * into v_just from public.obra_justificativas_atraso where id = p_justificativa_id for update;
  if found then
    v_setor := public.setor_etapa_obra(v_just.etapa);
    v_aut := public.autorizacao_setor_obra(v_just.obra_id, v_setor);
    v_eu := public.meu_membro_id(v_just.empresa_id);
  end if;
  -- coalesce: sem vínculo na empresa, meu_membro_id é null e a comparação também; null nunca autoriza.
  if not found or not coalesce(
    v_just.pedido_a = v_eu
      or v_aut in ('admin', 'coordenar')
      or (v_aut is not null and public.substituto_ativo_obra(v_just.obra_id, v_setor) = v_eu),
    false
  ) then
    raise exception 'Só quem recebeu o pedido (ou o substituto dele) responde esta justificativa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_just.respondido_em is not null then
    raise exception 'Esta justificativa já foi respondida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_texto is null or length(v_texto) < 3 or length(v_texto) > 500 then
    raise exception 'Explique o atraso (de 3 a 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  update public.obra_justificativas_atraso
  set texto = v_texto, respondido_em = now(), respondido_por = v_eu
  where id = p_justificativa_id;
  perform public.registrar_historico_obra(v_just.obra_id, 'justificativa_atraso_respondida', v_setor, jsonb_build_object('etapa', v_just.etapa));
end;
$$;

reset lock_timeout;
