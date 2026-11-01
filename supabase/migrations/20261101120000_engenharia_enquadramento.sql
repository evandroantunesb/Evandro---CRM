-- Engenharia em Obras (P6c): enquadramento da obra e checklist condicional (spec v1.3, seções 7 e 24).
--
--  * `obra_engenharia_enquadramento`: uma ficha por obra com as perguntas da seção 24.1 (opções fixas) e dois números
--    opcionais (potência dos módulos e dos inversores). Escrita só pela RPC `salvar_enquadramento_engenharia` (mesma
--    porta do checklist: admin, coordenador ou participante ativo da Engenharia); leitura por quem vê a obra.
--  * `engenharia_checklist_modelo.condicoes`: o admin diz quando cada item vale, por pergunta e respostas aceitas
--    ({"titularidade": ["terceiro_procuracao"]}). Dentro de uma pergunta basta uma resposta; entre perguntas, todas.
--    Sem condição, vale sempre (os itens de hoje). Nenhuma regra da distribuidora vem pronta.
--  * Pergunta sem resposta não exclui item: o item fica (indeterminado). Obra sem ficha = tudo vale, como antes.
--  * Aplicar o checklist copia só os itens que valem. Ao salvar o enquadramento com o checklist já aplicado
--    (decisão E2 "a"): entram os itens que passaram a valer; os que deixaram de valer e estão pendentes ou em
--    conferência viram "não se aplica" com o motivo "Fora do enquadramento" (marcados `pelo_enquadramento`); se
--    voltarem a valer, voltam a pendentes. Item válido ou dispensado pela equipe não muda. Tudo no histórico.
--  * Passo 2: confirmar exige todas as perguntas de opção respondidas ("Desconhecido" e "Verificar" contam).
--    Editar o modelo continua sem mexer em obra já aplicada (decisão do P2).
-- Decisões do Evandro em 31/10/2026 (E1 a E4 como recomendados).
-- Depende de: 20261030100000_engenharia_checklist.sql, 20261101100000_engenharia_passos.sql.

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Perguntas e respostas aceitas (fonte única para a ficha e para as condições)
-- ---------------------------------------------------------------------------

create or replace function public.opcoes_enquadramento_engenharia()
returns jsonb
language sql immutable set search_path = ''
as $$
  select '{
    "tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao", "outro"],
    "categoria": ["micro", "mini", "indefinida"],
    "faixa_formulario": ["ate_10kw", "de_10_a_75kw", "mini"],
    "tipo_instalacao": ["telhado", "solo", "outra"],
    "modalidade_scee": ["local", "remoto", "multiplas_ucs", "compartilhada", "outra"],
    "titularidade": ["pf", "pj", "terceiro_procuracao"],
    "obra_rede": ["sim", "nao", "desconhecido"],
    "inversor_verificado": ["sim", "nao", "verificar"],
    "situacao_ambiental": ["nao_aplicavel", "dispensa", "licenca", "verificar"]
  }'::jsonb;
$$;

-- Condições válidas: objeto cujas chaves são perguntas e cujos valores são listas não vazias de respostas aceitas.
create or replace function public.condicoes_checklist_validas(p jsonb)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_opcoes jsonb := public.opcoes_enquadramento_engenharia();
  v_chave text;
  v_valores jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for v_chave, v_valores in select * from jsonb_each(p) loop
    if not v_opcoes ? v_chave or jsonb_typeof(v_valores) <> 'array' or jsonb_array_length(v_valores) = 0 then
      return false;
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_valores) x
      where jsonb_typeof(x) <> 'string' or not (v_opcoes -> v_chave) ? (x #>> '{}')
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.resposta_enquadramento_valida(p_pergunta text, p_resposta text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_resposta is null or coalesce((public.opcoes_enquadramento_engenharia() -> p_pergunta) ? p_resposta, false);
$$;

-- O item vale para a ficha? Pergunta sem resposta não exclui; sem ficha, vale.
create or replace function public.item_vale_no_enquadramento(p_condicoes jsonb, p_enquadramento jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_enquadramento is null or not exists (
    select 1 from jsonb_each(coalesce(p_condicoes, '{}')) c
    where p_enquadramento ->> c.key is not null and not c.value ? (p_enquadramento ->> c.key)
  );
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

alter table public.engenharia_checklist_modelo
  add column condicoes jsonb not null default '{}'::jsonb
    constraint engenharia_checklist_modelo_condicoes check (public.condicoes_checklist_validas(condicoes));

alter table public.obra_engenharia_itens add column pelo_enquadramento boolean not null default false;

create table public.obra_engenharia_enquadramento (
  obra_id uuid primary key,
  empresa_id uuid not null,
  tipo_solicitacao text,
  categoria text,
  faixa_formulario text,
  tipo_instalacao text,
  modalidade_scee text,
  titularidade text,
  obra_rede text,
  inversor_verificado text,
  situacao_ambiental text,
  justificativa_ambiental text check (justificativa_ambiental is null or length(justificativa_ambiental) between 3 and 500),
  potencia_modulos_kwp numeric(10, 3) check (potencia_modulos_kwp is null or potencia_modulos_kwp > 0),
  potencia_inversores_kw numeric(10, 3) check (potencia_inversores_kw is null or potencia_inversores_kw > 0),
  atualizado_por uuid,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- "Não aplicável" sempre diz por quê; as outras situações não guardam justificativa antiga.
  constraint obra_engenharia_enquadramento_justificativa check ((situacao_ambiental = 'nao_aplicavel') = (justificativa_ambiental is not null)),
  -- Cada resposta é uma das opções da pergunta (ou vazia).
  constraint obra_engenharia_enquadramento_respostas check (
    public.resposta_enquadramento_valida('tipo_solicitacao', tipo_solicitacao) and
    public.resposta_enquadramento_valida('categoria', categoria) and
    public.resposta_enquadramento_valida('faixa_formulario', faixa_formulario) and
    public.resposta_enquadramento_valida('tipo_instalacao', tipo_instalacao) and
    public.resposta_enquadramento_valida('modalidade_scee', modalidade_scee) and
    public.resposta_enquadramento_valida('titularidade', titularidade) and
    public.resposta_enquadramento_valida('obra_rede', obra_rede) and
    public.resposta_enquadramento_valida('inversor_verificado', inversor_verificado) and
    public.resposta_enquadramento_valida('situacao_ambiental', situacao_ambiental)
  ),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);

alter table public.obra_engenharia_enquadramento enable row level security;
create policy "ver enquadramento da obra" on public.obra_engenharia_enquadramento for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
revoke all on public.obra_engenharia_enquadramento from anon;
revoke insert, update, delete, truncate on public.obra_engenharia_enquadramento from authenticated, service_role;

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado',
  'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada', 'engenharia_concluida_excecao',
  'passo_engenharia_registrado', 'enquadramento_engenharia_salvo'
));

-- ---------------------------------------------------------------------------
-- Ficha como jsonb (só as perguntas de opção) e ficha completa
-- ---------------------------------------------------------------------------

create or replace function public.enquadramento_obra_json(p_obra_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'tipo_solicitacao', e.tipo_solicitacao, 'categoria', e.categoria, 'faixa_formulario', e.faixa_formulario,
    'tipo_instalacao', e.tipo_instalacao, 'modalidade_scee', e.modalidade_scee, 'titularidade', e.titularidade,
    'obra_rede', e.obra_rede, 'inversor_verificado', e.inversor_verificado, 'situacao_ambiental', e.situacao_ambiental
  )
  from public.obra_engenharia_enquadramento e where e.obra_id = p_obra_id;
$$;

create or replace function public.enquadramento_completo(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select not exists (select 1 from jsonb_each(public.enquadramento_obra_json(p_obra_id)) x where x.value = 'null'::jsonb)
    where public.enquadramento_obra_json(p_obra_id) is not null
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Checklist: aplicar só o que vale e reconciliar com a ficha
-- ---------------------------------------------------------------------------

-- Mesma assinatura e regras de antes; agora copia só os itens que valem para a ficha (sem ficha, todos).
create or replace function public.aplicar_checklist_engenharia(p_obra_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_empresa uuid;
  v_enq jsonb := public.enquadramento_obra_json(p_obra_id);
  v_novos integer;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  insert into public.obra_engenharia_itens (empresa_id, obra_id, modelo_id, grupo, titulo, descricao, obrigatorio, ordem)
  select v_empresa, p_obra_id, m.id, btrim(m.grupo), btrim(m.titulo), m.descricao, m.obrigatorio, m.ordem
  from public.engenharia_checklist_modelo m
  where m.empresa_id = v_empresa and m.ativo and public.item_vale_no_enquadramento(m.condicoes, v_enq)
  on conflict (obra_id, modelo_id) do nothing;
  get diagnostics v_novos = row_count;
  if v_novos > 0 then
    perform public.registrar_historico_obra(p_obra_id, 'checklist_engenharia_aplicado', 'engenharia',
      jsonb_build_object('itens', v_novos, 'autorizacao', v_aut));
  end if;
  return v_novos;
end;
$$;

-- Interna: depois de salvar a ficha, com a obra já travada. Só age se o checklist já foi aplicado.
create or replace function public.reconciliar_checklist_engenharia(p_obra_id uuid, p_aut text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_enq jsonb := public.enquadramento_obra_json(p_obra_id);
  v_membro uuid;
  v_novos integer;
  v_item record;
begin
  if not exists (select 1 from public.obra_engenharia_itens where obra_id = p_obra_id) then
    return;
  end if;
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  v_membro := public.meu_membro_id(v_empresa);

  -- Entram os itens ativos que passaram a valer.
  insert into public.obra_engenharia_itens (empresa_id, obra_id, modelo_id, grupo, titulo, descricao, obrigatorio, ordem)
  select v_empresa, p_obra_id, m.id, btrim(m.grupo), btrim(m.titulo), m.descricao, m.obrigatorio, m.ordem
  from public.engenharia_checklist_modelo m
  where m.empresa_id = v_empresa and m.ativo and public.item_vale_no_enquadramento(m.condicoes, v_enq)
  on conflict (obra_id, modelo_id) do nothing;
  get diagnostics v_novos = row_count;
  if v_novos > 0 then
    perform public.registrar_historico_obra(p_obra_id, 'checklist_engenharia_aplicado', 'engenharia',
      jsonb_build_object('itens', v_novos, 'autorizacao', p_aut, 'origem', 'enquadramento'));
  end if;

  -- Saem (viram "não se aplica") os pendentes e em conferência que deixaram de valer.
  for v_item in
    select i.id, i.titulo, i.status from public.obra_engenharia_itens i
    join public.engenharia_checklist_modelo m on m.id = i.modelo_id
    where i.obra_id = p_obra_id and i.status in ('pendente', 'em_conferencia')
      and not public.item_vale_no_enquadramento(m.condicoes, v_enq)
    order by i.ordem, i.id
  loop
    update public.obra_engenharia_itens
    set status = 'dispensado', motivo = 'Fora do enquadramento', pelo_enquadramento = true, atualizado_por = v_membro, atualizado_em = now()
    where id = v_item.id;
    perform public.registrar_historico_obra(p_obra_id, 'item_engenharia_alterado', 'engenharia', jsonb_build_object(
      'item', v_item.titulo, 'de', v_item.status, 'para', 'dispensado', 'motivo', 'Fora do enquadramento',
      'autorizacao', p_aut, 'origem', 'enquadramento'
    ));
  end loop;

  -- Voltam a pendentes os que saíram pelo enquadramento e voltaram a valer.
  for v_item in
    select i.id, i.titulo from public.obra_engenharia_itens i
    join public.engenharia_checklist_modelo m on m.id = i.modelo_id
    where i.obra_id = p_obra_id and i.pelo_enquadramento and i.status = 'dispensado' and i.motivo = 'Fora do enquadramento'
      and public.item_vale_no_enquadramento(m.condicoes, v_enq)
    order by i.ordem, i.id
  loop
    update public.obra_engenharia_itens
    set status = 'pendente', motivo = null, pelo_enquadramento = false, atualizado_por = v_membro, atualizado_em = now()
    where id = v_item.id;
    perform public.registrar_historico_obra(p_obra_id, 'item_engenharia_alterado', 'engenharia', jsonb_build_object(
      'item', v_item.titulo, 'de', 'dispensado', 'para', 'pendente', 'autorizacao', p_aut, 'origem', 'enquadramento'
    ));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Salvar a ficha
-- ---------------------------------------------------------------------------

-- Grava a ficha inteira (chave ausente = sem resposta) e reconcilia o checklist. Respostas fora das opções, números
-- inválidos ou "não aplicável" sem justificativa são recusados com mensagem.
create or replace function public.salvar_enquadramento_engenharia(p_obra_id uuid, p_respostas jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_opcoes jsonb := public.opcoes_enquadramento_engenharia();
  v_empresa uuid;
  v_chave text;
  v_valor jsonb;
  v_just text;
  v_mod numeric;
  v_inv numeric;
  v_antes jsonb;
  v_depois jsonb;
  v_campos text[];
begin
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'Respostas inválidas.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  for v_chave, v_valor in select * from jsonb_each(p_respostas) loop
    if v_opcoes ? v_chave then
      if v_valor <> 'null'::jsonb and (jsonb_typeof(v_valor) <> 'string' or not (v_opcoes -> v_chave) ? (v_valor #>> '{}')) then
        raise exception 'Resposta inválida em "%".', v_chave using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    elsif v_chave in ('potencia_modulos_kwp', 'potencia_inversores_kw') then
      if v_valor <> 'null'::jsonb and (jsonb_typeof(v_valor) <> 'number' or (v_valor #>> '{}')::numeric <= 0 or (v_valor #>> '{}')::numeric >= 10000000) then
        raise exception 'Potência inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    elsif v_chave <> 'justificativa_ambiental' then
      raise exception 'Pergunta desconhecida: %.', v_chave using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end loop;

  v_just := nullif(btrim(coalesce(p_respostas ->> 'justificativa_ambiental', '')), '');
  if p_respostas ->> 'situacao_ambiental' = 'nao_aplicavel' then
    if v_just is null or length(v_just) < 3 then
      raise exception 'Explique por que a questão ambiental não se aplica.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if length(v_just) > 500 then
      raise exception 'Justificativa muito longa (máximo 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  else
    v_just := null;
  end if;
  v_mod := (p_respostas ->> 'potencia_modulos_kwp')::numeric;
  v_inv := (p_respostas ->> 'potencia_inversores_kw')::numeric;

  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  select to_jsonb(e) - 'atualizado_por' - 'atualizado_em' - 'created_at' into v_antes
  from public.obra_engenharia_enquadramento e where e.obra_id = p_obra_id;

  insert into public.obra_engenharia_enquadramento as e (
    obra_id, empresa_id, tipo_solicitacao, categoria, faixa_formulario, tipo_instalacao, modalidade_scee, titularidade,
    obra_rede, inversor_verificado, situacao_ambiental, justificativa_ambiental, potencia_modulos_kwp, potencia_inversores_kw,
    atualizado_por, atualizado_em
  ) values (
    p_obra_id, v_empresa, p_respostas ->> 'tipo_solicitacao', p_respostas ->> 'categoria', p_respostas ->> 'faixa_formulario',
    p_respostas ->> 'tipo_instalacao', p_respostas ->> 'modalidade_scee', p_respostas ->> 'titularidade', p_respostas ->> 'obra_rede',
    p_respostas ->> 'inversor_verificado', p_respostas ->> 'situacao_ambiental', v_just, v_mod, v_inv,
    public.meu_membro_id(v_empresa), now()
  )
  on conflict (obra_id) do update set
    tipo_solicitacao = excluded.tipo_solicitacao, categoria = excluded.categoria, faixa_formulario = excluded.faixa_formulario,
    tipo_instalacao = excluded.tipo_instalacao, modalidade_scee = excluded.modalidade_scee, titularidade = excluded.titularidade,
    obra_rede = excluded.obra_rede, inversor_verificado = excluded.inversor_verificado, situacao_ambiental = excluded.situacao_ambiental,
    justificativa_ambiental = excluded.justificativa_ambiental, potencia_modulos_kwp = excluded.potencia_modulos_kwp,
    potencia_inversores_kw = excluded.potencia_inversores_kw, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em
  -- Nada mudou: não grava nem toca a data (a revisão do passo 2 não fica desatualizada à toa).
  where (e.tipo_solicitacao, e.categoria, e.faixa_formulario, e.tipo_instalacao, e.modalidade_scee, e.titularidade, e.obra_rede,
         e.inversor_verificado, e.situacao_ambiental, e.justificativa_ambiental, e.potencia_modulos_kwp, e.potencia_inversores_kw)
    is distinct from
        (excluded.tipo_solicitacao, excluded.categoria, excluded.faixa_formulario, excluded.tipo_instalacao, excluded.modalidade_scee,
         excluded.titularidade, excluded.obra_rede, excluded.inversor_verificado, excluded.situacao_ambiental,
         excluded.justificativa_ambiental, excluded.potencia_modulos_kwp, excluded.potencia_inversores_kw);
  if not found then
    return;
  end if;

  select to_jsonb(e) - 'atualizado_por' - 'atualizado_em' - 'created_at' into v_depois
  from public.obra_engenharia_enquadramento e where e.obra_id = p_obra_id;
  select coalesce(array_agg(d.key order by d.key), '{}') into v_campos
  from jsonb_each(v_depois) d
  where d.key not in ('obra_id', 'empresa_id') and d.value is distinct from coalesce(v_antes -> d.key, 'null'::jsonb);

  -- Sem a justificativa nem os valores: só quais perguntas mudaram.
  perform public.registrar_historico_obra(p_obra_id, 'enquadramento_engenharia_salvo', 'engenharia',
    jsonb_build_object('campos', to_jsonb(v_campos), 'autorizacao', v_aut));
  perform public.reconciliar_checklist_engenharia(p_obra_id, v_aut);
end;
$$;

-- ---------------------------------------------------------------------------
-- Passo 2 exige a ficha completa (mesma função de 20261101100000, com a trava nova)
-- ---------------------------------------------------------------------------

create or replace function public.registrar_passo_engenharia(p_obra_id uuid, p_passo smallint, p_acao text, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_empresa uuid;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_atual text;
  v_id uuid;
begin
  if p_passo is null or p_passo not in (2, 3, 5, 7) then
    raise exception 'Passo inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao is null or p_acao not in ('confirmado', 'reaberto', 'nao_se_aplica') then
    raise exception 'Ação inválida para o passo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao = 'nao_se_aplica' and p_passo <> 7 then
    raise exception 'Só as condições de conexão podem ser marcadas como "não se aplica".' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao in ('reaberto', 'nao_se_aplica') and (v_obs is null or length(v_obs) < 3) then
    raise exception 'Informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obs is not null and length(v_obs) < 3 then
    raise exception 'Observação muito curta (mínimo 3 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(v_obs) > 500 then
    raise exception 'Observação muito longa (máximo 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  select acao into v_atual from public.obra_engenharia_passo_registros
  where obra_id = p_obra_id and passo = p_passo order by created_at desc, id desc limit 1;

  if p_acao = 'reaberto' and v_atual is distinct from 'confirmado' and v_atual is distinct from 'nao_se_aplica' then
    raise exception 'Este passo não está concluído.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_acao = 'nao_se_aplica' and v_atual = 'nao_se_aplica' then
    raise exception 'Este passo já está marcado como "não se aplica".' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Passo 2 (P6c): a ficha de enquadramento com todas as perguntas de opção respondidas.
  if p_passo = 2 and p_acao = 'confirmado' and not public.enquadramento_completo(p_obra_id) then
    raise exception 'Responda todas as perguntas do enquadramento antes de concluir este passo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_passo = 5 and p_acao = 'confirmado' then
    if not exists (select 1 from public.obra_engenharia_itens where obra_id = p_obra_id)
       or exists (
         select 1 from public.obra_engenharia_itens
         where obra_id = p_obra_id and obrigatorio and status not in ('valido', 'dispensado')
       ) then
      raise exception 'Aplique o checklist e resolva os itens obrigatórios antes de concluir a revisão.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;
  if p_passo = 7 and p_acao in ('confirmado', 'nao_se_aplica') and not exists (
    select 1 from public.obra_engenharia_protocolos
    where obra_id = p_obra_id and status in ('aprovado', 'orcamento_emitido', 'encerrado')
  ) then
    raise exception 'Registre a aprovação ou o orçamento da distribuidora no protocolo antes deste passo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_engenharia_passo_registros (empresa_id, obra_id, passo, acao, observacao, autor_membro_id)
  values (v_empresa, p_obra_id, p_passo, p_acao, v_obs, public.meu_membro_id(v_empresa))
  returning id into v_id;

  perform public.registrar_historico_obra(p_obra_id, 'passo_engenharia_registrado', 'engenharia', jsonb_build_object(
    'passo', p_passo,
    'acao', p_acao,
    'autorizacao', v_aut
  ));
  return v_id;
end;
$$;

-- Internas: ninguém executa pela API.
revoke all on function public.reconciliar_checklist_engenharia(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.enquadramento_obra_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.enquadramento_completo(uuid) from public, anon, authenticated, service_role;
-- Usadas em checks de tabela (precisam ser executáveis por quem escreve no modelo).
revoke all on function public.opcoes_enquadramento_engenharia() from public, anon;
revoke all on function public.condicoes_checklist_validas(jsonb) from public, anon;
revoke all on function public.resposta_enquadramento_valida(text, text) from public, anon;
grant execute on function public.resposta_enquadramento_valida(text, text) to authenticated, service_role;
grant execute on function public.opcoes_enquadramento_engenharia() to authenticated, service_role;
grant execute on function public.condicoes_checklist_validas(jsonb) to authenticated, service_role;
revoke all on function public.item_vale_no_enquadramento(jsonb, jsonb) from public, anon, authenticated, service_role;

revoke all on function public.aplicar_checklist_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.aplicar_checklist_engenharia(uuid) to authenticated;
revoke all on function public.salvar_enquadramento_engenharia(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.salvar_enquadramento_engenharia(uuid, jsonb) to authenticated;
revoke all on function public.registrar_passo_engenharia(uuid, smallint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_passo_engenharia(uuid, smallint, text, text) to authenticated;
