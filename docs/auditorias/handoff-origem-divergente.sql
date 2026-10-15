-- Auditoria SOMENTE LEITURA: origem do repasse (`negocios.handoff_origem_id`) e bônus de SDR.
-- Só SELECT. Nada aqui altera dado, esquema ou permissão. Rodar pelo SQL Editor do Supabase (ou
-- psql) com papel de leitura; não depende da migration 20261015110000.
--
-- Os resultados são INDÍCIOS para investigação caso a caso, não prova de fraude: dados antigos
-- podem ter explicação legítima (backfill, reparo manual, fluxo anterior à B1a).

-- 1) CONTAGEM: negócios cuja origem aponta para repasse de outro negócio, de outra empresa ou
--    não aceito.
select count(*) as negocios_com_origem_inconsistente
from public.negocios n
join public.handoffs h on h.id = n.handoff_origem_id
where h.negocio_id is distinct from n.id
   or h.empresa_id is distinct from n.empresa_id
   or h.status is distinct from 'aceito';

-- 2) IDENTIFICAÇÃO dos negócios da consulta 1.
select
  n.id            as negocio_id,
  n.empresa_id    as empresa_do_negocio,
  n.status        as status_negocio,
  h.id            as handoff_id,
  h.negocio_id    as negocio_do_handoff,
  h.empresa_id    as empresa_do_handoff,
  h.status        as status_handoff,
  h.de_membro_id  as sdr_membro_id,
  n.updated_at
from public.negocios n
join public.handoffs h on h.id = n.handoff_origem_id
where h.negocio_id is distinct from n.id
   or h.empresa_id is distinct from n.empresa_id
   or h.status is distinct from 'aceito'
order by n.updated_at desc;

-- 3) Bônus de SDR (`handoff.won`, `handoff.contrato_assinado`) cujo beneficiário não é o SDR
--    remetente de nenhum repasse daquele negócio, naquela empresa.
select
  e.id            as evento_id,
  e.tipo,
  e.empresa_id,
  e.entidade_id   as negocio_id,
  e.beneficiario_id,
  e.created_at
from public.eventos e
where e.tipo in ('handoff.won', 'handoff.contrato_assinado')
  and not exists (
    select 1
    from public.handoffs h
    join public.empresa_membros m on m.id = h.de_membro_id
    where h.negocio_id = e.entidade_id
      and h.empresa_id = e.empresa_id
      and m.user_id = e.beneficiario_id
  )
order by e.created_at desc;

-- 4) Negócios com repasse aceito mas sem origem registrada (possível anulação). Pode ser
--    legítimo em dados anteriores ao campo; conferir pelo histórico (`atividades`).
select
  n.id as negocio_id,
  n.empresa_id,
  n.status,
  count(h.id) as repasses_aceitos
from public.negocios n
join public.handoffs h on h.negocio_id = n.id and h.empresa_id = n.empresa_id and h.status = 'aceito'
where n.handoff_origem_id is null
group by n.id, n.empresa_id, n.status
order by n.id;
