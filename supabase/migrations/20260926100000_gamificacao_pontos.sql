-- Fase 2 (início): motor de pontos da gamificação.
--
-- O motor de eventos já existe desde a Fundação (tabela `eventos`, alimentada
-- por gatilhos em negócios/tarefas/notas). Esta migration adiciona a camada
-- de regras + extrato configurável pelo admin, sem pontos fixos no código:
--   1. `gamification_rules`: admin associa um tipo de evento (+ condição
--      opcional sobre o payload) a uma pontuação, com teto opcional por
--      dia/mês.
--   2. `point_ledger`: extrato imutável (exceto por estorno) de pontos por
--      membro, gerado automaticamente sempre que um evento bate com uma
--      regra ativa.
-- Metas, comissões, XP/níveis, conquistas, ranking e loja de recompensas
-- entram em migrations seguintes, todos lendo deste mesmo extrato.

create type public.periodo_limite_regra as enum ('dia', 'mes');

create table public.gamification_rules (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  evento_tipo text not null,
  condicao jsonb,
  pontos integer not null,
  limite_periodo public.periodo_limite_regra,
  limite_quantidade integer,
  ativa boolean not null default true,
  criado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((limite_periodo is null) = (limite_quantidade is null)),
  check (limite_quantidade is null or limite_quantidade > 0)
);
create index on public.gamification_rules (empresa_id, evento_tipo) where ativa;

create table public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null references public.empresa_membros (id) on delete cascade,
  regra_id uuid references public.gamification_rules (id) on delete set null,
  evento_id bigint references public.eventos (id) on delete set null,
  pontos integer not null,
  descricao text not null default '',
  referencia_tipo text,
  referencia_id uuid,
  estornado boolean not null default false,
  estornado_em timestamptz,
  estornado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.point_ledger (empresa_id, membro_id, created_at desc);
create index on public.point_ledger (regra_id, membro_id, created_at desc) where not estornado;

create trigger gamification_rules_updated_at before update on public.gamification_rules
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- Avaliação de condição de regra
-- ---------------------------------------------------------------------------

-- Condição simples sobre um campo do payload do evento: {"campo": "valor",
-- "operador": ">=", "valor": 5000}. Sem condição (null), a regra sempre bate
-- quando o tipo de evento coincide. Operadores: =, !=, >=, >, <=, <.
create or replace function public.avaliar_condicao_regra(p_payload jsonb, p_condicao jsonb)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_campo text := p_condicao->>'campo';
  v_operador text := p_condicao->>'operador';
  v_valor text := p_condicao->>'valor';
  v_atual text;
begin
  if p_condicao is null or v_campo is null or v_operador is null then
    return true;
  end if;

  v_atual := p_payload->>v_campo;
  if v_atual is null then
    return false;
  end if;

  return case v_operador
    when '=' then v_atual = v_valor
    when '!=' then v_atual <> v_valor
    when '>=' then v_atual::numeric >= v_valor::numeric
    when '>' then v_atual::numeric > v_valor::numeric
    when '<=' then v_atual::numeric <= v_valor::numeric
    when '<' then v_atual::numeric < v_valor::numeric
    else false
  end;
exception when others then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilho: todo evento novo é confrontado com as regras ativas da empresa.
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_regras_gamificacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_membro_id uuid;
  v_regra record;
  v_qtd integer;
  v_desde timestamptz;
begin
  if new.ator_id is null then
    return new;
  end if;

  select id into v_membro_id from public.empresa_membros
    where empresa_id = new.empresa_id and user_id = new.ator_id and ativo
    limit 1;
  if v_membro_id is null then
    return new;
  end if;

  for v_regra in
    select * from public.gamification_rules
    where empresa_id = new.empresa_id and evento_tipo = new.tipo and ativa
  loop
    if not public.avaliar_condicao_regra(new.payload, v_regra.condicao) then
      continue;
    end if;

    if v_regra.limite_periodo is not null then
      v_desde := case v_regra.limite_periodo
        when 'dia' then date_trunc('day', now())
        when 'mes' then date_trunc('month', now())
      end;
      select count(*) into v_qtd from public.point_ledger
        where regra_id = v_regra.id and membro_id = v_membro_id
          and not estornado and created_at >= v_desde;
      if v_qtd >= v_regra.limite_quantidade then
        continue;
      end if;
    end if;

    insert into public.point_ledger
      (empresa_id, membro_id, regra_id, evento_id, pontos, descricao, referencia_tipo, referencia_id)
      values (new.empresa_id, v_membro_id, v_regra.id, new.id, v_regra.pontos, v_regra.nome, new.entidade, new.entidade_id);
  end loop;

  return new;
end;
$$;

create trigger eventos_aplicar_gamificacao after insert on public.eventos
  for each row execute function public.aplicar_regras_gamificacao();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.gamification_rules enable row level security;
alter table public.point_ledger enable row level security;

-- Regras: só admin configura e só admin precisa ver a regra em si (o extrato
-- já mostra pro colaborador o nome/motivo de cada lançamento, denormalizado).
create policy "admin le regras de gamificacao" on public.gamification_rules for select to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));
create policy "admin cria regra de gamificacao" on public.gamification_rules for insert to authenticated
  with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin edita regra de gamificacao" on public.gamification_rules for update to authenticated
  using (public.tem_papel(empresa_id, '{admin}')) with check (public.tem_papel(empresa_id, '{admin}'));
create policy "admin apaga regra de gamificacao" on public.gamification_rules for delete to authenticated
  using (public.tem_papel(empresa_id, '{admin}'));

-- Extrato: mesma visibilidade de "quem vê o responsável" já usada no resto
-- do CRM (o próprio membro, o gestor da equipe dele, ou o admin).
create policy "ver extrato de pontos" on public.point_ledger for select to authenticated
  using (public.pode_ver_responsavel(empresa_id, membro_id));

-- Lançamentos são criados só pelo gatilho (security definer) e nunca
-- diretamente por usuários; estorno é uma ação administrativa específica
-- (função própria, não update direto) — ver próxima migration da Fase 2.
revoke insert, update, delete on public.point_ledger from anon, authenticated, service_role;
revoke insert, update, delete on public.gamification_rules from anon, service_role;
