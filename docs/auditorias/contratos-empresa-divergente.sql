-- Auditoria SOMENTE LEITURA de integridade de contratos e confirmações de pagamento.
-- Só SELECT. Nada aqui altera dado, esquema ou permissão. Rodar pelo SQL Editor do Supabase (ou
-- psql) com papel de leitura; não depende de nenhuma migration da PR.
--
-- Os resultados são INDÍCIOS para conferência caso a caso, não prova de fraude nem de erro: dado
-- antigo pode ter explicação legítima (reparo manual, fluxo anterior, troca de responsável).
--
-- Validação da FK composta (migration 20261015100000, criada NOT VALID): com a contagem 1 em zero e
-- as consultas 2 e 3 vazias, é seguro validar em migration própria:
--   alter table public.contratos validate constraint contratos_negocio_empresa_fk;

-- 1) CONTAGEM: contratos com empresa diferente da do negócio.
select count(*) as contratos_divergentes
from public.contratos c
join public.negocios n on n.id = c.negocio_id
where c.empresa_id is distinct from n.empresa_id;

-- 2) IDENTIFICAÇÃO: quais são, com as duas empresas e o estado do contrato.
select
  c.id                 as contrato_id,
  c.negocio_id,
  c.empresa_id         as empresa_do_contrato,
  n.empresa_id         as empresa_do_negocio,
  c.status,
  c.responsavel_assinatura_id,
  c.criado_por,
  c.created_at,
  c.updated_at,
  exists (select 1 from public.confirmacoes_pagamento p where p.contrato_id = c.id) as tem_confirmacao_pagamento
from public.contratos c
join public.negocios n on n.id = c.negocio_id
where c.empresa_id is distinct from n.empresa_id
order by c.updated_at desc;

-- 3) Responsável congelado na assinatura que não é membro da empresa do negócio.
select
  c.id as contrato_id,
  c.negocio_id,
  n.empresa_id              as empresa_do_negocio,
  c.responsavel_assinatura_id,
  m.empresa_id              as empresa_do_responsavel,
  c.status
from public.contratos c
join public.negocios n on n.id = c.negocio_id
left join public.empresa_membros m on m.id = c.responsavel_assinatura_id
where c.responsavel_assinatura_id is not null
  and m.empresa_id is distinct from n.empresa_id;

-- 4) Responsável congelado diferente de quem o banco registrou no evento `contrato.assinado` mais
--    recente do negócio (`registrar_contrato` grava como ator o usuário responsável no momento da
--    assinatura). Conferir caso a caso (reparo manual, contrato reassinado).
select
  c.id                         as contrato_id,
  c.negocio_id,
  c.responsavel_assinatura_id,
  m.user_id                    as usuario_do_responsavel_congelado,
  ev.ator_id                   as usuario_no_evento_de_assinatura,
  c.perfil_assinatura,
  ev.profile_at_event          as perfil_no_evento,
  ev.created_at                as assinado_em_evento,
  exists (select 1 from public.confirmacoes_pagamento p where p.contrato_id = c.id) as tem_confirmacao_pagamento
from public.contratos c
left join public.empresa_membros m on m.id = c.responsavel_assinatura_id
left join lateral (
  select e.ator_id, e.profile_at_event, e.created_at
  from public.eventos e
  where e.entidade_id = c.negocio_id and e.tipo = 'contrato.assinado'
  order by e.id desc
  limit 1
) ev on true
where c.status = 'assinado'
  and ev.ator_id is not null
  and (m.user_id is distinct from ev.ator_id or c.perfil_assinatura is distinct from ev.profile_at_event)
order by ev.created_at desc;

-- 5) Contratos assinados cujo responsável congelado difere do responsável ATUAL do negócio.
--    Não é erro por si só: o negócio pode ter trocado de responsável depois da assinatura. É a
--    lista para conferir se o beneficiário registrado é o closer que de fato assinou.
select
  c.id as contrato_id,
  c.negocio_id,
  c.status,
  c.responsavel_assinatura_id,
  n.responsavel_id          as responsavel_atual_do_negocio,
  c.criado_por,
  c.updated_at
from public.contratos c
join public.negocios n on n.id = c.negocio_id
where c.status = 'assinado'
  and c.responsavel_assinatura_id is distinct from n.responsavel_id
order by c.updated_at desc;

-- 6) Confirmações de pagamento cujo beneficiário não é membro da empresa do negócio, ou cuja
--    `empresa_id` difere da empresa do negócio.
select
  p.id                      as confirmacao_id,
  p.contrato_id,
  p.negocio_id,
  p.empresa_id              as empresa_da_confirmacao,
  n.empresa_id              as empresa_do_negocio,
  p.beneficiario_membro_id,
  m.empresa_id              as empresa_do_beneficiario,
  p.confirmado_em,
  p.estornado_em
from public.confirmacoes_pagamento p
join public.negocios n on n.id = p.negocio_id
left join public.empresa_membros m on m.id = p.beneficiario_membro_id
where p.empresa_id is distinct from n.empresa_id
   or m.empresa_id is distinct from n.empresa_id
order by p.confirmado_em desc;

-- 7) Contratos fora de 'assinado' com responsável da assinatura já preenchido e sem nenhum evento
--    `contrato.assinado` no negócio. (Contrato reaberto depois de assinado mantém o valor, mas tem o
--    evento; por isso ele não aparece aqui.)
select
  c.id as contrato_id,
  c.negocio_id,
  c.status,
  c.responsavel_assinatura_id,
  c.perfil_assinatura,
  c.criado_por,
  c.created_at,
  c.updated_at
from public.contratos c
where c.status <> 'assinado'
  and (c.responsavel_assinatura_id is not null or c.perfil_assinatura is not null)
  and not exists (
    select 1 from public.eventos e
    where e.entidade_id = c.negocio_id and e.tipo = 'contrato.assinado'
  )
order by c.updated_at desc;
