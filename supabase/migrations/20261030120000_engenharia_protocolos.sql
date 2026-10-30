-- Engenharia (P3): protocolos na concessionária, respostas, exigências e reenvios, com bloqueio de etapa.
--
-- Especificação v1.3 (29/10/2026), seções OB-09, 7.2 (gates G2 a G4), 8.3, 8.4 e 25. Autorizado pelo Evandro em
-- 30/10/2026 ("siga para o 3"), depois do P2 (20261030100000_engenharia_checklist.sql).
--
-- O que faz:
--  * `obra_engenharia_protocolos`: protocolo registrado à mão pelo engenheiro (o Raion não acessa o PEW/CAW):
--    distribuidora, canal, número, tipo de solicitação, data do envio. No máximo um protocolo em andamento por obra;
--    depois de indeferido, cancelado ou encerrado, pode haver outro.
--  * `obra_engenharia_protocolo_eventos`: linha do tempo imutável (registrado, em análise, exigência, reenvio,
--    aprovado, orçamento emitido, indeferido, cancelado, encerrado), com a data informada e o texto da resposta.
--  * `obra_engenharia_exigencias`: cada exigência recebida (categoria, texto, prazo interno), aberta → reenviada →
--    resolvida (sozinha quando o protocolo é aprovado, tem orçamento ou é encerrado).
--  * `obra_engenharia_protocolo_documentos`: o pacote enviado — a versão mais recente de cada item válido do
--    checklist no registro e em cada reenvio. Assim a versão usada num envio fica registrada e nunca se perde.
--  * `obra_engenharia_protocolo_arquivos`: comprovante, ofício, orçamento etc., ligados ao evento; mesmo bucket e
--    pasta dos documentos (`engenharia-documentos`, `empresa/obra/objeto`). Nada se apaga.
--  * Gate G2: registrar protocolo exige o checklist aplicado e todos os itens obrigatórios válidos ou "não se aplica".
--  * Gate G3: a Engenharia só sai de "A iniciar" ou "Projeto em elaboração" para uma etapa posterior com protocolo
--    registrado (não cancelado nem indeferido). Obra que já está adiante não é afetada; voltar etapa segue livre.
--  * Registrar o protocolo leva a Engenharia para "Enviado à concessionária" sozinho (sem digitar duas vezes), pelo
--    mesmo caminho e histórico da troca manual. As respostas não mudam a etapa: aprovação, vistoria e conclusão
--    seguem pela troca manual de etapa.
--  * Tudo visível só para admin e quem atua em Engenharia na obra (`pode_ver_documentos_engenharia`: textos da
--    distribuidora podem ter dado pessoal). Escrita só pelas RPCs, com a obra travada e histórico com o autor real.
-- Depende de: 20261030100000_engenharia_checklist.sql, preparar_escrita_obra, registrar_historico_obra,
-- meu_membro_id, alterar_status_fluxo_obra (20261008100000_obras_escrita_operacao.sql, redefinida aqui).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.obra_engenharia_protocolos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  distribuidora text not null check (length(btrim(distribuidora)) between 2 and 60),
  canal text not null check (canal in ('pew', 'caw', 'atendimento', 'outro')),
  numero text not null check (length(btrim(numero)) between 1 and 60),
  tipo_solicitacao text not null check (tipo_solicitacao in ('nova_conexao', 'ampliacao', 'regularizacao', 'outro')),
  protocolado_em date not null,
  status text not null default 'protocolado' check (status in (
    'protocolado', 'em_analise', 'com_exigencia', 'aprovado', 'orcamento_emitido', 'indeferido', 'cancelado', 'encerrado'
  )),
  observacao text check (observacao is null or length(observacao) <= 1000),
  registrado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);
-- No máximo um protocolo em andamento por obra.
create unique index obra_engenharia_protocolos_um_ativo on public.obra_engenharia_protocolos (obra_id)
  where status not in ('indeferido', 'cancelado', 'encerrado');
create index on public.obra_engenharia_protocolos (obra_id, created_at);
create trigger obra_engenharia_protocolos_updated_at before update on public.obra_engenharia_protocolos
  for each row execute function public.tocar_updated_at();

create table public.obra_engenharia_protocolo_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  protocolo_id uuid not null,
  tipo text not null check (tipo in (
    'registrado', 'em_analise', 'exigencia', 'reenvio', 'aprovado', 'orcamento_emitido', 'indeferido', 'cancelado', 'encerrado'
  )),
  status_de text,
  status_para text not null,
  ocorrido_em date not null,
  descricao text check (descricao is null or length(descricao) <= 4000),
  autor_membro_id uuid,
  created_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, protocolo_id) references public.obra_engenharia_protocolos (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_protocolo_eventos (protocolo_id, created_at);

create table public.obra_engenharia_exigencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  protocolo_id uuid not null,
  evento_id uuid not null,
  categoria text not null check (categoria in (
    'cadastral', 'documento_faltante', 'documento_ilegivel', 'projeto_eletrico', 'art', 'inversor',
    'protecao', 'padrao_entrada', 'rede', 'outro'
  )),
  descricao text not null check (length(btrim(descricao)) between 3 and 4000),
  prazo_interno date,
  status text not null default 'aberta' check (status in ('aberta', 'reenviada', 'resolvida')),
  resolvida_em timestamptz,
  created_at timestamptz not null default now(),
  constraint obra_engenharia_exigencias_resolvida check ((status = 'resolvida') = (resolvida_em is not null)),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, protocolo_id) references public.obra_engenharia_protocolos (empresa_id, id) on delete cascade,
  foreign key (empresa_id, evento_id) references public.obra_engenharia_protocolo_eventos (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_exigencias (obra_id) where status <> 'resolvida';
create index on public.obra_engenharia_exigencias (protocolo_id);

create table public.obra_engenharia_protocolo_documentos (
  empresa_id uuid not null,
  evento_id uuid not null,
  documento_id uuid not null,
  primary key (evento_id, documento_id),
  foreign key (empresa_id, evento_id) references public.obra_engenharia_protocolo_eventos (empresa_id, id) on delete cascade,
  foreign key (documento_id) references public.obra_engenharia_documentos (id) on delete cascade
);
create index on public.obra_engenharia_protocolo_documentos (documento_id);

create table public.obra_engenharia_protocolo_arquivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  evento_id uuid not null,
  caminho text not null unique,
  nome text not null check (length(btrim(nome)) between 1 and 200),
  tamanho bigint not null check (tamanho > 0),
  tipo_mime text,
  enviado_por uuid,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, evento_id) references public.obra_engenharia_protocolo_eventos (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_protocolo_arquivos (evento_id);
create index on public.obra_engenharia_protocolo_arquivos (obra_id);

-- Leitura: admin e quem atua em Engenharia na obra. Escrita direta revogada (inclusive service_role).
alter table public.obra_engenharia_protocolos enable row level security;
create policy "ver protocolos da engenharia" on public.obra_engenharia_protocolos for select to authenticated
  using (public.pode_ver_documentos_engenharia(obra_id));
alter table public.obra_engenharia_protocolo_eventos enable row level security;
create policy "ver eventos dos protocolos" on public.obra_engenharia_protocolo_eventos for select to authenticated
  using (public.pode_ver_documentos_engenharia(obra_id));
alter table public.obra_engenharia_exigencias enable row level security;
create policy "ver exigências da engenharia" on public.obra_engenharia_exigencias for select to authenticated
  using (public.pode_ver_documentos_engenharia(obra_id));
alter table public.obra_engenharia_protocolo_documentos enable row level security;
create policy "ver pacote enviado" on public.obra_engenharia_protocolo_documentos for select to authenticated
  using (exists (
    select 1 from public.obra_engenharia_protocolo_eventos e
    where e.id = evento_id and public.pode_ver_documentos_engenharia(e.obra_id)
  ));
alter table public.obra_engenharia_protocolo_arquivos enable row level security;
create policy "ver arquivos dos protocolos" on public.obra_engenharia_protocolo_arquivos for select to authenticated
  using (public.pode_ver_documentos_engenharia(obra_id));

revoke all on public.obra_engenharia_protocolos, public.obra_engenharia_protocolo_eventos, public.obra_engenharia_exigencias,
  public.obra_engenharia_protocolo_documentos, public.obra_engenharia_protocolo_arquivos from anon;
revoke insert, update, delete, truncate on public.obra_engenharia_protocolos, public.obra_engenharia_protocolo_eventos,
  public.obra_engenharia_exigencias, public.obra_engenharia_protocolo_documentos, public.obra_engenharia_protocolo_arquivos
  from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Histórico
-- ---------------------------------------------------------------------------

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado'
));

-- ---------------------------------------------------------------------------
-- Etapa do setor: gravação comum e gate G3
-- ---------------------------------------------------------------------------

-- Grava o novo status do setor (a obra já travada e a autorização conferida por quem chama). Mesmas regras de
-- sempre: status_desde = agora; iniciado_em na primeira saída do inicial; concluido_em ao entrar no final e limpo
-- ao sair. Mesmo status: nada muda. `p_origem` vai para o histórico ('manual' ou 'protocolo').
create or replace function public.gravar_status_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_status text, p_aut text, p_origem text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fluxo public.obra_fluxos;
  v_inicial text := case p_setor when 'compras' then 'a_comprar' when 'engenharia' then 'a_iniciar' else 'aguardando_liberacao' end;
  v_final text := case p_setor when 'compras' then 'faturado_fornecedor' else 'concluido' end;
begin
  select * into v_fluxo from public.obra_fluxos where obra_id = p_obra_id and setor = p_setor for update;
  if not found then
    raise exception 'Fluxo do setor não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_fluxo.status = p_status then
    return;
  end if;

  update public.obra_fluxos
  set status = p_status,
      status_desde = now(),
      iniciado_em = case when v_fluxo.iniciado_em is null and p_status <> v_inicial then now() else v_fluxo.iniciado_em end,
      concluido_em = case when p_status = v_final then now() else null end
  where obra_id = p_obra_id and setor = p_setor;

  perform public.registrar_historico_obra(p_obra_id, 'fluxo_alterado', p_setor, jsonb_build_object(
    'campo', 'status',
    'de', v_fluxo.status,
    'para', p_status,
    'autorizacao', p_aut,
    'origem', p_origem
  ));
end;
$$;

-- Troca manual de etapa (mesma assinatura e regras de antes) + gate G3 na Engenharia.
create or replace function public.alterar_status_fluxo_obra(p_obra_id uuid, p_setor public.setor_obra, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_atual text;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, p_setor, true);
  if p_status is null or not (
    (p_setor = 'compras' and p_status in ('a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor'))
    or (p_setor = 'engenharia' and p_status in ('a_iniciar', 'projeto_em_elaboracao', 'enviado_concessionaria', 'aprovado', 'aguardando_vistoria', 'concluido'))
    or (p_setor = 'operacional' and p_status in ('aguardando_liberacao', 'liberada_agendamento', 'agendada', 'em_instalacao', 'instalacao_concluida', 'concluido'))
  ) then
    raise exception 'Status inválido para este setor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_setor = 'engenharia' and p_status not in ('a_iniciar', 'projeto_em_elaboracao') then
    select status into v_atual from public.obra_fluxos where obra_id = p_obra_id and setor = 'engenharia';
    if v_atual in ('a_iniciar', 'projeto_em_elaboracao') and not exists (
      select 1 from public.obra_engenharia_protocolos p
      where p.obra_id = p_obra_id and p.status not in ('cancelado', 'indeferido')
    ) then
      raise exception 'Registre o protocolo da concessionária antes de avançar a Engenharia.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

  perform public.gravar_status_fluxo_obra(p_obra_id, p_setor, p_status, v_aut, 'manual');
end;
$$;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- Hoje no horário de Brasília (datas informadas não podem ser futuras).
create or replace function public.hoje_brasilia()
returns date
language sql stable set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Pacote enviado: a versão mais recente de cada item válido do checklist da obra, ligada ao evento.
create or replace function public.registrar_pacote_protocolo(p_evento_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.obra_engenharia_protocolo_documentos (empresa_id, evento_id, documento_id)
  select distinct on (d.item_id) e.empresa_id, e.id, d.id
  from public.obra_engenharia_protocolo_eventos e
  join public.obra_engenharia_itens i on i.obra_id = e.obra_id and i.status = 'valido'
  join public.obra_engenharia_documentos d on d.item_id = i.id
  where e.id = p_evento_id
  order by d.item_id, d.versao desc;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Registra o protocolo feito no portal da distribuidora (gate G2), guarda o pacote enviado e leva a Engenharia para
-- "Enviado à concessionária" se ela ainda estava antes disso. Obra pausada não aceita (muda a etapa).
create or replace function public.registrar_protocolo_engenharia(
  p_obra_id uuid,
  p_distribuidora text,
  p_canal text,
  p_numero text,
  p_tipo_solicitacao text,
  p_protocolado_em date,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', true);
  v_empresa uuid;
  v_faltam text;
  v_protocolo uuid;
  v_evento uuid;
  v_documentos integer;
  v_etapa text;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;

  if length(btrim(coalesce(p_numero, ''))) not between 1 and 60 then
    raise exception 'Informe o número do protocolo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_distribuidora, ''))) not between 2 and 60 then
    raise exception 'Informe a distribuidora.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_canal is null or p_canal not in ('pew', 'caw', 'atendimento', 'outro') then
    raise exception 'Canal inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo_solicitacao is null or p_tipo_solicitacao not in ('nova_conexao', 'ampliacao', 'regularizacao', 'outro') then
    raise exception 'Tipo de solicitação inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_protocolado_em is null or p_protocolado_em > public.hoje_brasilia() then
    raise exception 'Informe a data do protocolo (não pode ser futura).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_observacao is not null and length(p_observacao) > 1000 then
    raise exception 'Observação muito longa (máximo 1000 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Gate G2: checklist aplicado e obrigatórios resolvidos.
  if not exists (select 1 from public.obra_engenharia_itens where obra_id = p_obra_id) then
    raise exception 'Aplique o checklist e resolva os itens obrigatórios antes de registrar o protocolo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select string_agg(titulo, '; ' order by ordem) into v_faltam
  from public.obra_engenharia_itens
  where obra_id = p_obra_id and obrigatorio and status not in ('valido', 'dispensado');
  if v_faltam is not null then
    raise exception 'Itens obrigatórios do checklist ainda não resolvidos: %.', v_faltam using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if exists (
    select 1 from public.obra_engenharia_protocolos
    where obra_id = p_obra_id and status not in ('indeferido', 'cancelado', 'encerrado')
  ) then
    raise exception 'Esta obra já tem um protocolo em andamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_engenharia_protocolos (empresa_id, obra_id, distribuidora, canal, numero, tipo_solicitacao, protocolado_em, observacao, registrado_por)
  values (v_empresa, p_obra_id, btrim(p_distribuidora), p_canal, btrim(p_numero), p_tipo_solicitacao, p_protocolado_em,
    nullif(btrim(coalesce(p_observacao, '')), ''), public.meu_membro_id(v_empresa))
  returning id into v_protocolo;

  insert into public.obra_engenharia_protocolo_eventos (empresa_id, obra_id, protocolo_id, tipo, status_de, status_para, ocorrido_em, autor_membro_id)
  values (v_empresa, p_obra_id, v_protocolo, 'registrado', null, 'protocolado', p_protocolado_em, public.meu_membro_id(v_empresa))
  returning id into v_evento;
  v_documentos := public.registrar_pacote_protocolo(v_evento);

  perform public.registrar_historico_obra(p_obra_id, 'protocolo_engenharia_registrado', 'engenharia', jsonb_build_object(
    'distribuidora', btrim(p_distribuidora),
    'canal', p_canal,
    'documentos', v_documentos,
    'autorizacao', v_aut
  ));

  select status into v_etapa from public.obra_fluxos where obra_id = p_obra_id and setor = 'engenharia';
  if v_etapa in ('a_iniciar', 'projeto_em_elaboracao') then
    perform public.gravar_status_fluxo_obra(p_obra_id, 'engenharia', 'enviado_concessionaria', v_aut, 'protocolo');
  end if;
  return v_protocolo;
end;
$$;

-- Registra a resposta da distribuidora (ou o reenvio) no protocolo. Transições:
--  protocolado → em_analise | exigencia | aprovado | orcamento_emitido | indeferido | cancelado
--  em_analise → exigencia | aprovado | orcamento_emitido | indeferido | cancelado
--  com_exigencia → exigencia (outra) | reenvio (volta a em_analise) | indeferido | cancelado
--  aprovado | orcamento_emitido → encerrado | cancelado
-- Exigência exige categoria e texto; indeferido e cancelado exigem descrição. Reenvio guarda o novo pacote e marca as
-- exigências abertas como reenviadas; aprovado, orçamento e encerrado resolvem as exigências pendentes.
create or replace function public.registrar_evento_protocolo_engenharia(
  p_protocolo_id uuid,
  p_tipo text,
  p_ocorrido_em date,
  p_descricao text default null,
  p_categoria text default null,
  p_prazo_interno date default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_p public.obra_engenharia_protocolos;
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_para text;
  v_evento uuid;
begin
  select obra_id into v_obra from public.obra_engenharia_protocolos where id = p_protocolo_id;
  v_aut := public.preparar_escrita_obra(v_obra, 'engenharia', false);
  select * into v_p from public.obra_engenharia_protocolos where id = p_protocolo_id for update;

  if p_tipo is null or p_tipo not in ('em_analise', 'exigencia', 'reenvio', 'aprovado', 'orcamento_emitido', 'indeferido', 'cancelado', 'encerrado') then
    raise exception 'Tipo de registro inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not (
    (v_p.status = 'protocolado' and p_tipo in ('em_analise', 'exigencia', 'aprovado', 'orcamento_emitido', 'indeferido', 'cancelado'))
    or (v_p.status = 'em_analise' and p_tipo in ('exigencia', 'aprovado', 'orcamento_emitido', 'indeferido', 'cancelado'))
    or (v_p.status = 'com_exigencia' and p_tipo in ('exigencia', 'reenvio', 'indeferido', 'cancelado'))
    or (v_p.status in ('aprovado', 'orcamento_emitido') and p_tipo in ('encerrado', 'cancelado'))
  ) then
    raise exception 'Este registro não cabe na situação atual do protocolo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_ocorrido_em is null or p_ocorrido_em > public.hoje_brasilia() or p_ocorrido_em < v_p.protocolado_em then
    raise exception 'Informe a data (entre o protocolo e hoje).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_desc is not null and length(v_desc) > 4000 then
    raise exception 'Texto muito longo (máximo 4000 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo in ('exigencia', 'indeferido', 'cancelado') and (v_desc is null or length(v_desc) < 3) then
    raise exception 'Descreva o que a distribuidora informou.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo = 'exigencia' and (p_categoria is null or p_categoria not in (
    'cadastral', 'documento_faltante', 'documento_ilegivel', 'projeto_eletrico', 'art', 'inversor', 'protecao', 'padrao_entrada', 'rede', 'outro'
  )) then
    raise exception 'Escolha a categoria da exigência.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo = 'reenvio' and not exists (
    select 1 from public.obra_engenharia_exigencias where protocolo_id = v_p.id and status = 'aberta'
  ) then
    raise exception 'Não há exigência aberta para reenviar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_para := case p_tipo when 'exigencia' then 'com_exigencia' when 'reenvio' then 'em_analise' else p_tipo end;

  insert into public.obra_engenharia_protocolo_eventos (empresa_id, obra_id, protocolo_id, tipo, status_de, status_para, ocorrido_em, descricao, autor_membro_id)
  values (v_p.empresa_id, v_p.obra_id, v_p.id, p_tipo, v_p.status, v_para, p_ocorrido_em, v_desc, public.meu_membro_id(v_p.empresa_id))
  returning id into v_evento;

  if p_tipo = 'exigencia' then
    insert into public.obra_engenharia_exigencias (empresa_id, obra_id, protocolo_id, evento_id, categoria, descricao, prazo_interno)
    values (v_p.empresa_id, v_p.obra_id, v_p.id, v_evento, p_categoria, v_desc, p_prazo_interno);
  elsif p_tipo = 'reenvio' then
    update public.obra_engenharia_exigencias set status = 'reenviada' where protocolo_id = v_p.id and status = 'aberta';
    perform public.registrar_pacote_protocolo(v_evento);
  elsif p_tipo in ('aprovado', 'orcamento_emitido', 'encerrado') then
    update public.obra_engenharia_exigencias set status = 'resolvida', resolvida_em = now()
    where protocolo_id = v_p.id and status <> 'resolvida';
  end if;

  update public.obra_engenharia_protocolos set status = v_para where id = v_p.id;

  perform public.registrar_historico_obra(v_p.obra_id, 'protocolo_engenharia_atualizado', 'engenharia', jsonb_build_object(
    'tipo', p_tipo,
    'de', v_p.status,
    'para', v_para,
    'categoria', case when p_tipo = 'exigencia' then p_categoria end,
    'autorizacao', v_aut
  ));
  return v_evento;
end;
$$;

-- Anexa ao evento um arquivo que o navegador já enviou à pasta da obra (comprovante, ofício, orçamento…). Mesmas
-- conferências dos documentos do checklist; nada se apaga.
create or replace function public.registrar_arquivo_protocolo_engenharia(p_evento_id uuid, p_caminho text, p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_e public.obra_engenharia_protocolo_eventos;
  v_objeto record;
  v_id uuid;
begin
  select obra_id into v_obra from public.obra_engenharia_protocolo_eventos where id = p_evento_id;
  v_aut := public.preparar_escrita_obra(v_obra, 'engenharia', false);
  select * into v_e from public.obra_engenharia_protocolo_eventos where id = p_evento_id;

  if public.obra_da_pasta_engenharia(p_caminho) is distinct from v_e.obra_id then
    raise exception 'O arquivo não está na pasta desta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_nome, ''))) not between 1 and 200 then
    raise exception 'Nome do arquivo inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select o.metadata into v_objeto
  from storage.objects o
  where o.bucket_id = 'engenharia-documentos' and o.name = p_caminho and o.owner_id = (select auth.uid())::text;
  if not found then
    raise exception 'Arquivo não encontrado no armazenamento. Envie de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce((v_objeto.metadata ->> 'size')::bigint, 0) <= 0 then
    raise exception 'O arquivo está vazio.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_engenharia_protocolo_arquivos (empresa_id, obra_id, evento_id, caminho, nome, tamanho, tipo_mime, enviado_por)
  values (v_e.empresa_id, v_e.obra_id, v_e.id, p_caminho, btrim(p_nome), (v_objeto.metadata ->> 'size')::bigint,
    nullif(v_objeto.metadata ->> 'mimetype', ''), public.meu_membro_id(v_e.empresa_id))
  on conflict (caminho) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Este arquivo já está registrado.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;
  return v_id;
end;
$$;

-- Internas: ninguém executa pela API.
revoke all on function public.gravar_status_fluxo_obra(uuid, public.setor_obra, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.registrar_pacote_protocolo(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hoje_brasilia() from public, anon;
-- RPCs de cliente.
revoke all on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) from public, anon, authenticated, service_role;
grant execute on function public.alterar_status_fluxo_obra(uuid, public.setor_obra, text) to authenticated;
revoke all on function public.registrar_protocolo_engenharia(uuid, text, text, text, text, date, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_protocolo_engenharia(uuid, text, text, text, text, date, text) to authenticated;
revoke all on function public.registrar_evento_protocolo_engenharia(uuid, text, date, text, text, date) from public, anon, authenticated, service_role;
grant execute on function public.registrar_evento_protocolo_engenharia(uuid, text, date, text, text, date) to authenticated;
revoke all on function public.registrar_arquivo_protocolo_engenharia(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_arquivo_protocolo_engenharia(uuid, text, text) to authenticated;

reset lock_timeout;
