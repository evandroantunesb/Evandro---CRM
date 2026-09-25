-- Entrega 3: operação do dia a dia. Tarefas, notas, anexos, etiquetas,
-- ganho/perda com motivo e campos obrigatórios por etapa.

create type public.tipo_tarefa as enum ('ligacao', 'whatsapp', 'visita', 'reuniao', 'email', 'outro');

-- ---------------------------------------------------------------------------
-- Configurações
-- ---------------------------------------------------------------------------

create table public.motivos_perda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  cor text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- Campos que o negócio precisa ter preenchidos para entrar na etapa.
alter table public.etapas
  add column campos_obrigatorios text[] not null default '{}'
  check (campos_obrigatorios <@ array[
    'valor', 'origem', 'descricao', 'contato_telefone', 'contato_email', 'contato_documento', 'contato_cidade'
  ]);

alter table public.negocios
  add column motivo_perda_id uuid references public.motivos_perda (id) on delete restrict,
  add column motivo_perda_detalhe text;

-- ---------------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------------

create table public.negocio_etiquetas (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (negocio_id, etiqueta_id)
);
create index on public.negocio_etiquetas (etiqueta_id);

create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid references public.negocios (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  tipo public.tipo_tarefa not null default 'outro',
  vence_em timestamptz not null,
  responsavel_id uuid references public.empresa_membros (id) on delete set null,
  concluida_em timestamptz,
  concluida_por uuid references public.empresa_membros (id) on delete set null,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tarefas (empresa_id, responsavel_id, vence_em) where concluida_em is null;
create index on public.tarefas (negocio_id);

create table public.notas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0 and length(texto) <= 5000),
  autor_id uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notas (negocio_id, created_at desc);

-- Metadados dos arquivos guardados no bucket "anexos".
-- Caminho no bucket: <empresa_id>/<negocio_id>/<arquivo>.
create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  caminho text not null unique,
  tamanho bigint not null check (tamanho >= 0),
  tipo_mime text,
  enviado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.anexos (negocio_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Permissão: quem vê o negócio
-- ---------------------------------------------------------------------------

create or replace function public.pode_ver_negocio(p_negocio_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.pode_ver_responsavel(n.empresa_id, n.responsavel_id)
    from public.negocios n where n.id = p_negocio_id
  ), false);
$$;

-- Usado pelas políticas do Storage: o caminho começa com empresa e negócio.
create or replace function public.pode_ver_pasta_anexo(p_caminho text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_negocio uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 3 then
    return false;
  end if;
  begin
    v_negocio := v_partes[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (
    select 1 from public.negocios n
    where n.id = v_negocio
      and n.empresa_id::text = v_partes[1]
      and public.pode_ver_responsavel(n.empresa_id, n.responsavel_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Negócio: campos obrigatórios, ganho exige valor e perda exige motivo
-- (substitui a versão da entrega 2)
-- ---------------------------------------------------------------------------

-- Erros com hint 'mensagem_usuario' são mostrados como estão na tela.
create or replace function public.preparar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
  v_etapa record;
  v_contato record;
  v_faltando text[] := '{}';
begin
  if tg_op = 'INSERT' then
    update public.empresas set seq_negocio = seq_negocio + 1
      where id = new.empresa_id
      returning seq_negocio into new.numero;
    new.criado_por := v_eu;
    -- Quem cria é o responsável, a não ser que outro tenha sido escolhido.
    new.responsavel_id := coalesce(new.responsavel_id, v_eu);
    if new.etapa_id is null then
      select id into new.etapa_id from public.etapas
        where funil_id = new.funil_id and inicial and ativa;
      if new.etapa_id is null then
        select id into new.etapa_id from public.etapas
          where funil_id = new.funil_id and ativa order by ordem limit 1;
      end if;
    end if;
    new.etapa_desde := now();
    new.status := 'aberto';
    new.motivo_perda_id := null;
    new.motivo_perda_detalhe := null;
  else
    new.numero := old.numero;
    new.criado_por := old.criado_por;
    new.empresa_id := old.empresa_id;
    if new.etapa_id is distinct from old.etapa_id then
      new.etapa_desde := now();
    end if;
    if new.status is distinct from old.status then
      new.fechado_em := case when new.status = 'aberto' then null else now() end;
    end if;
  end if;

  if not exists (select 1 from public.etapas where id = new.etapa_id and funil_id = new.funil_id and empresa_id = new.empresa_id) then
    raise exception 'Etapa não pertence ao funil' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.contatos where id = new.contato_id and empresa_id = new.empresa_id) then
    raise exception 'Contato de outra empresa' using errcode = 'check_violation';
  end if;
  if new.origem_id is not null and not exists (select 1 from public.origens where id = new.origem_id and empresa_id = new.empresa_id) then
    raise exception 'Origem de outra empresa' using errcode = 'check_violation';
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.empresa_membros where id = new.responsavel_id and empresa_id = new.empresa_id and ativo
  ) then
    raise exception 'Responsável precisa ser um usuário ativo da empresa' using errcode = 'check_violation';
  end if;

  -- Perda: motivo obrigatório. Aberto ou ganho: sem motivo.
  if new.status = 'perdido' then
    if new.motivo_perda_id is null then
      raise exception 'Escolha o motivo da perda.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if not exists (select 1 from public.motivos_perda where id = new.motivo_perda_id and empresa_id = new.empresa_id) then
      raise exception 'Motivo de outra empresa' using errcode = 'check_violation';
    end if;
  else
    new.motivo_perda_id := null;
    new.motivo_perda_detalhe := null;
  end if;

  if new.status = 'ganho' and coalesce(new.valor, 0) <= 0
     and (tg_op = 'INSERT' or old.status is distinct from 'ganho' or new.valor is distinct from old.valor) then
    raise exception 'Informe o valor do negócio antes de marcar como ganho.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Campos obrigatórios da etapa: conferidos ao entrar nela.
  if tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id then
    select nome, campos_obrigatorios into v_etapa from public.etapas where id = new.etapa_id;
    if cardinality(v_etapa.campos_obrigatorios) > 0 then
      select telefone, email, documento, cidade into v_contato from public.contatos where id = new.contato_id;
      if 'valor' = any (v_etapa.campos_obrigatorios) and coalesce(new.valor, 0) <= 0 then
        v_faltando := array_append(v_faltando, 'valor');
      end if;
      if 'origem' = any (v_etapa.campos_obrigatorios) and new.origem_id is null then
        v_faltando := array_append(v_faltando, 'origem');
      end if;
      if 'descricao' = any (v_etapa.campos_obrigatorios) and nullif(trim(new.descricao), '') is null then
        v_faltando := array_append(v_faltando, 'descrição');
      end if;
      if 'contato_telefone' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.telefone), '') is null then
        v_faltando := array_append(v_faltando, 'telefone do contato');
      end if;
      if 'contato_email' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.email::text), '') is null then
        v_faltando := array_append(v_faltando, 'e-mail do contato');
      end if;
      if 'contato_documento' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.documento), '') is null then
        v_faltando := array_append(v_faltando, 'CPF/CNPJ do contato');
      end if;
      if 'contato_cidade' = any (v_etapa.campos_obrigatorios) and nullif(trim(v_contato.cidade), '') is null then
        v_faltando := array_append(v_faltando, 'cidade do contato');
      end if;
      if cardinality(v_faltando) > 0 then
        raise exception 'Para entrar em "%", preencha: %.', v_etapa.nome, array_to_string(v_faltando, ', ')
          using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Registra o motivo na linha do tempo quando o negócio é perdido.
create or replace function public.registrar_perda()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'perdido' and old.status is distinct from 'perdido' then
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'motivo_perda', (select auth.uid()),
              jsonb_build_object('motivo_id', new.motivo_perda_id, 'detalhe', new.motivo_perda_detalhe));
  end if;
  return null;
end;
$$;
create trigger negocios_registrar_perda after update of status on public.negocios
  for each row execute function public.registrar_perda();

-- ---------------------------------------------------------------------------
-- Gatilhos das tabelas novas
-- ---------------------------------------------------------------------------

create trigger motivos_perda_updated_at before update on public.motivos_perda
  for each row execute function public.tocar_updated_at();
create trigger etiquetas_updated_at before update on public.etiquetas
  for each row execute function public.tocar_updated_at();
create trigger tarefas_updated_at before update on public.tarefas
  for each row execute function public.tocar_updated_at();
create trigger notas_updated_at before update on public.notas
  for each row execute function public.tocar_updated_at();

create trigger auditar_motivos_perda after insert or update or delete on public.motivos_perda
  for each row execute function public.auditar();
create trigger auditar_etiquetas after insert or update or delete on public.etiquetas
  for each row execute function public.auditar();

-- Etiqueta no negócio: mesma empresa.
create or replace function public.preparar_negocio_etiqueta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select empresa_id into new.empresa_id from public.negocios where id = new.negocio_id;
  if not exists (select 1 from public.etiquetas where id = new.etiqueta_id and empresa_id = new.empresa_id) then
    raise exception 'Etiqueta de outra empresa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger negocio_etiquetas_preparar before insert on public.negocio_etiquetas
  for each row execute function public.preparar_negocio_etiqueta();

-- Tarefa: criador, responsável padrão, quem concluiu e checagem de empresa.
create or replace function public.preparar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
begin
  if tg_op = 'INSERT' then
    new.criado_por := v_eu;
    new.responsavel_id := coalesce(new.responsavel_id, v_eu);
    new.concluida_por := case when new.concluida_em is null then null else v_eu end;
  else
    new.empresa_id := old.empresa_id;
    new.criado_por := old.criado_por;
    if new.concluida_em is distinct from old.concluida_em then
      new.concluida_por := case when new.concluida_em is null then null else v_eu end;
    else
      new.concluida_por := old.concluida_por;
    end if;
  end if;
  if new.negocio_id is not null and not exists (
    select 1 from public.negocios where id = new.negocio_id and empresa_id = new.empresa_id
  ) then
    raise exception 'Negócio de outra empresa' using errcode = 'check_violation';
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.empresa_membros where id = new.responsavel_id and empresa_id = new.empresa_id and ativo
  ) then
    raise exception 'Responsável precisa ser um usuário ativo da empresa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger tarefas_preparar before insert or update on public.tarefas
  for each row execute function public.preparar_tarefa();

create or replace function public.registrar_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_contato uuid;
begin
  if new.negocio_id is not null then
    select contato_id into v_contato from public.negocios where id = new.negocio_id;
  end if;
  if tg_op = 'INSERT' then
    if new.negocio_id is not null then
      insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
        values (new.empresa_id, new.negocio_id, v_contato, 'tarefa_criada', v_ator,
                jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo, 'vence_em', new.vence_em,
                                   'responsavel_id', new.responsavel_id));
    end if;
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'task.created', v_ator, 'tarefa', new.id,
              jsonb_build_object('negocio_id', new.negocio_id, 'tipo', new.tipo, 'responsavel_id', new.responsavel_id));
  elsif new.concluida_em is not null and old.concluida_em is null then
    if new.negocio_id is not null then
      insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
        values (new.empresa_id, new.negocio_id, v_contato, 'tarefa_concluida', v_ator,
                jsonb_build_object('tarefa_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo,
                                   'atrasada', new.concluida_em > new.vence_em));
    end if;
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'task.completed', v_ator, 'tarefa', new.id,
              jsonb_build_object('negocio_id', new.negocio_id, 'tipo', new.tipo, 'responsavel_id', new.responsavel_id,
                                 'no_prazo', new.concluida_em <= new.vence_em));
  end if;
  return null;
end;
$$;
create trigger tarefas_registrar after insert or update on public.tarefas
  for each row execute function public.registrar_tarefa();

-- Nota: autor é quem escreveu e não muda.
create or replace function public.preparar_nota()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := public.meu_membro_id(new.empresa_id);
    if not exists (select 1 from public.negocios where id = new.negocio_id and empresa_id = new.empresa_id) then
      raise exception 'Negócio de outra empresa' using errcode = 'check_violation';
    end if;
  else
    new.autor_id := old.autor_id;
    new.empresa_id := old.empresa_id;
    new.negocio_id := old.negocio_id;
  end if;
  return new;
end;
$$;
create trigger notas_preparar before insert or update on public.notas
  for each row execute function public.preparar_nota();

create or replace function public.registrar_nota()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
    values (new.empresa_id, 'note.created', (select auth.uid()), 'nota', new.id,
            jsonb_build_object('negocio_id', new.negocio_id));
  return null;
end;
$$;
create trigger notas_registrar after insert on public.notas
  for each row execute function public.registrar_nota();

-- Anexo: quem enviou e caminho dentro da pasta do negócio.
create or replace function public.preparar_anexo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.enviado_por := public.meu_membro_id(new.empresa_id);
  if not exists (select 1 from public.negocios where id = new.negocio_id and empresa_id = new.empresa_id) then
    raise exception 'Negócio de outra empresa' using errcode = 'check_violation';
  end if;
  if split_part(new.caminho, '/', 1) <> new.empresa_id::text or split_part(new.caminho, '/', 2) <> new.negocio_id::text then
    raise exception 'Caminho do anexo fora da pasta do negócio' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger anexos_preparar before insert on public.anexos
  for each row execute function public.preparar_anexo();

create or replace function public.registrar_anexo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha public.anexos := case when tg_op = 'DELETE' then old else new end;
  v_contato uuid;
begin
  select contato_id into v_contato from public.negocios where id = v_linha.negocio_id;
  -- Negócio apagado em cascata: não há onde registrar.
  if not found then
    return null;
  end if;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_linha.empresa_id, v_linha.negocio_id, v_contato,
            case when tg_op = 'DELETE' then 'anexo_removido' else 'anexo_adicionado' end,
            (select auth.uid()), jsonb_build_object('nome', v_linha.nome));
  return null;
end;
$$;
create trigger anexos_registrar after insert or delete on public.anexos
  for each row execute function public.registrar_anexo();

-- Motivos de perda padrão para empresas novas e existentes.
create or replace function public.criar_motivos_padrao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.motivos_perda (empresa_id, nome) values
    (new.id, 'Preço'), (new.id, 'Fechou com concorrente'), (new.id, 'Financiamento negado'),
    (new.id, 'Sem retorno do cliente'), (new.id, 'Desistiu do projeto'),
    (new.id, 'Inviável tecnicamente (telhado, estrutura, sombra)'), (new.id, 'Outro');
  return null;
end;
$$;
create trigger empresas_motivos_padrao after insert on public.empresas
  for each row execute function public.criar_motivos_padrao();

insert into public.motivos_perda (empresa_id, nome)
select e.id, m.nome
from public.empresas e
cross join (values ('Preço'), ('Fechou com concorrente'), ('Financiamento negado'), ('Sem retorno do cliente'),
                   ('Desistiu do projeto'), ('Inviável tecnicamente (telhado, estrutura, sombra)'), ('Outro')) as m (nome)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.motivos_perda enable row level security;
alter table public.etiquetas enable row level security;
alter table public.negocio_etiquetas enable row level security;
alter table public.tarefas enable row level security;
alter table public.notas enable row level security;
alter table public.anexos enable row level security;

create policy "ver motivos" on public.motivos_perda for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria motivos" on public.motivos_perda for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita motivos" on public.motivos_perda for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

create policy "ver etiquetas" on public.etiquetas for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria etiquetas" on public.etiquetas for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita etiquetas" on public.etiquetas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

-- Etiquetas do negócio: quem vê o negócio pode marcar e desmarcar.
create policy "ver etiquetas do negócio" on public.negocio_etiquetas for select to authenticated
  using (public.pode_ver_negocio(negocio_id));
create policy "marcar etiqueta" on public.negocio_etiquetas for insert to authenticated
  with check (public.pode_ver_negocio(negocio_id));
create policy "desmarcar etiqueta" on public.negocio_etiquetas for delete to authenticated
  using (public.pode_ver_negocio(negocio_id));

-- Tarefas: o responsável e quem o enxerga, mais quem vê o negócio da tarefa.
create policy "ver tarefas" on public.tarefas for select to authenticated
  using (
    public.membro_ativo(empresa_id)
    and (
      (responsavel_id is not null and public.pode_ver_responsavel(empresa_id, responsavel_id))
      or (negocio_id is not null and public.pode_ver_negocio(negocio_id))
    )
  );
-- Só cria para quem enxerga (vendedor: para si mesmo) e em negócio que vê.
create policy "criar tarefas" on public.tarefas for insert to authenticated
  with check (
    public.membro_ativo(empresa_id)
    and responsavel_id is not null
    and public.pode_ver_responsavel(empresa_id, responsavel_id)
    and (negocio_id is null or public.pode_ver_negocio(negocio_id))
  );
create policy "editar tarefas" on public.tarefas for update to authenticated
  using (
    public.membro_ativo(empresa_id)
    and (
      (responsavel_id is not null and public.pode_ver_responsavel(empresa_id, responsavel_id))
      or (negocio_id is not null and public.pode_ver_negocio(negocio_id))
    )
  )
  with check (
    public.membro_ativo(empresa_id)
    and (
      (responsavel_id is not null and public.pode_ver_responsavel(empresa_id, responsavel_id))
      or (negocio_id is not null and public.pode_ver_negocio(negocio_id))
    )
  );
create policy "apagar tarefas" on public.tarefas for delete to authenticated
  using (criado_por = public.meu_membro_id(empresa_id) or public.tem_papel(empresa_id, '{admin}'));

-- Notas: quem vê o negócio lê e escreve; só o autor edita ou apaga.
create policy "ver notas" on public.notas for select to authenticated using (public.pode_ver_negocio(negocio_id));
create policy "criar notas" on public.notas for insert to authenticated
  with check (public.membro_ativo(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "autor edita nota" on public.notas for update to authenticated
  using (autor_id = public.meu_membro_id(empresa_id)) with check (autor_id = public.meu_membro_id(empresa_id));
create policy "autor apaga nota" on public.notas for delete to authenticated
  using (autor_id = public.meu_membro_id(empresa_id));

-- Anexos: quem vê o negócio vê e envia; quem enviou ou o admin apaga.
create policy "ver anexos" on public.anexos for select to authenticated using (public.pode_ver_negocio(negocio_id));
create policy "enviar anexos" on public.anexos for insert to authenticated
  with check (public.membro_ativo(empresa_id) and public.pode_ver_negocio(negocio_id));
create policy "apagar anexos" on public.anexos for delete to authenticated
  using (
    public.pode_ver_negocio(negocio_id)
    and (enviado_por = public.meu_membro_id(empresa_id) or public.tem_papel(empresa_id, '{admin}'))
  );

-- ---------------------------------------------------------------------------
-- Storage: bucket privado, arquivos até 20 MB
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 20971520)
on conflict (id) do nothing;

-- Envio e leitura só dentro da pasta de um negócio visível.
-- A remoção do arquivo é feita pelo servidor depois de apagar o registro em "anexos".
create policy "anexos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_ver_pasta_anexo(name));
create policy "anexos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_ver_pasta_anexo(name));
