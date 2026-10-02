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
-- 2. contar_marco_membro: NÃO alterado nesta migration. Conflito estrutural
--    encontrado e reportado ao Evandro em vez de corrigido silenciosamente
--    (mesma instrução do ponto 6: parar antes de ampliar escopo).
--
--    O revoke total (mesmo padrão do ponto 1, e a correção arquiteturalmente
--    certa — confirmado: esta função só é chamada internamente, por
--    avaliar_conquistas_marco()) quebra tests/gamificacao-conquistas-marco.
--    test.ts, que chama contar_marco_membro(...) diretamente via RPC
--    autenticada (helper `contarMarco`, usado em ~10 casos) pra testar a
--    lógica de contagem isolada da engrenagem do gatilho — padrão
--    pré-existente, em arquivo fora do escopo desta PR.
--
--    Uma correção alternativa (manter EXECUTE pra authenticated + checagem
--    de autorização via pode_ver_responsavel, como calcular_realizado_meta)
--    foi tentada e também não funciona por desenho: o beneficiário de um
--    marco pode ser estruturalmente diferente de quem executou a ação que
--    gerou o evento (ex.: handoff.won credita o SDR de origem quando é o
--    CLOSER que fecha a venda) — confirmado na prática, quebrando o teste
--    "handoff.won credita o SDR de origem, não quem fechou a venda". Uma
--    checagem baseada em auth.uid()/pode_ver_responsavel rejeitaria esse
--    crédito interno legítimo.
-- ---------------------------------------------------------------------------

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
-- 6. Grants de defesa em profundidade (metas, planos_comissao,
--    comissoes_calculadas, recompensas): NÃO alterado nesta migration.
--    Conflito estrutural encontrado e reportado ao Evandro em vez de corrigido
--    silenciosamente (instrução explícita: só revogar se nenhum fluxo legítimo
--    depender do acesso de service_role; parar e reportar se houver risco de
--    quebra). Embora nenhuma rota de produção em src/ use a service-role key
--    nessas 4 tabelas, a própria suíte de testes do projeto usa — de forma
--    estabelecida e espalhada por múltiplos arquivos pré-existentes (não
--    criados por esta PR) — o cliente de serviço (`servico`, em tests/ajuda.ts)
--    pra inserir fixtures direto em `planos_comissao`/`comissoes_calculadas`
--    (tests/comissoes-causal.test.ts) e `recompensas`
--    (tests/loja-saldo-concorrencia.test.ts), contornando de propósito a
--    fricção de RLS/admin só pra montar cenário de teste. Revogar quebraria
--    esse padrão de teste já consolidado em vários arquivos fora do escopo
--    desta PR. Ver relato ao Evandro para decidir o próximo passo (migrar os
--    fixtures pra inserir via cliente admin, ou aceitar o risco de defesa em
--    profundidade documentado na auditoria).
-- ---------------------------------------------------------------------------
