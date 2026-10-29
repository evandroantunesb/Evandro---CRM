-- Anexos das tarefas de setor: quem pede manda as fotos do local; o setor devolve o 3D, o orçamento etc.
--
-- * Arquivo no bucket privado `tarefas-setor`, em `empresa/tarefa/objeto` (separado dos anexos do negócio: a
--   Operação nunca lê a pasta do negócio, só o que foi anexado à tarefa).
-- * Quem vê a tarefa vê e baixa os anexos; quem vê a tarefa anexa enquanto ela está aberta.
-- * Registro só pela RPC, que confere o objeto no Storage (dono, tamanho e tipo reais). Remover: quem enviou ou o
--   admin, com a tarefa aberta; o servidor apaga o arquivo depois.
-- Depende de: 20261029210000_tarefas_setor.sql.

set lock_timeout = '3s';

create table public.tarefas_setor_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas_setor (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  caminho text not null unique,
  nome text not null check (length(btrim(nome)) between 1 and 200),
  tamanho bigint not null check (tamanho > 0),
  tipo_mime text,
  enviado_por uuid,
  created_at timestamptz not null default now()
);
create index on public.tarefas_setor_anexos (tarefa_id, created_at);

alter table public.tarefas_setor_anexos enable row level security;
create policy "ver anexos das tarefas de setor" on public.tarefas_setor_anexos for select to authenticated
  using (public.pode_ver_tarefa_setor(tarefa_id));
revoke all on public.tarefas_setor_anexos from anon;
revoke insert, update, delete, truncate on public.tarefas_setor_anexos from authenticated, service_role;

-- Tarefa da pasta `empresa/tarefa/objeto`, ou nulo se o caminho não tem esse formato ou a empresa não confere.
create or replace function public.tarefa_da_pasta_anexo(p_caminho text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_tarefa uuid;
  v_empresa uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[3] = '' then
    return null;
  end if;
  begin
    v_tarefa := v_partes[2]::uuid;
    v_empresa := v_partes[1]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return (select t.id from public.tarefas_setor t where t.id = v_tarefa and t.empresa_id = v_empresa);
end;
$$;

-- Storage: ler quem vê a tarefa; enviar quem vê a tarefa enquanto ela está aberta. Remover só pelo servidor.
create or replace function public.pode_ver_pasta_tarefa_setor(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.pode_ver_tarefa_setor(public.tarefa_da_pasta_anexo(p_caminho)), false);
$$;

create or replace function public.pode_enviar_pasta_tarefa_setor(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select t.status = 'aberta' and public.pode_ver_tarefa_setor(t.id)
    from public.tarefas_setor t where t.id = public.tarefa_da_pasta_anexo(p_caminho)
  ), false);
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('tarefas-setor', 'tarefas-setor', false, 20971520)
on conflict (id) do nothing;

create policy "tarefas-setor: ler" on storage.objects for select to authenticated
  using (bucket_id = 'tarefas-setor' and public.pode_ver_pasta_tarefa_setor(name));
create policy "tarefas-setor: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'tarefas-setor' and public.pode_enviar_pasta_tarefa_setor(name));

-- Registra um arquivo que o navegador já enviou. Não confia no navegador: o objeto tem de existir, ter sido
-- enviado por quem chama e não ser vazio; tamanho e tipo vêm do Storage.
create or replace function public.registrar_anexo_tarefa_setor(p_caminho text, p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas_setor;
  v_tarefa uuid := public.tarefa_da_pasta_anexo(p_caminho);
  v_objeto record;
  v_id uuid;
begin
  if v_tarefa is null then
    raise exception 'Tarefa não encontrada.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v := public.travar_tarefa_setor(v_tarefa);
  if v.status <> 'aberta' then
    raise exception 'Só tarefa aberta recebe anexo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_nome, ''))) not between 1 and 200 then
    raise exception 'Nome do arquivo inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select o.metadata into v_objeto
  from storage.objects o
  where o.bucket_id = 'tarefas-setor' and o.name = p_caminho and o.owner_id = (select auth.uid())::text;
  if not found then
    raise exception 'Arquivo não encontrado no armazenamento. Envie de novo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce((v_objeto.metadata ->> 'size')::bigint, 0) <= 0 then
    raise exception 'O arquivo está vazio.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.tarefas_setor_anexos (tarefa_id, empresa_id, caminho, nome, tamanho, tipo_mime, enviado_por)
  values (v.id, v.empresa_id, p_caminho, btrim(p_nome), (v_objeto.metadata ->> 'size')::bigint,
    nullif(v_objeto.metadata ->> 'mimetype', ''), public.meu_membro_id(v.empresa_id))
  on conflict (caminho) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Este arquivo já está registrado.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;
  return v_id;
end;
$$;

-- Remove o registro (quem enviou ou o admin, com a tarefa aberta) e devolve o caminho para o servidor apagar o
-- arquivo. Concluída, os anexos ficam como registro do que foi entregue.
create or replace function public.remover_anexo_tarefa_setor(p_anexo_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  a public.tarefas_setor_anexos;
  v public.tarefas_setor;
begin
  select * into a from public.tarefas_setor_anexos where id = p_anexo_id;
  if not found or not public.pode_ver_tarefa_setor(a.tarefa_id) then
    raise exception 'Arquivo não encontrado.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v := public.travar_tarefa_setor(a.tarefa_id);
  if v.status <> 'aberta' then
    raise exception 'Tarefa encerrada: os anexos ficam como registro.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not (public.tem_papel(a.empresa_id, '{admin}') or a.enviado_por = public.meu_membro_id(a.empresa_id)) then
    raise exception 'Só quem enviou ou o admin remove o arquivo.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  delete from public.tarefas_setor_anexos where id = p_anexo_id;
  return a.caminho;
end;
$$;

-- Internas: ninguém executa pela API.
revoke all on function public.tarefa_da_pasta_anexo(text) from public, anon, authenticated, service_role;
-- Usadas nas policies do Storage: só `authenticated`.
revoke all on function public.pode_ver_pasta_tarefa_setor(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pasta_tarefa_setor(text) to authenticated;
revoke all on function public.pode_enviar_pasta_tarefa_setor(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_enviar_pasta_tarefa_setor(text) to authenticated;
-- RPCs de cliente.
revoke all on function public.registrar_anexo_tarefa_setor(text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_anexo_tarefa_setor(text, text) to authenticated;
revoke all on function public.remover_anexo_tarefa_setor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.remover_anexo_tarefa_setor(uuid) to authenticated;

reset lock_timeout;
