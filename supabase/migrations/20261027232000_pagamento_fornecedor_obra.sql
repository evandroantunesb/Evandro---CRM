-- Pagamento ao fornecedor: autorização explícita, comprovante e NF por pedido.
-- Não representa recebimento do cliente nem executa uma transferência bancária.

alter table public.empresa_membros add column pode_pagar_fornecedor boolean not null default false;

create or replace function public.limpar_permissao_pagamento_fornecedor()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.papel <> 'operacao' or new.status <> 'ativo' then
    new.pode_pagar_fornecedor := false;
  end if;
  return new;
end;
$$;
revoke all on function public.limpar_permissao_pagamento_fornecedor() from public, anon, authenticated, service_role;
create trigger zz_empresa_membros_limpar_pagamento_fornecedor
  before insert or update on public.empresa_membros
  for each row execute function public.limpar_permissao_pagamento_fornecedor();

create or replace function public.pode_gerir_pagamento_fornecedor(p_obra_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.obras o
    where o.id = p_obra_id and (
      public.tem_papel(o.empresa_id, '{admin}')
      or (
        public.tem_papel(o.empresa_id, '{operacao}')
        and public.autorizacao_setor_obra(o.id, 'operacional') is not null
        and exists (
          select 1 from public.empresa_membros m
          where m.empresa_id = o.empresa_id and m.id = public.meu_membro_id(o.empresa_id)
            and m.ativo and m.papel = 'operacao' and m.pode_pagar_fornecedor
        )
      )
    )
  );
$$;
revoke all on function public.pode_gerir_pagamento_fornecedor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_gerir_pagamento_fornecedor(uuid) to authenticated;

-- Talita pode consultar orçamento e pedido mesmo quando não é a principal técnica.
create or replace function public.pode_ver_documentos_compras_obra(p_obra_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.autorizacao_setor_obra(p_obra_id, 'compras') is not null
    or public.pode_revisar_orcamento_obra(p_obra_id)
    or public.autorizacao_setor_obra(p_obra_id, 'operacional') = 'coordenar'
    or public.pode_gerir_pagamento_fornecedor(p_obra_id);
$$;

create table public.obra_pagamentos_fornecedor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  pedido_id uuid not null references public.obra_compras_documentos (id),
  versao integer not null check (versao > 0),
  valor_autorizado numeric(14,2) not null check (valor_autorizado > 0),
  justificativa text check (justificativa is null or length(trim(justificativa)) between 1 and 1000),
  autorizado_por uuid not null references public.empresa_membros (id),
  autorizado_em timestamptz not null default now(),
  valor_pago numeric(14,2) check (valor_pago is null or valor_pago > 0),
  comprovante_caminho text unique,
  comprovante_nome text,
  comprovante_tamanho bigint,
  comprovante_tipo_mime text,
  pago_por uuid references public.empresa_membros (id),
  pago_em timestamptz,
  nf_caminho text unique,
  nf_nome text,
  nf_tamanho bigint,
  nf_tipo_mime text,
  nf_por uuid references public.empresa_membros (id),
  nf_em timestamptz,
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  unique (pedido_id, versao),
  constraint pagamento_fornecedor_prova_completa check (
    (pago_em is null and valor_pago is null and comprovante_caminho is null and comprovante_nome is null
      and comprovante_tamanho is null and comprovante_tipo_mime is null and pago_por is null)
    or (pago_em is not null and valor_pago = valor_autorizado and comprovante_caminho is not null
      and comprovante_nome is not null and comprovante_tamanho between 1 and 20971520
      and comprovante_tipo_mime in ('application/pdf', 'image/png', 'image/jpeg') and pago_por is not null)
  ),
  constraint pagamento_fornecedor_nf_completa check (
    (nf_em is null and nf_caminho is null and nf_nome is null and nf_tamanho is null
      and nf_tipo_mime is null and nf_por is null)
    or (pago_em is not null and nf_em is not null and nf_caminho is not null and nf_nome is not null
      and nf_tamanho between 1 and 20971520
      and nf_tipo_mime in ('application/pdf', 'image/png', 'image/jpeg') and nf_por is not null)
  )
);
create index obra_pagamentos_fornecedor_lista_idx on public.obra_pagamentos_fornecedor (obra_id, autorizado_em desc);
alter table public.obra_pagamentos_fornecedor enable row level security;
create policy "financeiro vê pagamentos do fornecedor" on public.obra_pagamentos_fornecedor
  for select to authenticated using (public.pode_gerir_pagamento_fornecedor(obra_id));
revoke insert, update, delete, truncate on public.obra_pagamentos_fornecedor from anon, authenticated, service_role;

create or replace function public.pode_acessar_arquivo_financeiro_obra(p_caminho text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_obra uuid;
begin
  if p_caminho is null or p_caminho !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/financeiro/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg)$' then
    return false;
  end if;
  v_empresa := split_part(p_caminho, '/', 1)::uuid;
  v_obra := split_part(p_caminho, '/', 2)::uuid;
  return exists (
    select 1 from public.obras o where o.id = v_obra and o.empresa_id = v_empresa
      and public.pode_gerir_pagamento_fornecedor(o.id)
  );
end;
$$;
revoke all on function public.pode_acessar_arquivo_financeiro_obra(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_acessar_arquivo_financeiro_obra(text) to authenticated;
create policy "obra financeiro: ler" on storage.objects for select to authenticated
  using (bucket_id = 'obra-compras' and public.pode_acessar_arquivo_financeiro_obra(name));
create policy "obra financeiro: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'obra-compras' and public.pode_acessar_arquivo_financeiro_obra(name));

create or replace function public.conferir_documento_financeiro_obra(p_caminho text, p_obra_id uuid)
returns table (tamanho bigint, tipo_mime text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_objeto storage.objects;
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  if not public.pode_acessar_arquivo_financeiro_obra(p_caminho)
     or p_caminho not like v_empresa::text || '/' || p_obra_id::text || '/financeiro/%' then
    raise exception 'Arquivo fora da pasta financeira da obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_objeto from storage.objects o
    where o.bucket_id = 'obra-compras' and o.name = p_caminho;
  tamanho := (v_objeto.metadata ->> 'size')::bigint;
  tipo_mime := v_objeto.metadata ->> 'mimetype';
  if not found or tipo_mime not in ('application/pdf', 'image/png', 'image/jpeg')
     or coalesce(tamanho, 0) < 1 or tamanho > 20971520 then
    raise exception 'Comprovante ou nota PDF/imagem não encontrado no armazenamento.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return next;
end;
$$;
revoke all on function public.conferir_documento_financeiro_obra(text, uuid) from public, anon, authenticated, service_role;

create or replace function public.autorizar_pagamento_fornecedor(
  p_pedido_id uuid, p_valor numeric, p_justificativa text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_pedido public.obra_compras_documentos;
  v_obra public.obras;
  v_ultimo public.obra_pagamentos_fornecedor;
  v_id uuid;
  v_versao integer;
begin
  select * into v_pedido from public.obra_compras_documentos where id = p_pedido_id;
  if not found or v_pedido.tipo <> 'pedido' then
    raise exception 'Pedido não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.preparar_escrita_obra(v_pedido.obra_id, 'operacional', true);
  if not public.pode_gerir_pagamento_fornecedor(v_pedido.obra_id) then
    raise exception 'Você não tem permissão financeira nesta obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  select * into v_obra from public.obras where id = v_pedido.obra_id;
  if p_valor is null or p_valor <= 0 or p_valor > 999999999999.99 then
    raise exception 'Informe o valor autorizado do fornecedor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_justificativa is not null and length(trim(p_justificativa)) not between 1 and 1000 then
    raise exception 'Justificativa inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (
    select 1 from public.obra_compras_documentos q
    where q.id = v_pedido.orcamento_id and q.tipo = 'orcamento' and q.revisao = 'aprovado'
      and q.versao = (select max(versao) from public.obra_compras_documentos
                      where obra_id = v_pedido.obra_id and tipo = 'orcamento')
  ) then
    raise exception 'O pedido precisa estar vinculado ao orçamento técnico aprovado mais recente.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_ultimo from public.obra_pagamentos_fornecedor
    where pedido_id = p_pedido_id order by versao desc limit 1;
  if found and v_ultimo.pago_em is not null then
    raise exception 'Este pedido já possui pagamento registrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if found and p_justificativa is null then
    raise exception 'Informe por que o valor autorizado foi alterado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  v_versao := coalesce(v_ultimo.versao, 0) + 1;
  insert into public.obra_pagamentos_fornecedor
    (empresa_id, obra_id, pedido_id, versao, valor_autorizado, justificativa, autorizado_por)
  values (v_obra.empresa_id, v_obra.id, p_pedido_id, v_versao, p_valor,
          nullif(trim(p_justificativa), ''), public.meu_membro_id(v_obra.empresa_id))
  returning id into v_id;
  perform public.registrar_historico_obra(v_obra.id, 'pagamento_fornecedor_autorizado', 'operacional',
    jsonb_build_object('pagamento_id', v_id, 'pedido_id', p_pedido_id, 'versao', v_versao));
  return v_id;
end;
$$;
revoke all on function public.autorizar_pagamento_fornecedor(uuid, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.autorizar_pagamento_fornecedor(uuid, numeric, text) to authenticated;

create or replace function public.registrar_arquivo_pagamento_fornecedor(
  p_pagamento_id uuid, p_tipo text, p_caminho text, p_nome text, p_valor_pago numeric default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_pagamento public.obra_pagamentos_fornecedor;
  v_arquivo record;
begin
  select * into v_pagamento from public.obra_pagamentos_fornecedor where id = p_pagamento_id;
  if not found then
    raise exception 'Autorização não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.preparar_escrita_obra(v_pagamento.obra_id, 'operacional', true);
  if not public.pode_gerir_pagamento_fornecedor(v_pagamento.obra_id) then
    raise exception 'Você não tem permissão financeira nesta obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  select * into v_pagamento from public.obra_pagamentos_fornecedor where id = p_pagamento_id for update;
  if v_pagamento.versao <> (select max(versao) from public.obra_pagamentos_fornecedor where pedido_id = v_pagamento.pedido_id)
     or not exists (
       select 1 from public.obra_compras_documentos p
       join public.obra_compras_documentos q on q.id = p.orcamento_id
       where p.id = v_pagamento.pedido_id and q.versao = (
         select max(versao) from public.obra_compras_documentos
         where obra_id = v_pagamento.obra_id and tipo = 'orcamento'
       )
     ) then
    raise exception 'Use a autorização mais recente do pedido vigente.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo not in ('comprovante', 'nota_fiscal') or p_tipo is null
     or p_nome is null or length(trim(p_nome)) not between 1 and 200 then
    raise exception 'Dados do documento inválidos.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select * into v_arquivo from public.conferir_documento_financeiro_obra(p_caminho, v_pagamento.obra_id);
  if p_tipo = 'comprovante' then
    if v_pagamento.pago_em is not null or p_valor_pago is distinct from v_pagamento.valor_autorizado then
      raise exception 'O valor pago precisa corresponder à autorização vigente; altere a autorização antes de pagar.'
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    update public.obra_pagamentos_fornecedor set valor_pago = p_valor_pago,
      comprovante_caminho = p_caminho, comprovante_nome = trim(p_nome),
      comprovante_tamanho = v_arquivo.tamanho, comprovante_tipo_mime = v_arquivo.tipo_mime,
      pago_por = public.meu_membro_id(v_pagamento.empresa_id), pago_em = now()
      where id = p_pagamento_id;
    perform public.registrar_historico_obra(v_pagamento.obra_id, 'pagamento_fornecedor_comprovado', 'operacional',
      jsonb_build_object('pagamento_id', p_pagamento_id));
  else
    if v_pagamento.pago_em is null or v_pagamento.nf_em is not null then
      raise exception 'Anexe a nota após o comprovante, uma vez por autorização.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    update public.obra_pagamentos_fornecedor set nf_caminho = p_caminho, nf_nome = trim(p_nome),
      nf_tamanho = v_arquivo.tamanho, nf_tipo_mime = v_arquivo.tipo_mime,
      nf_por = public.meu_membro_id(v_pagamento.empresa_id), nf_em = now()
      where id = p_pagamento_id;
    update public.obra_fluxos set status = 'faturado_fornecedor', status_desde = now(), concluido_em = now()
      where obra_id = v_pagamento.obra_id and setor = 'compras';
    perform public.registrar_historico_obra(v_pagamento.obra_id, 'nota_fiscal_fornecedor_anexada', 'operacional',
      jsonb_build_object('pagamento_id', p_pagamento_id));
  end if;
end;
$$;
revoke all on function public.registrar_arquivo_pagamento_fornecedor(uuid, text, text, text, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.registrar_arquivo_pagamento_fornecedor(uuid, text, text, text, numeric)
  to authenticated;

alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'documento_compras_anexado', 'orcamento_aprovado', 'orcamento_reprovado',
  'pagamento_fornecedor_autorizado', 'pagamento_fornecedor_comprovado', 'nota_fiscal_fornecedor_anexada'
));

create or replace function public.travar_status_compras_documentadas()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_orcamento public.obra_compras_documentos;
begin
  if new.setor <> 'compras' or new.status = old.status then
    return new;
  end if;
  select * into v_orcamento from public.obra_compras_documentos d
    where d.obra_id = new.obra_id and d.tipo = 'orcamento'
    order by d.versao desc limit 1;
  if not found then
    return new;
  end if;
  if new.status = 'pedido_realizado'
     and (v_orcamento.revisao <> 'aprovado' or not exists (
       select 1 from public.obra_compras_documentos p
       where p.tipo = 'pedido' and p.orcamento_id = v_orcamento.id
     )) then
    raise exception 'Anexe o pedido vinculado ao orçamento técnico aprovado antes de avançar Compras.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if new.status = 'faturado_fornecedor' and not exists (
    select 1 from public.obra_compras_documentos p
    join public.obra_pagamentos_fornecedor f on f.pedido_id = p.id
    where p.tipo = 'pedido' and p.orcamento_id = v_orcamento.id
      and f.versao = (select max(versao) from public.obra_pagamentos_fornecedor where pedido_id = p.id)
      and f.pago_em is not null and f.nf_em is not null
  ) then
    raise exception 'Anexe o comprovante e a nota fiscal do fornecedor antes de concluir Compras.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return new;
end;
$$;
