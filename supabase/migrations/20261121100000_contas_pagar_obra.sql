-- Contas a pagar da obra e nota fiscal do cliente (PR A2a de "Perfis e setores"; desenhos aprovados "Ficha da obra ·
-- Administrativo" e "Administrativo · Financeiro", decisões do Evandro de 05/11/2026).
--
--  * Conta a pagar: fornecedor (nome livre), categoria de custo, descrição, valor e vencimento, lançada pelo
--    Administrativo da obra (ou admin). Fica separada do custo real e só vira `obra_custos` quando é paga, na mesma
--    categoria: o semáforo e a margem continuam contando só o que saiu do caixa.
--  * Registrar o pagamento pede a data e o comprovante; a nota fiscal do fornecedor pode vir antes ou depois.
--  * Conta a pagar se cancela com motivo. Conta paga não se apaga: o pagamento é estornado com motivo (o custo sai da
--    obra pelo estorno de sempre) e a conta fica "estornada"; o certo é lançado como conta nova.
--  * O custo de uma conta paga só se estorna pela conta (estornar_custo_obra recusa).
--  * O Administrativo também lança e estorna custo real direto, como o Operacional.
--  * Quem vê contas, custos e o pagamento do cliente: admin, gestor que vê a obra, Administrativo e Operacional da obra.
--  * Nota fiscal do cliente: anexada pelo Administrativo (ou admin); anexar conclui o marco "NF do cliente". O arquivo
--    só para admin, gestor que vê a obra e Administrativo da obra. Nada exige a nota para concluir o setor ou a obra.
--  * Anexos no bucket privado `financeiro-obra`, em `empresa/obra/fornecedor|cliente/arquivo`. Nunca se removem.
--  * Nenhum valor em dinheiro vai para `obra_historico` (ADR Pedido + Obra): só fornecedor e categoria.
--
-- Depende de: autorizacao_setor_obra, preparar_escrita_obra, registrar_historico_obra, pode_ver_obra, tem_papel,
-- meu_membro_id, hoje_brasilia, auditar, tocar_updated_at, atualizar_marco_obra e obra_historico_tipo_check
-- (20261116100000), obra_custos (20261105100000), confirma_pagamento_cliente (20261119100100).

-- ---------------------------------------------------------------------------
-- Quem vê e quem escreve
-- ---------------------------------------------------------------------------

-- Custos, contas a pagar e pagamento do cliente: + Administrativo (corpo de 20261105100000_obras_custos.sql).
create or replace function public.pode_ver_custos_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{admin}')
        or (public.tem_papel(o.empresa_id, '{gestor}') and public.pode_ver_obra(o.id))
        or public.autorizacao_setor_obra(o.id, 'operacional') is not null
        or public.autorizacao_setor_obra(o.id, 'administrativo') is not null
    from public.obras o where o.id = p_obra_id
  ), false);
$$;

-- Arquivo da nota fiscal do cliente (tem dados do cliente): sem o Operacional.
create or replace function public.pode_ver_nf_cliente_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{admin}')
        or (public.tem_papel(o.empresa_id, '{gestor}') and public.pode_ver_obra(o.id))
        or public.autorizacao_setor_obra(o.id, 'administrativo') is not null
    from public.obras o where o.id = p_obra_id
  ), false);
$$;
revoke all on function public.pode_ver_nf_cliente_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_nf_cliente_obra(uuid) to authenticated;

-- Setor em nome do qual o custo real é escrito: o Administrativo, se a pessoa atua nele na obra; senão o Operacional
-- (admin cai no Administrativo). `preparar_escrita_obra` confere de novo.
create or replace function public.setor_custos_obra(p_obra_id uuid)
returns public.setor_obra
language sql stable security definer set search_path = ''
as $$
  select case when public.autorizacao_setor_obra(p_obra_id, 'administrativo') is not null
    then 'administrativo'::public.setor_obra else 'operacional'::public.setor_obra end;
$$;
revoke all on function public.setor_custos_obra(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Contas a pagar
-- ---------------------------------------------------------------------------

create table public.obra_contas_pagar (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  fornecedor text not null check (length(btrim(fornecedor)) between 2 and 120),
  categoria text not null check (categoria in ('equipamentos', 'estrutura_materiais', 'mao_de_obra', 'homologacao', 'frete')),
  descricao text check (descricao is null or length(btrim(descricao)) between 1 and 300),
  valor numeric(12, 2) not null check (valor > 0),
  vencimento date not null,
  situacao text not null default 'a_pagar' check (situacao in ('a_pagar', 'paga', 'cancelada', 'estornada')),
  pago_em date,
  comprovante_caminho text,
  comprovante_nome text,
  custo_id uuid unique references public.obra_custos (id),
  pago_por uuid,
  nf_caminho text,
  nf_nome text,
  nf_anexada_em timestamptz,
  motivo text check (motivo is null or length(btrim(motivo)) between 3 and 300),
  encerrada_em timestamptz,
  encerrada_por uuid,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint obra_contas_pagar_pagamento check (
    (situacao in ('paga', 'estornada')) = (pago_em is not null and comprovante_caminho is not null and custo_id is not null)
  ),
  constraint obra_contas_pagar_encerramento check (
    (situacao in ('cancelada', 'estornada')) = (motivo is not null and encerrada_em is not null)
  ),
  constraint obra_contas_pagar_nf check ((nf_caminho is null) = (nf_anexada_em is null))
);
create index on public.obra_contas_pagar (obra_id, vencimento);
create index on public.obra_contas_pagar (empresa_id, situacao, vencimento);
create trigger obra_contas_pagar_updated_at before update on public.obra_contas_pagar
  for each row execute function public.tocar_updated_at();
create trigger auditar_obra_contas_pagar after insert or update or delete on public.obra_contas_pagar
  for each row execute function public.auditar();

alter table public.obra_contas_pagar enable row level security;
create policy "ver contas a pagar da obra" on public.obra_contas_pagar for select to authenticated
  using (public.pode_ver_custos_obra(obra_id));
-- Só as funções escrevem.
revoke all on public.obra_contas_pagar from anon, authenticated, service_role;
grant select on public.obra_contas_pagar to authenticated, service_role;

-- Nota fiscal do cliente: uma por obra (anexar de novo substitui; a auditoria guarda a anterior).
create table public.obra_nf_cliente (
  obra_id uuid primary key,
  empresa_id uuid not null,
  caminho text not null,
  nome text not null,
  anexada_em timestamptz not null default now(),
  anexada_por uuid,
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);
create trigger auditar_obra_nf_cliente after insert or update or delete on public.obra_nf_cliente
  for each row execute function public.auditar();
alter table public.obra_nf_cliente enable row level security;
create policy "ver nota fiscal do cliente" on public.obra_nf_cliente for select to authenticated
  using (public.pode_ver_nf_cliente_obra(obra_id));
revoke all on public.obra_nf_cliente from anon, authenticated, service_role;
grant select on public.obra_nf_cliente to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Anexos (bucket privado)
-- ---------------------------------------------------------------------------

-- Obra e tipo da pasta `empresa/obra/fornecedor|cliente/arquivo`; nulos se o formato ou a empresa não conferem.
create or replace function public.pasta_financeiro_obra(p_caminho text)
returns table (obra_id uuid, tipo text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_caminho, '/');
  v_obra uuid;
  v_empresa uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 4 or v_partes[4] = '' or v_partes[3] not in ('fornecedor', 'cliente') then
    return;
  end if;
  begin
    v_empresa := v_partes[1]::uuid;
    v_obra := v_partes[2]::uuid;
  exception when invalid_text_representation then
    return;
  end;
  return query select o.id, v_partes[3] from public.obras o where o.id = v_obra and o.empresa_id = v_empresa;
end;
$$;
revoke all on function public.pasta_financeiro_obra(text) from public, anon, authenticated, service_role;

create or replace function public.pode_ver_pasta_financeiro(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case p.tipo when 'fornecedor' then public.pode_ver_custos_obra(p.obra_id) else public.pode_ver_nf_cliente_obra(p.obra_id) end
    from public.pasta_financeiro_obra(p_caminho) p
  ), false);
$$;
revoke all on function public.pode_ver_pasta_financeiro(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_pasta_financeiro(text) to authenticated;

-- Enviar: quem atua no Administrativo da obra (ou admin), com a obra não cancelada.
create or replace function public.pode_enviar_pasta_financeiro(p_caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select o.cancelada_em is null and public.autorizacao_setor_obra(o.id, 'administrativo') is not null
    from public.pasta_financeiro_obra(p_caminho) p join public.obras o on o.id = p.obra_id
  ), false);
$$;
revoke all on function public.pode_enviar_pasta_financeiro(text) from public, anon, authenticated, service_role;
grant execute on function public.pode_enviar_pasta_financeiro(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financeiro-obra', 'financeiro-obra', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'text/xml', 'application/xml'])
on conflict (id) do nothing;

create policy "financeiro-obra: ler" on storage.objects for select to authenticated
  using (bucket_id = 'financeiro-obra' and public.pode_ver_pasta_financeiro(name));
create policy "financeiro-obra: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'financeiro-obra' and public.pode_enviar_pasta_financeiro(name));

-- O anexo informado numa RPC precisa estar na pasta certa desta obra e existir no bucket.
create or replace function public.validar_anexo_financeiro(p_obra_id uuid, p_tipo text, p_caminho text, p_nome text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_caminho is null or nullif(btrim(p_nome), '') is null or length(p_nome) > 200 then
    raise exception 'Envie o arquivo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (select 1 from public.pasta_financeiro_obra(p_caminho) p where p.obra_id = p_obra_id and p.tipo = p_tipo)
     or not exists (select 1 from storage.objects s where s.bucket_id = 'financeiro-obra' and s.name = p_caminho) then
    raise exception 'O arquivo enviado não é desta obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
end;
$$;
revoke all on function public.validar_anexo_financeiro(uuid, text, text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Histórico (sem valores)
-- ---------------------------------------------------------------------------

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
  'conta_pagar_lancada', 'conta_paga', 'conta_cancelada', 'conta_estornada', 'nf_fornecedor_anexada', 'nf_cliente_anexada'
));

-- ---------------------------------------------------------------------------
-- Custo real: Operacional ou Administrativo (corpos de 20261105100000_obras_custos.sql)
-- ---------------------------------------------------------------------------

create or replace function public.lancar_custo_obra(p_obra_id uuid, p_categoria text, p_valor numeric, p_data date, p_descricao text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_setor public.setor_obra := public.setor_custos_obra(p_obra_id);
  v_aut text;
  v_id uuid;
  v_descricao text := nullif(btrim(p_descricao), '');
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, v_setor, false);
  if p_categoria is null or p_categoria not in ('equipamentos', 'estrutura_materiais', 'mao_de_obra', 'homologacao', 'frete') then
    raise exception 'Categoria de custo inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_data is null or p_data > public.hoje_brasilia() then
    raise exception 'Informe a data do custo (hoje ou antes).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_descricao is null or length(v_descricao) < 3 or length(v_descricao) > 300 then
    raise exception 'Descreva o custo (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.obra_custos (empresa_id, obra_id, categoria, valor, ocorrido_em, descricao, registrado_por)
  select o.empresa_id, o.id, p_categoria, round(p_valor, 2), p_data, v_descricao, public.meu_membro_id(o.empresa_id)
  from public.obras o where o.id = p_obra_id
  returning id into v_id;
  perform public.registrar_historico_obra(p_obra_id, 'custo_lancado', v_setor, jsonb_build_object('categoria', p_categoria, 'autorizacao', v_aut));
  return v_id;
end;
$$;

-- + recusa o custo de uma conta paga (esse se estorna pela conta).
create or replace function public.estornar_custo_obra(p_custo_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_custo public.obra_custos;
  v_setor public.setor_obra;
  v_aut text;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  select * into v_custo from public.obra_custos where id = p_custo_id;
  if not found then
    raise exception 'Você não tem permissão para alterar este setor da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_setor := public.setor_custos_obra(v_custo.obra_id);
  v_aut := public.preparar_escrita_obra(v_custo.obra_id, v_setor, false);
  if v_custo.estorna_id is not null then
    raise exception 'Um estorno não pode ser estornado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.obra_custos c where c.estorna_id = p_custo_id) then
    raise exception 'Este lançamento já foi estornado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.obra_contas_pagar k where k.custo_id = p_custo_id) then
    raise exception 'Este custo veio de uma conta paga: estorne pelo pagamento, em Pagamentos a fornecedores.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Explique o motivo do estorno (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.obra_custos (empresa_id, obra_id, categoria, valor, ocorrido_em, descricao, estorna_id, registrado_por)
  values (v_custo.empresa_id, v_custo.obra_id, v_custo.categoria, -v_custo.valor, public.hoje_brasilia(), v_motivo, v_custo.id,
          public.meu_membro_id(v_custo.empresa_id));
  perform public.registrar_historico_obra(v_custo.obra_id, 'custo_estornado', v_setor, jsonb_build_object('categoria', v_custo.categoria, 'autorizacao', v_aut));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs das contas a pagar (Administrativo da obra ou admin; obra pausada aceita, cancelada não)
-- ---------------------------------------------------------------------------

create or replace function public.lancar_conta_pagar_obra(
  p_obra_id uuid, p_fornecedor text, p_categoria text, p_descricao text, p_valor numeric, p_vencimento date
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_id uuid;
  v_fornecedor text := nullif(btrim(p_fornecedor), '');
  v_descricao text := nullif(btrim(p_descricao), '');
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'administrativo', false);
  if v_fornecedor is null or length(v_fornecedor) < 2 or length(v_fornecedor) > 120 then
    raise exception 'Informe o fornecedor (de 2 a 120 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_categoria is null or p_categoria not in ('equipamentos', 'estrutura_materiais', 'mao_de_obra', 'homologacao', 'frete') then
    raise exception 'Categoria de custo inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_descricao is not null and length(v_descricao) > 300 then
    raise exception 'A descrição tem no máximo 300 caracteres.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_vencimento is null then
    raise exception 'Informe o vencimento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.obra_contas_pagar (empresa_id, obra_id, fornecedor, categoria, descricao, valor, vencimento, criado_por)
  select o.empresa_id, o.id, v_fornecedor, p_categoria, v_descricao, round(p_valor, 2), p_vencimento, public.meu_membro_id(o.empresa_id)
  from public.obras o where o.id = p_obra_id
  returning id into v_id;
  perform public.registrar_historico_obra(p_obra_id, 'conta_pagar_lancada', 'administrativo',
    jsonb_build_object('fornecedor', v_fornecedor, 'categoria', p_categoria, 'autorizacao', v_aut));
  return v_id;
end;
$$;

-- Trava a conta e confere a escrita na obra dela. Mesma resposta para "não existe" e "sem permissão".
create or replace function public.preparar_escrita_conta_pagar(p_conta_id uuid)
returns public.obra_contas_pagar
language plpgsql security definer set search_path = ''
as $$
declare
  v_conta public.obra_contas_pagar;
begin
  select * into v_conta from public.obra_contas_pagar where id = p_conta_id;
  if not found then
    raise exception 'Você não tem permissão para alterar este setor da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  -- Obra antes da conta: mesma ordem de trava das outras escritas da obra.
  perform public.preparar_escrita_obra(v_conta.obra_id, 'administrativo', false);
  select * into v_conta from public.obra_contas_pagar where id = p_conta_id for update;
  return v_conta;
end;
$$;
revoke all on function public.preparar_escrita_conta_pagar(uuid) from public, anon, authenticated, service_role;

-- Pagamento: data (hoje ou antes), comprovante obrigatório e, se já houver, a nota fiscal. Vira custo real.
create or replace function public.registrar_pagamento_conta_pagar(
  p_conta_id uuid, p_pago_em date, p_comprovante_caminho text, p_comprovante_nome text,
  p_nf_caminho text default null, p_nf_nome text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_conta public.obra_contas_pagar := public.preparar_escrita_conta_pagar(p_conta_id);
  v_custo uuid;
  v_eu uuid := public.meu_membro_id(v_conta.empresa_id);
begin
  if v_conta.situacao <> 'a_pagar' then
    raise exception 'Esta conta não está a pagar.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_pago_em is null or p_pago_em > public.hoje_brasilia() then
    raise exception 'Informe a data do pagamento (hoje ou antes).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_anexo_financeiro(v_conta.obra_id, 'fornecedor', p_comprovante_caminho, p_comprovante_nome);
  if p_nf_caminho is not null then
    perform public.validar_anexo_financeiro(v_conta.obra_id, 'fornecedor', p_nf_caminho, p_nf_nome);
  end if;

  insert into public.obra_custos (empresa_id, obra_id, categoria, valor, ocorrido_em, descricao, registrado_por)
  values (v_conta.empresa_id, v_conta.obra_id, v_conta.categoria, v_conta.valor, p_pago_em,
          left(v_conta.fornecedor || coalesce(' · ' || v_conta.descricao, ''), 300), v_eu)
  returning id into v_custo;

  update public.obra_contas_pagar
  set situacao = 'paga', pago_em = p_pago_em, comprovante_caminho = p_comprovante_caminho,
      comprovante_nome = btrim(p_comprovante_nome), custo_id = v_custo, pago_por = v_eu,
      nf_caminho = coalesce(p_nf_caminho, nf_caminho),
      nf_nome = case when p_nf_caminho is not null then btrim(p_nf_nome) else nf_nome end,
      nf_anexada_em = case when p_nf_caminho is not null then now() else nf_anexada_em end
  where id = p_conta_id;

  perform public.registrar_historico_obra(v_conta.obra_id, 'conta_paga', 'administrativo',
    jsonb_build_object('fornecedor', v_conta.fornecedor, 'categoria', v_conta.categoria));
end;
$$;

-- Nota fiscal do fornecedor, antes ou depois do pagamento (substituir a anterior fica na auditoria).
create or replace function public.anexar_nf_conta_pagar(p_conta_id uuid, p_caminho text, p_nome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_conta public.obra_contas_pagar := public.preparar_escrita_conta_pagar(p_conta_id);
begin
  if v_conta.situacao not in ('a_pagar', 'paga') then
    raise exception 'Esta conta foi encerrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  perform public.validar_anexo_financeiro(v_conta.obra_id, 'fornecedor', p_caminho, p_nome);
  update public.obra_contas_pagar set nf_caminho = p_caminho, nf_nome = btrim(p_nome), nf_anexada_em = now() where id = p_conta_id;
  perform public.registrar_historico_obra(v_conta.obra_id, 'nf_fornecedor_anexada', 'administrativo',
    jsonb_build_object('fornecedor', v_conta.fornecedor, 'categoria', v_conta.categoria));
end;
$$;

-- Conta ainda a pagar: cancela com motivo.
create or replace function public.cancelar_conta_pagar(p_conta_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_conta public.obra_contas_pagar := public.preparar_escrita_conta_pagar(p_conta_id);
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_conta.situacao <> 'a_pagar' then
    raise exception 'Só uma conta a pagar pode ser cancelada; conta paga se corrige com estorno.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Explique o motivo (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  update public.obra_contas_pagar
  set situacao = 'cancelada', motivo = v_motivo, encerrada_em = now(), encerrada_por = public.meu_membro_id(v_conta.empresa_id)
  where id = p_conta_id;
  perform public.registrar_historico_obra(v_conta.obra_id, 'conta_cancelada', 'administrativo',
    jsonb_build_object('fornecedor', v_conta.fornecedor, 'categoria', v_conta.categoria));
end;
$$;

-- Conta paga registrada errado: estorna o custo (mesmo valor negativo) e a conta fica "estornada".
create or replace function public.estornar_pagamento_conta_pagar(p_conta_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_conta public.obra_contas_pagar := public.preparar_escrita_conta_pagar(p_conta_id);
  v_motivo text := nullif(btrim(p_motivo), '');
  v_eu uuid := public.meu_membro_id(v_conta.empresa_id);
begin
  if v_conta.situacao <> 'paga' then
    raise exception 'Só uma conta paga pode ser estornada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Explique o motivo do estorno (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.obra_custos (empresa_id, obra_id, categoria, valor, ocorrido_em, descricao, estorna_id, registrado_por)
  select c.empresa_id, c.obra_id, c.categoria, -c.valor, public.hoje_brasilia(), v_motivo, c.id, v_eu
  from public.obra_custos c where c.id = v_conta.custo_id;
  update public.obra_contas_pagar
  set situacao = 'estornada', motivo = v_motivo, encerrada_em = now(), encerrada_por = v_eu
  where id = p_conta_id;
  perform public.registrar_historico_obra(v_conta.obra_id, 'conta_estornada', 'administrativo',
    jsonb_build_object('fornecedor', v_conta.fornecedor, 'categoria', v_conta.categoria));
end;
$$;

-- Nota fiscal do cliente: anexa (ou substitui) e conclui o marco "NF do cliente" se ainda não estiver concluído.
create or replace function public.anexar_nf_cliente_obra(p_obra_id uuid, p_caminho text, p_nome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  -- A NF não depende da obra estar em andamento: pausada também aceita.
  perform public.preparar_escrita_obra(p_obra_id, 'administrativo', false);
  perform public.validar_anexo_financeiro(p_obra_id, 'cliente', p_caminho, p_nome);
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  insert into public.obra_nf_cliente (obra_id, empresa_id, caminho, nome, anexada_por)
  values (p_obra_id, v_empresa, p_caminho, btrim(p_nome), public.meu_membro_id(v_empresa))
  on conflict (obra_id) do update
    set caminho = excluded.caminho, nome = excluded.nome, anexada_em = now(), anexada_por = excluded.anexada_por;
  perform public.registrar_historico_obra(p_obra_id, 'nf_cliente_anexada', 'administrativo', '{}'::jsonb);
  if exists (select 1 from public.obra_marcos m where m.obra_id = p_obra_id and m.marco = 'nf_cliente' and m.status <> 'concluido')
     and not exists (select 1 from public.obras o where o.id = p_obra_id and o.pausada_em is not null) then
    perform public.atualizar_marco_obra(p_obra_id, 'nf_cliente', 'concluido');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagamento do cliente na obra (cartão da ficha)
-- ---------------------------------------------------------------------------

-- Para quem vê os custos: condição gravada no contrato, valor vendido, quem confirmou e quando, e o comprovante do
-- aviso do vendedor, se houve. Vazio sem acesso.
create or replace function public.pagamento_cliente_obra(p_obra_id uuid)
returns table (
  situacao text, condicao text, valor numeric, confirmado_em timestamptz, confirmado_por_membro_id uuid,
  comprovante_caminho text, comprovante_nome text
)
language sql stable security definer set search_path = ''
as $$
  select
    case when cp.id is null then null when cp.estornado_em is null then 'confirmado' else 'estornado' end,
    c.condicao_pagamento ->> 'descricao',
    dc.valor_vendido,
    cp.confirmado_em,
    cp.confirmado_por_membro_id,
    a.comprovante_caminho,
    a.comprovante_nome
  from public.obras o
  left join public.obra_dados_comerciais dc on dc.obra_id = o.id
  left join lateral (
    select x.* from public.confirmacoes_pagamento x where x.negocio_id = o.negocio_id order by x.confirmado_em desc limit 1
  ) cp on true
  left join public.contratos c on c.id = cp.contrato_id
  left join public.avisos_pagamento a on a.confirmacao_id = cp.id
  where o.id = p_obra_id and public.pode_ver_custos_obra(o.id);
$$;
revoke all on function public.pagamento_cliente_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pagamento_cliente_obra(uuid) to authenticated;

-- Comprovante do aviso: + quem vê os custos da obra daquele negócio, depois de confirmado (corpo de
-- 20261119100100_setor_administrativo.sql).
create or replace function public.pode_ver_comprovante_pagamento(p_caminho text, p_dono text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.avisos_pagamento a
      where a.comprovante_caminho = p_caminho
        and (public.pode_ver_negocio(a.negocio_id)
             or (a.situacao = 'aberto' and public.confirma_pagamento_cliente(a.empresa_id))
             or (a.situacao = 'confirmado' and exists (
                   select 1 from public.obras o where o.negocio_id = a.negocio_id and public.pode_ver_custos_obra(o.id))))
    )
    or (p_dono = (select auth.uid())::text
        and public.pode_informar_pagamento(public.contrato_da_pasta_comprovante(p_caminho)));
$$;

-- RPCs de cliente: só `authenticated` executa.
revoke all on function public.lancar_conta_pagar_obra(uuid, text, text, text, numeric, date) from public, anon, authenticated, service_role;
grant execute on function public.lancar_conta_pagar_obra(uuid, text, text, text, numeric, date) to authenticated;
revoke all on function public.registrar_pagamento_conta_pagar(uuid, date, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_pagamento_conta_pagar(uuid, date, text, text, text, text) to authenticated;
revoke all on function public.anexar_nf_conta_pagar(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.anexar_nf_conta_pagar(uuid, text, text) to authenticated;
revoke all on function public.cancelar_conta_pagar(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cancelar_conta_pagar(uuid, text) to authenticated;
revoke all on function public.estornar_pagamento_conta_pagar(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.estornar_pagamento_conta_pagar(uuid, text) to authenticated;
revoke all on function public.anexar_nf_cliente_obra(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.anexar_nf_cliente_obra(uuid, text, text) to authenticated;
