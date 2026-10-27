-- Responsáveis padrão por empresa e setor, aplicados somente às novas Obras.
-- A configuração acompanha a remoção do setor ou a desativação do membro.
create table public.empresa_responsaveis_obra_padrao (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  setor public.setor_obra not null check (setor <> 'comercial'),
  membro_id uuid not null,
  definido_por_user_id uuid,
  definido_em timestamptz not null default now(),
  primary key (empresa_id, setor),
  foreign key (empresa_id, membro_id, setor)
    references public.membro_setores_obra (empresa_id, membro_id, setor) on delete cascade
);
create index empresa_responsaveis_obra_padrao_membro_idx
  on public.empresa_responsaveis_obra_padrao (membro_id);
alter table public.empresa_responsaveis_obra_padrao enable row level security;
create policy "admin vê responsáveis padrão da obra" on public.empresa_responsaveis_obra_padrao
  for select to authenticated using (public.tem_papel(empresa_id, '{admin}'));
revoke insert, update, delete, truncate on public.empresa_responsaveis_obra_padrao
  from anon, authenticated, service_role;

create or replace function public.definir_responsavel_padrao_obra(
  p_empresa_id uuid, p_setor public.setor_obra, p_membro_id uuid
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_membro public.empresa_membros;
begin
  if not public.tem_papel(p_empresa_id, '{admin}') then
    raise exception 'Somente o administrador configura responsáveis padrão.'
      using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if p_setor is null or p_setor = 'comercial' then
    raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_membro_id is null then
    delete from public.empresa_responsaveis_obra_padrao
      where empresa_id = p_empresa_id and setor = p_setor;
    return;
  end if;

  -- A mesma linha é travada na desativação e na edição dos setores do membro.
  select * into v_membro from public.empresa_membros
    where id = p_membro_id and empresa_id = p_empresa_id for update;
  if not found or not v_membro.ativo or v_membro.papel <> 'operacao'
     or not exists (
       select 1 from public.membro_setores_obra s
       where s.empresa_id = p_empresa_id and s.membro_id = p_membro_id and s.setor = p_setor
     ) then
    raise exception 'Escolha um colaborador ativo com acesso a este setor.'
      using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.empresa_responsaveis_obra_padrao
    (empresa_id, setor, membro_id, definido_por_user_id)
  values (p_empresa_id, p_setor, p_membro_id, (select auth.uid()))
  on conflict (empresa_id, setor) do update
    set membro_id = excluded.membro_id,
        definido_por_user_id = excluded.definido_por_user_id,
        definido_em = now();
end;
$$;
revoke all on function public.definir_responsavel_padrao_obra(uuid, public.setor_obra, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.definir_responsavel_padrao_obra(uuid, public.setor_obra, uuid)
  to authenticated;

-- A criação idempotente registra obra_criada depois dos fluxos e dos participantes
-- comerciais. Este gatilho acrescenta os responsáveis logo em seguida, uma vez só.
create or replace function public.atribuir_responsaveis_padrao_obra()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_padrao record;
  v_participante_id uuid;
begin
  if new.tipo <> 'obra_criada' then
    return null;
  end if;
  for v_padrao in
    select p.setor, p.membro_id from public.empresa_responsaveis_obra_padrao p
    join public.empresa_membros m on m.id = p.membro_id and m.empresa_id = p.empresa_id
    where p.empresa_id = new.empresa_id and m.ativo and m.papel = 'operacao'
    order by p.setor
  loop
    insert into public.obra_participantes
      (obra_id, empresa_id, membro_id, setor, funcao, principal, criado_por_user_id)
    values (new.obra_id, new.empresa_id, v_padrao.membro_id, v_padrao.setor,
            'responsavel', true, (select auth.uid()))
    on conflict do nothing
    returning id into v_participante_id;
    if v_participante_id is not null then
      perform public.registrar_historico_obra(new.obra_id, 'participante_atribuido',
        v_padrao.setor, jsonb_build_object(
          'participante_id', v_participante_id,
          'membro_id', v_padrao.membro_id,
          'funcao', 'responsavel',
          'principal', true,
          'origem', 'padrao_empresa'
        ));
    end if;
    v_participante_id := null;
  end loop;
  return null;
end;
$$;
revoke all on function public.atribuir_responsaveis_padrao_obra()
  from public, anon, authenticated, service_role;
create trigger obra_criada_atribuir_responsaveis_padrao
  after insert on public.obra_historico
  for each row when (new.tipo = 'obra_criada')
  execute function public.atribuir_responsaveis_padrao_obra();
