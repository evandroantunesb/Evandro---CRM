-- Autoconfirmação de pagamento (decisão do Evandro, 03/11/2026).
--
-- Admin e gestor confirmam o pagamento de qualquer venda que veem, inclusive a própria
-- (contrato que assinaram como responsável), no Solo e no Pro. Antes, quem assinou não podia
-- confirmar; no Solo com equipe, a venda do próprio dono ficava sem ter quem confirmasse.
-- A autoconfirmação conta normalmente para pontos e comissão: o evento `pagamento.confirmado`
-- continua creditando o responsável congelado na assinatura. Fica rastreável, porque a
-- confirmação grava quem confirmou (`confirmado_por_*`) ao lado do beneficiário, e qualquer
-- admin ou gestor pode estorná-la.
--
-- Três travas proibiam a autoconfirmação; as três saem juntas:
-- 1. `confirmacoes_pagamento_sem_autoconfirmacao` (tabela de confirmações): removida.
-- 2. `eventos_pagamento_beneficiario_check` (eventos `pagamento.*`): continua exigindo
--    beneficiário e ator explícitos, que é a proteção crítica (o motor credita
--    `coalesce(beneficiario_id, ator_id)`, então sem beneficiário o crédito cairia em quem
--    confirmou); deixa de exigir que sejam pessoas diferentes. A versão mais solta aceita
--    todas as linhas existentes, e o estorno da própria confirmação também passa a valer.
-- 3. confirmar_pagamento(): abaixo.
alter table public.confirmacoes_pagamento drop constraint confirmacoes_pagamento_sem_autoconfirmacao;

alter table public.eventos drop constraint eventos_pagamento_beneficiario_check;
alter table public.eventos add constraint eventos_pagamento_beneficiario_check check (
  tipo not like 'pagamento.%' or (beneficiario_id is not null and ator_id is not null)
);

-- confirmar_pagamento(): idêntica à versão de 20261015100000_integridade_contratos.sql, exceto
-- que não recusa mais quando `responsavel_assinatura_id` é o membro de quem confirma.
-- Continua: só admin/gestor, com acesso ao negócio, contrato assinado e sem confirmação ativa.
create or replace function public.confirmar_pagamento(p_contrato_id uuid)
returns public.confirmacoes_pagamento
language plpgsql security definer set search_path = ''
as $$
declare
  v_contrato public.contratos;
  v_empresa uuid;
  v_contato_id uuid;
  v_ator uuid := (select auth.uid());
  v_meu_membro_id uuid;
  v_benef_user uuid;
  v_evento_id bigint;
  v_conf public.confirmacoes_pagamento;
begin
  select * into v_contrato from public.contratos where id = p_contrato_id for update;
  if not found then
    raise exception 'Contrato não encontrado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;
  select empresa_id into v_empresa from public.negocios where id = v_contrato.negocio_id;

  if not public.tem_papel(v_empresa, '{admin,gestor}') then
    raise exception 'Só gestor ou admin pode confirmar pagamento.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  if not public.pode_ver_negocio(v_contrato.negocio_id) then
    raise exception 'Você não tem acesso a este negócio.' using errcode = 'insufficient_privilege', hint = 'mensagem_usuario';
  end if;
  v_meu_membro_id := public.meu_membro_id(v_empresa);

  if v_contrato.status <> 'assinado' then
    raise exception 'Só é possível confirmar pagamento de contrato assinado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  if exists (select 1 from public.confirmacoes_pagamento where contrato_id = p_contrato_id and estornado_em is null) then
    raise exception 'Pagamento deste contrato já está confirmado.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- Beneficiário: closer congelado no momento da assinatura (`responsavel_assinatura_id`,
  -- ver trigger `travar_contrato_com_pagamento`), nunca `negocios.responsavel_id` atual —
  -- o negócio pode ter trocado de responsável entre a assinatura e o pagamento.
  if v_contrato.responsavel_assinatura_id is null then
    raise exception 'Contrato sem responsável registrado na assinatura: não é possível determinar o beneficiário.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  -- O beneficiário precisa ser membro da empresa do negócio (protege também dado legado).
  select user_id into v_benef_user from public.empresa_membros
    where id = v_contrato.responsavel_assinatura_id and empresa_id = v_empresa;
  if v_benef_user is null then
    raise exception 'Responsável da assinatura inválido para crédito.' using errcode = 'check_violation', hint = 'mensagem_usuario';
  end if;

  insert into public.eventos (empresa_id, tipo, ator_id, beneficiario_id, entidade, entidade_id, payload, profile_at_event)
    values (v_empresa, 'pagamento.confirmado', v_ator, v_benef_user, 'negocio', v_contrato.negocio_id,
            jsonb_build_object('contrato_id', v_contrato.id), v_contrato.perfil_assinatura)
    returning id into v_evento_id;

  insert into public.confirmacoes_pagamento
    (empresa_id, contrato_id, negocio_id, confirmado_por_membro_id, confirmado_por_user_id,
     beneficiario_membro_id, beneficiario_user_id, evento_confirmacao_id)
    values (v_empresa, v_contrato.id, v_contrato.negocio_id, v_meu_membro_id, v_ator,
            v_contrato.responsavel_assinatura_id, v_benef_user, v_evento_id)
    returning * into v_conf;

  select contato_id into v_contato_id from public.negocios where id = v_contrato.negocio_id;
  insert into public.atividades (empresa_id, negocio_id, contato_id, tipo, ator_id, dados)
    values (v_empresa, v_contrato.negocio_id, v_contato_id, 'pagamento_confirmado', v_ator,
            jsonb_build_object('contrato_id', v_contrato.id, 'confirmacao_id', v_conf.id));

  return v_conf;
end;
$$;
revoke all on function public.confirmar_pagamento(uuid) from public, anon;
grant execute on function public.confirmar_pagamento(uuid) to authenticated;
