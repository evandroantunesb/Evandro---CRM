-- Usuários com perfil único (PR B de "Perfis e setores", desenho aprovado em 05/11/2026). A tela de Usuários mostra
-- um perfil por pessoa; para quem é da Operação, o perfil é um setor (Compras, Engenharia, Operacional ou
-- Administrativo) e os outros setores aparecem em "Também atua em". O banco passa a guardar qual setor é o principal.
--
--  * `membro_setores_obra.principal`: no máximo um por pessoa (índice único parcial). Só muda pela RPC.
--  * Existentes: o setor que a pessoa coordena; se não coordena nenhum, o primeiro da ordem do enum
--    (Compras, Engenharia, Operacional, Administrativo).
--  * `definir_setores_membro`: cada item aceita `"principal": true` (no máximo um). Sem marca, mantém o principal
--    atual se o setor continua; senão, aplica a mesma regra dos existentes. Assinatura e demais regras iguais a
--    20261119100100_setor_administrativo.sql.
-- Permissões não mudam: o principal é só o perfil exibido; quem atua em cada setor continua definido pela capacidade.

alter table public.membro_setores_obra add column principal boolean not null default false;
create unique index membro_setores_obra_um_principal on public.membro_setores_obra (empresa_id, membro_id) where principal;

update public.membro_setores_obra s
set principal = true
from (
  select distinct on (empresa_id, membro_id) empresa_id, membro_id, setor
  from public.membro_setores_obra
  order by empresa_id, membro_id, (capacidade = 'coordenar') desc, setor
) p
where s.empresa_id = p.empresa_id and s.membro_id = p.membro_id and s.setor = p.setor;

-- Corpo de 20261119100100_setor_administrativo.sql + o setor principal.
create or replace function public.definir_setores_membro(p_membro_id uuid, p_setores jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_papel public.papel_membro;
  v_ativo boolean;
  v_item jsonb;
  v_setor text;
  v_capacidade text;
  v_vistos text[] := '{}';
  v_antigo record;
  v_cap_antes public.capacidade_obra;
  v_autor_membro uuid;
  v_autor_contexto jsonb;
  v_principal text;
begin
  -- Trava a linha do membro: não desativa/muda de papel no meio da operação.
  select m.empresa_id, m.papel, m.ativo into v_empresa, v_papel, v_ativo
  from public.empresa_membros m where m.id = p_membro_id for update;

  -- Mesma resposta para "não existe" e "não sou admin dessa empresa": não revela vínculos de outras empresas.
  if v_empresa is null or not public.tem_papel(v_empresa, '{admin}') then
    raise exception 'Você não tem acesso a este colaborador.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not v_ativo then
    raise exception 'O colaborador precisa estar ativo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_papel <> 'operacao' then
    raise exception 'Só colaboradores com o papel Operação têm setores de obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_setores is null or jsonb_typeof(p_setores) <> 'array' then
    raise exception 'Informe a lista de setores.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  for v_item in select * from jsonb_array_elements(p_setores) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_setor := v_item ->> 'setor';
    v_capacidade := v_item ->> 'capacidade';
    if v_setor is null or v_setor not in ('compras', 'engenharia', 'operacional', 'administrativo') then
      raise exception 'Setor inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_capacidade is null or v_capacidade not in ('executar', 'coordenar') then
      raise exception 'Capacidade inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_setor = any (v_vistos) then
      raise exception 'Setor repetido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_item ? 'principal' and jsonb_typeof(v_item -> 'principal') <> 'boolean' then
      raise exception 'Setor principal inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if coalesce((v_item ->> 'principal')::boolean, false) then
      if v_principal is not null then
        raise exception 'Escolha um só setor principal.' using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
      v_principal := v_setor;
    end if;
    v_vistos := v_vistos || v_setor;
  end loop;

  -- Autor real (o admin que chama), com o papel deste momento.
  v_autor_membro := public.meu_membro_id(v_empresa);
  v_autor_contexto := jsonb_build_object('papel', 'admin');

  -- Setores retirados: remove, audita e encerra as participações daquele setor.
  for v_antigo in
    delete from public.membro_setores_obra
    where empresa_id = v_empresa and membro_id = p_membro_id
      and setor::text <> all (v_vistos)
    returning setor, capacidade
  loop
    insert into public.membro_setores_obra_historico
      (empresa_id, membro_id, setor, capacidade_antes, capacidade_depois, autor_user_id, autor_membro_id, autor_contexto)
    values (v_empresa, p_membro_id, v_antigo.setor, v_antigo.capacidade, null, (select auth.uid()), v_autor_membro, v_autor_contexto);
    perform public.encerrar_participacoes_operacionais(p_membro_id, v_antigo.setor, 'setor_removido',
      'Setor retirado do colaborador');
  end loop;

  -- Setores mantidos/novos: grava (como na 3b-2) e audita só o que mudou.
  for v_item in select * from jsonb_array_elements(p_setores) loop
    select s.capacidade into v_cap_antes
    from public.membro_setores_obra s
    where s.empresa_id = v_empresa and s.membro_id = p_membro_id and s.setor = (v_item ->> 'setor')::public.setor_obra;

    insert into public.membro_setores_obra (empresa_id, membro_id, setor, capacidade, definido_por_user_id)
    values (v_empresa, p_membro_id, (v_item ->> 'setor')::public.setor_obra,
            (v_item ->> 'capacidade')::public.capacidade_obra, (select auth.uid()))
    on conflict (empresa_id, membro_id, setor) do update
      set capacidade = excluded.capacidade, definido_por_user_id = excluded.definido_por_user_id;

    if v_cap_antes is distinct from (v_item ->> 'capacidade')::public.capacidade_obra then
      insert into public.membro_setores_obra_historico
        (empresa_id, membro_id, setor, capacidade_antes, capacidade_depois, autor_user_id, autor_membro_id, autor_contexto)
      values (v_empresa, p_membro_id, (v_item ->> 'setor')::public.setor_obra, v_cap_antes,
              (v_item ->> 'capacidade')::public.capacidade_obra, (select auth.uid()), v_autor_membro, v_autor_contexto);
    end if;
  end loop;

  -- Setor principal (o perfil da pessoa): o marcado; sem marca, o principal atual se continua na lista; senão, o que
  -- coordena e, por fim, o primeiro da ordem do enum. Desmarca antes de marcar (o índice único não admite dois).
  if v_principal is null then
    select s.setor::text into v_principal
    from public.membro_setores_obra s
    where s.empresa_id = v_empresa and s.membro_id = p_membro_id
    order by s.principal desc, (s.capacidade = 'coordenar') desc, s.setor
    limit 1;
  end if;
  update public.membro_setores_obra set principal = false
  where empresa_id = v_empresa and membro_id = p_membro_id and principal and setor::text is distinct from v_principal;
  update public.membro_setores_obra set principal = true
  where empresa_id = v_empresa and membro_id = p_membro_id and setor::text = v_principal and not principal;
end;
$$;

-- RPC de cliente: só `authenticated` executa (grants reafirmados).
revoke all on function public.definir_setores_membro(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.definir_setores_membro(uuid, jsonb) to authenticated;
