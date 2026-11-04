-- Prazos da Engenharia para a Copel (PR 2 de 3 do enquadramento Copel) — decisões do Evandro em 04/11/2026.
--
--  * Cada prazo escolhe a contagem: dias úteis (como antes) ou dias corridos (`engenharia_prazos.contagem`). A coluna
--    `dias_uteis` guarda a quantidade de dias nas duas contagens (o nome fica por compatibilidade).
--  * Valores do engenheiro: aprovação do projeto em 15 dias corridos; na zona rural (enquadramento) em 30 dias corridos
--    (chave nova `distribuidora_analise_rural`); vistoria em 7 dias úteis. Conexão segue vazia.
--  * Prazo interno novo `art`: emitir a ART (TRT) em 1 dia útil, contado do pagamento confirmado (a obra nasce com ele)
--    até o item "ART..." do checklist ficar válido ou "não se aplica"; com o checklist ainda não aplicado, até o
--    registro do protocolo. Nunca conta de antes de 04/11/2026 (data desta regra): as obras anteriores ganham o prazo a
--    partir dela, sem atraso retroativo.
--  * Empresas atuais: os valores novos entram só onde o prazo está vazio; o que o admin preencheu fica.
--  * Em dias corridos, o vencimento é o marco + N dias e `dias_restantes` conta dias corridos; em dias úteis, como antes.
-- Depende de: 20261030160000_engenharia_prazos_indicadores.sql, 20261114100000_engenharia_enquadramento_copel.sql.

set lock_timeout = '5s';

alter table public.engenharia_prazos drop constraint engenharia_prazos_chave_check;
alter table public.engenharia_prazos add constraint engenharia_prazos_chave_check check (chave in (
  'a_iniciar', 'projeto_em_elaboracao', 'exigencia', 'correcao_campo', 'art',
  'distribuidora_analise', 'distribuidora_analise_rural', 'distribuidora_vistoria', 'distribuidora_conexao'
));
alter table public.engenharia_prazos
  add column contagem text not null default 'uteis' check (contagem in ('uteis', 'corridos'));
comment on column public.engenharia_prazos.dias_uteis is 'Dias do prazo, na contagem de `contagem` (úteis ou corridos).';
-- O admin muda os dias e a contagem (a policy de update já exige admin).
grant update (contagem) on public.engenharia_prazos to authenticated;

create or replace function public.inserir_prazos_engenharia_padrao(p_empresa_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.engenharia_prazos (empresa_id, chave, dias_uteis, contagem) values
    (p_empresa_id, 'a_iniciar', 2, 'uteis'),
    (p_empresa_id, 'projeto_em_elaboracao', 5, 'uteis'),
    (p_empresa_id, 'exigencia', 3, 'uteis'),
    (p_empresa_id, 'correcao_campo', 5, 'uteis'),
    (p_empresa_id, 'art', 1, 'uteis'),
    (p_empresa_id, 'distribuidora_analise', 15, 'corridos'),
    (p_empresa_id, 'distribuidora_analise_rural', 30, 'corridos'),
    (p_empresa_id, 'distribuidora_vistoria', 7, 'uteis'),
    (p_empresa_id, 'distribuidora_conexao', null, 'uteis')
  on conflict (empresa_id, chave) do nothing;
$$;
revoke all on function public.inserir_prazos_engenharia_padrao(uuid) from public, anon, authenticated, service_role;

-- Empresas atuais: ganham as chaves novas; os prazos da Copel entram só onde ainda estão vazios.
select public.inserir_prazos_engenharia_padrao(id) from public.empresas;
update public.engenharia_prazos set dias_uteis = 15, contagem = 'corridos'
  where chave = 'distribuidora_analise' and dias_uteis is null;
update public.engenharia_prazos set dias_uteis = 7, contagem = 'uteis'
  where chave = 'distribuidora_vistoria' and dias_uteis is null;

-- ---------------------------------------------------------------------------
-- Contagem
-- ---------------------------------------------------------------------------

-- Vencimento de um prazo de N dias contado do marco: corridos = marco + N; úteis = `somar_dias_uteis`.
create or replace function public.somar_dias_prazo(p_empresa_id uuid, p_inicio date, p_dias integer, p_contagem text)
returns date
language sql stable set search_path = ''
as $$
  select case when p_contagem = 'corridos' then p_inicio + p_dias else public.somar_dias_uteis(p_empresa_id, p_inicio, p_dias) end;
$$;

-- Dias até o vencimento na contagem do prazo: 0 = vence hoje; negativo = atraso.
create or replace function public.prazo_restante(p_empresa_id uuid, p_limite date, p_hoje date, p_contagem text)
returns integer
language sql stable set search_path = ''
as $$
  select case when p_contagem = 'corridos' then p_limite - p_hoje else public.prazo_dias_restantes(p_empresa_id, p_limite, p_hoje) end;
$$;

revoke all on function public.somar_dias_prazo(uuid, date, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.prazo_restante(uuid, date, date, text) from public, anon, authenticated, service_role;
grant execute on function public.somar_dias_prazo(uuid, date, integer, text) to authenticated;
grant execute on function public.prazo_restante(uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Prazos em curso por obra
-- ---------------------------------------------------------------------------

-- Mesma regra de 20261030160000, mais: a contagem de cada prazo (devolvida em `contagem`), o prazo da ART e o da
-- análise na zona rural (a chave devolvida continua `distribuidora_analise`). O retorno ganhou uma coluna, então a
-- função é recriada.
drop function public.prazos_engenharia(uuid);
create function public.prazos_engenharia(p_empresa_id uuid)
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
  ),
  vencimentos as (
    select m.obra_id, m.chave, m.inicio, coalesce(pr.contagem, 'uteis') as contagem,
      coalesce(m.fixo, public.somar_dias_prazo(p_empresa_id, m.inicio, pr.dias, pr.contagem)) as limite
    from marcos m
    left join prazo pr on pr.chave = m.regra
    where m.inicio is not null and (m.fixo is not null or pr.dias is not null)
  )
  select x.obra_id, x.chave, x.inicio, x.limite, public.prazo_restante(p_empresa_id, x.limite, public.hoje_brasilia(), x.contagem), x.contagem
  from vencimentos x
  where public.engenharia_em_curso(x.obra_id);
$$;
revoke all on function public.prazos_engenharia(uuid) from public, anon, authenticated, service_role;
grant execute on function public.prazos_engenharia(uuid) to authenticated;

reset lock_timeout;
