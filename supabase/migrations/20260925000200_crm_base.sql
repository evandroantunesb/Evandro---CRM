-- Entrega 2: CRM base. Funis, etapas, origens, contatos, negócios e histórico.

create type public.status_negocio as enum ('aberto', 'ganho', 'perdido');
create type public.tipo_pessoa as enum ('pf', 'pj');

-- Numeração sequencial de negócios por empresa (#1, #2, ...).
alter table public.empresas add column seq_negocio integer not null default 0;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.funis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  funil_id uuid not null references public.funis (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null default 0,
  inicial boolean not null default false,
  ativa boolean not null default true,
  cor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.etapas (funil_id, ordem);
-- No máximo uma etapa inicial por funil.
create unique index etapas_uma_inicial_por_funil on public.etapas (funil_id) where inicial;

create table public.origens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  cor text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo public.tipo_pessoa not null default 'pf',
  nome text not null check (length(trim(nome)) > 0),
  telefone text,
  telefone_digitos text generated always as (nullif(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), '')) stored,
  telefone2 text,
  email citext,
  documento text,
  cidade text,
  uf text,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.contatos (empresa_id, telefone_digitos);
create index on public.contatos (empresa_id, email);
create index on public.contatos (empresa_id, lower(nome) text_pattern_ops);

create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  numero integer not null default 0, -- preenchido pelo gatilho
  titulo text not null check (length(trim(titulo)) > 0),
  contato_id uuid not null references public.contatos (id) on delete restrict,
  funil_id uuid not null references public.funis (id) on delete restrict,
  etapa_id uuid not null references public.etapas (id) on delete restrict,
  origem_id uuid references public.origens (id) on delete set null,
  responsavel_id uuid references public.empresa_membros (id) on delete set null,
  valor numeric(14, 2) check (valor is null or valor >= 0),
  descricao text,
  status public.status_negocio not null default 'aberto',
  fechado_em timestamptz,
  etapa_desde timestamptz not null default now(),
  criado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index on public.negocios (empresa_id, funil_id, status, etapa_id);
create index on public.negocios (responsavel_id);
create index on public.negocios (contato_id);

-- Tempo em cada etapa (base das métricas de conversão).
create table public.historico_etapas (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  etapa_id uuid not null references public.etapas (id) on delete cascade,
  entrou_em timestamptz not null default now(),
  saiu_em timestamptz,
  movido_por uuid
);
create index on public.historico_etapas (negocio_id, entrou_em);

-- Linha do tempo do negócio: fonte de verdade operacional.
create table public.atividades (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  negocio_id uuid references public.negocios (id) on delete cascade,
  contato_id uuid references public.contatos (id) on delete cascade,
  tipo text not null,
  ator_id uuid,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.atividades (negocio_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Permissões por hierarquia
-- ---------------------------------------------------------------------------

-- id do vínculo (empresa_membros) de quem está logado na empresa.
create or replace function public.meu_membro_id(p_empresa_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.empresa_membros m
  join public.empresas e on e.id = m.empresa_id
  where m.empresa_id = p_empresa_id
    and m.user_id = (select auth.uid())
    and m.ativo
    and e.situacao = 'ativa';
$$;

-- Quem vê os negócios de um responsável:
--   admin: todos da empresa;
--   o próprio responsável;
--   gestor de uma equipe da qual o responsável faz parte.
-- Negócio sem responsável é visto por admin e por quem tem papel de gestor.
create or replace function public.pode_ver_responsavel(p_empresa_id uuid, p_responsavel_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with eu as (
    select m.id, m.papel
    from public.empresa_membros m
    join public.empresas e on e.id = m.empresa_id
    where m.empresa_id = p_empresa_id
      and m.user_id = (select auth.uid())
      and m.ativo
      and e.situacao = 'ativa'
  )
  select exists (
    select 1 from eu
    where eu.papel = 'admin'
       or eu.id = p_responsavel_id
       or (p_responsavel_id is null and eu.papel = 'gestor')
       or exists (
         select 1
         from public.equipe_membros minha
         join public.equipe_membros dele on dele.equipe_id = minha.equipe_id
         join public.equipes eq on eq.id = minha.equipe_id and eq.ativa
         where minha.membro_id = eu.id
           and minha.e_gestor
           and dele.membro_id = p_responsavel_id
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

create trigger funis_updated_at before update on public.funis
  for each row execute function public.tocar_updated_at();
create trigger etapas_updated_at before update on public.etapas
  for each row execute function public.tocar_updated_at();
create trigger origens_updated_at before update on public.origens
  for each row execute function public.tocar_updated_at();
create trigger contatos_updated_at before update on public.contatos
  for each row execute function public.tocar_updated_at();
create trigger negocios_updated_at before update on public.negocios
  for each row execute function public.tocar_updated_at();

-- Etapa precisa ser do mesmo funil e da mesma empresa.
create or replace function public.validar_etapa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.funis where id = new.funil_id and empresa_id = new.empresa_id) then
    raise exception 'Funil de outra empresa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger etapas_validar before insert or update on public.etapas
  for each row execute function public.validar_etapa();

-- Contato: registra quem criou.
create or replace function public.preparar_contato()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, public.meu_membro_id(new.empresa_id));
  else
    new.criado_por := old.criado_por;
  end if;
  return new;
end;
$$;
create trigger contatos_preparar before insert or update on public.contatos
  for each row execute function public.preparar_contato();

-- Negócio: número sequencial, etapa inicial, responsável padrão e checagem de empresa.
create or replace function public.preparar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := public.meu_membro_id(new.empresa_id);
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
  return new;
end;
$$;
create trigger negocios_preparar before insert or update on public.negocios
  for each row execute function public.preparar_negocio();

-- Histórico, linha do tempo e eventos de domínio.
create or replace function public.registrar_negocio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := (select auth.uid());
  v_tipo text;
begin
  if tg_op = 'INSERT' then
    insert into public.historico_etapas (empresa_id, negocio_id, etapa_id, movido_por)
      values (new.empresa_id, new.id, new.etapa_id, v_ator);
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'negocio_criado', v_ator,
              jsonb_build_object('etapa_id', new.etapa_id, 'origem_id', new.origem_id, 'responsavel_id', new.responsavel_id, 'valor', new.valor));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'deal.created', v_ator, 'negocio', new.id,
              jsonb_build_object('origem_id', new.origem_id, 'responsavel_id', new.responsavel_id, 'valor', new.valor));
    return null;
  end if;

  if new.etapa_id is distinct from old.etapa_id then
    update public.historico_etapas set saiu_em = now()
      where negocio_id = new.id and saiu_em is null;
    insert into public.historico_etapas (empresa_id, negocio_id, etapa_id, movido_por)
      values (new.empresa_id, new.id, new.etapa_id, v_ator);
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'etapa_alterada', v_ator,
              jsonb_build_object('de', old.etapa_id, 'para', new.etapa_id));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'deal.stage_changed', v_ator, 'negocio', new.id,
              jsonb_build_object('de', old.etapa_id, 'para', new.etapa_id, 'responsavel_id', new.responsavel_id));
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'responsavel_alterado', v_ator,
              jsonb_build_object('de', old.responsavel_id, 'para', new.responsavel_id));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id, 'deal.owner_changed', v_ator, 'negocio', new.id,
              jsonb_build_object('de', old.responsavel_id, 'para', new.responsavel_id));
  end if;

  if new.origem_id is distinct from old.origem_id then
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'origem_alterada', v_ator,
              jsonb_build_object('de', old.origem_id, 'para', new.origem_id));
  end if;

  if new.valor is distinct from old.valor then
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, 'valor_alterado', v_ator,
              jsonb_build_object('de', old.valor, 'para', new.valor));
  end if;

  if new.status is distinct from old.status then
    v_tipo := case new.status when 'ganho' then 'negocio_ganho' when 'perdido' then 'negocio_perdido' else 'negocio_reaberto' end;
    insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
      values (new.empresa_id, new.id, new.contato_id, v_tipo, v_ator,
              jsonb_build_object('valor', new.valor));
    insert into public.eventos (empresa_id, tipo, ator_id, entidade, entidade_id, payload)
      values (new.empresa_id,
              case new.status when 'ganho' then 'deal.won' when 'perdido' then 'deal.lost' else 'deal.reopened' end,
              v_ator, 'negocio', new.id,
              jsonb_build_object('valor', new.valor, 'responsavel_id', new.responsavel_id));
  end if;

  return null;
end;
$$;
create trigger negocios_registrar after insert or update on public.negocios
  for each row execute function public.registrar_negocio();

-- Toda empresa nova já nasce com o funil e as origens padrão.
create or replace function public.criar_padroes_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_funil uuid;
begin
  insert into public.funis (empresa_id, nome) values (new.id, 'Vendas') returning id into v_funil;
  insert into public.etapas (empresa_id, funil_id, nome, ordem, inicial) values
    (new.id, v_funil, 'Novo lead', 1, true),
    (new.id, v_funil, 'Contato feito', 2, false),
    (new.id, v_funil, 'Visita agendada', 3, false),
    (new.id, v_funil, 'Proposta enviada', 4, false);
  insert into public.origens (empresa_id, nome) values
    (new.id, 'Meta Ads'), (new.id, 'Google Ads'), (new.id, 'Site'), (new.id, 'Indicação'),
    (new.id, 'Prospecção ativa'), (new.id, 'WhatsApp'), (new.id, 'Evento'), (new.id, 'Parceiro'),
    (new.id, 'Outros');
  return null;
end;
$$;
create trigger empresas_padroes after insert on public.empresas
  for each row execute function public.criar_padroes_empresa();

-- Auditoria das configurações.
create trigger auditar_funis after insert or update or delete on public.funis
  for each row execute function public.auditar();
create trigger auditar_etapas after insert or update or delete on public.etapas
  for each row execute function public.auditar();
create trigger auditar_origens after insert or update or delete on public.origens
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- Busca de duplicados
-- ---------------------------------------------------------------------------

-- Procura contato com o mesmo telefone ou e-mail na empresa, inclusive os que
-- o usuário não enxerga. Para esses, devolve só quem é o responsável, sem os dados.
create or replace function public.buscar_contato_duplicado(p_empresa_id uuid, p_telefone text, p_email text)
returns table (contato_id uuid, nome text, visivel boolean, responsavel_nome text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_digitos text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
begin
  if public.meu_membro_id(p_empresa_id) is null then
    return;
  end if;
  return query
    select
      c.id,
      c.nome,
      public.pode_ver_contato(c.id),
      (
        select p.nome
        from public.negocios n
        join public.empresa_membros m on m.id = n.responsavel_id
        join public.perfis p on p.id = m.user_id
        where n.contato_id = c.id
        order by n.created_at desc
        limit 1
      )
    from public.contatos c
    where c.empresa_id = p_empresa_id
      and (
        (v_digitos is not null and length(v_digitos) >= 8 and c.telefone_digitos = v_digitos)
        or (nullif(trim(p_email), '') is not null and lower(c.email::text) = lower(trim(p_email)))
      )
    limit 5;
end;
$$;

-- Contato visível: admin vê todos; demais veem os que criaram e os ligados a negócios que enxergam.
-- Recebe as colunas da linha (e não só o id) para funcionar também no RETURNING de um insert.
create or replace function public.pode_ver_contato_linha(p_empresa_id uuid, p_contato_id uuid, p_criado_por uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.membro_ativo(p_empresa_id)
    and (
      public.tem_papel(p_empresa_id, '{admin}')
      or p_criado_por = public.meu_membro_id(p_empresa_id)
      or exists (
        select 1 from public.negocios n
        where n.contato_id = p_contato_id
          and public.pode_ver_responsavel(n.empresa_id, n.responsavel_id)
      )
    );
$$;

create or replace function public.pode_ver_contato(p_contato_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.pode_ver_contato_linha(c.empresa_id, c.id, c.criado_por)
    from public.contatos c where c.id = p_contato_id
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.funis enable row level security;
alter table public.etapas enable row level security;
alter table public.origens enable row level security;
alter table public.contatos enable row level security;
alter table public.negocios enable row level security;
alter table public.historico_etapas enable row level security;
alter table public.atividades enable row level security;

-- Configurações: todos da empresa leem, só o admin altera.
create policy "ver funis" on public.funis for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria funis" on public.funis for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita funis" on public.funis for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

create policy "ver etapas" on public.etapas for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria etapas" on public.etapas for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita etapas" on public.etapas for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

create policy "ver origens" on public.origens for select to authenticated using (public.membro_ativo(empresa_id));
create policy "admin cria origens" on public.origens for insert to authenticated with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita origens" on public.origens for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));

-- Contatos. O super-admin não tem acesso (não há exceção para ele aqui).
create policy "ver contatos" on public.contatos for select to authenticated
  using (public.pode_ver_contato_linha(empresa_id, id, criado_por));
create policy "criar contatos" on public.contatos for insert to authenticated with check (public.membro_ativo(empresa_id));
create policy "editar contatos" on public.contatos for update to authenticated
  using (public.pode_ver_contato_linha(empresa_id, id, criado_por)) with check (public.membro_ativo(empresa_id));
create policy "admin apaga contatos" on public.contatos for delete to authenticated using (public.tem_papel(empresa_id, '{admin}'));

-- Negócios.
create policy "ver negócios" on public.negocios for select to authenticated
  using (public.pode_ver_responsavel(empresa_id, responsavel_id));
-- Vendedor só cria para si mesmo; admin e gestor podem escolher quem enxergam.
create policy "criar negócios" on public.negocios for insert to authenticated
  with check (
    public.membro_ativo(empresa_id)
    and (responsavel_id is null or public.pode_ver_responsavel(empresa_id, responsavel_id))
  );
create policy "editar negócios" on public.negocios for update to authenticated
  using (public.pode_ver_responsavel(empresa_id, responsavel_id))
  with check (public.pode_ver_responsavel(empresa_id, responsavel_id));
create policy "admin apaga negócios" on public.negocios for delete to authenticated using (public.tem_papel(empresa_id, '{admin}'));

-- Histórico e linha do tempo: leitura para quem vê o negócio. Escrita só pelos gatilhos.
create policy "ver histórico" on public.historico_etapas for select to authenticated
  using (exists (select 1 from public.negocios n where n.id = negocio_id));
create policy "ver atividades" on public.atividades for select to authenticated
  using (
    (negocio_id is not null and exists (select 1 from public.negocios n where n.id = negocio_id))
    or (negocio_id is null and contato_id is not null and public.pode_ver_contato(contato_id))
  );

revoke update, delete on public.historico_etapas from anon, authenticated;
revoke update, delete on public.atividades from anon, authenticated, service_role;

-- Empresas já existentes recebem os padrões.
do $$
declare
  e record;
  v_funil uuid;
begin
  for e in select id from public.empresas where not exists (select 1 from public.funis f where f.empresa_id = empresas.id) loop
    insert into public.funis (empresa_id, nome) values (e.id, 'Vendas') returning id into v_funil;
    insert into public.etapas (empresa_id, funil_id, nome, ordem, inicial) values
      (e.id, v_funil, 'Novo lead', 1, true),
      (e.id, v_funil, 'Contato feito', 2, false),
      (e.id, v_funil, 'Visita agendada', 3, false),
      (e.id, v_funil, 'Proposta enviada', 4, false);
    insert into public.origens (empresa_id, nome) values
      (e.id, 'Meta Ads'), (e.id, 'Google Ads'), (e.id, 'Site'), (e.id, 'Indicação'),
      (e.id, 'Prospecção ativa'), (e.id, 'WhatsApp'), (e.id, 'Evento'), (e.id, 'Parceiro'),
      (e.id, 'Outros');
  end loop;
end;
$$;
