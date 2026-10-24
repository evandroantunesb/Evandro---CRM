-- Temperatura do negócio (Quente / Morno / Frio) e mês de fechamento previsto.
--
-- O que faz:
--  * `regras_temperatura`: cardápio FIXO de regras por empresa, cada uma ligada a um sinal que o sistema já
--    registra. Admin e gestor ligam/desligam, ajustam os parâmetros, escolhem Quente ou Frio e a ordem; não criam
--    sinal novo. Toda empresa nasce com as 11 regras (4 ligadas, padrões aprovados pelo Evandro em 24/10/2026) e as
--    existentes recebem as mesmas. Mudanças só por `salvar_regras_temperatura` (lista inteira, atômica), com autor
--    gravado na própria linha e histórico na auditoria existente (`auditar`).
--  * `temperatura_negocios(ids)`: calcula na leitura (nada gravado, nunca desatualiza): a 1ª regra ligada que bate,
--    pela ordem, define a temperatura e vira o "porquê"; nenhuma = morno. Só negócios abertos, não arquivados e que o
--    usuário enxerga (`pode_ver_negocio`). SECURITY DEFINER para todos verem a MESMA temperatura (o SDR não lê
--    contratos nem emissões, mas o sinal "contrato gerado" vale para ele também); devolve só temperatura, sinal e
--    número de dias, nunca dado do contrato ou da proposta.
--  * `negocios.fechamento_previsto` (1º dia do mês) e o campo obrigatório "fechamento_previsto" nas etapas, conferido
--    por gatilho próprio ao entrar na etapa (não reescreve `preparar_negocio` do M1).
-- O que NÃO faz: não gera evento, ponto, tarefa nem comissão; não altera linha existente de negócio.
-- Depende de: tem_papel, membro_ativo, meu_membro_id, pode_ver_negocio, tocar_updated_at, auditar (já existentes).

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Mês de fechamento previsto
-- ---------------------------------------------------------------------------

alter table public.negocios
  add column fechamento_previsto date
    constraint negocios_fechamento_previsto_mes check (fechamento_previsto = date_trunc('month', fechamento_previsto)::date);

alter table public.etapas drop constraint etapas_campos_obrigatorios_check;
alter table public.etapas add constraint etapas_campos_obrigatorios_check
  check (campos_obrigatorios <@ array[
    'valor', 'origem', 'descricao', 'contato_telefone', 'contato_email', 'contato_documento', 'contato_cidade',
    'fechamento_previsto'
  ]);

-- Roda depois de `negocios_preparar` (ordem alfabética dos gatilhos BEFORE), com a etapa já resolvida.
create or replace function public.exigir_fechamento_previsto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_etapa record;
begin
  if (tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id) and new.fechamento_previsto is null then
    select nome, campos_obrigatorios into v_etapa from public.etapas where id = new.etapa_id;
    if 'fechamento_previsto' = any (v_etapa.campos_obrigatorios) then
      raise exception 'Para entrar em "%", preencha: mês previsto de fechamento.', v_etapa.nome
        using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end if;
  return new;
end;
$$;
create trigger negocios_previsao_obrigatoria before insert or update on public.negocios
  for each row execute function public.exigir_fechamento_previsto();

-- ---------------------------------------------------------------------------
-- Regras de temperatura
-- ---------------------------------------------------------------------------

create table public.regras_temperatura (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  sinal text not null check (sinal in (
    'contrato_gerado', 'etapa', 'etapa_negociacao', 'proposta_emitida', 'prazo_instalacao', 'decisor',
    'orcamento_outra_empresa', 'busca_financiamento', 'somente_pesquisando', 'sem_atividade', 'tarefa_atrasada'
  )),
  parametros jsonb not null default '{}' check (jsonb_typeof(parametros) = 'object'),
  temperatura text not null check (temperatura in ('quente', 'frio')),
  ordem smallint not null check (ordem > 0),
  ativa boolean not null default false,
  atualizado_por uuid references public.empresa_membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, sinal),
  -- Adiável: `salvar_regras_temperatura` troca posições numa só transação.
  constraint regras_temperatura_ordem_unica unique (empresa_id, ordem) deferrable initially deferred
);

-- Parâmetros conferidos por sinal; o autor da mudança é sempre quem está logado (não dá para forjar).
create or replace function public.preparar_regra_temperatura()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_p jsonb := new.parametros;
  v_dias int;
begin
  if tg_op = 'UPDATE' then
    if new.empresa_id is distinct from old.empresa_id or new.sinal is distinct from old.sinal then
      raise exception 'Empresa e sinal da regra não mudam' using errcode = 'check_violation';
    end if;
    new.atualizado_por := public.meu_membro_id(new.empresa_id);
  end if;

  if new.sinal in ('proposta_emitida', 'sem_atividade', 'tarefa_atrasada') then
    if jsonb_typeof(v_p -> 'dias') is distinct from 'number' then
      raise exception 'Informe o número de dias.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    v_dias := (v_p ->> 'dias')::numeric;
    if v_dias::numeric <> (v_p ->> 'dias')::numeric or v_dias < 1 or v_dias > 365 then
      raise exception 'Dias devem ser um número inteiro de 1 a 365.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    new.parametros := jsonb_build_object('dias', v_dias);
  elsif new.sinal = 'etapa' then
    if jsonb_typeof(coalesce(v_p -> 'etapas', '[]')) <> 'array'
       or exists (select 1 from jsonb_array_elements(coalesce(v_p -> 'etapas', '[]')) x where jsonb_typeof(x) <> 'string'
                    or (x #>> '{}') !~ '^[0-9a-f-]{36}$'
                    or not exists (select 1 from public.etapas e where e.id = (x #>> '{}')::uuid and e.empresa_id = new.empresa_id)) then
      raise exception 'Etapa inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if new.ativa and jsonb_array_length(coalesce(v_p -> 'etapas', '[]')) = 0 then
      raise exception 'Escolha pelo menos uma etapa para ligar a regra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    new.parametros := jsonb_build_object('etapas', coalesce(v_p -> 'etapas', '[]'));
  elsif new.sinal = 'prazo_instalacao' then
    if jsonb_typeof(coalesce(v_p -> 'prazos', '[]')) <> 'array'
       or exists (select 1 from jsonb_array_elements(coalesce(v_p -> 'prazos', '[]')) x
                   where (x #>> '{}') is null or jsonb_typeof(x) <> 'string'
                      or (x #>> '{}') not in ('imediatamente', 'ate_30_dias', '1_3_meses', '3_6_meses', 'somente_pesquisando'))
       or jsonb_typeof(coalesce(v_p -> 'exige_decisor', 'false')) <> 'boolean' then
      raise exception 'Prazo de instalação inválido.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    if new.ativa and jsonb_array_length(coalesce(v_p -> 'prazos', '[]')) = 0 then
      raise exception 'Escolha pelo menos um prazo para ligar a regra.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    new.parametros := jsonb_build_object('prazos', coalesce(v_p -> 'prazos', '[]'),
                                         'exige_decisor', coalesce(v_p -> 'exige_decisor', 'false'));
  else
    new.parametros := '{}';
  end if;
  return new;
end;
$$;
create trigger regras_temperatura_preparar before insert or update on public.regras_temperatura
  for each row execute function public.preparar_regra_temperatura();
create trigger regras_temperatura_updated_at before update on public.regras_temperatura
  for each row execute function public.tocar_updated_at();
create trigger auditar_regras_temperatura after insert or update or delete on public.regras_temperatura
  for each row execute function public.auditar();

alter table public.regras_temperatura enable row level security;
create policy "membros veem regras de temperatura" on public.regras_temperatura for select to authenticated
  using (public.membro_ativo(empresa_id));
create policy "admin e gestor editam regras de temperatura" on public.regras_temperatura for update to authenticated
  using (public.tem_papel(empresa_id, '{admin,gestor}'))
  with check (public.tem_papel(empresa_id, '{admin,gestor}'));
-- Sem INSERT nem DELETE pela API: o cardápio é fixo e nasce com a empresa.
revoke insert, delete, truncate on public.regras_temperatura from anon, authenticated;

-- Padrões aprovados (24/10/2026). Ordem: contrato gerado vence tudo; depois os sinais de frio; depois o prazo curto.
create or replace function public.inserir_regras_temperatura_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.regras_temperatura (empresa_id, sinal, parametros, temperatura, ordem, ativa) values
    (p_empresa_id, 'contrato_gerado', '{}', 'quente', 1, true),
    (p_empresa_id, 'sem_atividade', '{"dias": 7}', 'frio', 2, true),
    (p_empresa_id, 'somente_pesquisando', '{}', 'frio', 3, true),
    (p_empresa_id, 'prazo_instalacao', '{"prazos": ["imediatamente", "ate_30_dias"], "exige_decisor": true}', 'quente', 4, true),
    (p_empresa_id, 'etapa_negociacao', '{}', 'quente', 5, false),
    (p_empresa_id, 'etapa', '{"etapas": []}', 'quente', 6, false),
    (p_empresa_id, 'proposta_emitida', '{"dias": 7}', 'quente', 7, false),
    (p_empresa_id, 'decisor', '{}', 'quente', 8, false),
    (p_empresa_id, 'busca_financiamento', '{}', 'quente', 9, false),
    (p_empresa_id, 'orcamento_outra_empresa', '{}', 'frio', 10, false),
    (p_empresa_id, 'tarefa_atrasada', '{"dias": 3}', 'frio', 11, false)
  on conflict (empresa_id, sinal) do nothing;
$$;
revoke all on function public.inserir_regras_temperatura_padrao(uuid) from public, anon, authenticated, service_role;

create or replace function public.criar_regras_temperatura_empresa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.inserir_regras_temperatura_padrao(new.id);
  return null;
end;
$$;
create trigger empresas_regras_temperatura after insert on public.empresas
  for each row execute function public.criar_regras_temperatura_empresa();

select public.inserir_regras_temperatura_padrao(id) from public.empresas;

-- Salva a lista inteira de uma vez (ordem, ligada, temperatura, parâmetros). SECURITY INVOKER: a política de UPDATE
-- decide quem pode (admin e gestor); a lista precisa ter exatamente as regras da empresa, sem repetição.
create or replace function public.salvar_regras_temperatura(p_empresa_id uuid, p_regras jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_item jsonb;
  v_ordem int := 0;
  v_alteradas int;
begin
  if not public.tem_papel(p_empresa_id, '{admin,gestor}') then
    raise exception 'Só admin ou gestor alteram as regras de temperatura.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if jsonb_typeof(p_regras) <> 'array'
     or jsonb_array_length(p_regras) <> (select count(*) from public.regras_temperatura where empresa_id = p_empresa_id)
     or (select count(distinct x ->> 'id') from jsonb_array_elements(p_regras) x) <> jsonb_array_length(p_regras) then
    raise exception 'A lista de regras está incompleta. Recarregue a página.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  for v_item in select value from jsonb_array_elements(p_regras) loop
    v_ordem := v_ordem + 1;
    if (v_item ->> 'temperatura') is null or jsonb_typeof(v_item -> 'ativa') is distinct from 'boolean' then
      raise exception 'Regra inválida.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
    update public.regras_temperatura
       set ordem = v_ordem,
           ativa = (v_item ->> 'ativa')::boolean,
           temperatura = v_item ->> 'temperatura',
           parametros = coalesce(v_item -> 'parametros', '{}')
     where id = (v_item ->> 'id')::uuid and empresa_id = p_empresa_id
       and (ordem, ativa, temperatura, parametros) is distinct from
           (v_ordem::smallint, (v_item ->> 'ativa')::boolean, v_item ->> 'temperatura', coalesce(v_item -> 'parametros', '{}'));
    get diagnostics v_alteradas = row_count;
    if v_alteradas = 0 and not exists (select 1 from public.regras_temperatura where id = (v_item ->> 'id')::uuid and empresa_id = p_empresa_id) then
      raise exception 'A lista de regras está incompleta. Recarregue a página.' using errcode = 'check_violation', hint = 'mensagem_usuario';
    end if;
  end loop;
end;
$$;
revoke all on function public.salvar_regras_temperatura(uuid, jsonb) from public, anon, service_role;
grant execute on function public.salvar_regras_temperatura(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Cálculo
-- ---------------------------------------------------------------------------

-- "Atividade" = mudança de etapa, nota ou tarefa concluída, o que for mais recente.
-- `dias` acompanha os sinais que dependem de tempo (para o "porquê": "sem atividade há 9 dias").
create or replace function public.temperatura_negocios(p_negocio_ids uuid[])
returns table (negocio_id uuid, temperatura text, sinal text, dias int)
language sql stable security definer set search_path = ''
as $$
  select n.id,
         coalesce(r.temperatura, 'morno'),
         r.sinal,
         case r.sinal
           when 'sem_atividade' then s.dias_sem_atividade
           when 'proposta_emitida' then s.dias_desde_proposta
           when 'tarefa_atrasada' then s.dias_tarefa_atrasada
         end
  from public.negocios n
  join public.etapas e on e.id = n.etapa_id
  cross join lateral (
    select
      exists (select 1 from public.contratos c where c.negocio_id = n.id) as contrato_gerado,
      floor(extract(epoch from now() - greatest(
        n.etapa_desde,
        (select max(nt.created_at) from public.notas nt where nt.negocio_id = n.id),
        (select max(t.concluida_em) from public.tarefas t where t.negocio_id = n.id)
      )) / 86400)::int as dias_sem_atividade,
      floor(extract(epoch from now() - greatest(
        (select max(pe.emitida_em) from public.propostas_emissoes pe where pe.negocio_id = n.id),
        (select p.created_at from public.propostas p where p.negocio_id = n.id)
      )) / 86400)::int as dias_desde_proposta,
      floor(extract(epoch from now() - (
        select min(t.vence_em) from public.tarefas t where t.negocio_id = n.id and t.concluida_em is null
      )) / 86400)::int as dias_tarefa_atrasada
  ) s
  left join lateral (
    select rt.temperatura, rt.sinal
    from public.regras_temperatura rt
    where rt.empresa_id = n.empresa_id
      and rt.ativa
      and case rt.sinal
        when 'contrato_gerado' then s.contrato_gerado
        when 'etapa' then rt.parametros -> 'etapas' ? n.etapa_id::text
        when 'etapa_negociacao' then e.marca_negociacao
        when 'proposta_emitida' then s.dias_desde_proposta <= (rt.parametros ->> 'dias')::int
        when 'prazo_instalacao' then rt.parametros -> 'prazos' ? n.qualif_prazo_instalacao
          and (not (rt.parametros ->> 'exige_decisor')::boolean or coalesce(n.qualif_e_decisor, false))
        when 'decisor' then coalesce(n.qualif_e_decisor, false)
        when 'busca_financiamento' then coalesce(n.qualif_busca_financiamento, false)
        when 'orcamento_outra_empresa' then coalesce(n.qualif_orcamento_outra_empresa, false)
        when 'somente_pesquisando' then n.qualif_prazo_instalacao = 'somente_pesquisando'
        when 'sem_atividade' then s.dias_sem_atividade >= (rt.parametros ->> 'dias')::int
        when 'tarefa_atrasada' then s.dias_tarefa_atrasada >= (rt.parametros ->> 'dias')::int
      end
    order by rt.ordem
    limit 1
  ) r on true
  where n.id = any (p_negocio_ids)
    and n.status = 'aberto'
    and n.arquivado_em is null
    and public.pode_ver_negocio(n.id);
$$;
revoke all on function public.temperatura_negocios(uuid[]) from public, anon, service_role;
grant execute on function public.temperatura_negocios(uuid[]) to authenticated;
