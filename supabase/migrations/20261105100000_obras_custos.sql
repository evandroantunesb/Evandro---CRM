-- Obras OPR, PR 2: orçamento por categoria, custo real lançado e deduções do lucro.
--
-- Decisões do Evandro (02/11/2026), com o desenho aprovado "Obras — Apresentação" (card "Custos: planejado × realizado"
-- e "Lucro líquido previsto"):
--  * Cinco categorias do desenho: equipamentos, estrutura e materiais, mão de obra, homologação e frete.
--  * O planejado nasce com a obra, dos dados do negócio (preço do kit do cálculo) e dos parâmetros da calculadora
--    daquele momento (material CA por kWp, instalação por módulo, engenharia e o novo frete, zerado por padrão).
--    Obras que já existem recebem o mesmo cálculo. Depois, admin e gestor ajustam.
--  * Custo real = lançamentos (categoria, valor, data, descrição) do admin ou de quem atua no Operacional da obra.
--    Ninguém apaga nem altera: erro se corrige com estorno.
--  * Impostos e comissões: dois percentuais sobre a venda, por empresa, que admin e gestor mudam; valem com o valor
--    atual para todas as obras.
--  * Quem vê custos: admin, gestor que vê a obra e quem atua no Operacional dela. Venda, lucro e margem seguem a
--    regra do valor vendido (`pode_ver_valor_vendido_obra`).
--  * Nenhum valor em dinheiro vai para `obra_historico` (ADR Pedido + Obra): o histórico diz só a categoria; os
--    valores ficam nas tabelas, com auditoria.
--
-- Depende de: autorizacao_setor_obra, preparar_escrita_obra, registrar_historico_obra, pode_ver_obra, tem_papel,
-- meu_membro_id, auditar, obra_historico_tipo_check (20261104100000).

-- ---------------------------------------------------------------------------
-- Frete na calculadora (só para o orçamento da obra; não entra no preço sugerido)
-- ---------------------------------------------------------------------------

alter table public.parametros_calculadora
  add column custo_frete numeric(10, 2) not null default 0 check (custo_frete >= 0);

-- ---------------------------------------------------------------------------
-- Quem vê e quem mexe
-- ---------------------------------------------------------------------------

create or replace function public.pode_ver_custos_obra(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select public.tem_papel(o.empresa_id, '{admin}')
        or (public.tem_papel(o.empresa_id, '{gestor}') and public.pode_ver_obra(o.id))
        or public.autorizacao_setor_obra(o.id, 'operacional') is not null
    from public.obras o where o.id = p_obra_id
  ), false);
$$;
revoke all on function public.pode_ver_custos_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pode_ver_custos_obra(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Orçamento (planejado por categoria)
-- ---------------------------------------------------------------------------

create table public.obra_orcamento (
  obra_id uuid not null,
  empresa_id uuid not null,
  categoria text not null check (categoria in ('equipamentos', 'estrutura_materiais', 'mao_de_obra', 'homologacao', 'frete')),
  planejado numeric(12, 2) not null check (planejado >= 0),
  updated_at timestamptz not null default now(),
  primary key (obra_id, categoria),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade
);
create trigger obra_orcamento_updated_at before update on public.obra_orcamento
  for each row execute function public.tocar_updated_at();
create trigger auditar_obra_orcamento after insert or update or delete on public.obra_orcamento
  for each row execute function public.auditar();

alter table public.obra_orcamento enable row level security;
create policy "ver orçamento da obra" on public.obra_orcamento for select to authenticated
  using (public.pode_ver_custos_obra(obra_id));
-- Só as funções escrevem.
revoke all on public.obra_orcamento from anon, authenticated, service_role;
grant select on public.obra_orcamento to authenticated, service_role;

-- Planejado inicial a partir do negócio e dos parâmetros da calculadora da empresa (sem gravar, só calcula).
create or replace function public.orcamento_inicial_obra(p_obra_id uuid)
returns table (categoria text, planejado numeric)
language sql stable security definer set search_path = ''
as $$
  with o as (select * from public.obras where id = p_obra_id),
  p as (select pc.* from public.parametros_calculadora pc join o on pc.empresa_id = o.empresa_id),
  kit as (select cs.kit_preco from public.calculos_solares cs join o on cs.negocio_id = o.negocio_id),
  modulos as (
    select coalesce(sum(k.quantidade), 0) as n from public.kit_componentes k join o on k.negocio_id = o.negocio_id where k.tipo = 'modulo'
  )
  select 'equipamentos', coalesce((select kit_preco from kit), 0)
  union all select 'estrutura_materiais', round(coalesce((select custo_material_ca_por_kwp from p), 0) * coalesce((select potencia_kwp from o), 0), 2)
  union all select 'mao_de_obra', round(coalesce((select custo_instalacao_por_modulo from p), 0) * (select n from modulos), 2)
  union all select 'homologacao', coalesce((select custo_engenharia from p), 0)
  union all select 'frete', coalesce((select custo_frete from p), 0);
$$;
revoke all on function public.orcamento_inicial_obra(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_orcamento_obra()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.obra_orcamento (obra_id, empresa_id, categoria, planejado)
  select new.id, new.empresa_id, i.categoria, i.planejado from public.orcamento_inicial_obra(new.id) i
  on conflict (obra_id, categoria) do nothing;
  return null;
end;
$$;
revoke all on function public.criar_orcamento_obra() from public, anon, authenticated, service_role;
create trigger obras_orcamento after insert on public.obras
  for each row execute function public.criar_orcamento_obra();

-- Obras que já existem: o mesmo cálculo, com os dados do negócio e os parâmetros de hoje.
insert into public.obra_orcamento (obra_id, empresa_id, categoria, planejado)
select o.id, o.empresa_id, i.categoria, i.planejado
from public.obras o cross join lateral public.orcamento_inicial_obra(o.id) i
on conflict (obra_id, categoria) do nothing;

-- ---------------------------------------------------------------------------
-- Custo real (lançamentos imutáveis, com estorno)
-- ---------------------------------------------------------------------------

create table public.obra_custos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  obra_id uuid not null,
  categoria text not null check (categoria in ('equipamentos', 'estrutura_materiais', 'mao_de_obra', 'homologacao', 'frete')),
  -- Lançamento é positivo; o estorno é o mesmo valor negativo, apontando para o lançamento.
  valor numeric(12, 2) not null check (valor <> 0),
  ocorrido_em date not null,
  descricao text not null check (length(btrim(descricao)) between 3 and 300),
  estorna_id uuid references public.obra_custos (id),
  registrado_por uuid,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, obra_id) references public.obras (empresa_id, id) on delete cascade,
  constraint obra_custos_sinal check ((estorna_id is null) = (valor > 0))
);
create index on public.obra_custos (obra_id, created_at);
-- Um lançamento é estornado no máximo uma vez.
create unique index obra_custos_um_estorno on public.obra_custos (estorna_id) where estorna_id is not null;
create trigger auditar_obra_custos after insert or update or delete on public.obra_custos
  for each row execute function public.auditar();

alter table public.obra_custos enable row level security;
create policy "ver custos da obra" on public.obra_custos for select to authenticated
  using (public.pode_ver_custos_obra(obra_id));
-- Ninguém escreve direto, nem altera ou apaga (só a exclusão em cascata da empresa).
revoke all on public.obra_custos from anon, authenticated, service_role;
grant select on public.obra_custos to authenticated, service_role;

-- Histórico: só a categoria, nunca o valor.
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
  'orcamento_ajustado', 'custo_lancado', 'custo_estornado'
));

-- Admin ou gestor (que vê a obra) ajusta o planejado de uma categoria.
create or replace function public.ajustar_orcamento_obra(p_obra_id uuid, p_categoria text, p_planejado numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_obra public.obras;
  v_antes numeric;
begin
  select * into v_obra from public.obras where id = p_obra_id for update;
  if not found or not (
    public.tem_papel(v_obra.empresa_id, '{admin}') or (public.tem_papel(v_obra.empresa_id, '{gestor}') and public.pode_ver_obra(p_obra_id))
  ) then
    raise exception 'Só admin ou gestor ajusta o orçamento da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if v_obra.cancelada_em is not null then
    raise exception 'Esta obra foi cancelada e não aceita alterações.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_planejado is null or p_planejado < 0 then
    raise exception 'Informe um valor planejado de zero ou mais.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select planejado into v_antes from public.obra_orcamento where obra_id = p_obra_id and categoria = p_categoria;
  if not found then
    raise exception 'Categoria de custo inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_antes = round(p_planejado, 2) then
    return;
  end if;
  update public.obra_orcamento set planejado = round(p_planejado, 2) where obra_id = p_obra_id and categoria = p_categoria;
  perform public.registrar_historico_obra(p_obra_id, 'orcamento_ajustado', null, jsonb_build_object('categoria', p_categoria));
end;
$$;
revoke all on function public.ajustar_orcamento_obra(uuid, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.ajustar_orcamento_obra(uuid, text, numeric) to authenticated;

-- Admin ou quem atua no Operacional da obra lança um custo real.
create or replace function public.lancar_custo_obra(p_obra_id uuid, p_categoria text, p_valor numeric, p_data date, p_descricao text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text;
  v_id uuid;
  v_descricao text := nullif(btrim(p_descricao), '');
begin
  v_aut := public.preparar_escrita_obra(p_obra_id, 'operacional', false);
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
  perform public.registrar_historico_obra(p_obra_id, 'custo_lancado', 'operacional', jsonb_build_object('categoria', p_categoria, 'autorizacao', v_aut));
  return v_id;
end;
$$;
revoke all on function public.lancar_custo_obra(uuid, text, numeric, date, text) from public, anon, authenticated, service_role;
grant execute on function public.lancar_custo_obra(uuid, text, numeric, date, text) to authenticated;

-- Estorno: o mesmo valor negativo, com o motivo como descrição. Uma vez por lançamento; estorno não se estorna.
create or replace function public.estornar_custo_obra(p_custo_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_custo public.obra_custos;
  v_aut text;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  select * into v_custo from public.obra_custos where id = p_custo_id;
  if not found then
    raise exception 'Você não tem permissão para alterar este setor da obra.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_aut := public.preparar_escrita_obra(v_custo.obra_id, 'operacional', false);
  if v_custo.estorna_id is not null then
    raise exception 'Um estorno não pode ser estornado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.obra_custos c where c.estorna_id = p_custo_id) then
    raise exception 'Este lançamento já foi estornado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Explique o motivo do estorno (de 3 a 300 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_custos (empresa_id, obra_id, categoria, valor, ocorrido_em, descricao, estorna_id, registrado_por)
  values (v_custo.empresa_id, v_custo.obra_id, v_custo.categoria, -v_custo.valor, public.hoje_brasilia(), v_motivo, v_custo.id,
          public.meu_membro_id(v_custo.empresa_id));
  perform public.registrar_historico_obra(v_custo.obra_id, 'custo_estornado', 'operacional', jsonb_build_object('categoria', v_custo.categoria, 'autorizacao', v_aut));
end;
$$;
revoke all on function public.estornar_custo_obra(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.estornar_custo_obra(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deduções do lucro (impostos e comissões, % da venda), por empresa
-- ---------------------------------------------------------------------------

create table public.obra_deducoes (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  impostos_percentual numeric(5, 2) not null default 0 check (impostos_percentual between 0 and 100),
  comissoes_percentual numeric(5, 2) not null default 0 check (comissoes_percentual between 0 and 100),
  updated_at timestamptz not null default now(),
  constraint obra_deducoes_total check (impostos_percentual + comissoes_percentual <= 100)
);
create trigger obra_deducoes_updated_at before update on public.obra_deducoes
  for each row execute function public.tocar_updated_at();
create trigger auditar_obra_deducoes after insert or update or delete on public.obra_deducoes
  for each row execute function public.auditar();

alter table public.obra_deducoes enable row level security;
create policy "ver deduções do lucro" on public.obra_deducoes for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin e gestor editam deduções do lucro" on public.obra_deducoes for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
-- A linha nasce com a empresa; só os percentuais mudam.
revoke all on public.obra_deducoes from anon, authenticated, service_role;
grant select on public.obra_deducoes to authenticated, service_role;
grant update (impostos_percentual, comissoes_percentual) on public.obra_deducoes to authenticated;

create or replace function public.criar_deducoes_obra_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.obra_deducoes (empresa_id) values (new.id) on conflict (empresa_id) do nothing;
  return null;
end;
$$;
revoke all on function public.criar_deducoes_obra_empresa() from public, anon, authenticated, service_role;
create trigger empresas_deducoes_obra after insert on public.empresas
  for each row execute function public.criar_deducoes_obra_empresa();

insert into public.obra_deducoes (empresa_id) select id from public.empresas on conflict (empresa_id) do nothing;
