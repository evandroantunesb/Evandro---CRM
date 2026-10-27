-- Orçamento do fornecedor, aprovação técnica e pedido de compra na mesma Obra.
-- Cada alteração gera uma nova versão; a linha antiga nunca é sobrescrita.

create table public.obra_compras_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  tipo text not null check (tipo in ('orcamento', 'pedido')),
  versao integer not null check (versao > 0),
  orcamento_id uuid references public.obra_compras_documentos (id),
  fornecedor text not null check (length(trim(fornecedor)) between 1 and 200),
  valor numeric(14,2) check (valor is null or valor >= 0),
  caminho text not null unique,
  nome text not null check (length(trim(nome)) between 1 and 200),
  tamanho bigint not null check (tamanho > 0 and tamanho <= 20971520),
  tipo_mime text not null check (tipo_mime in ('application/pdf', 'image/png', 'image/jpeg')),
  revisao text check (revisao in ('pendente', 'aprovado', 'reprovado')),
  revisado_por uuid references public.empresa_membros (id),
  revisado_em timestamptz,
  motivo_reprovacao text check (motivo_reprovacao is null or length(trim(motivo_reprovacao)) between 1 and 1000),
  anexado_por uuid not null references public.empresa_membros (id),
  anexado_em timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  unique (obra_id, tipo, versao),
  constraint compra_documento_tipo_coerente check (
    (tipo = 'orcamento' and orcamento_id is null and revisao is not null)
    or (tipo = 'pedido' and orcamento_id is not null and revisao is null)
  ),
  constraint compra_documento_revisao_coerente check (
    (revisao = 'pendente' and revisado_por is null and revisado_em is null and motivo_reprovacao is null)
    or (revisao = 'aprovado' and revisado_por is not null and revisado_em is not null and motivo_reprovacao is null)
    or (revisao = 'reprovado' and revisado_por is not null and revisado_em is not null and motivo_reprovacao is not null)
    or (revisao is null and revisado_por is null and revisado_em is null and motivo_reprovacao is null)
  )
);
create index obra_compras_documentos_lista_idx on public.obra_compras_documentos (obra_id, tipo, versao desc);
create unique index obra_compras_um_pedido_por_orcamento on public.obra_compras_documentos (orcamento_id) where tipo = 'pedido';
alter table public.obra_compras_documentos enable row level security;
revoke insert, update, delete, truncate on public.obra_compras_documentos from anon, authenticated, service_role;

create or replace function public.pode_revisar_orcamento_obra(p_obra_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.obras o
    where o.id = p_obra_id and (
      public.tem_papel(o.empresa_id, '{admin}')
      or (
        public.tem_papel(o.empresa_id, '{operacao}')
        and exists (
          select 1 from public.obra_participantes p
          where p.obra_id = o.id and p.empresa_id = o.empresa_id
            and p.setor = 'operacional' and p.principal and p.fim is null
            and p.membro_id = public.meu_membro_id(o.empresa_id)
        )
      )
    )
  );
$$;
revoke all on function public.pode_revisar_orcamento_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_revisar_orcamento_obra(uuid) to authenticated;

create or replace function public.pode_ver_documentos_compras_obra(p_obra_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.autorizacao_setor_obra(p_obra_id, 'compras') is not null
    or public.pode_revisar_orcamento_obra(p_obra_id)
    or public.autorizacao_setor_obra(p_obra_id, 'operacional') = 'coordenar';
$$;
revoke all on function public.pode_ver_documentos_compras_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_documentos_compras_obra(uuid) to authenticated;

create policy "ver documentos de compras da obra" on public.obra_compras_documentos
  for select to authenticated using (public.pode_ver_documentos_compras_obra(obra_id));

-- O bucket é privado. O nome do objeto é um UUID, separado do nome original do arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('obra-compras', 'obra-compras', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.pode_acessar_arquivo_compras(p_caminho text, p_escrever boolean)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_obra uuid;
begin
  if p_caminho is null or p_caminho !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/compras/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg)$' then
    return false;
  end if;
  v_empresa := split_part(p_caminho, '/', 1)::uuid;
  v_obra := split_part(p_caminho, '/', 2)::uuid;
  if not exists (select 1 from public.obras o where o.id = v_obra and o.empresa_id = v_empresa) then
    return false;
  end if;
  if p_escrever then
    return public.autorizacao_setor_obra(v_obra, 'compras') is not null;
  end if;
  return public.pode_ver_documentos_compras_obra(v_obra);
end;
$$;
revoke all on function public.pode_acessar_arquivo_compras(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.pode_acessar_arquivo_compras(text, boolean) to authenticated;

create policy "obra compras: ler" on storage.objects for select to authenticated
  using (bucket_id = 'obra-compras' and public.pode_acessar_arquivo_compras(name, false));
create policy "obra compras: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'obra-compras' and public.pode_acessar_arquivo_compras(name, true));

create or replace function public.registrar_documento_compras_obra(
  p_obra_id uuid, p_tipo text, p_caminho text, p_nome text,
  p_fornecedor text default null, p_valor numeric default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_objeto storage.objects;
  v_ref public.obra_compras_documentos;
  v_id uuid;
  v_versao integer;
  v_mime text;
  v_tamanho bigint;
begin
  perform public.preparar_escrita_obra(p_obra_id, 'compras', true);
  select * into v_obra from public.obras where id = p_obra_id;
  if p_tipo not in ('orcamento', 'pedido') or p_tipo is null then
    raise exception 'Tipo de documento inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_nome is null or length(trim(p_nome)) not between 1 and 200 then
    raise exception 'Informe o nome do arquivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not public.pode_acessar_arquivo_compras(p_caminho, true)
     or p_caminho not like v_obra.empresa_id::text || '/' || p_obra_id::text || '/compras/%' then
    raise exception 'Arquivo fora da pasta de compras desta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_objeto from storage.objects o
    where o.bucket_id = 'obra-compras' and o.name = p_caminho;
  v_mime := v_objeto.metadata ->> 'mimetype';
  v_tamanho := (v_objeto.metadata ->> 'size')::bigint;
  if not found or v_mime not in ('application/pdf', 'image/png', 'image/jpeg')
     or coalesce(v_tamanho, 0) < 1 or v_tamanho > 20971520 then
    raise exception 'Arquivo PDF ou imagem não encontrado no armazenamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if p_tipo = 'orcamento' then
    if p_fornecedor is null or length(trim(p_fornecedor)) not between 1 and 200
       or p_valor is not null and (p_valor < 0 or p_valor > 999999999999.99) then
      raise exception 'Informe o fornecedor e confira o valor do orçamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  else
    select * into v_ref from public.obra_compras_documentos d
      where d.obra_id = p_obra_id and d.tipo = 'orcamento'
      order by d.versao desc limit 1;
    if not found or v_ref.revisao <> 'aprovado' then
      raise exception 'O orçamento mais recente precisa de aprovação técnica antes do pedido.'
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if exists (select 1 from public.obra_compras_documentos d
               where d.orcamento_id = v_ref.id and d.tipo = 'pedido') then
      raise exception 'O pedido deste orçamento já foi registrado.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
    end if;
    p_fornecedor := v_ref.fornecedor;
    p_valor := v_ref.valor;
  end if;

  select coalesce(max(d.versao), 0) + 1 into v_versao from public.obra_compras_documentos d
    where d.obra_id = p_obra_id and d.tipo = p_tipo;
  insert into public.obra_compras_documentos (
    empresa_id, obra_id, tipo, versao, orcamento_id, fornecedor, valor,
    caminho, nome, tamanho, tipo_mime, revisao, anexado_por
  ) values (
    v_obra.empresa_id, p_obra_id, p_tipo, v_versao,
    case when p_tipo = 'pedido' then v_ref.id end,
    trim(p_fornecedor), p_valor, p_caminho, trim(p_nome), v_tamanho, v_mime,
    case when p_tipo = 'orcamento' then 'pendente' end,
    public.meu_membro_id(v_obra.empresa_id)
  ) returning id into v_id;

  if p_tipo = 'orcamento' then
    update public.obra_fluxos set status = 'cotando', status_desde = now(),
      iniciado_em = coalesce(iniciado_em, now()), concluido_em = null
      where obra_id = p_obra_id and setor = 'compras';
  else
    update public.obra_fluxos set status = 'pedido_realizado', status_desde = now(),
      iniciado_em = coalesce(iniciado_em, now()), concluido_em = null
      where obra_id = p_obra_id and setor = 'compras';
  end if;
  perform public.registrar_historico_obra(p_obra_id, 'documento_compras_anexado', 'compras',
    jsonb_build_object('documento_id', v_id, 'tipo', p_tipo, 'versao', v_versao,
      'orcamento_id', case when p_tipo = 'pedido' then v_ref.id end));
  return v_id;
end;
$$;
revoke all on function public.registrar_documento_compras_obra(uuid, text, text, text, text, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.registrar_documento_compras_obra(uuid, text, text, text, text, numeric)
  to authenticated;

create or replace function public.revisar_orcamento_obra(p_documento_id uuid, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_doc public.obra_compras_documentos;
  v_obra public.obras;
begin
  select * into v_doc from public.obra_compras_documentos where id = p_documento_id;
  if not found or v_doc.tipo <> 'orcamento' then
    raise exception 'Orçamento não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_obra from public.obras where id = v_doc.obra_id for update;
  if not public.pode_revisar_orcamento_obra(v_doc.obra_id) then
    raise exception 'Só o responsável técnico principal ou admin pode revisar o orçamento.'
      using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null or v_obra.pausada_em is not null then
    raise exception 'A obra pausada ou cancelada não aceita revisão.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_doc from public.obra_compras_documentos where id = p_documento_id for update;
  if v_doc.revisao <> 'pendente'
     or exists (select 1 from public.obra_compras_documentos d
                where d.obra_id = v_doc.obra_id and d.tipo = 'orcamento' and d.versao > v_doc.versao) then
    raise exception 'Revise apenas o orçamento pendente mais recente.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_aprovar is null or (not p_aprovar and (p_motivo is null or length(trim(p_motivo)) not between 1 and 1000)) then
    raise exception 'Informe o motivo da reprovação.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.obra_compras_documentos set revisao = case when p_aprovar then 'aprovado' else 'reprovado' end,
    revisado_por = public.meu_membro_id(v_obra.empresa_id), revisado_em = now(),
    motivo_reprovacao = case when p_aprovar then null else trim(p_motivo) end
    where id = p_documento_id;
  perform public.registrar_historico_obra(v_doc.obra_id,
    case when p_aprovar then 'orcamento_aprovado' else 'orcamento_reprovado' end,
    'compras', jsonb_build_object('documento_id', v_doc.id, 'versao', v_doc.versao,
      'motivo', case when p_aprovar then null else trim(p_motivo) end));
end;
$$;
revoke all on function public.revisar_orcamento_obra(uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.revisar_orcamento_obra(uuid, boolean, text) to authenticated;
