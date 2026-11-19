-- Item 5 do roadmap, opção A (decisões do Evandro em 18/11/2026): a importação lê a potência (W) e preenche os
-- materiais em massa.
--
--  1. `potencia_item_importacao`: lê a potência opcional de um item (`potencia_w`, em W, maior que zero).
--  2. `importar_tabela_precos`: cada item pode trazer `potencia_w`. Material novo nasce com ela; material que já existe
--     só ganha a potência se estiver sem (a cadastrada fica: decisão de 18/11/2026). O retorno conta `potencias`.
--  3. `importar_lista_equipamentos`: lista de equipamentos sem preço (ex.: a do engenheiro). Cria os novos e completa a
--     potência de quem está sem; não mexe em preço e não apaga nada. Mesmas pessoas da tabela de preços.
--
-- Depende de: exigir_editar_precos_compra, validar_material_compra, validar_potencia_material, meu_membro_id.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Potência de um item
-- ---------------------------------------------------------------------------

create or replace function public.potencia_item_importacao(p_item jsonb, p_descricao text)
returns numeric
language plpgsql immutable set search_path = ''
as $$
declare
  v_potencia numeric;
begin
  if p_item is null or not (p_item ? 'potencia_w') or jsonb_typeof(p_item -> 'potencia_w') = 'null' then
    return null;
  end if;
  begin
    v_potencia := round((p_item ->> 'potencia_w')::numeric, 2);
  exception when invalid_text_representation then
    v_potencia := null;
  end;
  if v_potencia is null or v_potencia <= 0 or v_potencia >= 1000000 then
    raise exception 'Potência inválida em "%" (em W, maior que zero).', p_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return v_potencia;
end;
$$;
revoke all on function public.potencia_item_importacao(jsonb, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tabela de preços com potência (corpo de 20261129100000 com as linhas da potência)
-- ---------------------------------------------------------------------------

create or replace function public.importar_tabela_precos(
  p_empresa_id uuid, p_fornecedor text, p_data_tabela date, p_caminho text, p_nome_arquivo text,
  p_linhas_lidas integer, p_ignoradas integer, p_mapa jsonb, p_itens jsonb, p_valido_ate date default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro uuid;
  v_fornecedor text := regexp_replace(btrim(p_fornecedor), '\s+', ' ', 'g');
  v_chave text := public.chave_fornecedor(p_fornecedor);
  v_tabela uuid;
  v_item jsonb;
  v_material uuid;
  v_nome text;
  v_preco numeric;
  v_codigo text;
  v_descricao text;
  v_anterior numeric;
  v_vistos uuid[] := '{}';
  v_novos integer := 0;
  v_subiram integer := 0;
  v_baixaram integer := 0;
  v_iguais integer := 0;
  v_potencia numeric;
  v_potencias integer := 0;
begin
  perform public.exigir_editar_precos_compra(p_empresa_id);
  v_membro := public.meu_membro_id(p_empresa_id);
  perform public.validar_preco_compra(p_fornecedor, 1, p_data_tabela, null);
  if p_data_tabela > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da tabela não pode ser futura.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_valido_ate is not null and p_valido_ate < p_data_tabela then
    raise exception 'A validade não pode ser antes da data da tabela.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(btrim(p_nome_arquivo), '') is null or length(btrim(p_nome_arquivo)) > 200
     or public.pasta_compras_precos(p_caminho) is distinct from p_empresa_id
     or not exists (select 1 from storage.objects s where s.bucket_id = 'compras-precos' and s.name = p_caminho)
     or exists (select 1 from public.compras_tabelas_preco t where t.caminho = p_caminho) then
    raise exception 'Envie a planilha do fornecedor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum preço para importar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if jsonb_array_length(p_itens) > 5000 then
    raise exception 'A tabela tem mais de 5.000 preços. Divida a planilha.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if coalesce(p_linhas_lidas, -1) < jsonb_array_length(p_itens) or coalesce(p_ignoradas, -1) < 0 then
    raise exception 'Contagem de linhas inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_mapa is null or jsonb_typeof(p_mapa) <> 'object' or length(p_mapa::text) > 2000 then
    raise exception 'Indique as colunas da planilha.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.compras_tabelas_preco (
    empresa_id, fornecedor, data_tabela, valido_ate, caminho, nome_arquivo, linhas_lidas, ignoradas, enviado_por
  )
  values (p_empresa_id, v_fornecedor, p_data_tabela, p_valido_ate, p_caminho, btrim(p_nome_arquivo), p_linhas_lidas, p_ignoradas, v_membro)
  returning id into v_tabela;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Linha da tabela inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_descricao := nullif(btrim(v_item ->> 'descricao'), '');
    v_codigo := nullif(btrim(v_item ->> 'codigo'), '');
    if v_descricao is null or length(v_descricao) > 200 then
      raise exception 'Linha sem material (ou com mais de 200 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    begin
      v_preco := round((v_item ->> 'preco')::numeric, 2);
    exception when invalid_text_representation then
      v_preco := null;
    end;
    perform public.validar_preco_compra(v_fornecedor, v_preco, p_data_tabela, v_codigo);
    v_potencia := public.potencia_item_importacao(v_item, v_descricao);

    if v_item ? 'material_id' then
      begin
        v_material := (v_item ->> 'material_id')::uuid;
      exception when invalid_text_representation then
        v_material := null;
      end;
      if v_material is null or not exists (
        select 1 from public.compras_materiais m where m.id = v_material and m.empresa_id = p_empresa_id
      ) then
        raise exception 'Material de "%" não encontrado.', v_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
    elsif jsonb_typeof(v_item -> 'novo') = 'object' then
      v_nome := regexp_replace(btrim(v_item -> 'novo' ->> 'nome'), '\s+', ' ', 'g');
      perform public.validar_material_compra(v_nome, v_item -> 'novo' ->> 'categoria', v_item -> 'novo' ->> 'unidade');
      select m.id into v_material from public.compras_materiais m
      where m.empresa_id = p_empresa_id and lower(btrim(m.nome)) = lower(v_nome);
      if v_material is null then
        insert into public.compras_materiais (empresa_id, nome, categoria, unidade, potencia_w, criado_por)
        values (p_empresa_id, v_nome, v_item -> 'novo' ->> 'categoria', btrim(v_item -> 'novo' ->> 'unidade'), v_potencia, v_membro)
        returning id into v_material;
        if v_potencia is not null then
          v_potencias := v_potencias + 1;
        end if;
        v_potencia := null;
      end if;
    else
      raise exception 'Escolha o material de "%".', v_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;

    if v_material = any (v_vistos) then
      raise exception 'O material de "%" aparece mais de uma vez nesta tabela.', v_descricao
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_vistos := v_vistos || v_material;
    if v_potencia is not null then
      update public.compras_materiais set potencia_w = v_potencia
      where id = v_material and empresa_id = p_empresa_id and potencia_w is null;
      if found then
        v_potencias := v_potencias + 1;
      end if;
    end if;

    select p.preco into v_anterior from public.compras_precos p
    where p.empresa_id = p_empresa_id and p.material_id = v_material and p.fornecedor_chave = v_chave
    order by p.data_preco desc, p.created_at desc
    limit 1;
    if v_anterior is null then
      v_novos := v_novos + 1;
    elsif v_preco > v_anterior then
      v_subiram := v_subiram + 1;
    elsif v_preco < v_anterior then
      v_baixaram := v_baixaram + 1;
    else
      v_iguais := v_iguais + 1;
    end if;
    v_anterior := null;

    insert into public.compras_precos (
      empresa_id, material_id, fornecedor, codigo_fornecedor, descricao_fornecedor, preco, data_preco, tabela_id, lancado_por
    )
    values (p_empresa_id, v_material, v_fornecedor, v_codigo, v_descricao, v_preco, p_data_tabela, v_tabela, v_membro);
  end loop;

  update public.compras_tabelas_preco
  set novos = v_novos, subiram = v_subiram, baixaram = v_baixaram, iguais = v_iguais
  where id = v_tabela;

  insert into public.compras_mapas_colunas (empresa_id, fornecedor_chave, mapa)
  values (p_empresa_id, v_chave, p_mapa)
  on conflict (empresa_id, fornecedor_chave) do update set mapa = excluded.mapa, updated_at = now();

  return jsonb_build_object(
    'tabela_id', v_tabela, 'novos', v_novos, 'subiram', v_subiram, 'baixaram', v_baixaram, 'iguais', v_iguais,
    'potencias', v_potencias
  );
end;
$$;
revoke all on function public.importar_tabela_precos(uuid, text, date, text, text, integer, integer, jsonb, jsonb, date)
  from public, anon, authenticated, service_role;
grant execute on function public.importar_tabela_precos(uuid, text, date, text, text, integer, integer, jsonb, jsonb, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lista de equipamentos (sem preço)
-- ---------------------------------------------------------------------------

/*
 * Itens: `{ "material_id": "…" }` ou `{ "novo": { "nome", "categoria", "unidade" } }`, cada um com `descricao` (como veio
 * na planilha) e `potencia_w` opcional. Retorna quantos foram criados e quantos tiveram a potência completada.
 */
create or replace function public.importar_lista_equipamentos(p_empresa_id uuid, p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro uuid;
  v_item jsonb;
  v_material uuid;
  v_nome text;
  v_descricao text;
  v_potencia numeric;
  v_vistos uuid[] := '{}';
  v_criados integer := 0;
  v_completados integer := 0;
begin
  perform public.exigir_editar_precos_compra(p_empresa_id);
  v_membro := public.meu_membro_id(p_empresa_id);
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum equipamento para importar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if jsonb_array_length(p_itens) > 5000 then
    raise exception 'A lista tem mais de 5.000 equipamentos. Divida a planilha.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Linha da lista inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_descricao := coalesce(nullif(btrim(v_item ->> 'descricao'), ''), 'equipamento');
    v_potencia := public.potencia_item_importacao(v_item, v_descricao);

    if v_item ? 'material_id' then
      begin
        v_material := (v_item ->> 'material_id')::uuid;
      exception when invalid_text_representation then
        v_material := null;
      end;
      if v_material is null or not exists (
        select 1 from public.compras_materiais m where m.id = v_material and m.empresa_id = p_empresa_id
      ) then
        raise exception 'Material de "%" não encontrado.', v_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
      end if;
      if v_potencia is not null then
        update public.compras_materiais set potencia_w = v_potencia
        where id = v_material and empresa_id = p_empresa_id and potencia_w is null;
        if found then
          v_completados := v_completados + 1;
        end if;
      end if;
    elsif jsonb_typeof(v_item -> 'novo') = 'object' then
      v_nome := regexp_replace(btrim(v_item -> 'novo' ->> 'nome'), '\s+', ' ', 'g');
      perform public.validar_material_compra(v_nome, v_item -> 'novo' ->> 'categoria', v_item -> 'novo' ->> 'unidade');
      select m.id into v_material from public.compras_materiais m
      where m.empresa_id = p_empresa_id and lower(btrim(m.nome)) = lower(v_nome);
      if v_material is null then
        insert into public.compras_materiais (empresa_id, nome, categoria, unidade, potencia_w, criado_por)
        values (p_empresa_id, v_nome, v_item -> 'novo' ->> 'categoria', btrim(v_item -> 'novo' ->> 'unidade'), v_potencia, v_membro)
        returning id into v_material;
        v_criados := v_criados + 1;
      elsif v_potencia is not null then
        update public.compras_materiais set potencia_w = v_potencia
        where id = v_material and potencia_w is null;
        if found then
          v_completados := v_completados + 1;
        end if;
      end if;
    else
      raise exception 'Escolha o material de "%".', v_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;

    if v_material = any (v_vistos) then
      raise exception 'O material de "%" aparece mais de uma vez nesta lista.', v_descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_vistos := v_vistos || v_material;
  end loop;

  return jsonb_build_object('criados', v_criados, 'completados', v_completados);
end;
$$;
revoke all on function public.importar_lista_equipamentos(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.importar_lista_equipamentos(uuid, jsonb) to authenticated;

reset lock_timeout;
