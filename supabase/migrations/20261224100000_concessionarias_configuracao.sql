-- Concessionárias, entrega 3 (item 6 do roadmap; desenho em docs/superpowers/specs/2026-11-23-concessionarias-design.md,
-- decisões de 26/11/2026; plano em docs/superpowers/plans/2026-11-26-concessionarias-configuracao.md).
--
--  1. Checklist e prazos da distribuidora por concessionária. O modelo do checklist passa a ser de uma concessionária
--     (o de hoje vai para a Copel de cada empresa). Os prazos da distribuidora (análise, análise em zona rural, vistoria
--     e conexão) saem de `engenharia_prazos` para `concessionaria_prazos`, com os valores que cada empresa tem hoje;
--     os internos continuam da empresa. Para quem só atende a Copel, nada muda.
--  2. Canais de entrada por concessionária, nova concessionária (cópia da Copel ou vazia), protocolo com os canais da
--     concessionária da obra e troca do checklist ao trocar a concessionária da obra (regra 7).

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1a. Checklist por concessionária
-- ---------------------------------------------------------------------------

alter table public.engenharia_checklist_modelo add column concessionaria_id uuid;
alter table public.engenharia_checklist_modelo disable trigger engenharia_checklist_modelo_updated_at;
update public.engenharia_checklist_modelo m set concessionaria_id = c.id
from public.concessionarias c
where c.empresa_id = m.empresa_id and c.distribuidora = 'COPEL-DIS';
alter table public.engenharia_checklist_modelo enable trigger engenharia_checklist_modelo_updated_at;
alter table public.engenharia_checklist_modelo alter column concessionaria_id set not null;
alter table public.engenharia_checklist_modelo add constraint engenharia_checklist_modelo_concessionaria_fk
  foreign key (empresa_id, concessionaria_id) references public.concessionarias (empresa_id, id);
comment on column public.engenharia_checklist_modelo.concessionaria_id is
  'Concessionária do item (entrega 3 do item 6). A obra recebe só os itens da concessionária dela.';

-- Título, documento do cliente e procuração: únicos por concessionária (eram por empresa).
drop index public.engenharia_checklist_modelo_titulo_unico;
create unique index engenharia_checklist_modelo_titulo_unico
  on public.engenharia_checklist_modelo (concessionaria_id, lower(btrim(titulo)));
drop index public.engenharia_checklist_modelo_documento_cliente;
create unique index engenharia_checklist_modelo_documento_cliente
  on public.engenharia_checklist_modelo (concessionaria_id, documento_cliente) where documento_cliente is not null;
drop index public.engenharia_checklist_modelo_gera_procuracao;
create unique index engenharia_checklist_modelo_gera_procuracao
  on public.engenharia_checklist_modelo (concessionaria_id) where gera_procuracao;

create or replace function public.proteger_engenharia_checklist_modelo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa do item do checklist não muda' using errcode = 'check_violation';
  end if;
  if new.concessionaria_id is distinct from old.concessionaria_id then
    raise exception 'A concessionária do item do checklist não muda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_engenharia_checklist_modelo() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1b. Prazos da distribuidora por concessionária
-- ---------------------------------------------------------------------------

create table public.concessionaria_prazos (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  concessionaria_id uuid not null,
  chave text not null check (chave in ('distribuidora_analise', 'distribuidora_analise_rural', 'distribuidora_vistoria', 'distribuidora_conexao')),
  -- Nulo = sem prazo (a tela não mostra). Dias na contagem de `contagem`, como em `engenharia_prazos.dias_uteis`.
  dias_uteis integer check (dias_uteis is null or dias_uteis between 1 and 365),
  contagem text not null default 'uteis' check (contagem in ('uteis', 'corridos')),
  updated_at timestamptz not null default now(),
  primary key (concessionaria_id, chave),
  foreign key (empresa_id, concessionaria_id) references public.concessionarias (empresa_id, id) on delete cascade
);
comment on table public.concessionaria_prazos is
  'Prazos que a distribuidora tem para responder, por concessionária (entrega 3 do item 6). Os internos ficam em engenharia_prazos.';
create trigger concessionaria_prazos_updated_at before update on public.concessionaria_prazos
  for each row execute function public.tocar_updated_at();
create trigger auditar_concessionaria_prazos after insert or update or delete on public.concessionaria_prazos
  for each row execute function public.auditar();

alter table public.concessionaria_prazos enable row level security;
create policy "ver prazos da concessionária" on public.concessionaria_prazos for select to authenticated
  using (public.membro_ativo(empresa_id));
-- Mesma regra de `engenharia_prazos` (20261124100000): admin, gestor e quem coordena a Engenharia.
create policy "quem coordena a engenharia edita os prazos da concessionária" on public.concessionaria_prazos for update to authenticated
  using (public.coordena_setor(empresa_id, 'engenharia'))
  with check (public.coordena_setor(empresa_id, 'engenharia'));
revoke insert, update, delete, truncate on public.concessionaria_prazos from anon, authenticated;
grant update (dias_uteis, contagem) on public.concessionaria_prazos to authenticated;
revoke all on public.concessionaria_prazos from anon;

-- Carga: cada empresa leva para a Copel dela os prazos da distribuidora que tem hoje (editados ou não).
insert into public.concessionaria_prazos (empresa_id, concessionaria_id, chave, dias_uteis, contagem)
select p.empresa_id, c.id, p.chave, p.dias_uteis, p.contagem
from public.engenharia_prazos p
join public.concessionarias c on c.empresa_id = p.empresa_id and c.distribuidora = 'COPEL-DIS'
where p.chave in ('distribuidora_analise', 'distribuidora_analise_rural', 'distribuidora_vistoria', 'distribuidora_conexao');

-- ---------------------------------------------------------------------------
-- 1c. Canais de entrada por concessionária
-- ---------------------------------------------------------------------------

-- Por onde o pedido entra na distribuidora. `tipos` vazio = sem condição (o canal é listado, nunca sugerido).
-- `tensoes` vale só para ligação nova e aumento de carga (como a regra do PEW da Copel de 04/11/2026).
create table public.concessionaria_canais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  concessionaria_id uuid not null,
  nome text not null check (length(btrim(nome)) between 1 and 60 and lower(btrim(nome)) <> 'outro'),
  ordem integer not null default 0 check (ordem between 0 and 9999),
  ativo boolean not null default true,
  tipos text[] not null default '{}' check (tipos <@ array[
    'nova_conexao', 'ampliacao', 'regularizacao', 'troca_titularidade', 'aumento_carga', 'ligacao_nova', 'cadastro_compensacao'
  ]::text[]),
  tensoes text[] not null default '{}' check (tensoes <@ array['baixa', 'media']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (empresa_id, concessionaria_id) references public.concessionarias (empresa_id, id) on delete cascade
);
create unique index concessionaria_canais_nome_unico on public.concessionaria_canais (concessionaria_id, lower(btrim(nome)));
comment on table public.concessionaria_canais is
  'Canais de entrada do pedido na distribuidora, por concessionária (entrega 3 do item 6). "Outro" é do protocolo, não um canal.';

create or replace function public.proteger_concessionaria_canal()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id or new.concessionaria_id is distinct from old.concessionaria_id then
    raise exception 'O canal não muda de concessionária' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_concessionaria_canal() from public, anon, authenticated, service_role;
create trigger concessionaria_canais_proteger before update on public.concessionaria_canais
  for each row execute function public.proteger_concessionaria_canal();
create trigger concessionaria_canais_updated_at before update on public.concessionaria_canais
  for each row execute function public.tocar_updated_at();
create trigger auditar_concessionaria_canais after insert or update or delete on public.concessionaria_canais
  for each row execute function public.auditar();

alter table public.concessionaria_canais enable row level security;
create policy "ver canais da concessionária" on public.concessionaria_canais for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cria canal" on public.concessionaria_canais for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita canal" on public.concessionaria_canais for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
revoke delete, truncate on public.concessionaria_canais from anon, authenticated;
revoke all on public.concessionaria_canais from anon;

-- ---------------------------------------------------------------------------
-- 1d. Padrão da Copel (prazos do engenheiro de 04/11/2026 e canais da regra de hoje)
-- ---------------------------------------------------------------------------

-- Só completa o que falta: o que a empresa já tem fica como está.
create or replace function public.semear_padrao_copel(p_concessionaria_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.concessionaria_prazos (empresa_id, concessionaria_id, chave, dias_uteis, contagem)
  select c.empresa_id, c.id, v.chave, v.dias, v.contagem
  from public.concessionarias c
  cross join (values
    ('distribuidora_analise', 15, 'corridos'),
    ('distribuidora_analise_rural', 30, 'corridos'),
    ('distribuidora_vistoria', 7, 'uteis'),
    ('distribuidora_conexao', null::integer, 'uteis')
  ) as v (chave, dias, contagem)
  where c.id = p_concessionaria_id
  on conflict (concessionaria_id, chave) do nothing;
  insert into public.concessionaria_canais (empresa_id, concessionaria_id, nome, ordem, tipos, tensoes)
  select c.empresa_id, c.id, v.nome, v.ordem, v.tipos, v.tensoes
  from public.concessionarias c
  cross join (values
    ('PEW', 10, array['nova_conexao', 'ampliacao', 'regularizacao', 'ligacao_nova', 'aumento_carga']::text[], array['baixa']::text[]),
    ('Site da Copel', 20, array['troca_titularidade', 'cadastro_compensacao', 'ligacao_nova', 'aumento_carga']::text[], array['media']::text[]),
    ('CAW', 30, '{}'::text[], '{}'::text[]),
    ('Atendimento comercial', 40, '{}'::text[], '{}'::text[])
  ) as v (nome, ordem, tipos, tensoes)
  where c.id = p_concessionaria_id
  on conflict (concessionaria_id, lower(btrim(nome))) do nothing;
$$;
revoke all on function public.semear_padrao_copel(uuid) from public, anon, authenticated, service_role;

-- `inserir_concessionaria_copel` (20261223100000): a Copel nova já nasce com os prazos e os canais padrão. Chamada de
-- novo para uma empresa que já tem a Copel, não mexe em nada (um canal renomeado não volta).
create or replace function public.inserir_concessionaria_copel(p_empresa_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.concessionarias (empresa_id, nome, distribuidora)
  values (p_empresa_id, 'Copel', 'COPEL-DIS')
  on conflict (empresa_id, distribuidora) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.semear_padrao_copel(v_id);
  end if;
end;
$$;
revoke all on function public.inserir_concessionaria_copel(uuid) from public, anon, authenticated, service_role;

-- Copel das empresas atuais: completa as chaves que faltarem com o padrão e recebe os canais.
select public.semear_padrao_copel(id) from public.concessionarias where distribuidora = 'COPEL-DIS';

delete from public.engenharia_prazos
where chave in ('distribuidora_analise', 'distribuidora_analise_rural', 'distribuidora_vistoria', 'distribuidora_conexao');
alter table public.engenharia_prazos drop constraint engenharia_prazos_chave_check;
alter table public.engenharia_prazos add constraint engenharia_prazos_chave_check check (chave in (
  'a_iniciar', 'projeto_em_elaboracao', 'exigencia', 'correcao_campo', 'art'
));

-- `inserir_prazos_engenharia_padrao` (20261115100000_engenharia_prazos_copel.sql): só os prazos internos.
create or replace function public.inserir_prazos_engenharia_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.engenharia_prazos (empresa_id, chave, dias_uteis, contagem) values
    (p_empresa_id, 'a_iniciar', 2, 'uteis'),
    (p_empresa_id, 'projeto_em_elaboracao', 5, 'uteis'),
    (p_empresa_id, 'exigencia', 3, 'uteis'),
    (p_empresa_id, 'correcao_campo', 5, 'uteis'),
    (p_empresa_id, 'art', 1, 'uteis')
  on conflict (empresa_id, chave) do nothing;
$$;

-- Concessionária da obra para quem é da empresa dela. O papel `operacao` não lê `obras`, e `prazos_engenharia` roda como
-- quem chama.
create or replace function public.concessionaria_da_obra(p_obra_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select o.concessionaria_id from public.obras o where o.id = p_obra_id and public.membro_ativo(o.empresa_id);
$$;
revoke all on function public.concessionaria_da_obra(uuid) from public, anon, authenticated, service_role;
grant execute on function public.concessionaria_da_obra(uuid) to authenticated;

-- `prazos_engenharia` (20261116100000_engenharia_obra_rede.sql): internos da empresa; os da distribuidora, da concessionária da obra.
create or replace function public.prazos_engenharia(p_empresa_id uuid)
returns table (obra_id uuid, chave text, inicio date, limite date, dias_restantes integer, contagem text)
language sql stable set search_path = ''
as $$
  with prazo as (
    select p.chave, p.dias_uteis as dias, p.contagem from public.engenharia_prazos p
    where p.empresa_id = p_empresa_id and p.dias_uteis is not null
  ),
  ultima_vistoria as (
    select distinct on (v.obra_id) v.*
    from public.obra_engenharia_vistorias v
    where v.empresa_id = p_empresa_id and v.status <> 'cancelada'
    order by v.obra_id, v.created_at desc
  ),
  marcos as (
    -- Etapa interna: desde a entrada na etapa.
    select f.obra_id, f.status as chave, f.status as regra, (f.status_desde at time zone 'America/Sao_Paulo')::date as inicio, null::date as fixo
    from public.obra_fluxos f
    where f.empresa_id = p_empresa_id and f.setor = 'engenharia' and f.status in ('a_iniciar', 'projeto_em_elaboracao')
    union all
    -- ART (TRT): do pagamento confirmado (a obra nasce com ele) até o item da ART resolvido; sem checklist aplicado,
    -- até o protocolo. Nunca de antes de 04/11/2026 (sem atraso retroativo nas obras anteriores à regra). A data vem do
    -- fluxo da Engenharia, que nasce com a obra (o papel `operacao` não lê `obras`; a função roda como quem chama).
    select f.obra_id, 'art', 'art', greatest((f.created_at at time zone 'America/Sao_Paulo')::date, date '2026-11-04'), null
    from public.obra_fluxos f
    where f.empresa_id = p_empresa_id and f.setor = 'engenharia'
      and not exists (
        select 1 from public.obra_engenharia_itens i
        where i.obra_id = f.obra_id and i.titulo ilike 'ART %' and i.status in ('valido', 'dispensado')
      )
      and (
        exists (select 1 from public.obra_engenharia_itens i where i.obra_id = f.obra_id and i.titulo ilike 'ART %')
        or (
          not exists (select 1 from public.obra_engenharia_itens i where i.obra_id = f.obra_id)
          and not exists (select 1 from public.obra_engenharia_protocolos p where p.obra_id = f.obra_id)
        )
      )
    union all
    -- Exigência aberta: conta da data em que a distribuidora a emitiu (o evento), não de quando foi digitada. O prazo
    -- interno digitado vence o padrão. A mais urgente da obra: o menor vencimento efetivo.
    (select distinct on (e.obra_id) e.obra_id, 'exigencia', 'exigencia', ev.ocorrido_em,
      coalesce(e.prazo_interno, public.somar_dias_prazo(p_empresa_id, ev.ocorrido_em, pr.dias, pr.contagem)) as fixo
    from public.obra_engenharia_exigencias e
    join public.obra_engenharia_protocolo_eventos ev on ev.id = e.evento_id
    left join prazo pr on pr.chave = 'exigencia'
    where e.empresa_id = p_empresa_id and e.status = 'aberta'
    order by e.obra_id, fixo nulls last, ev.ocorrido_em)
    union all
    -- Correção de campo: desde a não conformidade, enquanto não houver a correção registrada.
    select v.obra_id, 'correcao_campo', 'correcao_campo', (
      select max(ev.ocorrido_em) from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'nao_conformidade'
    ), null
    from ultima_vistoria v
    where v.status = 'com_nao_conformidade'
      and not exists (select 1 from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'correcao_campo')
    union all
    -- Distribuidora analisa: do protocolo ou do último reenvio (com exigência aberta, a vez é nossa). Zona rural no
    -- enquadramento usa o prazo rural.
    select p.obra_id, 'distribuidora_analise',
      case when exists (select 1 from public.obra_engenharia_enquadramento q where q.obra_id = p.obra_id and q.zona = 'rural')
           then 'distribuidora_analise_rural' else 'distribuidora_analise' end,
      greatest(p.protocolado_em, (
        select max(ev.ocorrido_em) from public.obra_engenharia_protocolo_eventos ev where ev.protocolo_id = p.id and ev.tipo = 'reenvio'
      )), null
    from public.obra_engenharia_protocolos p
    where p.empresa_id = p_empresa_id and p.status in ('protocolado', 'em_analise')
    union all
    -- Distribuidora faz a vistoria: do pedido até a vistoria realizada.
    select v.obra_id, 'distribuidora_vistoria', 'distribuidora_vistoria', v.solicitada_em, null
    from ultima_vistoria v
    where v.status in ('solicitada', 'agendada')
    union all
    -- Distribuidora liga: da vistoria aprovada até a conexão confirmada.
    select v.obra_id, 'distribuidora_conexao', 'distribuidora_conexao', coalesce((
      select max(ev.ocorrido_em) from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'aprovada'
    ), v.realizada_em), null
    from ultima_vistoria v
    where v.status = 'aprovada' and v.conexao_confirmada_em is null
    union all
    -- Obra de rede da distribuidora (orçamento com custo): do pagamento à Copel, no prazo que ela informou, em dias
    -- úteis, até a obra concluída. O vencimento é da obra (não há prazo configurado).
    select r.obra_id, 'distribuidora_obra_rede', 'distribuidora_obra_rede', r.pagamento_em,
      public.somar_dias_uteis(p_empresa_id, r.pagamento_em, r.prazo_dias)
    from public.obra_engenharia_obra_rede r
    where r.empresa_id = p_empresa_id and r.pagamento_em is not null and r.prazo_dias is not null and r.concluida_em is null
  ),
  vencimentos as (
    select m.obra_id, m.chave, m.inicio, coalesce(pr.contagem, 'uteis') as contagem,
      coalesce(m.fixo, public.somar_dias_prazo(p_empresa_id, m.inicio, pr.dias, pr.contagem)) as limite
    from marcos m
    left join lateral (
      select p.dias, p.contagem from prazo p where p.chave = m.regra
      union all
      select cp.dias_uteis, cp.contagem from public.concessionaria_prazos cp
      where cp.concessionaria_id = public.concessionaria_da_obra(m.obra_id) and cp.chave = m.regra and cp.dias_uteis is not null
    ) pr on true
    where m.inicio is not null and (m.fixo is not null or pr.dias is not null)
  )
  select x.obra_id, x.chave, x.inicio, x.limite, public.prazo_restante(p_empresa_id, x.limite, public.hoje_brasilia(), x.contagem), x.contagem
  from vencimentos x
  where public.engenharia_em_curso(x.obra_id);
$$;

-- ---------------------------------------------------------------------------
-- 1e. Funções do checklist com a concessionária
-- ---------------------------------------------------------------------------

-- `marcar_documento_cliente_modelo` (20261212100000_procuracao.sql): uma marca por concessionária.
create or replace function public.marcar_documento_cliente_modelo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc text := public.documento_cliente_pelo_titulo(new.titulo);
begin
  if new.documento_cliente is null and v_doc is not null and not exists (
    select 1 from public.engenharia_checklist_modelo x where x.concessionaria_id = new.concessionaria_id and x.documento_cliente = v_doc
  ) then
    new.documento_cliente := v_doc;
  end if;
  if not new.gera_procuracao and public.gera_procuracao_pelo_titulo(new.titulo) and not exists (
    select 1 from public.engenharia_checklist_modelo x where x.concessionaria_id = new.concessionaria_id and x.gera_procuracao
  ) then
    new.gera_procuracao := true;
  end if;
  return new;
end;
$$;

-- `inserir_checklist_engenharia_padrao` (20261114100000_engenharia_enquadramento_copel.sql) na Copel da empresa. O gatilho do checklist roda antes do da
-- concessionária (ordem alfabética), por isso a Copel é criada aqui se ainda não existir.
create or replace function public.inserir_checklist_engenharia_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  select public.inserir_concessionaria_copel(p_empresa_id);
  insert into public.engenharia_checklist_modelo (empresa_id, concessionaria_id, grupo, titulo, descricao, obrigatorio, ordem, condicoes)
  select p_empresa_id, copel.id, i.grupo, i.titulo, i.descricao, i.obrigatorio, i.ordem, i.condicoes::jsonb
  from (values
    ('Cliente e titular', 'E-mail e celular do cliente', null, true, 10, '{}'),
    ('Cliente e titular', 'Documento com foto do titular, legível, com CPF', null, true, 20, '{}'),
    ('Cliente e titular', 'Fatura recente da unidade consumidora', null, true, 30, '{}'),
    ('Cliente e titular', 'Cartão CNPJ', null, true, 40, '{"titularidade": ["pj"]}'),
    ('Cliente e titular', 'QSA (quadro de sócios e administradores)', null, true, 50, '{"titularidade": ["pj"]}'),
    ('Cliente e titular', 'IPTU do imóvel', null, false, 60, '{"titularidade": ["pj"]}'),
    ('Cliente e titular', 'Procuração no modelo da Engenharia, com os documentos do cliente',
      'Poderes explícitos para representar o titular técnica e comercialmente perante a Copel, solicitar acesso, alterar carga e assinar contratos e documentos de micro ou minigeração. Identificar o endereço exato ou o número da UC. Sem assinatura gov.br ouro ou prata, reconhecer a firma em cartório.',
      true, 70, '{}'),
    ('Instalação e equipamentos', 'Localização da instalação', null, true, 80,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Instalação e equipamentos', 'Inversor: potência, modelo e marca', 'Na ampliação, os novos e os existentes.', true, 90,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Instalação e equipamentos', 'Painéis: potência, modelo e marca', 'Na ampliação, os novos e os existentes.', true, 100,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Projeto e Copel', 'ART (TRT) de projeto e execução', null, true, 110, '{}'),
    ('Projeto e Copel', 'DCA (declaração de carga)', null, true, 120, '{"tipo_solicitacao": ["aumento_carga", "ligacao_nova"]}'),
    ('Projeto e Copel', 'Diagrama unifilar', null, false, 130, '{}'),
    ('Projeto e Copel', 'Fatura ou faturas das unidades cadastradas', null, true, 140,
      '{"tipo_solicitacao": ["cadastro_compensacao"]}'),
    ('Produzido pela Engenharia', 'Formulário de solicitação de acesso (faixa de potência correta)', null, true, 150,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Memorial descritivo', null, true, 160,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Datasheet dos módulos', null, true, 170,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Datasheet e certificado do inversor', null, true, 180,
      '{"tipo_solicitacao": ["nova_conexao", "ampliacao", "regularizacao"]}'),
    ('Produzido pela Engenharia', 'Licença ambiental ou justificativa de não aplicabilidade', null, false, 190,
      '{"situacao_ambiental": ["licenca", "dispensa"]}'),
    ('Produzido pela Engenharia', 'Formulário de beneficiárias (autoconsumo remoto ou geração compartilhada)', null, true, 200,
      '{"modalidade_scee": ["remoto", "multiplas_ucs", "compartilhada"]}')
  ) as i (grupo, titulo, descricao, obrigatorio, ordem, condicoes)
  cross join (select id from public.concessionarias where empresa_id = p_empresa_id and distribuidora = 'COPEL-DIS') as copel
  on conflict (concessionaria_id, lower(btrim(titulo))) do update set
    grupo = excluded.grupo, descricao = excluded.descricao, obrigatorio = excluded.obrigatorio,
    ordem = excluded.ordem, condicoes = excluded.condicoes, ativo = true;
$$;

-- `aplicar_checklist_engenharia` (20261223100000_concessionarias.sql): só os itens da concessionária da obra.
create or replace function public.aplicar_checklist_engenharia(p_obra_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_empresa uuid;
  v_enq jsonb := public.enquadramento_obra_json(p_obra_id);
  v_novos integer;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  if (select concessionaria_id from public.obras where id = p_obra_id) is null then
    raise exception 'Escolha a concessionária da obra antes de aplicar o checklist.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  insert into public.obra_engenharia_itens (empresa_id, obra_id, modelo_id, grupo, titulo, descricao, obrigatorio, ordem)
  select v_empresa, p_obra_id, m.id, btrim(m.grupo), btrim(m.titulo), m.descricao, m.obrigatorio, m.ordem
  from public.engenharia_checklist_modelo m
  where m.empresa_id = v_empresa and m.ativo and public.item_vale_no_enquadramento(m.condicoes, v_enq)
    and m.concessionaria_id = (select concessionaria_id from public.obras where id = p_obra_id)
  on conflict (obra_id, modelo_id) do nothing;
  get diagnostics v_novos = row_count;
  if v_novos > 0 then
    perform public.registrar_historico_obra(p_obra_id, 'checklist_engenharia_aplicado', 'engenharia',
      jsonb_build_object('itens', v_novos, 'autorizacao', v_aut));
  end if;
  return v_novos;
end;
$$;

-- `reconciliar_checklist_engenharia` (20261101120000_engenharia_enquadramento.sql): só os itens da concessionária da obra.
create or replace function public.reconciliar_checklist_engenharia(p_obra_id uuid, p_aut text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa uuid;
  v_enq jsonb := public.enquadramento_obra_json(p_obra_id);
  v_membro uuid;
  v_novos integer;
  v_item record;
begin
  if not exists (select 1 from public.obra_engenharia_itens where obra_id = p_obra_id) then
    return;
  end if;
  select empresa_id into v_empresa from public.obras where id = p_obra_id;
  v_membro := public.meu_membro_id(v_empresa);

  -- Entram os itens ativos que passaram a valer.
  insert into public.obra_engenharia_itens (empresa_id, obra_id, modelo_id, grupo, titulo, descricao, obrigatorio, ordem)
  select v_empresa, p_obra_id, m.id, btrim(m.grupo), btrim(m.titulo), m.descricao, m.obrigatorio, m.ordem
  from public.engenharia_checklist_modelo m
  where m.empresa_id = v_empresa and m.ativo and public.item_vale_no_enquadramento(m.condicoes, v_enq)
    and m.concessionaria_id = (select concessionaria_id from public.obras where id = p_obra_id)
  on conflict (obra_id, modelo_id) do nothing;
  get diagnostics v_novos = row_count;
  if v_novos > 0 then
    perform public.registrar_historico_obra(p_obra_id, 'checklist_engenharia_aplicado', 'engenharia',
      jsonb_build_object('itens', v_novos, 'autorizacao', p_aut, 'origem', 'enquadramento'));
  end if;

  -- Saem (viram "não se aplica") os pendentes e em conferência que deixaram de valer.
  for v_item in
    select i.id, i.titulo, i.status from public.obra_engenharia_itens i
    join public.engenharia_checklist_modelo m on m.id = i.modelo_id
    where i.obra_id = p_obra_id and i.status in ('pendente', 'em_conferencia')
      and not public.item_vale_no_enquadramento(m.condicoes, v_enq)
    order by i.ordem, i.id
  loop
    update public.obra_engenharia_itens
    set status = 'dispensado', motivo = 'Fora do enquadramento', pelo_enquadramento = true, atualizado_por = v_membro, atualizado_em = now()
    where id = v_item.id;
    perform public.registrar_historico_obra(p_obra_id, 'item_engenharia_alterado', 'engenharia', jsonb_build_object(
      'item', v_item.titulo, 'de', v_item.status, 'para', 'dispensado', 'motivo', 'Fora do enquadramento',
      'autorizacao', p_aut, 'origem', 'enquadramento'
    ));
  end loop;

  -- Voltam a pendentes os que saíram pelo enquadramento e voltaram a valer.
  for v_item in
    select i.id, i.titulo from public.obra_engenharia_itens i
    join public.engenharia_checklist_modelo m on m.id = i.modelo_id
    where i.obra_id = p_obra_id and i.pelo_enquadramento and i.status = 'dispensado' and i.motivo = 'Fora do enquadramento'
      and public.item_vale_no_enquadramento(m.condicoes, v_enq)
    order by i.ordem, i.id
  loop
    update public.obra_engenharia_itens
    set status = 'pendente', motivo = null, pelo_enquadramento = false, atualizado_por = v_membro, atualizado_em = now()
    where id = v_item.id;
    perform public.registrar_historico_obra(p_obra_id, 'item_engenharia_alterado', 'engenharia', jsonb_build_object(
      'item', v_item.titulo, 'de', 'dispensado', 'para', 'pendente', 'autorizacao', p_aut, 'origem', 'enquadramento'
    ));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2a. Nova concessionária
-- ---------------------------------------------------------------------------

-- `proteger_concessionaria` (20261223100000_concessionarias.sql): o nome muda; a empresa e a distribuidora, não.
create or replace function public.proteger_concessionaria()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'A empresa da concessionária não muda' using errcode = 'check_violation';
  end if;
  if new.distribuidora is distinct from old.distribuidora then
    raise exception 'A distribuidora da concessionária não muda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Cópia de outra concessionária da empresa (itens ativos do modelo, prazos da distribuidora e canais) ou vazia (só os
-- prazos, sem dias). Só o admin da empresa.
create or replace function public.criar_concessionaria(p_empresa_id uuid, p_nome text, p_distribuidora text, p_copiar_de uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_sigla text := btrim(coalesce(p_distribuidora, ''));
  v_id uuid;
begin
  if not public.tem_papel(p_empresa_id, '{admin}') then
    raise exception 'Só o admin cria concessionária.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if length(v_nome) not between 2 and 60 then
    raise exception 'Informe o nome da concessionária (2 a 60 letras).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if not exists (select 1 from public.tarifas_gd_aneel t where t.distribuidora = v_sigla) then
    raise exception 'Distribuidora não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.concessionarias c where c.empresa_id = p_empresa_id and c.distribuidora = v_sigla) then
    raise exception 'Esta distribuidora já tem concessionária na empresa.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;
  if exists (select 1 from public.concessionarias c where c.empresa_id = p_empresa_id and lower(btrim(c.nome)) = lower(v_nome)) then
    raise exception 'Já existe uma concessionária com esse nome.' using errcode = 'unique_violation', hint = 'mensagem_usuario';
  end if;
  if p_copiar_de is not null and not exists (select 1 from public.concessionarias c where c.id = p_copiar_de and c.empresa_id = p_empresa_id) then
    raise exception 'Concessionária não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.concessionarias (empresa_id, nome, distribuidora) values (p_empresa_id, v_nome, v_sigla) returning id into v_id;

  if p_copiar_de is null then
    insert into public.concessionaria_prazos (empresa_id, concessionaria_id, chave)
    select p_empresa_id, v_id, k
    from unnest(array['distribuidora_analise', 'distribuidora_analise_rural', 'distribuidora_vistoria', 'distribuidora_conexao']) as k;
    return v_id;
  end if;

  insert into public.concessionaria_prazos (empresa_id, concessionaria_id, chave, dias_uteis, contagem)
  select p_empresa_id, v_id, p.chave, p.dias_uteis, p.contagem from public.concessionaria_prazos p where p.concessionaria_id = p_copiar_de;
  insert into public.concessionaria_canais (empresa_id, concessionaria_id, nome, ordem, ativo, tipos, tensoes)
  select p_empresa_id, v_id, k.nome, k.ordem, k.ativo, k.tipos, k.tensoes from public.concessionaria_canais k where k.concessionaria_id = p_copiar_de;
  insert into public.engenharia_checklist_modelo
    (empresa_id, concessionaria_id, grupo, titulo, descricao, obrigatorio, ordem, condicoes, documento_cliente, gera_procuracao)
  select p_empresa_id, v_id, m.grupo, m.titulo, m.descricao, m.obrigatorio, m.ordem, m.condicoes, m.documento_cliente, m.gera_procuracao
  from public.engenharia_checklist_modelo m
  where m.concessionaria_id = p_copiar_de and m.ativo;
  return v_id;
end;
$$;
revoke all on function public.criar_concessionaria(uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.criar_concessionaria(uuid, text, text, uuid) to authenticated;

-- Obras sem concessionária, pela distribuidora citada no negócio (mesma comparação de `concessionaria_do_negocio`), para
-- a tela da nova concessionária. Só o admin.
create or replace function public.obras_sem_concessionaria_por_distribuidora(p_empresa_id uuid)
returns table (distribuidora text, obras integer)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.tem_papel(p_empresa_id, '{admin}') then
    raise exception 'Só o admin vê esta contagem.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  return query
  select t.distribuidora, count(distinct o.id)::integer
  from public.obras o
  join public.negocios n on n.id = o.negocio_id
  join public.tarifas_gd_aneel t on public.normalizar_nome_distribuidora(coalesce(n.qualif_distribuidora, '')) = any (t.nomes_aceitos)
  where o.empresa_id = p_empresa_id and o.concessionaria_id is null and o.cancelada_em is null
  group by t.distribuidora;
end;
$$;
revoke all on function public.obras_sem_concessionaria_por_distribuidora(uuid) from public, anon, authenticated, service_role;
grant execute on function public.obras_sem_concessionaria_por_distribuidora(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Troca da concessionária da obra (regra 7)
-- ---------------------------------------------------------------------------

-- "Já houve envio" (decisão de 26/11/2026): protocolo, documento anexado ou item que alguém tirou de pendente. O item que
-- o enquadramento dispensou sozinho não conta. Nulo para quem não é da empresa da obra.
create or replace function public.checklist_engenharia_enviado(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when not exists (select 1 from public.obras o where o.id = p_obra_id and public.membro_ativo(o.empresa_id)) then null
  else exists (select 1 from public.obra_engenharia_protocolos p where p.obra_id = p_obra_id)
    or exists (select 1 from public.obra_engenharia_documentos d where d.obra_id = p_obra_id)
    or exists (
      select 1 from public.obra_engenharia_itens i
      where i.obra_id = p_obra_id and i.status <> 'pendente'
        and not (i.status = 'dispensado' and i.pelo_enquadramento and i.motivo = 'Fora do enquadramento')
    )
  end;
$$;
revoke all on function public.checklist_engenharia_enviado(uuid) from public, anon, authenticated, service_role;
grant execute on function public.checklist_engenharia_enviado(uuid) to authenticated;

-- `definir_concessionaria_obra` (20261223100000_concessionarias.sql) com a troca do checklist da regra 7.
create or replace function public.definir_concessionaria_obra(p_obra_id uuid, p_concessionaria_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', false);
  v_obra public.obras;
  v_nova public.concessionarias;
  v_antiga text;
  v_trocar boolean;
begin
  select * into v_obra from public.obras where id = p_obra_id;
  -- Mesma resposta para "não existe" e "de outra empresa": não revela dados de outras empresas.
  select * into v_nova from public.concessionarias where id = p_concessionaria_id and empresa_id = v_obra.empresa_id;
  if not found then
    raise exception 'Concessionária não encontrada.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if v_obra.concessionaria_id is not distinct from v_nova.id then
    return;
  end if;
  select nome into v_antiga from public.concessionarias where id = v_obra.concessionaria_id;
  update public.obras set concessionaria_id = v_nova.id where id = p_obra_id;
  -- Regra 7: nada enviado ainda, o checklist passa a ser o da nova concessionária; senão, fica.
  v_trocar := exists (select 1 from public.obra_engenharia_itens where obra_id = p_obra_id)
    and not coalesce(public.checklist_engenharia_enviado(p_obra_id), true);
  if v_trocar then
    delete from public.obra_engenharia_itens where obra_id = p_obra_id;
    insert into public.obra_engenharia_itens (empresa_id, obra_id, modelo_id, grupo, titulo, descricao, obrigatorio, ordem)
    select v_obra.empresa_id, p_obra_id, m.id, btrim(m.grupo), btrim(m.titulo), m.descricao, m.obrigatorio, m.ordem
    from public.engenharia_checklist_modelo m
    where m.concessionaria_id = v_nova.id and m.ativo
      and public.item_vale_no_enquadramento(m.condicoes, public.enquadramento_obra_json(p_obra_id))
    on conflict (obra_id, modelo_id) do nothing;
  end if;
  perform public.registrar_historico_obra(p_obra_id, 'concessionaria_obra_alterada', 'engenharia',
    jsonb_build_object('de', v_antiga, 'para', v_nova.nome, 'checklist_trocado', v_trocar, 'autorizacao', v_aut));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2c. Protocolo com os canais da concessionária da obra
-- ---------------------------------------------------------------------------

-- Protocolos antigos guardam os códigos de antes (pew, caw, atendimento, outro); os novos, o nome do canal ou "outro".
alter table public.obra_engenharia_protocolos drop constraint obra_engenharia_protocolos_canal_check;
alter table public.obra_engenharia_protocolos add constraint obra_engenharia_protocolos_canal_check
  check (length(btrim(canal)) between 1 and 60);

-- `registrar_protocolo_engenharia` (20261114100000_engenharia_enquadramento_copel.sql) com os canais da concessionária.
create or replace function public.registrar_protocolo_engenharia(
  p_obra_id uuid,
  p_distribuidora text,
  p_canal text,
  p_numero text,
  p_tipo_solicitacao text,
  p_protocolado_em date,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_aut text := public.preparar_escrita_obra(p_obra_id, 'engenharia', true);
  v_empresa uuid;
  v_faltam text;
  v_protocolo uuid;
  v_evento uuid;
  v_documentos integer;
  v_etapa text;
  v_canal text;
begin
  select empresa_id into v_empresa from public.obras where id = p_obra_id;

  if length(btrim(coalesce(p_numero, ''))) not between 1 and 60 then
    raise exception 'Informe o número do protocolo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if length(btrim(coalesce(p_distribuidora, ''))) not between 2 and 60 then
    raise exception 'Informe a distribuidora.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  -- Canal: "outro" ou um canal ativo da concessionária da obra, sem diferenciar maiúsculas (grava o nome cadastrado).
  if lower(btrim(coalesce(p_canal, ''))) = 'outro' then
    v_canal := 'outro';
  else
    select k.nome into v_canal from public.concessionaria_canais k
    where k.concessionaria_id = (select concessionaria_id from public.obras where id = p_obra_id)
      and k.ativo and lower(btrim(k.nome)) = lower(btrim(coalesce(p_canal, '')));
  end if;
  if v_canal is null then
    raise exception 'Escolha um canal da concessionária da obra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_tipo_solicitacao is null or not public.resposta_enquadramento_valida('tipo_solicitacao', p_tipo_solicitacao) then
    raise exception 'Tipo de solicitação inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_protocolado_em is null or p_protocolado_em > public.hoje_brasilia() then
    raise exception 'Informe a data do protocolo (não pode ser futura).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  if p_observacao is not null and length(p_observacao) > 1000 then
    raise exception 'Observação muito longa (máximo 1000 caracteres).' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Gate G2: checklist aplicado e obrigatórios resolvidos.
  if not exists (select 1 from public.obra_engenharia_itens where obra_id = p_obra_id) then
    raise exception 'Aplique o checklist e resolva os itens obrigatórios antes de registrar o protocolo.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select string_agg(titulo, '; ' order by ordem) into v_faltam
  from public.obra_engenharia_itens
  where obra_id = p_obra_id and obrigatorio and status not in ('valido', 'dispensado');
  if v_faltam is not null then
    raise exception 'Itens obrigatórios do checklist ainda não resolvidos: %.', v_faltam using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if exists (
    select 1 from public.obra_engenharia_protocolos
    where obra_id = p_obra_id and status not in ('indeferido', 'cancelado', 'encerrado')
  ) then
    raise exception 'Esta obra já tem um protocolo em andamento.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.obra_engenharia_protocolos (empresa_id, obra_id, distribuidora, canal, numero, tipo_solicitacao, protocolado_em, observacao, registrado_por)
  values (v_empresa, p_obra_id, btrim(p_distribuidora), v_canal, btrim(p_numero), p_tipo_solicitacao, p_protocolado_em,
    nullif(btrim(coalesce(p_observacao, '')), ''), public.meu_membro_id(v_empresa))
  returning id into v_protocolo;

  insert into public.obra_engenharia_protocolo_eventos (empresa_id, obra_id, protocolo_id, tipo, status_de, status_para, ocorrido_em, autor_membro_id)
  values (v_empresa, p_obra_id, v_protocolo, 'registrado', null, 'protocolado', p_protocolado_em, public.meu_membro_id(v_empresa))
  returning id into v_evento;
  v_documentos := public.registrar_pacote_protocolo(v_evento);

  perform public.registrar_historico_obra(p_obra_id, 'protocolo_engenharia_registrado', 'engenharia', jsonb_build_object(
    'distribuidora', btrim(p_distribuidora),
    'canal', v_canal,
    'documentos', v_documentos,
    'autorizacao', v_aut
  ));

  select status into v_etapa from public.obra_fluxos where obra_id = p_obra_id and setor = 'engenharia';
  if v_etapa in ('a_iniciar', 'projeto_em_elaboracao') then
    perform public.gravar_status_fluxo_obra(p_obra_id, 'engenharia', 'enviado_concessionaria', v_aut, 'protocolo');
  end if;
  return v_protocolo;
end;
$$;
