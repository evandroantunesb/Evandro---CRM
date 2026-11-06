-- Compras, P2: orçamentos e arquivos de compra da obra (desenho aprovado "Orçamentos e pedidos da obra", canvas
-- "Compras · Pedidos de compra"; decisões do Evandro de 06/11/2026).
--
--  * Orçamento: fornecedor (nome livre), valor total, itens cobertos (kit completo ou parte do kit, com quais itens),
--    entrega prometida, validade, condição de pagamento (opcional), observação (opcional) e o arquivo (obrigatório: PDF,
--    imagem ou planilha .xlsx/.csv). Anexa quem escreve em Compras na obra, só depois do "Iniciar compra".
--  * Edita (sem trocar o arquivo) e descarta (com motivo) enquanto não virou pedido ativo. Nada se apaga: o orçamento
--    descartado sai da comparação e o arquivo continua na lista.
--  * "Gerar pedido deste": `criar_pedido_compra` ganha `p_orcamento_id` e liga o orçamento ao pedido na mesma transação.
--    Um orçamento gera no máximo um pedido ativo; pedido cancelado libera o orçamento.
--  * Arquivos de compra: tudo o que foi anexado na obra (orçamentos, confirmação do pedido e outros), num bucket privado
--    próprio (`compras-obra`, pasta `empresa/obra/arquivo`), porque o do Financeiro não aceita planilha. A nota fiscal do
--    fornecedor continua no pedido e no Financeiro.
--  * Quem vê: os mesmos que veem os pedidos (`pode_ver_pedidos_compra`: Compras na obra, admin, gestor, Administrativo
--    e Operacional).
--  * Nenhum valor em dinheiro vai para `obra_historico`: só fornecedor, tipo e número do pedido.
--
-- Depende de: 20261125100000_compras_pedidos.sql (compras_pedidos, pode_ver_pedidos_compra, criar_pedido_compra,
-- gravar_itens_pedido_compra, validar_dados_pedido_compra, sincronizar_compras_obra, obra_historico_tipo_check),
-- preparar_escrita_obra, autorizacao_setor_obra, registrar_historico_obra, meu_membro_id, auditar, tocar_updated_at.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Arquivos de compra (bucket privado `compras-obra`)
-- ---------------------------------------------------------------------------

-- Obra da pasta `empresa/obra/arquivo`; nula se o formato ou a empresa não conferem.
create or replace function public.pasta_compras_obra(p_caminho text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_obra uuid;
  v_empresa uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[3] = '' then
    return null;
  end if;
  begin
    v_empresa := v_partes[1]::uuid;
    v_obra := v_partes[2]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return (select o.id from public.obras o where o.id = v_obra and o.empresa_id = v_empresa);
end;
$$;
revoke all on function public.pasta_compras_obra(text) from public, anon, authenticated, service_role;

create or replace function public.pode_ver_pasta_compras(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.pode_ver_pedidos_compra(public.pasta_compras_obra(p_caminho)), false);
$$;
revoke all on function public.pode_ver_pasta_compras(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pasta_compras(text) to authenticated;

-- Enviar: quem escreve em Compras na obra (Compras, coordenador, gestor, admin), com a obra não cancelada.
create or replace function public.pode_enviar_pasta_compras(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select o.cancelada_em is null and public.autorizacao_setor_obra(o.id, 'compras') is not null
    from public.obras o where o.id = public.pasta_compras_obra(p_caminho)
  ), false);
$$;
revoke all on function public.pode_enviar_pasta_compras(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_enviar_pasta_compras(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-obra', 'compras-obra', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'
])
on conflict (id) do nothing;

create policy "compras-obra: ler" on storage.objects for select to authenticated
  using (bucket_id = 'compras-obra' and public.pode_ver_pasta_compras(name));
create policy "compras-obra: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'compras-obra' and public.pode_enviar_pasta_compras(name));

create table public.compras_arquivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  tipo text not null check (tipo in ('orcamento', 'confirmacao', 'outro')),
  -- Confirmação: sempre de um pedido. Outro: pedido opcional. Orçamento: o pedido sai do próprio orçamento.
  pedido_id uuid,
  -- Só em "outro" (opcional); nos demais o fornecedor sai do orçamento ou do pedido.
  fornecedor text check (fornecedor is null or length(btrim(fornecedor)) between 2 and 120),
  caminho text not null unique,
  nome text not null check (length(btrim(nome)) between 1 and 200),
  enviado_por uuid,
  created_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, pedido_id) references public.compras_pedidos (empresa_id, id),
  constraint compras_arquivos_pedido check (
    (tipo = 'confirmacao' and pedido_id is not null)
    or (tipo = 'orcamento' and pedido_id is null and fornecedor is null)
    or tipo = 'outro'
  ),
  constraint compras_arquivos_fornecedor check (tipo = 'outro' or fornecedor is null)
);
create index on public.compras_arquivos (obra_id, created_at desc);
create index on public.compras_arquivos (pedido_id) where pedido_id is not null;
create trigger auditar_compras_arquivos after insert or update or delete on public.compras_arquivos
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- 2. Orçamentos
-- ---------------------------------------------------------------------------

create table public.compras_orcamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  fornecedor text not null check (length(btrim(fornecedor)) between 2 and 120),
  valor_total numeric(12, 2) not null check (valor_total > 0),
  cobertura text not null check (cobertura in ('kit_completo', 'parte')),
  itens_descricao text check (itens_descricao is null or length(btrim(itens_descricao)) between 2 and 200),
  entrega_prevista date not null,
  valido_ate date not null,
  condicao_pagamento text check (condicao_pagamento is null or length(btrim(condicao_pagamento)) between 1 and 60),
  observacao text check (observacao is null or length(btrim(observacao)) between 1 and 300),
  arquivo_id uuid not null unique,
  -- Pedido gerado a partir deste orçamento (o último; cancelado = orçamento livre de novo).
  pedido_id uuid unique,
  descartado_em timestamptz,
  descartado_por uuid,
  motivo_descarte text check (motivo_descarte is null or length(btrim(motivo_descarte)) between 3 and 300),
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  foreign key (empresa_id, arquivo_id) references public.compras_arquivos (empresa_id, id),
  foreign key (empresa_id, pedido_id) references public.compras_pedidos (empresa_id, id),
  constraint compras_orcamentos_itens check ((cobertura = 'parte') = (itens_descricao is not null)),
  constraint compras_orcamentos_descarte check ((descartado_em is null) = (motivo_descarte is null))
);
create index on public.compras_orcamentos (obra_id, created_at);
create trigger compras_orcamentos_updated_at before update on public.compras_orcamentos
  for each row execute function public.tocar_updated_at();
create trigger auditar_compras_orcamentos after insert or update or delete on public.compras_orcamentos
  for each row execute function public.auditar();

alter table public.compras_arquivos enable row level security;
alter table public.compras_orcamentos enable row level security;
create policy "ver arquivos de compra da obra" on public.compras_arquivos for select to authenticated
  using (public.pode_ver_pedidos_compra(obra_id));
create policy "ver orçamentos de compra da obra" on public.compras_orcamentos for select to authenticated
  using (public.pode_ver_pedidos_compra(obra_id));
-- Só as funções escrevem.
revoke all on public.compras_arquivos, public.compras_orcamentos from anon, authenticated, service_role;
grant select on public.compras_arquivos, public.compras_orcamentos to authenticated, service_role;

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
  'pedido_compra_recebido', 'pedido_compra_nf_desfeita',
  'orcamento_compra_anexado', 'orcamento_compra_editado', 'orcamento_compra_descartado', 'arquivo_compra_anexado'
));

-- Escrita em Compras da obra, depois do "Iniciar compra". Devolve a autorização.
create or replace function public.preparar_escrita_compras_obra(p_obra_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'compras', true);
begin
  if exists (select 1 from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'compras' and f.status = 'a_comprar') then
    raise exception 'Clique em "Iniciar compra" antes.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  return v_aut;
end;
$$;
revoke all on function public.preparar_escrita_compras_obra(uuid) from public, anon, authenticated, service_role;

-- Registra o arquivo já enviado ao bucket (pasta desta obra, ainda não usado). Devolve o id.
create or replace function public.gravar_arquivo_compra(
  p_obra_id uuid, p_tipo text, p_pedido_id uuid, p_fornecedor text, p_caminho text, p_nome text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_caminho is null or nullif(btrim(p_nome), '') is null or length(btrim(p_nome)) > 200 then
    raise exception 'Envie o arquivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if public.pasta_compras_obra(p_caminho) is distinct from p_obra_id
     or not exists (select 1 from storage.objects s where s.bucket_id = 'compras-obra' and s.name = p_caminho)
     or exists (select 1 from public.compras_arquivos a where a.caminho = p_caminho) then
    raise exception 'O arquivo enviado não é desta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.compras_arquivos (empresa_id, obra_id, tipo, pedido_id, fornecedor, caminho, nome, enviado_por)
  select o.empresa_id, o.id, p_tipo, p_pedido_id, nullif(btrim(p_fornecedor), ''), p_caminho, btrim(p_nome),
         public.meu_membro_id(o.empresa_id)
  from public.obras o where o.id = p_obra_id
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.gravar_arquivo_compra(uuid, text, uuid, text, text, text) from public, anon, authenticated, service_role;

create or replace function public.validar_dados_orcamento_compra(
  p_fornecedor text, p_valor numeric, p_cobertura text, p_itens text, p_entrega date, p_validade date,
  p_pagamento text, p_observacao text
)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if nullif(btrim(p_fornecedor), '') is null or length(btrim(p_fornecedor)) < 2 or length(btrim(p_fornecedor)) > 120 then
    raise exception 'Informe o fornecedor (de 2 a 120 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception 'Informe o valor total do orçamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_cobertura is null or p_cobertura not in ('kit_completo', 'parte') then
    raise exception 'Escolha os itens cobertos.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_cobertura = 'parte' and (nullif(btrim(p_itens), '') is null or length(btrim(p_itens)) < 2 or length(btrim(p_itens)) > 200) then
    raise exception 'Diga quais itens do kit o orçamento cobre (até 200 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_entrega is null then
    raise exception 'Informe a entrega prometida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_validade is null then
    raise exception 'Informe até quando o orçamento vale.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(p_pagamento)) > 60 then
    raise exception 'A condição de pagamento tem no máximo 60 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(p_observacao)) > 300 then
    raise exception 'A observação tem no máximo 300 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.validar_dados_orcamento_compra(text, numeric, text, text, date, date, text, text) from public, anon, authenticated, service_role;

create or replace function public.anexar_orcamento_compra(
  p_obra_id uuid,
  p_fornecedor text,
  p_valor numeric,
  p_cobertura text,
  p_itens text,
  p_entrega_prevista date,
  p_valido_ate date,
  p_condicao_pagamento text,
  p_observacao text,
  p_caminho text,
  p_nome text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_compras_obra(p_obra_id);
  v_arquivo uuid;
  v_orcamento public.compras_orcamentos;
begin
  perform public.validar_dados_orcamento_compra(
    p_fornecedor, p_valor, p_cobertura, p_itens, p_entrega_prevista, p_valido_ate, p_condicao_pagamento, p_observacao
  );
  v_arquivo := public.gravar_arquivo_compra(p_obra_id, 'orcamento', null, null, p_caminho, p_nome);
  insert into public.compras_orcamentos (
    empresa_id, obra_id, fornecedor, valor_total, cobertura, itens_descricao, entrega_prevista, valido_ate,
    condicao_pagamento, observacao, arquivo_id, criado_por
  )
  select o.empresa_id, o.id, btrim(p_fornecedor), round(p_valor, 2), p_cobertura,
         case when p_cobertura = 'parte' then btrim(p_itens) end, p_entrega_prevista, p_valido_ate,
         nullif(btrim(p_condicao_pagamento), ''), nullif(btrim(p_observacao), ''), v_arquivo, public.meu_membro_id(o.empresa_id)
  from public.obras o where o.id = p_obra_id
  returning * into v_orcamento;

  perform public.registrar_historico_obra(p_obra_id, 'orcamento_compra_anexado', 'compras', jsonb_build_object(
    'orcamento_id', v_orcamento.id, 'fornecedor', v_orcamento.fornecedor, 'autorizacao', v_aut
  ));
  return v_orcamento.id;
end;
$$;
revoke all on function public.anexar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.anexar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text, text, text) to authenticated;

-- Trava o orçamento e confere a escrita em Compras da obra dele; recusa descartado ou já ligado a pedido ativo.
-- Mesma resposta para "não existe" e "sem permissão".
create or replace function public.preparar_escrita_orcamento_compra(p_orcamento_id uuid, out orcamento public.compras_orcamentos, out aut text)
language plpgsql security definer set search_path = ''
as $$
begin
  select * into orcamento from public.compras_orcamentos where id = p_orcamento_id;
  if not found then
    raise exception 'Você não tem permissão para alterar este setor da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  -- Obra antes do orçamento: mesma ordem de trava das outras escritas da obra.
  aut := public.preparar_escrita_compras_obra(orcamento.obra_id);
  select * into orcamento from public.compras_orcamentos where id = p_orcamento_id for update;
  if orcamento.descartado_em is not null then
    raise exception 'Este orçamento foi descartado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.compras_pedidos p where p.id = orcamento.pedido_id and p.cancelado_em is null) then
    raise exception 'Este orçamento já virou pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.preparar_escrita_orcamento_compra(uuid) from public, anon, authenticated, service_role;

-- Corrige os dados (o arquivo não muda: arquivo errado, descarte e anexe outro).
create or replace function public.editar_orcamento_compra(
  p_orcamento_id uuid,
  p_fornecedor text,
  p_valor numeric,
  p_cobertura text,
  p_itens text,
  p_entrega_prevista date,
  p_valido_ate date,
  p_condicao_pagamento text,
  p_observacao text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_o record := public.preparar_escrita_orcamento_compra(p_orcamento_id);
  v_orcamento public.compras_orcamentos := v_o.orcamento;
begin
  perform public.validar_dados_orcamento_compra(
    p_fornecedor, p_valor, p_cobertura, p_itens, p_entrega_prevista, p_valido_ate, p_condicao_pagamento, p_observacao
  );
  update public.compras_orcamentos set
    fornecedor = btrim(p_fornecedor), valor_total = round(p_valor, 2), cobertura = p_cobertura,
    itens_descricao = case when p_cobertura = 'parte' then btrim(p_itens) end,
    entrega_prevista = p_entrega_prevista, valido_ate = p_valido_ate,
    condicao_pagamento = nullif(btrim(p_condicao_pagamento), ''), observacao = nullif(btrim(p_observacao), '')
  where id = p_orcamento_id
  returning * into v_orcamento;
  perform public.registrar_historico_obra(v_orcamento.obra_id, 'orcamento_compra_editado', 'compras', jsonb_build_object(
    'orcamento_id', p_orcamento_id, 'fornecedor', v_orcamento.fornecedor, 'autorizacao', v_o.aut
  ));
end;
$$;
revoke all on function public.editar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text) from public, anon, authenticated, service_role;
grant execute on function public.editar_orcamento_compra(uuid, text, numeric, text, text, date, date, text, text) to authenticated;

create or replace function public.descartar_orcamento_compra(p_orcamento_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_o record := public.preparar_escrita_orcamento_compra(p_orcamento_id);
  v_orcamento public.compras_orcamentos := v_o.orcamento;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Explique o motivo (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.compras_orcamentos
  set descartado_em = now(), descartado_por = public.meu_membro_id(v_orcamento.empresa_id), motivo_descarte = v_motivo
  where id = p_orcamento_id;
  perform public.registrar_historico_obra(v_orcamento.obra_id, 'orcamento_compra_descartado', 'compras', jsonb_build_object(
    'orcamento_id', p_orcamento_id, 'fornecedor', v_orcamento.fornecedor, 'autorizacao', v_o.aut
  ));
end;
$$;
revoke all on function public.descartar_orcamento_compra(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.descartar_orcamento_compra(uuid, text) to authenticated;

-- Confirmação do pedido (de um pedido ativo desta obra) ou outro arquivo de compra (pedido opcional).
create or replace function public.anexar_arquivo_compra(
  p_obra_id uuid, p_tipo text, p_caminho text, p_nome text, p_pedido_id uuid default null, p_fornecedor text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_compras_obra(p_obra_id);
  v_pedido public.compras_pedidos;
  v_id uuid;
begin
  if p_tipo is null or p_tipo not in ('confirmacao', 'outro') then
    raise exception 'Escolha o tipo do arquivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_pedido_id is not null then
    select * into v_pedido from public.compras_pedidos where id = p_pedido_id and obra_id = p_obra_id;
    if not found or v_pedido.cancelado_em is not null then
      raise exception 'Escolha um pedido desta obra que não esteja cancelado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  elsif p_tipo = 'confirmacao' then
    raise exception 'Escolha o pedido desta confirmação.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo = 'outro' and nullif(btrim(p_fornecedor), '') is not null
     and (length(btrim(p_fornecedor)) < 2 or length(btrim(p_fornecedor)) > 120) then
    raise exception 'O fornecedor tem de 2 a 120 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  v_id := public.gravar_arquivo_compra(
    p_obra_id, p_tipo, p_pedido_id, case when p_tipo = 'outro' then p_fornecedor end, p_caminho, p_nome
  );
  perform public.registrar_historico_obra(p_obra_id, 'arquivo_compra_anexado', 'compras', jsonb_build_object(
    'arquivo_id', v_id, 'tipo', p_tipo, 'pedido_id', p_pedido_id, 'numero', v_pedido.numero, 'autorizacao', v_aut
  ));
  return v_id;
end;
$$;
revoke all on function public.anexar_arquivo_compra(uuid, text, text, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.anexar_arquivo_compra(uuid, text, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. "Gerar pedido deste": o pedido nasce ligado ao orçamento
-- ---------------------------------------------------------------------------

-- Corpo de 20261125100000_compras_pedidos.sql + `p_orcamento_id` (opcional). A assinatura antiga sai para não haver
-- duas versões; quem chama sem o orçamento continua funcionando (o parâmetro novo tem padrão).
drop function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb);
create function public.criar_pedido_compra(
  p_obra_id uuid,
  p_fornecedor text,
  p_categoria text,
  p_entrega_prevista date,
  p_vencimento date,
  p_numero_fornecedor text,
  p_frete numeric,
  p_itens jsonb,
  p_orcamento_id uuid default null
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
  v_orcamento public.compras_orcamentos;
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'compras', true);
  if exists (select 1 from public.obra_fluxos f where f.obra_id = p_obra_id and f.setor = 'compras' and f.status = 'a_comprar') then
    raise exception 'Clique em "Iniciar compra" antes de fazer o pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_dados_pedido_compra(p_fornecedor, p_categoria, p_entrega_prevista, p_vencimento, p_numero_fornecedor, p_frete);
  select * into v_obra from public.obras where id = p_obra_id;

  if p_orcamento_id is not null then
    select * into v_orcamento from public.compras_orcamentos where id = p_orcamento_id and obra_id = p_obra_id for update;
    if not found or v_orcamento.descartado_em is not null then
      raise exception 'Este orçamento não está disponível nesta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if exists (select 1 from public.compras_pedidos p where p.id = v_orcamento.pedido_id and p.cancelado_em is null) then
      raise exception 'Este orçamento já virou pedido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;

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

  if p_orcamento_id is not null then
    update public.compras_orcamentos set pedido_id = v_pedido.id where id = p_orcamento_id;
  end if;

  perform public.registrar_historico_obra(p_obra_id, 'pedido_compra_criado', 'compras', jsonb_build_object(
    'pedido_id', v_pedido.id, 'numero', v_numero, 'fornecedor', v_pedido.fornecedor, 'autorizacao', v_aut,
    'orcamento_id', p_orcamento_id
  ));
  perform public.sincronizar_compras_obra(p_obra_id, v_aut);
  return v_pedido.id;
end;
$$;
revoke all on function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.criar_pedido_compra(uuid, text, text, date, date, text, numeric, jsonb, uuid) to authenticated;

reset lock_timeout;
