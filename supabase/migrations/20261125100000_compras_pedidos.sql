-- Compras, P1: pedidos de compra da obra (desenhos aprovados "Compras · Pedidos de compra": tela /compras, Novo pedido e
-- Compras na ficha da obra; decisões do Evandro de 05/11/2026).
--
--  * Fila e "Iniciar compra": a obra chega em Compras como "Aguardando Compras" (`a_comprar`). Quem atua em Compras vê
--    as obras em curso sem responsável principal em Compras e assume uma delas: vira o responsável principal e a etapa
--    vai para "Em cotação" (`cotando`), quando Compras busca os orçamentos. Admin, gestor e coordenador também iniciam,
--    sem se atribuir. O prazo da etapa "compra" continua contando da chegada da obra.
--  * Empresa sem ninguém ativo em Compras: o admin escolhe o setor que atende Compras (Administrativo ou Operacional;
--    sem escolha, só admin e gestor). A regra vale só enquanto ninguém ativo tiver o setor Compras.
--  * Pedido de compra: número por empresa (P-0001), fornecedor (nome livre), categoria do custo, entrega prevista,
--    vencimento, frete e itens (do kit vendido, pela posição no kit gravado na obra, ou fora do kit). Só depois do
--    "Iniciar compra". Edita e cancela (com motivo) enquanto não tem nota fiscal nem recebimento.
--  * Nota fiscal do pedido (número, valor e arquivo): registrada por Compras, cria a conta a pagar do Financeiro no
--    valor da nota, com o fornecedor, a categoria e o vencimento do pedido e a nota anexada. Conta cancelada no
--    Financeiro devolve o pedido a "aguardando nota fiscal".
--  * Recebimento por item (parcial ou total), antes ou depois da nota.
--  * Status de Compras anda sozinho e só para a frente: 1º pedido → "Pedido realizado"; nota de todos os pedidos →
--    "Faturado pelo fornecedor"; faturado e tudo recebido → "Material entregue". O ajuste manual continua
--    (`alterar_status_fluxo_obra`). A previsão de entrega do material passa a ser a maior entrega prevista dos pedidos
--    ativos (continua ajustável à mão).
--  * Quem vê pedidos: quem atua em Compras na obra e quem vê os custos dela (admin, gestor, Administrativo, Operacional).
--  * Nenhum valor em dinheiro vai para `obra_historico` (ADR Pedido + Obra): só número do pedido e fornecedor.
--
-- Depende de: autorizacao_setor_obra (20261122100000), pode_ver_obra_operacao (20261102100000), preparar_escrita_obra,
-- gravar_status_fluxo_obra (20261119100100), registrar_historico_obra, obra_historico_tipo_check (20261121100000),
-- pode_ver_custos_obra, pasta_financeiro_obra, validar_anexo_financeiro e obra_contas_pagar (20261121100000),
-- tem_papel, meu_membro_id, hoje_brasilia, auditar, tocar_updated_at.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Quem atende Compras
-- ---------------------------------------------------------------------------

alter table public.empresas add column compras_atendido_por public.setor_obra
  check (compras_atendido_por is null or compras_atendido_por in ('administrativo', 'operacional'));
alter table public.empresas add column seq_pedido_compra integer not null default 0 check (seq_pedido_compra >= 0);

-- Setor que atua como Compras nesta empresa: 'compras' se alguém ativo tem o setor; senão o escolhido pelo admin (ou
-- nulo: só admin e gestor).
create or replace function public.setor_atende_compras(p_empresa_id uuid)
returns public.setor_obra
language sql stable security definer set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.membro_setores_obra s
      join public.empresa_membros m on m.id = s.membro_id and m.empresa_id = s.empresa_id and m.ativo and m.papel = 'operacao'
      where s.empresa_id = p_empresa_id and s.setor = 'compras'
    ) then 'compras'::public.setor_obra
    else (select e.compras_atendido_por from public.empresas e where e.id = p_empresa_id)
  end;
$$;
revoke all on function public.setor_atende_compras(uuid) from public, anon, authenticated, service_role;
grant execute on function public.setor_atende_compras(uuid) to authenticated;

-- Eu atuo em Compras nesta empresa (pelo setor Compras ou pelo setor que atende no lugar dele), com o papel Operação.
create or replace function public.atuo_em_compras(p_empresa_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tem_papel(p_empresa_id, '{operacao}') and exists (
    select 1 from public.membro_setores_obra s
    where s.empresa_id = p_empresa_id
      and s.membro_id = public.meu_membro_id(p_empresa_id)
      and s.setor = public.setor_atende_compras(p_empresa_id)
  );
$$;
revoke all on function public.atuo_em_compras(uuid) from public, anon, authenticated, service_role;
grant execute on function public.atuo_em_compras(uuid) to authenticated;

-- Só o admin escolhe (nulo = só admin e gestor).
create or replace function public.definir_atendimento_compras(p_empresa_id uuid, p_setor public.setor_obra default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.tem_papel(p_empresa_id, '{admin}') then
    raise exception 'Só o admin define quem atende Compras.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if p_setor is not null and p_setor not in ('administrativo', 'operacional') then
    raise exception 'Escolha Administrativo, Operacional ou só admin e gestor.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.empresas set compras_atendido_por = p_setor where id = p_empresa_id;
end;
$$;
revoke all on function public.definir_atendimento_compras(uuid, public.setor_obra) from public, anon, authenticated, service_role;
grant execute on function public.definir_atendimento_compras(uuid, public.setor_obra) to authenticated;

-- Corpo de 20261122100000_gestor_escreve_setores.sql + em Compras, o setor que atende no lugar dele.
create or replace function public.autorizacao_setor_obra(p_obra_id uuid, p_setor public.setor_obra)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p_setor is null or p_setor = 'comercial' then null
    when public.tem_papel(o.empresa_id, '{admin}') then 'admin'
    when public.tem_papel(o.empresa_id, '{gestor}') then 'coordenar'
    when not public.tem_papel(o.empresa_id, '{operacao}') then null
    when exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = o.empresa_id
        and s.membro_id = public.meu_membro_id(o.empresa_id)
        and s.setor = case when p_setor = 'compras' then public.setor_atende_compras(o.empresa_id) else p_setor end
        and s.capacidade = 'coordenar'
    ) then 'coordenar'
    when exists (
      select 1 from public.membro_setores_obra s
      where s.empresa_id = o.empresa_id
        and s.membro_id = public.meu_membro_id(o.empresa_id)
        and s.setor = case when p_setor = 'compras' then public.setor_atende_compras(o.empresa_id) else p_setor end
    ) and exists (
      select 1 from public.obra_participantes p
      where p.obra_id = o.id
        and p.empresa_id = o.empresa_id
        and p.membro_id = public.meu_membro_id(o.empresa_id)
        and p.setor = p_setor
        and p.fim is null
    ) then 'executar'
  end
  from public.obras o where o.id = p_obra_id;
$$;

-- Corpo de 20261102100000_engenharia_iniciar_atuacao.sql + fila de Compras (obras em curso sem responsável principal
-- em Compras, para quem atua em Compras).
create or replace function public.pode_ver_obra_operacao(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{operacao}')
      and (
        exists (
          select 1 from public.obra_participantes p
          where p.obra_id = o.id
            and p.membro_id = public.meu_membro_id(o.empresa_id)
            and p.fim is null
        )
        or exists (
          select 1 from public.membro_setores_obra s
          where s.empresa_id = o.empresa_id
            and s.membro_id = public.meu_membro_id(o.empresa_id)
            and s.capacidade = 'coordenar'
        )
        -- Novas obras: em curso, sem responsável principal na Engenharia, para quem atua nela.
        or (
          o.cancelada_em is null
          and exists (
            select 1 from public.membro_setores_obra s
            where s.empresa_id = o.empresa_id
              and s.membro_id = public.meu_membro_id(o.empresa_id)
              and s.setor = 'engenharia'
          )
          and exists (
            select 1 from public.obra_fluxos f
            where f.obra_id = o.id and f.setor = 'engenharia' and f.status <> 'concluido'
          )
          and not exists (
            select 1 from public.obra_participantes p
            where p.obra_id = o.id and p.setor = 'engenharia' and p.principal and p.fim is null
          )
        )
        -- Fila de Compras: em curso, sem responsável principal em Compras, para quem atua em Compras.
        or (
          o.cancelada_em is null
          and public.atuo_em_compras(o.empresa_id)
          and exists (
            select 1 from public.obra_fluxos f
            where f.obra_id = o.id and f.setor = 'compras' and f.status <> 'material_entregue'
          )
          and not exists (
            select 1 from public.obra_participantes p
            where p.obra_id = o.id and p.setor = 'compras' and p.principal and p.fim is null
          )
        )
      )
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- 2. Iniciar compra
-- ---------------------------------------------------------------------------

create or replace function public.iniciar_compra_obra(p_obra_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_meu uuid;
  v_aut text;
  v_atuo boolean;
  v_tem_principal boolean;
  v_status text;
  v_id uuid;
begin
  -- Trava a obra: dois "Iniciar" ao mesmo tempo passam um de cada vez.
  select * into v_obra from public.obras where id = p_obra_id for update;
  if found then
    v_meu := public.meu_membro_id(v_obra.empresa_id);
    v_aut := public.autorizacao_setor_obra(p_obra_id, 'compras');
    v_atuo := public.atuo_em_compras(v_obra.empresa_id);
  end if;
  -- Mesma resposta para "não existe" e "sem permissão": não revela obras de outros.
  if v_meu is null or (v_aut is null and not coalesce(v_atuo, false)) then
    raise exception 'Só quem atua em Compras pode iniciar a compra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obra.pausada_em is not null then
    raise exception 'Esta obra está pausada: fale com o coordenador antes de iniciar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select f.status into v_status from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'compras';
  if v_status is distinct from 'a_comprar' then
    raise exception 'A compra desta obra já foi iniciada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_tem_principal := exists (
    select 1 from public.obra_participantes p
    where p.obra_id = p_obra_id and p.setor = 'compras' and p.principal and p.fim is null
  );
  -- Quem atua em Compras e ainda não tem autorização na obra só inicia obra sem responsável.
  if v_aut is null and v_tem_principal then
    raise exception 'Esta obra já tem responsável em Compras.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Quem atua em Compras vira o responsável principal da obra sem responsável. Admin e gestor iniciam sem se atribuir.
  if v_atuo and not v_tem_principal then
    begin
      insert into public.obra_participantes (obra_id, empresa_id, membro_id, setor, funcao, principal, criado_por_user_id)
      values (p_obra_id, v_obra.empresa_id, v_meu, 'compras', 'responsavel', true, (select auth.uid()))
      returning id into v_id;
    exception
      -- Já é responsável (não principal) nesta obra: a mesma função ativa não pode repetir.
      when unique_violation then
        raise exception 'Você já está nesta obra como responsável: peça ao coordenador para torná-lo o principal.'
          using errcode = 'check_violation', hint = 'mensagem_usuario';
    end;
    perform public.registrar_historico_obra(p_obra_id, 'participante_atribuido', 'compras', jsonb_build_object(
      'participante_id', v_id,
      'membro_id', v_meu,
      'funcao', 'responsavel',
      'principal', true,
      'substitui_id', null,
      'autorizacao', 'executar',
      'origem', 'iniciar_compra'
    ));
    v_aut := coalesce(v_aut, 'executar');
  end if;

  perform public.gravar_status_fluxo_obra(p_obra_id, 'compras', 'cotando', v_aut, 'iniciar_compra');
end;
$$;
revoke all on function public.iniciar_compra_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.iniciar_compra_obra(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pedidos de compra
-- ---------------------------------------------------------------------------

create table public.compras_pedidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  numero integer not null check (numero > 0),
  fornecedor text not null check (length(btrim(fornecedor)) between 2 and 120),
  categoria text not null check (categoria in ('equipamentos', 'estrutura_materiais', 'mao_de_obra', 'homologacao', 'frete')),
  entrega_prevista date not null,
  vencimento date not null,
  numero_fornecedor text check (numero_fornecedor is null or length(btrim(numero_fornecedor)) between 1 and 60),
  frete numeric(12, 2) not null default 0 check (frete >= 0),
  valor_total numeric(12, 2) not null check (valor_total > 0),
  nf_numero text check (nf_numero is null or length(btrim(nf_numero)) between 1 and 60),
  nf_valor numeric(12, 2) check (nf_valor is null or nf_valor > 0),
  nf_registrada_em timestamptz,
  nf_registrada_por uuid,
  conta_id uuid unique references public.obra_contas_pagar (id),
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text check (motivo_cancelamento is null or length(btrim(motivo_cancelamento)) between 3 and 300),
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero),
  unique (empresa_id, id),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint compras_pedidos_nf check (
    (nf_registrada_em is null) = (nf_numero is null)
    and (nf_registrada_em is null) = (nf_valor is null)
    and (nf_registrada_em is null) = (conta_id is null)
  ),
  constraint compras_pedidos_cancelamento check ((cancelado_em is null) = (motivo_cancelamento is null)),
  constraint compras_pedidos_cancelado_sem_nf check (cancelado_em is null or nf_registrada_em is null)
);
create index on public.compras_pedidos (obra_id, created_at);
create index on public.compras_pedidos (empresa_id, created_at desc);
create trigger compras_pedidos_updated_at before update on public.compras_pedidos
  for each row execute function public.tocar_updated_at();
create trigger auditar_compras_pedidos after insert or update or delete on public.compras_pedidos
  for each row execute function public.auditar();

create table public.compras_pedido_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  pedido_id uuid not null,
  -- Posição do item no kit vendido gravado na obra (`obras.snapshot -> 'kit'`); nulo = item fora do kit.
  kit_indice integer check (kit_indice is null or kit_indice >= 0),
  descricao text not null check (length(btrim(descricao)) between 1 and 200),
  unidade text not null default 'un' check (length(btrim(unidade)) between 1 and 20),
  quantidade numeric(12, 3) not null check (quantidade > 0),
  valor_unitario numeric(12, 2) not null check (valor_unitario >= 0),
  quantidade_recebida numeric(12, 3) not null default 0,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, pedido_id) references public.compras_pedidos (empresa_id, id) on delete cascade,
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint compras_pedido_itens_recebida check (quantidade_recebida >= 0 and quantidade_recebida <= quantidade)
);
create index on public.compras_pedido_itens (pedido_id, ordem);
create index on public.compras_pedido_itens (obra_id);
create trigger auditar_compras_pedido_itens after insert or update or delete on public.compras_pedido_itens
  for each row execute function public.auditar();

-- Quem vê: quem atua em Compras na obra e quem vê os custos dela.
create or replace function public.pode_ver_pedidos_compra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.autorizacao_setor_obra(p_obra_id, 'compras') is not null or public.pode_ver_custos_obra(p_obra_id);
$$;
revoke all on function public.pode_ver_pedidos_compra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pedidos_compra(uuid) to authenticated;

alter table public.compras_pedidos enable row level security;
alter table public.compras_pedido_itens enable row level security;
create policy "ver pedidos de compra da obra" on public.compras_pedidos for select to authenticated
  using (public.pode_ver_pedidos_compra(obra_id));
create policy "ver itens dos pedidos de compra" on public.compras_pedido_itens for select to authenticated
  using (public.pode_ver_pedidos_compra(obra_id));
-- Só as funções escrevem.
revoke all on public.compras_pedidos, public.compras_pedido_itens from anon, authenticated, service_role;
grant select on public.compras_pedidos, public.compras_pedido_itens to authenticated, service_role;

-- Histórico (sem valores).
alter table public.obra_historico drop constraint obra_historico_tipo_check;
alter table public.obra_historico add constraint obra_historico_tipo_check check (tipo in (
  'obra_criada', 'pagamento_estornado', 'pagamento_reconfirmado', 'venda_alterada',
  'participante_atribuido', 'participante_encerrado', 'fluxo_alterado', 'marco_alterado',
  'fixacao_definida',
  'checklist_engenharia_aplicado', 'documento_engenharia_enviado', 'item_engenharia_alterado',
  'protocolo_engenharia_registrado', 'protocolo_engenharia_atualizado',
  'vistoria_engenharia_solicitada', 'vistoria_engenharia_atualizada', 'engenharia_concluida_excecao',
  'passo_engenharia_registrado', 'enquadramento_engenharia_salvo',
  'entrega_contratada_ajustada', 'entrega_material_prevista',
  'orcamento_ajustado', 'custo_lancado', 'custo_estornado',
  'justificativa_atraso_pedida', 'justificativa_atraso_cobrada', 'justificativa_atraso_respondida',
  'escalonamento_aberto', 'escalonamento_fechado',
  'obra_rede_engenharia',
  'conta_pagar_lancada', 'conta_paga', 'conta_cancelada', 'conta_estornada', 'nf_fornecedor_anexada', 'nf_cliente_anexada',
  'pedido_compra_criado', 'pedido_compra_editado', 'pedido_compra_cancelado', 'pedido_compra_faturado',
  'pedido_compra_recebido', 'pedido_compra_nf_desfeita'
));

-- Itens informados (jsonb) → linhas validadas do pedido. Devolve a soma dos itens.
-- Formato: [{"kit_indice": 0 | null, "descricao": "...", "unidade": "un", "quantidade": 10, "valor_unitario": 780}]
create or replace function public.gravar_itens_pedido_compra(p_pedido public.compras_pedidos, p_itens jsonb, p_kit jsonb)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_ordem integer := 0;
  v_total numeric := 0;
  v_kit_indice integer;
  v_descricao text;
  v_unidade text;
  v_qtd numeric;
  v_vu numeric;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua ao menos um item no pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if jsonb_array_length(p_itens) > 100 then
    raise exception 'Um pedido tem no máximo 100 itens.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    begin
      v_kit_indice := nullif(v_item ->> 'kit_indice', '')::integer;
      v_qtd := (v_item ->> 'quantidade')::numeric;
      v_vu := (v_item ->> 'valor_unitario')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Quantidade ou valor inválido num item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end;
    v_descricao := nullif(btrim(v_item ->> 'descricao'), '');
    v_unidade := coalesce(nullif(btrim(v_item ->> 'unidade'), ''), 'un');
    if v_descricao is null or length(v_descricao) > 200 then
      raise exception 'Informe a descrição de cada item (até 200 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if length(v_unidade) > 20 then
      raise exception 'A unidade tem no máximo 20 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_qtd is null or round(v_qtd, 3) <= 0 then
      raise exception 'Informe uma quantidade maior que zero em cada item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_vu is null or round(v_vu, 2) < 0 then
      raise exception 'Informe o valor unitário de cada item.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_kit_indice is not null and (v_kit_indice < 0 or v_kit_indice >= coalesce(jsonb_array_length(p_kit), 0)) then
      raise exception 'Item do kit não encontrado nesta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    insert into public.compras_pedido_itens (empresa_id, obra_id, pedido_id, kit_indice, descricao, unidade, quantidade, valor_unitario, ordem)
    values (p_pedido.empresa_id, p_pedido.obra_id, p_pedido.id, v_kit_indice, v_descricao, v_unidade, round(v_qtd, 3), round(v_vu, 2), v_ordem);
    v_total := v_total + round(round(v_qtd, 3) * round(v_vu, 2), 2);
    v_ordem := v_ordem + 1;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.gravar_itens_pedido_compra(public.compras_pedidos, jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.validar_dados_pedido_compra(
  p_fornecedor text, p_categoria text, p_entrega date, p_vencimento date, p_numero_fornecedor text, p_frete numeric
)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if nullif(btrim(p_fornecedor), '') is null or length(btrim(p_fornecedor)) < 2 or length(btrim(p_fornecedor)) > 120 then
    raise exception 'Informe o fornecedor (de 2 a 120 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_categoria is null or p_categoria not in ('equipamentos', 'estrutura_materiais', 'mao_de_obra', 'homologacao', 'frete') then
    raise exception 'Categoria de custo inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_entrega is null then
    raise exception 'Informe a entrega prevista.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_vencimento is null then
    raise exception 'Informe o vencimento do pagamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if nullif(btrim(p_numero_fornecedor), '') is not null and length(btrim(p_numero_fornecedor)) > 60 then
    raise exception 'O número do pedido no fornecedor tem no máximo 60 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_frete is not null and round(p_frete, 2) < 0 then
    raise exception 'O frete não pode ser negativo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.validar_dados_pedido_compra(text, text, date, date, text, numeric) from public, anon, authenticated, service_role;

-- Avança o status de Compras (nunca volta) e acerta a previsão de entrega do material pelos pedidos ativos.
create or replace function public.sincronizar_compras_obra(p_obra_id uuid, p_aut text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ordem constant text[] := array['a_comprar', 'cotando', 'pedido_realizado', 'faturado_fornecedor', 'material_entregue'];
  v_atual text;
  v_alvo text;
  v_ativos integer;
  v_sem_nf integer;
  v_falta_receber boolean;
  v_entrega date;
  v_prevista date;
begin
  select status into v_atual from public.obra_fluxos where obra_id = p_obra_id and setor = 'compras';
  select count(*), count(*) filter (where p.nf_registrada_em is null), max(p.entrega_prevista)
  into v_ativos, v_sem_nf, v_entrega
  from public.compras_pedidos p where p.obra_id = p_obra_id and p.cancelado_em is null;
  v_falta_receber := exists (
    select 1 from public.compras_pedido_itens i join public.compras_pedidos p on p.id = i.pedido_id
    where i.obra_id = p_obra_id and p.cancelado_em is null and i.quantidade_recebida < i.quantidade
  );

  v_alvo := case
    when v_ativos = 0 then null
    when v_sem_nf > 0 then 'pedido_realizado'
    when v_falta_receber then 'faturado_fornecedor'
    else 'material_entregue'
  end;
  if v_alvo is not null and array_position(v_ordem, v_alvo) > coalesce(array_position(v_ordem, v_atual), 0) then
    perform public.gravar_status_fluxo_obra(p_obra_id, 'compras', v_alvo, p_aut, 'pedido_compra');
  end if;

  if v_entrega is not null then
    select entrega_material_prevista into v_prevista from public.obras where id = p_obra_id;
    if v_prevista is distinct from v_entrega then
      update public.obras set entrega_material_prevista = v_entrega where id = p_obra_id;
      perform public.registrar_historico_obra(p_obra_id, 'entrega_material_prevista', 'compras', jsonb_build_object(
        'de', v_prevista, 'para', v_entrega, 'autorizacao', p_aut, 'origem', 'pedido_compra'
      ));
    end if;
  end if;
end;
$$;
revoke all on function public.sincronizar_compras_obra(uuid, text) from public, anon, authenticated, service_role;

create or replace function public.criar_pedido_compra(
  p_obra_id uuid,
  p_fornecedor text,
  p_categoria text,
  p_entrega_prevista date,
  p_vencimento date,
  p_numero_fornecedor text,
  p_frete numeric,
  p_itens jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_obra public.obras;
  v_numero integer;
  v_pedido public.compras_pedidos;
  v_total numeric;
  v_frete numeric := round(coalesce(p_frete, 0), 2);
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'compras', true);
  if exists (select 1 from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'compras' and f.status = 'a_comprar') then
    raise exception 'Clique em "Iniciar compra" antes de fazer o pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_dados_pedido_compra(p_fornecedor, p_categoria, p_entrega_prevista, p_vencimento, p_numero_fornecedor, p_frete);
  select * into v_obra from public.obras where id = p_obra_id;

  update public.empresas set seq_pedido_compra = seq_pedido_compra + 1
  where id = v_obra.empresa_id returning seq_pedido_compra into v_numero;

  -- Total provisório: o real sai dos itens logo abaixo.
  insert into public.compras_pedidos (
    empresa_id, obra_id, numero, fornecedor, categoria, entrega_prevista, vencimento, numero_fornecedor, frete,
    valor_total, criado_por
  )
  values (
    v_obra.empresa_id, p_obra_id, v_numero, btrim(p_fornecedor), p_categoria, p_entrega_prevista, p_vencimento,
    nullif(btrim(p_numero_fornecedor), ''), v_frete, 0.01, public.meu_membro_id(v_obra.empresa_id)
  )
  returning * into v_pedido;

  v_total := public.gravar_itens_pedido_compra(v_pedido, p_itens, v_obra.snapshot -> 'kit') + v_frete;
  if v_total <= 0 then
    raise exception 'O total do pedido precisa ser maior que zero.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.compras_pedidos set valor_total = v_total where id = v_pedido.id;

  perform public.registrar_historico_obra(p_obra_id, 'pedido_compra_criado', 'compras', jsonb_build_object(
    'pedido_id', v_pedido.id, 'numero', v_numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_aut
  ));
  perform public.sincronizar_compras_obra(p_obra_id, v_aut);
  return v_pedido.id;
end;
$$;
revoke all on function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb) to authenticated;

-- Trava o pedido e confere a escrita em Compras da obra dele. Mesma resposta para "não existe" e "sem permissão".
create or replace function public.preparar_escrita_pedido_compra(p_pedido_id uuid, out pedido public.compras_pedidos, out aut text)
language plpgsql security definer set search_path = ''
as $$
begin
  select * into pedido from public.compras_pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Você não tem permissão para alterar este setor da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  -- Obra antes do pedido: mesma ordem de trava das outras escritas da obra.
  aut := public.preparar_escrita_obra(pedido.obra_id, 'compras', true);
  select * into pedido from public.compras_pedidos where id = p_pedido_id for update;
  if pedido.cancelado_em is not null then
    raise exception 'Este pedido foi cancelado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.preparar_escrita_pedido_compra(uuid) from public, anon, authenticated, service_role;

-- Sem nota fiscal e sem nada recebido: troca os dados e os itens.
create or replace function public.editar_pedido_compra(
  p_pedido_id uuid,
  p_fornecedor text,
  p_categoria text,
  p_entrega_prevista date,
  p_vencimento date,
  p_numero_fornecedor text,
  p_frete numeric,
  p_itens jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_p record := public.preparar_escrita_pedido_compra(p_pedido_id);
  v_pedido public.compras_pedidos := v_p.pedido;
  v_frete numeric := round(coalesce(p_frete, 0), 2);
  v_total numeric;
begin
  if v_pedido.nf_registrada_em is not null then
    raise exception 'Pedido com nota fiscal não se edita: cancele a conta no Financeiro para corrigir.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.compras_pedido_itens i where i.pedido_id = p_pedido_id and i.quantidade_recebida > 0) then
    raise exception 'Pedido com material recebido não se edita.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_dados_pedido_compra(p_fornecedor, p_categoria, p_entrega_prevista, p_vencimento, p_numero_fornecedor, p_frete);

  update public.compras_pedidos set
    fornecedor = btrim(p_fornecedor), categoria = p_categoria, entrega_prevista = p_entrega_prevista,
    vencimento = p_vencimento, numero_fornecedor = nullif(btrim(p_numero_fornecedor), ''), frete = v_frete
  where id = p_pedido_id
  returning * into v_pedido;
  delete from public.compras_pedido_itens where pedido_id = p_pedido_id;
  v_total := public.gravar_itens_pedido_compra(
    v_pedido, p_itens, (select o.snapshot -> 'kit' from public.obras o where o.id = v_pedido.obra_id)
  ) + v_frete;
  if v_total <= 0 then
    raise exception 'O total do pedido precisa ser maior que zero.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.compras_pedidos set valor_total = v_total where id = p_pedido_id;

  perform public.registrar_historico_obra(v_pedido.obra_id, 'pedido_compra_editado', 'compras', jsonb_build_object(
    'pedido_id', p_pedido_id, 'numero', v_pedido.numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_p.aut
  ));
  perform public.sincronizar_compras_obra(v_pedido.obra_id, v_p.aut);
end;
$$;
revoke all on function public.editar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.editar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb) to authenticated;

create or replace function public.cancelar_pedido_compra(p_pedido_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_p record := public.preparar_escrita_pedido_compra(p_pedido_id);
  v_pedido public.compras_pedidos := v_p.pedido;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_pedido.nf_registrada_em is not null then
    raise exception 'Pedido com nota fiscal não se cancela: cancele a conta no Financeiro primeiro.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.compras_pedido_itens i where i.pedido_id = p_pedido_id and i.quantidade_recebida > 0) then
    raise exception 'Pedido com material recebido não se cancela.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Explique o motivo (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.compras_pedidos
  set cancelado_em = now(), cancelado_por = public.meu_membro_id(v_pedido.empresa_id), motivo_cancelamento = v_motivo
  where id = p_pedido_id;
  perform public.registrar_historico_obra(v_pedido.obra_id, 'pedido_compra_cancelado', 'compras', jsonb_build_object(
    'pedido_id', p_pedido_id, 'numero', v_pedido.numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_p.aut
  ));
  -- Cancelar pode completar a nota ou o recebimento dos pedidos que sobram.
  perform public.sincronizar_compras_obra(v_pedido.obra_id, v_p.aut);
end;
$$;
revoke all on function public.cancelar_pedido_compra(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cancelar_pedido_compra(uuid, text) to authenticated;

-- Nota fiscal do pedido: cria a conta a pagar no valor da nota, com a nota anexada.
create or replace function public.registrar_nf_pedido_compra(
  p_pedido_id uuid, p_nf_numero text, p_nf_valor numeric, p_caminho text, p_nome text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_p record := public.preparar_escrita_pedido_compra(p_pedido_id);
  v_pedido public.compras_pedidos := v_p.pedido;
  v_numero text := nullif(btrim(p_nf_numero), '');
  v_eu uuid := public.meu_membro_id(v_pedido.empresa_id);
  v_conta uuid;
begin
  if v_pedido.nf_registrada_em is not null then
    raise exception 'Este pedido já tem nota fiscal.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_numero is null or length(v_numero) > 60 then
    raise exception 'Informe o número da nota (até 60 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_nf_valor is null or round(p_nf_valor, 2) <= 0 then
    raise exception 'Informe o valor da nota.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_anexo_financeiro(v_pedido.obra_id, 'fornecedor', p_caminho, p_nome);

  insert into public.obra_contas_pagar (
    empresa_id, obra_id, fornecedor, categoria, descricao, valor, vencimento, nf_caminho, nf_nome, nf_anexada_em, criado_por
  )
  values (
    v_pedido.empresa_id, v_pedido.obra_id, v_pedido.fornecedor, v_pedido.categoria,
    'Pedido P-' || lpad(v_pedido.numero::text, 4, '0') || ' · NF ' || v_numero,
    round(p_nf_valor, 2), v_pedido.vencimento, p_caminho, btrim(p_nome), now(), v_eu
  )
  returning id into v_conta;

  update public.compras_pedidos
  set nf_numero = v_numero, nf_valor = round(p_nf_valor, 2), nf_registrada_em = now(), nf_registrada_por = v_eu, conta_id = v_conta
  where id = p_pedido_id;

  perform public.registrar_historico_obra(v_pedido.obra_id, 'pedido_compra_faturado', 'compras', jsonb_build_object(
    'pedido_id', p_pedido_id, 'numero', v_pedido.numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_p.aut
  ));
  perform public.registrar_historico_obra(v_pedido.obra_id, 'conta_pagar_lancada', 'compras', jsonb_build_object(
    'fornecedor', v_pedido.fornecedor, 'categoria', v_pedido.categoria, 'autorizacao', v_p.aut, 'origem', 'pedido_compra'
  ));
  perform public.sincronizar_compras_obra(v_pedido.obra_id, v_p.aut);
  return v_conta;
end;
$$;
revoke all on function public.registrar_nf_pedido_compra(uuid, text, numeric, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_nf_pedido_compra(uuid, text, numeric, text, text) to authenticated;

-- Recebimento: quantidade que chegou agora em cada item (soma ao que já tinha chegado).
-- Formato: [{"item_id": "...", "quantidade": 10}]
create or replace function public.registrar_recebimento_pedido_compra(p_pedido_id uuid, p_itens jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_p record := public.preparar_escrita_pedido_compra(p_pedido_id);
  v_pedido public.compras_pedidos := v_p.pedido;
  v_item jsonb;
  v_id uuid;
  v_qtd numeric;
  v_linha public.compras_pedido_itens;
  v_algum boolean := false;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe o que chegou.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    begin
      v_id := (v_item ->> 'item_id')::uuid;
      v_qtd := round((v_item ->> 'quantidade')::numeric, 3);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Quantidade inválida no recebimento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end;
    if v_qtd is null or v_qtd < 0 then
      raise exception 'Quantidade inválida no recebimento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    continue when v_qtd = 0;
    select * into v_linha from public.compras_pedido_itens where id = v_id and pedido_id = p_pedido_id for update;
    if not found then
      raise exception 'Item não encontrado neste pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if v_linha.quantidade_recebida + v_qtd > v_linha.quantidade then
      raise exception 'Chegou mais do que o pedido em "%".', v_linha.descricao using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    update public.compras_pedido_itens set quantidade_recebida = quantidade_recebida + v_qtd where id = v_id;
    v_algum := true;
  end loop;
  if not v_algum then
    raise exception 'Informe o que chegou.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  perform public.registrar_historico_obra(v_pedido.obra_id, 'pedido_compra_recebido', 'compras', jsonb_build_object(
    'pedido_id', p_pedido_id, 'numero', v_pedido.numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_p.aut,
    'completo', not exists (
      select 1 from public.compras_pedido_itens i where i.pedido_id = p_pedido_id and i.quantidade_recebida < i.quantidade
    )
  ));
  perform public.sincronizar_compras_obra(v_pedido.obra_id, v_p.aut);
end;
$$;
revoke all on function public.registrar_recebimento_pedido_compra(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.registrar_recebimento_pedido_compra(uuid, jsonb) to authenticated;

-- Conta do pedido cancelada no Financeiro: o pedido volta a "aguardando nota fiscal" (o status de Compras não volta).
create or replace function public.pedido_compra_ao_cancelar_conta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pedido public.compras_pedidos;
begin
  update public.compras_pedidos
  set nf_numero = null, nf_valor = null, nf_registrada_em = null, nf_registrada_por = null, conta_id = null
  where conta_id = new.id
  returning * into v_pedido;
  if found then
    perform public.registrar_historico_obra(v_pedido.obra_id, 'pedido_compra_nf_desfeita', 'compras', jsonb_build_object(
      'pedido_id', v_pedido.id, 'numero', v_pedido.numero, 'fornecedor', v_pedido.fornecedor
    ));
  end if;
  return null;
end;
$$;
revoke all on function public.pedido_compra_ao_cancelar_conta() from public, anon, authenticated, service_role;
create trigger obra_contas_pagar_pedido_compra after update of situacao on public.obra_contas_pagar
  for each row when (new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada')
  execute function public.pedido_compra_ao_cancelar_conta();

-- ---------------------------------------------------------------------------
-- 4. Anexos: Compras também envia a nota do fornecedor (pasta `fornecedor` do bucket `financeiro-obra`)
-- ---------------------------------------------------------------------------

-- Corpo de 20261121100000_contas_pagar_obra.sql + Compras da obra na pasta do fornecedor.
create or replace function public.pode_enviar_pasta_financeiro(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select o.cancelada_em is null and (
      public.autorizacao_setor_obra(o.id, 'administrativo') is not null
      or (p.tipo = 'fornecedor' and public.autorizacao_setor_obra(o.id, 'compras') is not null)
    )
    from public.pasta_financeiro_obra(p_caminho) p join public.obras o on o.id = p.obra_id
  ), false);
$$;

-- Corpo de 20261121100000_contas_pagar_obra.sql + Compras da obra lê a pasta do fornecedor (a nota que enviou).
create or replace function public.pode_ver_pasta_financeiro(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case p.tipo
      when 'fornecedor' then public.pode_ver_custos_obra(p.obra_id) or public.autorizacao_setor_obra(p.obra_id, 'compras') is not null
      else public.pode_ver_nf_cliente_obra(p.obra_id)
    end
    from public.pasta_financeiro_obra(p_caminho) p
  ), false);
$$;

reset lock_timeout;
