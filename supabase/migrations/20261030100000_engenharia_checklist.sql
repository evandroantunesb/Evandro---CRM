-- Engenharia (P2): checklist de documentos da obra, com arquivos versionados.
--
-- Especificação v1.3 (29/10/2026), seções 7, OB-08 e 24. Autorizado pelo Evandro ("pode avançar, depois ajustamos").
--
-- O que faz:
--  * `engenharia_checklist_modelo`: itens da empresa (grupo, título, obrigatório, ordem, ativo). Admin cria e edita;
--    membro ativo lê; sem DELETE (desativar). Nasce com a lista inicial da spec (seção 24.2), para revisar com o
--    responsável técnico. Regras condicionais (procuração, ambiental, beneficiárias) ficam para depois: por ora o
--    item opcional é marcado "Não se aplica" com motivo.
--  * `obra_engenharia_itens`: o checklist APLICADO na obra (cópia do modelo; mudar o modelo não muda obra já
--    aplicada). Status: pendente → em_conferencia (sozinho, ao chegar arquivo) → valido | invalido; ou dispensado.
--    Lido por quem vê a obra (como fluxos e marcos); escrita só pelas RPCs.
--  * `obra_engenharia_documentos`: cada arquivo é uma versão do item (1, 2, 3…). Imutável: nem quem enviou apaga;
--    arquivo errado = nova versão + item inválido. Arquivo e registro só para admin e quem atua em Engenharia na obra
--    (`autorizacao_setor_obra`: coordenador do setor ou participante ativo dele). Gestor, comercial e outros setores
--    veem o status do checklist, não os documentos (pessoais: identidade, ART, fatura).
--  * Bucket privado `engenharia-documentos`, pasta `empresa/obra/objeto`.
--  * RPCs: `aplicar_checklist_engenharia`, `registrar_documento_engenharia`, `alterar_item_engenharia`. Todas passam
--    por `preparar_escrita_obra` (trava a obra, confere a autorização, recusa obra cancelada; pausada aceita, como a
--    fixação: é dado da obra). Cada mudança vai para `obra_historico` com o autor real.
--  * Regras (decisões padrão, ajustáveis): marcar válido exige ao menos um arquivo; inválido e dispensado exigem
--    motivo; item obrigatório só é dispensado por admin ou coordenador da Engenharia; arquivo novo em item válido
--    volta para conferência.
-- O que NÃO faz: não muda `obra_fluxos` nem bloqueia etapa (gates entram com protocolos, P3); não cria prazo.
-- Depende de: membro_ativo, tem_papel, meu_membro_id, auditar, tocar_updated_at, pode_ver_obra,
-- pode_ver_obra_operacao, autorizacao_setor_obra, preparar_escrita_obra, registrar_historico_obra.

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Modelo da empresa
-- ---------------------------------------------------------------------------

create table public.engenharia_checklist_modelo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  grupo text not null check (length(btrim(grupo)) between 2 and 60),
  titulo text not null check (length(btrim(titulo)) between 2 and 160),
  descricao text check (descricao is null or length(descricao) <= 500),
  obrigatorio boolean not null default true,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index engenharia_checklist_modelo_titulo_unico on public.engenharia_checklist_modelo (empresa_id, lower(btrim(titulo)));

create or replace function public.proteger_engenharia_checklist_modelo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa do item do checklist não muda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger engenharia_checklist_modelo_proteger before update on public.engenharia_checklist_modelo
  for each row execute function public.proteger_engenharia_checklist_modelo();
create trigger engenharia_checklist_modelo_updated_at before update on public.engenharia_checklist_modelo
  for each row execute function public.tocar_updated_at();
create trigger auditar_engenharia_checklist_modelo after insert or update or delete on public.engenharia_checklist_modelo
  for each row execute function public.auditar();

alter table public.engenharia_checklist_modelo enable row level security;
create policy "ver checklist da engenharia" on public.engenharia_checklist_modelo for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria item do checklist" on public.engenharia_checklist_modelo for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita item do checklist" on public.engenharia_checklist_modelo for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
revoke delete, truncate on public.engenharia_checklist_modelo from anon, authenticated;
revoke all on public.engenharia_checklist_modelo from anon;

-- Lista inicial (spec v1.3, seção 24.2: padrão operacional para a Copel, não relação exaustiva dos formulários).
-- Cada empresa revisa com o responsável técnico, edita e desativa; empresas novas recebem a mesma lista.
create or replace function public.inserir_checklist_engenharia_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.engenharia_checklist_modelo (empresa_id, grupo, titulo, obrigatorio, ordem) values
    (p_empresa_id, 'Cliente e unidade consumidora', 'Fatura recente da unidade consumidora', true, 10),
    (p_empresa_id, 'Cliente e unidade consumidora', 'Documento de identificação do titular (pessoa física ou jurídica)', true, 20),
    (p_empresa_id, 'Cliente e unidade consumidora', 'Procuração e documento do procurador (quando houver representante)', false, 30),
    (p_empresa_id, 'Projeto e responsabilidade técnica', 'Formulário de solicitação de acesso (faixa de potência correta)', true, 40),
    (p_empresa_id, 'Projeto e responsabilidade técnica', 'ART de projeto e execução', true, 50),
    (p_empresa_id, 'Projeto e responsabilidade técnica', 'Diagrama unifilar', true, 60),
    (p_empresa_id, 'Projeto e responsabilidade técnica', 'Memorial descritivo', true, 70),
    (p_empresa_id, 'Equipamentos', 'Datasheet dos módulos', true, 80),
    (p_empresa_id, 'Equipamentos', 'Datasheet e certificado do inversor', true, 90),
    (p_empresa_id, 'Condicionais', 'Licença ambiental ou justificativa de não aplicabilidade', false, 100),
    (p_empresa_id, 'Condicionais', 'Formulário de beneficiárias (autoconsumo remoto ou geração compartilhada)', false, 110)
  on conflict (empresa_id, lower(btrim(titulo))) do nothing;
$$;
revoke all on function public.inserir_checklist_engenharia_padrao(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_checklist_engenharia_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.inserir_checklist_engenharia_padrao(new.id);
  return null;
end;
$$;
revoke all on function public.criar_checklist_engenharia_empresa() from public, anon, authenticated, service_role;
create trigger empresas_checklist_engenharia after insert on public.empresas
  for each row execute function public.criar_checklist_engenharia_empresa();

select public.inserir_checklist_engenharia_padrao(id) from public.empresas;

-- ---------------------------------------------------------------------------
-- Checklist aplicado na obra
-- ---------------------------------------------------------------------------

create table public.obra_engenharia_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  modelo_id uuid not null,
  grupo text not null,
  titulo text not null,
  descricao text,
  obrigatorio boolean not null,
  ordem integer not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_conferencia', 'valido', 'invalido', 'dispensado')),
  motivo text check (motivo is null or length(motivo) <= 500),
  atualizado_por uuid,
  atualizado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (empresa_id, id),
  unique (obra_id, modelo_id),
  -- Inválido e dispensado sempre dizem por quê; os outros não carregam motivo antigo.
  constraint obra_engenharia_itens_motivo check ((status in ('invalido', 'dispensado')) = (motivo is not null)),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, modelo_id) references public.engenharia_checklist_modelo (empresa_id, id)
);
create index on public.obra_engenharia_itens (obra_id, ordem);
create index on public.obra_engenharia_itens (modelo_id);

alter table public.obra_engenharia_itens enable row level security;
create policy "ver checklist da obra" on public.obra_engenharia_itens for select to authenticated
  using (public.pode_ver_obra(obra_id) or public.pode_ver_obra_operacao(obra_id));
revoke all on public.obra_engenharia_itens from anon;
revoke insert, update, delete, truncate on public.obra_engenharia_itens from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Documentos (versões) e Storage
-- ---------------------------------------------------------------------------

-- Admin e quem atua em Engenharia na obra (coordenador do setor ou participante ativo).
create or replace function public.pode_ver_documentos_engenharia(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_obra_id is not null and public.autorizacao_setor_obra(p_obra_id, 'engenharia') is not null;
$$;

create table public.obra_engenharia_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  item_id uuid not null,
  versao integer not null check (versao > 0),
  caminho text not null unique,
  nome text not null check (length(btrim(nome)) between 1 and 200),
  tamanho bigint not null check (tamanho > 0),
  tipo_mime text,
  enviado_por uuid,
  created_at timestamptz not null default now(),
  unique (item_id, versao),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, item_id) references public.obra_engenharia_itens (empresa_id, id) on delete cascade
);
create index on public.obra_engenharia_documentos (obra_id, created_at);

alter table public.obra_engenharia_documentos enable row level security;
create policy "ver documentos da engenharia" on public.obra_engenharia_documentos for select to authenticated
  using (public.pode_ver_documentos_engenharia(obra_id));
revoke all on public.obra_engenharia_documentos from anon;
revoke insert, update, delete, truncate on public.obra_engenharia_documentos from authenticated, service_role;

-- Obra da pasta `empresa/obra/objeto`, ou nulo se o caminho não tem esse formato ou a empresa não confere.
create or replace function public.obra_da_pasta_engenharia(p_caminho text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_obra uuid;
  v_empresa uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[3] = '' then
    return null;
  end if;
  begin
    v_empresa := v_partes[1]::uuid;
    v_obra := v_partes[2]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return (select o.id from public.obras o where o.id = v_obra and o.empresa_id = v_empresa);
end;
$$;

-- Storage: ler e enviar quem vê os documentos; enviar só com a obra não cancelada. Nunca remover.
create or replace function public.pode_ver_pasta_engenharia(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.pode_ver_documentos_engenharia(public.obra_da_pasta_engenharia(p_caminho)), false);
$$;

create or replace function public.pode_enviar_pasta_engenharia(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select o.cancelada_em is null and public.pode_ver_documentos_engenharia(o.id)
    from public.obras o where o.id = public.obra_da_pasta_engenharia(p_caminho)
  ), false);
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('engenharia-documentos', 'engenharia-documentos', false, 20971520)
on conflict (id) do nothing;

create policy "engenharia-documentos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'engenharia-documentos' and public.pode_ver_pasta_engenharia(name));
create policy "engenharia-documentos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'engenharia-documentos' and public.pode_enviar_pasta_engenharia(name));

-- ---------------------------------------------------------------------------
-- Histórico
-- ---------------------------------------------------------------------------

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado'
));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Copia para a obra os itens ativos do modelo que ela ainda não tem. Repetir só acrescenta o que entrou no modelo
-- depois (é a decisão explícita de atualizar); nada é removido nem reescrito. Devolve quantos itens entraram.
create or replace function public.aplicar_checklist_engenharia(p_obra_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_empresa uuid;
  v_novos integer;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  insert into public.obra_engenharia_itens (empresa_id, obra_id, modelo_id, grupo, titulo, descricao, obrigatorio, ordem)
  select v_empresa, p_obra_id, m.id, btrim(m.grupo), btrim(m.titulo), m.descricao, m.obrigatorio, m.ordem
  from public.engenharia_checklist_modelo m
  where m.empresa_id = v_empresa and m.ativo
  on conflict (obra_id, modelo_id) do nothing;
  get diagnostics v_novos = row_count;
  if v_novos > 0 then
    perform public.registrar_historico_obra(p_obra_id, 'checklist_engenharia_aplicado', 'engenharia',
      jsonb_build_object('itens', v_novos, 'autorizacao', v_aut));
  end if;
  return v_novos;
end;
$$;

-- Registra um arquivo que o navegador já enviou à pasta da obra, como nova versão do item. Não confia no
-- navegador: a pasta tem de ser da obra do item e o objeto, enviado por quem chama e não vazio; tamanho e tipo vêm
-- do Storage. Item pendente, em conferência, válido ou inválido volta para conferência; dispensado fica como está.
create or replace function public.registrar_documento_engenharia(p_item_id uuid, p_caminho text, p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_item public.obra_engenharia_itens;
  v_objeto record;
  v_versao integer;
  v_id uuid;
begin
  select obra_id into v_obra from public.obra_engenharia_itens where id = p_item_id;
  -- Sem item: preparar_escrita_obra responde "sem permissão" (mesma resposta para o que a pessoa não vê).
  v_aut := public.preparar_escrita_obra(v_obra, 'engenharia', false);
  select * into v_item from public.obra_engenharia_itens where id = p_item_id for update;

  if public.obra_da_pasta_engenharia(p_caminho) is distinct from v_item.obra_id then
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

  -- A obra está travada: a próxima versão não corre risco de repetir.
  select coalesce(max(versao), 0) + 1 into v_versao from public.obra_engenharia_documentos where item_id = v_item.id;
  insert into public.obra_engenharia_documentos (empresa_id, obra_id, item_id, versao, caminho, nome, tamanho, tipo_mime, enviado_por)
  values (v_item.empresa_id, v_item.obra_id, v_item.id, v_versao, p_caminho, btrim(p_nome),
    (v_objeto.metadata ->> 'size')::bigint, nullif(v_objeto.metadata ->> 'mimetype', ''), public.meu_membro_id(v_item.empresa_id))
  on conflict (caminho) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Este arquivo já está registrado.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;

  if v_item.status <> 'dispensado' then
    update public.obra_engenharia_itens
    set status = 'em_conferencia', motivo = null, atualizado_por = public.meu_membro_id(v_item.empresa_id), atualizado_em = now()
    where id = v_item.id;
  end if;

  perform public.registrar_historico_obra(v_item.obra_id, 'documento_engenharia_enviado', 'engenharia', jsonb_build_object(
    'item', v_item.titulo,
    'arquivo', btrim(p_nome),
    'versao', v_versao,
    'autorizacao', v_aut
  ));
  return v_id;
end;
$$;

-- Confere um item: válido (exige arquivo), inválido (motivo), dispensado (motivo; obrigatório só admin ou
-- coordenador da Engenharia) ou de volta a pendente. "Em conferência" só nasce do envio de arquivo.
create or replace function public.alterar_item_engenharia(p_item_id uuid, p_status text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra uuid;
  v_aut text;
  v_item public.obra_engenharia_itens;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select obra_id into v_obra from public.obra_engenharia_itens where id = p_item_id;
  v_aut := public.preparar_escrita_obra(v_obra, 'engenharia', false);
  select * into v_item from public.obra_engenharia_itens where id = p_item_id for update;

  if p_status is null or p_status not in ('pendente', 'valido', 'invalido', 'dispensado') then
    raise exception 'Situação inválida para o item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_status in ('invalido', 'dispensado') then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'Informe o motivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if length(v_motivo) > 500 then
      raise exception 'Motivo muito longo (máximo 500 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  else
    v_motivo := null;
  end if;
  if p_status = 'valido' and not exists (select 1 from public.obra_engenharia_documentos d where d.item_id = v_item.id) then
    raise exception 'Anexe o arquivo antes de marcar o item como válido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_status = 'dispensado' and v_item.obrigatorio and v_aut not in ('admin', 'coordenar') then
    raise exception 'Só o admin ou o coordenador da Engenharia dispensa item obrigatório.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_item.status = p_status and v_item.motivo is not distinct from v_motivo then
    return;
  end if;

  update public.obra_engenharia_itens
  set status = p_status, motivo = v_motivo, atualizado_por = public.meu_membro_id(v_item.empresa_id), atualizado_em = now()
  where id = v_item.id;

  perform public.registrar_historico_obra(v_item.obra_id, 'item_engenharia_alterado', 'engenharia', jsonb_build_object(
    'item', v_item.titulo,
    'de', v_item.status,
    'para', p_status,
    'motivo', v_motivo,
    'autorizacao', v_aut
  ));
end;
$$;

-- Internas: ninguém executa pela API.
revoke all on function public.proteger_engenharia_checklist_modelo() from public, anon, authenticated, service_role;
revoke all on function public.obra_da_pasta_engenharia(text) from public, anon, authenticated, service_role;
-- Usadas nas policies (tabela e Storage): só `authenticated`.
revoke all on function public.pode_ver_documentos_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_documentos_engenharia(uuid) to authenticated;
revoke all on function public.pode_ver_pasta_engenharia(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pasta_engenharia(text) to authenticated;
revoke all on function public.pode_enviar_pasta_engenharia(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_enviar_pasta_engenharia(text) to authenticated;
-- RPCs de cliente.
revoke all on function public.aplicar_checklist_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.aplicar_checklist_engenharia(uuid) to authenticated;
revoke all on function public.registrar_documento_engenharia(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_documento_engenharia(uuid, text, text) to authenticated;
revoke all on function public.alterar_item_engenharia(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.alterar_item_engenharia(uuid, text, text) to authenticated;

reset lock_timeout;
