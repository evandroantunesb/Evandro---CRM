-- Engenharia P5: prazos (internos e da distribuidora) em dias úteis e indicadores de desempenho no servidor.
--
-- Decisões do Evandro (30/10/2026):
--  * Prazos contam em DIAS ÚTEIS a partir do dia útil seguinte ao marco registrado (o dia do marco não conta).
--    Dia útil = segunda a sexta, fora feriado nacional (inclusive Carnaval, Sexta-feira Santa e Corpus Christi)
--    e fora feriado que o admin cadastra para a empresa (municipal, por exemplo).
--  * Prazos internos com padrão sugerido e editável pelo admin: A iniciar 2, Projeto em elaboração 5, responder
--    exigência 3, correção de campo após não conformidade 5. "Aprovado" não tem prazo da Engenharia.
--  * Prazos da distribuidora (análise do protocolo, vistoria, conexão) nascem VAZIOS: só o engenheiro ou o Evandro
--    preenche. Vazio = a tela não mostra prazo. Cada um conta do marco que já registramos.
--  * Prazo vencido só sinaliza: não muda etapa nem bloqueia nada.
--  * Indicadores: tempo em cada etapa, protocolo → aprovação, protocolos com exigência, vistorias com não conformidade,
--    vistoria aprovada → conexão. Tempos em mediana de dias úteis.

-- ---------------------------------------------------------------------------
-- Dias úteis
-- ---------------------------------------------------------------------------

-- Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
create or replace function public.data_pascoa(p_ano integer)
returns date
language plpgsql immutable set search_path = ''
as $$
declare
  a int := p_ano % 19;
  b int := p_ano / 100;
  c int := p_ano % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(p_ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

-- Feriados nacionais fixos e móveis. Consciência Negra (20/11) é nacional desde 2024 (Lei 14.759/2023).
create or replace function public.feriado_nacional(p_data date)
returns boolean
language sql immutable set search_path = ''
as $$
  -- Páscoa e "MM-DD" calculados uma vez por data: a função roda para cada dia dos intervalos de prazo.
  select x.md in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25')
    or (x.md = '11-20' and extract(year from p_data) >= 2024)
    or p_data in (
      x.pascoa - 48, -- segunda de Carnaval
      x.pascoa - 47, -- terça de Carnaval
      x.pascoa - 2,  -- Sexta-feira Santa
      x.pascoa + 60  -- Corpus Christi
    )
  from (select to_char(p_data, 'MM-DD') as md, public.data_pascoa(extract(year from p_data)::int) as pascoa) x;
$$;

-- Feriados da empresa (municipais, estaduais): o admin cadastra e remove. É configuração, não fato: pode apagar.
create table public.empresa_feriados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  data date not null,
  nome text not null check (length(btrim(nome)) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (empresa_id, data)
);
create trigger auditar_empresa_feriados after insert or update or delete on public.empresa_feriados
  for each row execute function public.auditar();

alter table public.empresa_feriados enable row level security;
create policy "ver feriados da empresa" on public.empresa_feriados for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin cadastra feriado" on public.empresa_feriados for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin remove feriado" on public.empresa_feriados for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
revoke update, truncate on public.empresa_feriados from anon, authenticated;
revoke all on public.empresa_feriados from anon;

create or replace function public.dia_util(p_empresa_id uuid, p_data date)
returns boolean
language sql stable set search_path = ''
as $$
  select extract(isodow from p_data) < 6
    and not public.feriado_nacional(p_data)
    and not exists (select 1 from public.empresa_feriados f where f.empresa_id = p_empresa_id and f.data = p_data);
$$;

-- Data em que vence um prazo de N dias úteis contado do dia útil seguinte ao marco.
create or replace function public.somar_dias_uteis(p_empresa_id uuid, p_inicio date, p_dias integer)
returns date
language sql stable set search_path = ''
as $$
  select d::date
  from generate_series(p_inicio + 1, p_inicio + p_dias * 2 + 30, interval '1 day') d
  where p_dias > 0 and public.dia_util(p_empresa_id, d::date)
  order by d
  offset greatest(p_dias, 1) - 1
  limit 1;
$$;

-- Dias úteis no intervalo (início, fim]: o dia do marco não conta. Fim antes do início dá 0.
create or replace function public.dias_uteis_entre(p_empresa_id uuid, p_inicio date, p_fim date)
returns integer
language sql stable set search_path = ''
as $$
  select count(*)::int
  from generate_series(p_inicio + 1, p_fim, interval '1 day') d
  where public.dia_util(p_empresa_id, d::date);
$$;

-- Dias úteis até o vencimento: 0 = vence hoje; negativo = dias úteis de atraso. Limite já passado é sempre atraso
-- (pelo menos −1), mesmo sem dia útil entre ele e hoje (venceu na sexta, hoje é sábado; prazo digitado num feriado).
create or replace function public.prazo_dias_restantes(p_empresa_id uuid, p_limite date, p_hoje date)
returns integer
language sql stable set search_path = ''
as $$
  select case when p_limite >= p_hoje then public.dias_uteis_entre(p_empresa_id, p_hoje, p_limite)
              else least(-1, -public.dias_uteis_entre(p_empresa_id, p_limite, p_hoje)) end;
$$;

-- Engenharia em curso na obra: obra nem pausada nem cancelada e setor ainda não concluído (inclusive pela exceção que
-- conclui sem a conexão). Fora disso o prazo não corre. Security definer porque o papel `operacao` não lê `obras`;
-- só responde sobre obra que quem chama vê (mesma regra da RLS das tabelas filhas).
create or replace function public.engenharia_em_curso(p_obra_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select o.pausada_em is null and o.cancelada_em is null and f.status <> 'concluido'
    from public.obras o
    join public.obra_fluxos f on f.obra_id = o.id and f.setor = 'engenharia'
    where o.id = p_obra_id and (public.pode_ver_obra(o.id) or public.pode_ver_obra_operacao(o.id))
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Prazos configuráveis
-- ---------------------------------------------------------------------------

create table public.engenharia_prazos (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  chave text not null check (chave in (
    'a_iniciar', 'projeto_em_elaboracao', 'exigencia', 'correcao_campo',
    'distribuidora_analise', 'distribuidora_vistoria', 'distribuidora_conexao'
  )),
  -- Nulo = sem prazo (a tela não mostra).
  dias_uteis integer check (dias_uteis is null or dias_uteis between 1 and 365),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, chave)
);
create trigger engenharia_prazos_updated_at before update on public.engenharia_prazos
  for each row execute function public.tocar_updated_at();
create trigger auditar_engenharia_prazos after insert or update or delete on public.engenharia_prazos
  for each row execute function public.auditar();

alter table public.engenharia_prazos enable row level security;
create policy "ver prazos da engenharia" on public.engenharia_prazos for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin edita prazo da engenharia" on public.engenharia_prazos for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}'))
  with check (public.tem_papel(empresa_id, '{admin}'));
-- As linhas nascem com a empresa; o admin só muda os dias.
revoke insert, update, delete, truncate on public.engenharia_prazos from anon, authenticated;
grant update (dias_uteis) on public.engenharia_prazos to authenticated;
revoke all on public.engenharia_prazos from anon;

create or replace function public.inserir_prazos_engenharia_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.engenharia_prazos (empresa_id, chave, dias_uteis) values
    (p_empresa_id, 'a_iniciar', 2),
    (p_empresa_id, 'projeto_em_elaboracao', 5),
    (p_empresa_id, 'exigencia', 3),
    (p_empresa_id, 'correcao_campo', 5),
    (p_empresa_id, 'distribuidora_analise', null),
    (p_empresa_id, 'distribuidora_vistoria', null),
    (p_empresa_id, 'distribuidora_conexao', null)
  on conflict (empresa_id, chave) do nothing;
$$;
revoke all on function public.inserir_prazos_engenharia_padrao(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_prazos_engenharia_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.inserir_prazos_engenharia_padrao(new.id);
  return null;
end;
$$;
revoke all on function public.criar_prazos_engenharia_empresa() from public, anon, authenticated, service_role;
create trigger empresas_prazos_engenharia after insert on public.empresas
  for each row execute function public.criar_prazos_engenharia_empresa();

select public.inserir_prazos_engenharia_padrao(id) from public.empresas;

-- ---------------------------------------------------------------------------
-- Prazos em curso por obra (Central da Engenharia)
-- ---------------------------------------------------------------------------

-- Um prazo por obra e chave, só dos marcos em aberto. Security invoker: a RLS de cada tabela decide o que entra
-- (fluxo: quem vê a obra; protocolo, exigência e vistoria: quem vê os registros da Engenharia). Só corre prazo com a
-- Engenharia em curso (`engenharia_em_curso`). dias_restantes: ver `prazo_dias_restantes`.
create or replace function public.prazos_engenharia(p_empresa_id uuid)
returns table (obra_id uuid, chave text, inicio date, limite date, dias_restantes integer)
language sql stable set search_path = ''
as $$
  with prazo as (select p.chave, p.dias_uteis from public.engenharia_prazos p where p.empresa_id = p_empresa_id and p.dias_uteis is not null),
  ultima_vistoria as (
    select distinct on (v.obra_id) v.*
    from public.obra_engenharia_vistorias v
    where v.empresa_id = p_empresa_id and v.status <> 'cancelada'
    order by v.obra_id, v.created_at desc
  ),
  marcos as (
    -- Etapa interna: desde a entrada na etapa.
    select f.obra_id, f.status as chave, (f.status_desde at time zone 'America/Sao_Paulo')::date as inicio, null::date as fixo
    from public.obra_fluxos f
    where f.empresa_id = p_empresa_id and f.setor = 'engenharia' and f.status in ('a_iniciar', 'projeto_em_elaboracao')
    union all
    -- Exigência aberta: conta da data em que a distribuidora a emitiu (o evento), não de quando foi digitada. O prazo
    -- interno digitado vence o padrão. A mais urgente da obra: o menor vencimento efetivo.
    (select distinct on (e.obra_id) e.obra_id, 'exigencia', ev.ocorrido_em,
      coalesce(e.prazo_interno, public.somar_dias_uteis(p_empresa_id, ev.ocorrido_em, pr.dias_uteis)) as fixo
    from public.obra_engenharia_exigencias e
    join public.obra_engenharia_protocolo_eventos ev on ev.id = e.evento_id
    left join prazo pr on pr.chave = 'exigencia'
    where e.empresa_id = p_empresa_id and e.status = 'aberta'
    order by e.obra_id, fixo nulls last, ev.ocorrido_em)
    union all
    -- Correção de campo: desde a não conformidade, enquanto não houver a correção registrada.
    select v.obra_id, 'correcao_campo', (
      select max(ev.ocorrido_em) from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'nao_conformidade'
    ), null
    from ultima_vistoria v
    where v.status = 'com_nao_conformidade'
      and not exists (select 1 from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'correcao_campo')
    union all
    -- Distribuidora analisa: do protocolo ou do último reenvio (com exigência aberta, a vez é nossa).
    select p.obra_id, 'distribuidora_analise', greatest(p.protocolado_em, (
      select max(ev.ocorrido_em) from public.obra_engenharia_protocolo_eventos ev where ev.protocolo_id = p.id and ev.tipo = 'reenvio'
    )), null
    from public.obra_engenharia_protocolos p
    where p.empresa_id = p_empresa_id and p.status in ('protocolado', 'em_analise')
    union all
    -- Distribuidora faz a vistoria: do pedido até a vistoria realizada.
    select v.obra_id, 'distribuidora_vistoria', v.solicitada_em, null
    from ultima_vistoria v
    where v.status in ('solicitada', 'agendada')
    union all
    -- Distribuidora liga: da vistoria aprovada até a conexão confirmada.
    select v.obra_id, 'distribuidora_conexao', coalesce((
      select max(ev.ocorrido_em) from public.obra_engenharia_vistoria_eventos ev where ev.vistoria_id = v.id and ev.tipo = 'aprovada'
    ), v.realizada_em), null
    from ultima_vistoria v
    where v.status = 'aprovada' and v.conexao_confirmada_em is null
  ),
  vencimentos as (
    select m.obra_id, m.chave, m.inicio, coalesce(m.fixo, public.somar_dias_uteis(p_empresa_id, m.inicio, pr.dias_uteis)) as limite
    from marcos m
    left join prazo pr on pr.chave = m.chave
    where m.inicio is not null and (m.fixo is not null or pr.dias_uteis is not null)
  )
  select x.obra_id, x.chave, x.inicio, x.limite, public.prazo_dias_restantes(p_empresa_id, x.limite, public.hoje_brasilia())
  from vencimentos x
  where public.engenharia_em_curso(x.obra_id);
$$;

-- ---------------------------------------------------------------------------
-- Indicadores de desempenho
-- ---------------------------------------------------------------------------

-- Agregados do que quem chama pode ver, sem limite de linhas. Security definer só para ler `obras` também pelo
-- caminho do papel `operacao` (que não lê a tabela direto); devolve apenas contagens e medianas. Cada fonte aplica a
-- mesma regra da RLS da sua tabela: fluxo e histórico, quem vê a obra; protocolos e exigências,
-- `pode_ver_documentos_engenharia`; vistorias, `pode_ver_vistoria_obra`. Assim o agregado de uma obra só nunca
-- revela o que a RLS esconde. Período: marcos ocorridos a partir de p_desde.
create or replace function public.indicadores_engenharia(p_empresa_id uuid, p_desde date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.membro_ativo(p_empresa_id) then
    raise exception 'Sem acesso a esta empresa.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;

  with obras_vis as (
    select o.id, o.pausada_em, o.cancelada_em
    from public.obras o
    where o.empresa_id = p_empresa_id and (public.pode_ver_obra(o.id) or public.pode_ver_obra_operacao(o.id))
  ),
  obras_docs as (select o.id from obras_vis o where public.pode_ver_documentos_engenharia(o.id)),
  obras_vistoria as (select o.id from obras_vis o where public.pode_ver_vistoria_obra(o.id)),
  fluxo as (
    select f.* from public.obra_fluxos f join obras_vis o on o.id = f.obra_id where f.setor = 'engenharia'
  ),
  trocas as (
    select h.obra_id, h.dados ->> 'de' as etapa, h.created_at as fim,
      lag(h.created_at) over (partition by h.obra_id order by h.created_at, h.id) as inicio_anterior
    from public.obra_historico h join obras_vis o on o.id = h.obra_id
    where h.setor = 'engenharia' and h.tipo = 'fluxo_alterado' and h.dados ->> 'campo' = 'status'
  ),
  estadias as (
    select t.etapa, public.dias_uteis_entre(p_empresa_id,
      (coalesce(t.inicio_anterior, f.created_at) at time zone 'America/Sao_Paulo')::date,
      (t.fim at time zone 'America/Sao_Paulo')::date) as dias
    from trocas t join fluxo f on f.obra_id = t.obra_id
    where (t.fim at time zone 'America/Sao_Paulo')::date >= p_desde and t.etapa is not null
  ),
  aprovacoes as (
    select public.dias_uteis_entre(p_empresa_id, p.protocolado_em, a.aprovado_em) as dias
    from public.obra_engenharia_protocolos p join obras_docs o on o.id = p.obra_id
    cross join lateral (
      select min(ev.ocorrido_em) as aprovado_em from public.obra_engenharia_protocolo_eventos ev
      where ev.protocolo_id = p.id and ev.tipo = 'aprovado'
    ) a
    where a.aprovado_em >= p_desde
  ),
  -- Só protocolos que a distribuidora já respondeu (exigência, aprovação, orçamento ou indeferimento): os que ainda
  -- esperam análise não dizem se haverá exigência e baixariam a taxa.
  protocolos as (
    select exists (select 1 from public.obra_engenharia_exigencias e where e.protocolo_id = p.id) as com_exigencia
    from public.obra_engenharia_protocolos p join obras_docs o on o.id = p.obra_id
    where p.protocolado_em >= p_desde and p.status <> 'cancelado'
      and exists (
        select 1 from public.obra_engenharia_protocolo_eventos ev
        where ev.protocolo_id = p.id and ev.tipo in ('exigencia', 'aprovado', 'orcamento_emitido', 'indeferido')
      )
  ),
  resultados as (
    select ev.tipo = 'nao_conformidade' as nc
    from public.obra_engenharia_vistoria_eventos ev join obras_vistoria o on o.id = ev.obra_id
    where ev.tipo in ('aprovada', 'nao_conformidade') and ev.ocorrido_em >= p_desde
  ),
  conexoes as (
    select public.dias_uteis_entre(p_empresa_id, coalesce(a.aprovada_em, v.realizada_em), v.conexao_confirmada_em) as dias
    from public.obra_engenharia_vistorias v join obras_vistoria o on o.id = v.obra_id
    cross join lateral (
      select min(ev.ocorrido_em) as aprovada_em from public.obra_engenharia_vistoria_eventos ev
      where ev.vistoria_id = v.id and ev.tipo = 'aprovada'
    ) a
    where v.conexao_confirmada_em >= p_desde and coalesce(a.aprovada_em, v.realizada_em) is not null
  )
  select jsonb_build_object(
    'carteira', (
      select jsonb_build_object('total', count(*), 'paradas', count(*) filter (where f.parado))
      from fluxo f join obras_vis o on o.id = f.obra_id
      where f.status <> 'concluido' and o.cancelada_em is null and o.pausada_em is null
    ),
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('etapa', e.etapa, 'mediana', e.mediana, 'n', e.n))
      from (
        select etapa, round((percentile_cont(0.5) within group (order by dias))::numeric, 1) as mediana, count(*) as n
        from estadias group by etapa
      ) e
    ), '[]'::jsonb),
    'protocolo_aprovacao', (
      select jsonb_build_object('mediana', round((percentile_cont(0.5) within group (order by dias))::numeric, 1), 'n', count(*)) from aprovacoes
    ),
    'exigencia', (select jsonb_build_object('com', count(*) filter (where com_exigencia), 'total', count(*)) from protocolos),
    'nao_conformidade', (select jsonb_build_object('com', count(*) filter (where nc), 'total', count(*)) from resultados),
    'conexao', (
      select jsonb_build_object('mediana', round((percentile_cont(0.5) within group (order by dias))::numeric, 1), 'n', count(*)) from conexoes
    )
  ) into v;
  return v;
end;
$$;

revoke all on function public.data_pascoa(integer) from public, anon, authenticated, service_role;
grant execute on function public.data_pascoa(integer) to authenticated;
revoke all on function public.feriado_nacional(date) from public, anon, authenticated, service_role;
grant execute on function public.feriado_nacional(date) to authenticated;
revoke all on function public.dia_util(uuid, date) from public, anon, authenticated, service_role;
grant execute on function public.dia_util(uuid, date) to authenticated;
revoke all on function public.somar_dias_uteis(uuid, date, integer) from public, anon, authenticated, service_role;
grant execute on function public.somar_dias_uteis(uuid, date, integer) to authenticated;
revoke all on function public.dias_uteis_entre(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.dias_uteis_entre(uuid, date, date) to authenticated;
revoke all on function public.prazo_dias_restantes(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.prazo_dias_restantes(uuid, date, date) to authenticated;
revoke all on function public.engenharia_em_curso(uuid) from public, anon, authenticated, service_role;
grant execute on function public.engenharia_em_curso(uuid) to authenticated;
revoke all on function public.prazos_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.prazos_engenharia(uuid) to authenticated;
revoke all on function public.indicadores_engenharia(uuid, date) from public, anon, authenticated, service_role;
grant execute on function public.indicadores_engenharia(uuid, date) to authenticated;
