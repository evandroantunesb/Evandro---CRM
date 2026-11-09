-- Compras P4a: margem por categoria, venda sugerida e potência do material (prévia aprovada "Compras P4 · Margens,
-- limite de desconto e potência do material", canvas "Raion — Nova interface"; decisões do Evandro de 09/11/2026).
--
--  * Margem por categoria de material (lista fixa da P3), em fração (0,18 = 18%). Venda sugerida de um material =
--    melhor custo atual × (1 + margem da categoria); sem margem cadastrada, 0%. Editam o admin e o gestor; veem os
--    mesmos que veem a tabela de preços. A P4b usa a venda sugerida para montar o preço do kit.
--  * Potência do material (W), opcional no banco: a P4b só oferece ao vendedor módulos e inversores com potência.
--    `criar_material_compra` e `editar_material_compra` ganham `p_potencia_w` (padrão nulo; chamadas antigas seguem).

create table public.compras_margens (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  categoria text not null
    check (categoria in ('modulos', 'inversores', 'baterias', 'estrutura', 'cabos_protecao', 'outros')),
  margem numeric(6, 4) not null check (margem >= 0 and margem <= 5),
  atualizado_por uuid,
  updated_at timestamptz not null default now(),
  primary key (empresa_id, categoria)
);
create trigger auditar_compras_margens after insert or update or delete on public.compras_margens
  for each row execute function public.auditar();
alter table public.compras_margens enable row level security;
create policy "ver margens de compra" on public.compras_margens for select to authenticated
  using (public.pode_ver_precos_compra(empresa_id));
revoke all on public.compras_margens from anon, authenticated, service_role;
grant select on public.compras_margens to authenticated, service_role;

-- Grava as margens informadas ({"modulos": 0.18, ...}); categoria ausente fica como está.
create or replace function public.salvar_margens_compra(p_empresa_id uuid, p_margens jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_chave text;
  v_valor jsonb;
  v_margem numeric;
begin
  if p_empresa_id is null or not public.tem_papel(p_empresa_id, '{admin,gestor}') then
    raise exception 'Só o admin e o gestor alteram as margens.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if p_margens is null or jsonb_typeof(p_margens) <> 'object' then
    raise exception 'Informe as margens.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  for v_chave, v_valor in select key, value from jsonb_each(p_margens) loop
    if v_chave not in ('modulos', 'inversores', 'baterias', 'estrutura', 'cabos_protecao', 'outros') then
      raise exception 'Categoria desconhecida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    begin
      v_margem := (v_valor #>> '{}')::numeric;
    exception when invalid_text_representation then
      v_margem := null;
    end;
    if v_margem is null or v_margem < 0 or v_margem > 5 then
      raise exception 'Margem inválida: use de 0%% a 500%%.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    insert into public.compras_margens (empresa_id, categoria, margem, atualizado_por)
    values (p_empresa_id, v_chave, round(v_margem, 4), public.meu_membro_id(p_empresa_id))
    on conflict (empresa_id, categoria) do update
      set margem = excluded.margem, atualizado_por = excluded.atualizado_por, updated_at = now()
      where public.compras_margens.margem is distinct from excluded.margem;
  end loop;
end;
$$;
revoke all on function public.salvar_margens_compra(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.salvar_margens_compra(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Potência do material
-- ---------------------------------------------------------------------------

alter table public.compras_materiais add column potencia_w numeric(8, 2)
  check (potencia_w is null or (potencia_w > 0 and potencia_w < 1000000));

create or replace function public.validar_potencia_material(p_potencia_w numeric)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_potencia_w is not null and (p_potencia_w <= 0 or p_potencia_w >= 1000000) then
    raise exception 'Potência inválida (em W, maior que zero).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.validar_potencia_material(numeric) from public, anon, authenticated, service_role;

drop function public.criar_material_compra(uuid, text, text, text);
create function public.criar_material_compra(
  p_empresa_id uuid, p_nome text, p_categoria text, p_unidade text, p_potencia_w numeric default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_editar_precos_compra(p_empresa_id);
  perform public.validar_material_compra(p_nome, p_categoria, p_unidade);
  perform public.validar_potencia_material(p_potencia_w);
  insert into public.compras_materiais (empresa_id, nome, categoria, unidade, potencia_w, criado_por)
  values (p_empresa_id, regexp_replace(btrim(p_nome), '\s+', ' ', 'g'), p_categoria, btrim(p_unidade), round(p_potencia_w, 2),
          public.meu_membro_id(p_empresa_id))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe um material com esse nome.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
end;
$$;
revoke all on function public.criar_material_compra(uuid, text, text, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.criar_material_compra(uuid, text, text, text, numeric) to authenticated;

drop function public.editar_material_compra(uuid, text, text, text);
create function public.editar_material_compra(
  p_material_id uuid, p_nome text, p_categoria text, p_unidade text, p_potencia_w numeric default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid := (select m.empresa_id from public.compras_materiais m where m.id = p_material_id);
begin
  perform public.exigir_editar_precos_compra(v_empresa);
  perform public.validar_material_compra(p_nome, p_categoria, p_unidade);
  perform public.validar_potencia_material(p_potencia_w);
  update public.compras_materiais
  set nome = regexp_replace(btrim(p_nome), '\s+', ' ', 'g'), categoria = p_categoria, unidade = btrim(p_unidade),
      potencia_w = round(p_potencia_w, 2)
  where id = p_material_id;
exception when unique_violation then
  raise exception 'Já existe um material com esse nome.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
end;
$$;
revoke all on function public.editar_material_compra(uuid, text, text, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.editar_material_compra(uuid, text, text, text, numeric) to authenticated;
