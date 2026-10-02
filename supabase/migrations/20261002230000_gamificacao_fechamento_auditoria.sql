-- Fechamento funcional da Gamificação (Evandro, 2026-10-02), a partir da auditoria
-- integrada read-only e da microauditoria de Conquistas. Escopo fechado nos 6 pontos
-- abaixo; qualquer outro achado da auditoria (revogação de conquistas, CHECK em
-- deal.won/handoff.won, alerta de comissão desatualizada, regras legadas ignoradas,
-- deal.first_contact_done, menu/redesign) fica deliberadamente fora.

-- ---------------------------------------------------------------------------
-- 1. estornar_lancamentos_evento: nunca teve revoke/grant, ficando exposta como
--    RPC pública (Postgres concede EXECUTE a PUBLIC por padrão na criação). É
--    chamada só internamente, dentro de outras funções security definer
--    (registrar_negocio, registrar_handoff etc.) — que executam como o owner da
--    função e por isso continuam funcionando mesmo com o revoke abaixo (owner
--    sempre pode executar a própria função). Mesmo padrão já usado pela função
--    irmã estornar_lancamentos_do_evento.
-- ---------------------------------------------------------------------------

revoke all on function public.estornar_lancamentos_evento(uuid, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. contar_marco_membro: revoke total (public/anon/authenticated). Nunca
--    teve grant/revoke, ficando exposta como RPC pública. Tratada como helper
--    interno — só é chamada de dentro de avaliar_conquistas_marco() (gatilho
--    AFTER INSERT em `eventos`). NÃO recebeu checagem via auth.uid()/
--    pode_ver_responsavel (ao contrário de calcular_realizado_meta): o
--    beneficiário de um marco pode ser estruturalmente diferente de quem
--    executou a ação que gerou o evento (ex.: handoff.won credita o SDR de
--    origem quando é o CLOSER que fecha a venda) — uma checagem desse tipo
--    rejeitaria esse crédito interno legítimo. Owner da função (avaliar_
--    conquistas_marco, também security definer) continua executando-a sem
--    qualquer problema de permissão.
--
--    Conflito resolvido (Evandro, 2026-10-02): tests/gamificacao-conquistas-
--    marco.test.ts chamava a função direto via RPC autenticada (`contarMarco`)
--    pra testar a contagem isolada — migrado nesta PR pra validar a mesma
--    contagem só pelo fluxo interno legítimo (conquistas marco_contagem
--    "pino", desbloqueio observado via `conquistas_desbloqueadas`), nunca
--    mais chamando a RPC diretamente.
-- ---------------------------------------------------------------------------

revoke all on function public.contar_marco_membro(text, uuid, uuid, timestamptz, public.perfil_gamificacao) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ranking: admin/gestor ficam fora da competição por construção, mesmo que
--    perfil_gamificacao esteja preenchido (hoje a exclusão é só por ausência de
--    perfil, sem checagem de papel — nada impede um admin se autoatribuir um
--    perfil e aparecer competindo). Mudar para admin/gestor não apaga XP/
--    moedas/histórico nem o saldo da Loja (point_ledger não é tocado); só deixa
--    de ser somado neste RPC a partir de agora.
-- ---------------------------------------------------------------------------

drop function if exists public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz);

create function public.ranking_gamificacao(p_empresa_id uuid, p_perfil public.perfil_gamificacao, p_desde timestamptz default null)
returns table (membro_id uuid, total_xp bigint)
language sql stable security definer set search_path = ''
as $$
  select l.membro_id, sum(l.xp)::bigint as total_xp
  from public.point_ledger l
  join public.empresa_membros m on m.id = l.membro_id
  where l.empresa_id = p_empresa_id
    and l.profile_at_event = p_perfil
    and not l.estornado
    and (p_desde is null or l.created_at >= p_desde)
    and public.membro_ativo(p_empresa_id)
    and m.papel not in ('admin', 'gestor')
  group by l.membro_id
  order by total_xp desc;
$$;

revoke all on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz) from public;
grant execute on function public.ranking_gamificacao(uuid, public.perfil_gamificacao, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Grants de defesa em profundidade: metas, planos_comissao,
--    comissoes_calculadas e recompensas nunca tiveram revoke de service_role
--    (diferente do resto do módulo — point_ledger, conquistas_desbloqueadas,
--    resgates, confirmacoes_pagamento, handoffs já revogam). service_role tem
--    BYPASSRLS por padrão no Supabase, então qualquer código futuro que use a
--    chave de serviço nessas tabelas ignoraria silenciosamente a checagem
--    tem_papel(admin). Reconfirmado antes desta migration: nenhuma rota/código
--    em src/ usa a service-role key pra escrever nessas 4 tabelas — o único
--    uso era em fixtures de teste (tests/comissoes-causal.test.ts,
--    tests/loja-saldo-concorrencia.test.ts), migradas nesta PR pro cliente
--    admin autenticado (RLS normal), que já era o caminho de escrita legítimo
--    em produção. Revoga só insert/update/delete — select de serviço
--    (backups, scripts administrativos read-only) não é afetado. Nenhuma
--    regra funcional de Comissões ou Loja foi alterada.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.metas from service_role;
revoke insert, update, delete on public.planos_comissao from service_role;
revoke insert, update, delete on public.comissoes_calculadas from service_role;
revoke insert, update, delete on public.recompensas from service_role;
