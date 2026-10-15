-- Auditoria SOMENTE LEITURA: contratos cuja empresa diverge da empresa real do negócio.
-- Só SELECT. Nada aqui altera dado, esquema ou permissão. Rodar pelo SQL Editor do Supabase (ou
-- psql) com papel de leitura; não depende de nenhuma migration da PR.
--
-- Contexto: até a migration 20261015100000_integridade_contratos.sql não havia FK composta, então
-- `contratos.empresa_id` podia divergir de `negocios.empresa_id`. A migration cria a FK como
-- NOT VALID (não varre o legado). Com a contagem 1 em zero e as consultas 2 a 4 vazias, é seguro
-- validar: alter table public.contratos validate constraint contratos_negocio_empresa_fk;

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

-- 3) Beneficiário da assinatura de OUTRA empresa (valor que o cliente conseguia gravar no INSERT,
--    ver a migration): responsável congelado que não é membro da empresa do negócio.
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

-- 4) Contratos assinados cujo responsável congelado difere do responsável ATUAL do negócio.
--    NÃO é erro por si só (o negócio pode ter trocado de responsável depois da assinatura): é a
--    lista para conferir, caso a caso, se o beneficiário registrado é o closer que de fato assinou.
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
