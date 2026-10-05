# Estado do projeto — Raion CRM

Fonte única do estado atual do desenvolvimento. Substitui `PROGRESS.md` e `HANDOFF.md` da raiz, que ficam como registro histórico. Última atualização: 2026-10-05 (consolidado a partir de `docs/HANDOFF-CLAUDE-2026-10-06.md`, PR #133, e do complemento de contexto do Evandro).

O código (`src/`, `supabase/migrations/`) é a fonte da verdade; este arquivo pode estar atrás dele. Status de PR muda fora das sessões — confirme no GitHub antes de agir.

## Produto

Funil de vendas para empresas de energia solar (residencial e comercial). Uso duplo: ferramenta interna do Evandro (gerente comercial, equipe pequena) e SaaS multiempresa revendável. Produção: `raion-crm-roan.vercel.app` (`raion-crm.vercel.app`, sem "-roan", é de terceiros).

## Andamento

Percentuais aproximados, definidos pelo Evandro em 2026-10-05.

- **MVP comercial atual:** ~79%.
- **Produto completo** (todo o roadmap): ~58%.

**Legenda:** **Produção** = na `main` e em produção · **Branch/PR** = implementado só numa PR não mesclada · **Roadmap** = não iniciado (detalhes em `docs/ROADMAP.md`).

| Módulo | % | Onde está |
| --- | --- | --- |
| CRM Comercial | 85% | Produção: contatos, negócios, Kanban/lista, tarefas, notas, anexos, distribuição de leads (rodízio, aprovação do gestor, por papel), leads/propostas parados, leads sem contato, notificações in-app, papel SDR (qualificação, handoff com aceite, tarefa automática), Google Agenda |
| Calculadora Solar | 72% | Produção: calculadora atual. **Branch/PR #101:** motor de dimensionamento real no wizard de 3 etapas, com 13 migrations — fora da `main`. Falta CSV real de equipamentos e validação com o engenheiro |
| Catálogo Técnico | 75% | Parte relevante na **PR #101**, fora da `main`/produção |
| Propostas | 50% | Produção: proposta em PDF, link público, contrato com status |
| Gamificação | 88% | Produção: motor funcionalmente fechado em 2026-10-02 (XP/moedas, níveis, conquistas, ranking, loja, metas, comissões, pagamento confirmado). Visual novo só em Visão geral e Extrato (PR #130); ~9 telas no visual antigo |
| Interface/UX geral | 55% | Produção: redesign de Início, Tarefas (#80), Contatos (#82), gamificação parcial (#130). Kanban e demais telas pendentes |
| Base Demo | 85% | **Branch/PR #132:** script pronto, dry-run feito em produção; falta a execução real |
| Segurança/Produção | 70% | Produção: RLS multiempresa, CI, deploy, migrations via workflow. Backup automático (#62) parado por falta de secrets |
| Onboarding | 15% | Roadmap |
| Tipos de Solução | 10% | Roadmap |
| Pós-venda/Obras | 8% | Roadmap |
| Engenharia | 5% | Roadmap |
| Administrativo/Pós-vendas | 5% | Roadmap |
| Documentos configuráveis | 5% | Roadmap |
| Concessionárias | 10% | Roadmap |
| Agenda Operacional | 15% | Roadmap |
| Integrações/Automações | 15% | Roadmap (Google Agenda já em produção) |

Nada do papel SDR, Tarefas, Contatos, wizard e Loja tem validação registrada em navegador real.

## Base Demo — PR #132

Draft, branch `feature/seed-base-demo`, script `scripts/seed-base-demo.mjs`. Substitui os vendedores reais da empresa por uma base fictícia de 90 dias de histórico (energia solar residencial e comercial, tickets de ~R$ 15 mil a R$ 120 mil), gerada por fluxos reais (triggers, RPCs, sessões autenticadas) — nunca por inserção direta de pontos ou eventos.

**Dry-run executado com sucesso contra produção** (nada foi alterado):

- empresa correta localizada;
- 3 membros atuais seriam removidos — encontrados pelo filtro atual do script, `papel = 'vendedor'` (membros com `papel = 'sdr'` não entram nesse filtro) — e 6 negócios atuais seriam apagados;
- admin, configurações da empresa e contas Auth antigas preservados.

**Usuários fictícios:** Lucas Martins (closer, melhor desempenho), Mariana Costa (closer, boa e constante), Rafael Almeida (closer, intermediário), Bruno Ferreira (closer, abaixo da meta), Gabriel Santos (SDR).

**Bloqueio da execução real:** o seed atual cria o Gabriel com `papel = 'vendedor'` + `perfil_gamificacao = 'sdr'`, mas o cenário aprovado exige um SDR real (`papel = 'sdr'`). A limpeza também precisa considerar membros antigos com `papel = 'sdr'`. Corrigir na branch `feature/seed-base-demo` e refazer o dry-run antes de executar.

**Próximo passo:** execução real (`CONFIRMAR_RESET_DEMO=sim`) — **somente com autorização explícita e específica do Evandro**; aprovação de merge não autoriza a execução. Depois, validar no banco real:

- 5 usuários fictícios;
- 35 negócios: 12 ganhos (7 pagos), 5 perdidos, 18 em andamento;
- 5 handoffs do Gabriel, que deve pontuar como SDR;
- XP/pontos reais e ranking `Lucas > Mariana > Rafael > Bruno`;
- metas e comissões.

O script já faz essa conferência ao final (`validarPosSeed`).

## Banco

- 67 migrations em `main` (última: `20261004233000_gamificacao_progresso_conquistas.sql`), todas aplicadas em produção.
- **PR #101** traz 13 migrations ainda não aplicadas: aguardam o backup do banco de produção feito pelo Evandro.

## Outras PRs abertas

Conforme o handoff de 2026-10-05; confira o estado real no GitHub.

- **#101 — motor de dimensionamento real no wizard** (draft, CI verde). Ver Calculadora acima.
- **#102 — imagem nas recompensas da loja** (draft, não investigada).
- **#103–#118 — cadeia de gamificação empilhada** (drafts): provavelmente superada pela #131 (commit `98a97d6`). Comparar o diff com `main` antes de qualquer ação; o caminho provável é fechar como superseded.
- **#62, #68, #70, #71, #76** (2026-09-29/30): prováveis remanescentes. #62 (backup) depende dos secrets `BACKUP_ENCRYPTION_KEY`/`BACKUP_REPO_TOKEN`, nunca criados. Confirmar com o Evandro antes de fechar.
- Dependabot (#55–#58, #60, #61) não aparece mais entre as abertas.

Branches locais já mescladas e candidatas a limpeza (só com autorização): `feature/gamificacao-kpis-funcionais` (#131), `feature/gamificacao-redesign-visual-fundacao` (#130).

## Prioridade atual

Ordem aproximada definida pelo Evandro:

1. Concluir a Base Demo (execução real autorizada + validação).
2. Validar o CRM populado.
3. Concluir o redesign das demais telas de Gamificação.
4. Revisar UX geral e Kanban.
5. Consolidar Calculadora + Propostas.
6. Resolver a PR #101 e suas migrations, depois do backup.
7. Onboarding de empresa.
8. Tipos de solução.
9. Bloco Pedido / Pós-venda / Engenharia / Compras / Obras (ver `docs/ROADMAP.md`).

Fora da sequência, quando houver espaço: decidir o destino da cadeia #102–#118 e das PRs antigas; validar telas em navegador real.

## Pendências sem prazo (dependem do Evandro)

- Secrets do backup (#62); apagar `NEXT_PUBLIC_SITE_URL` antiga no Vercel.
- Zerar/desativar as 4 regras antigas de gamificação em Configurações > Gamificação (ação manual) quando as novas regras estiverem valendo.
- Workflow manual "Popular metas comerciais dos vendedores" (Actions) para dar dados à meta da equipe na Início.
- CSV real de equipamentos e teste de referência de 1.500 kWh/mês (Cascavel/PR) com o engenheiro.
- Deduplicação de contatos (sem desenho); hardening de concorrência em `unica_por_negocio` e centralização de `point_ledger` (adiados).
- Tarefas: ao escolher "retornar depois", criar a próxima tarefa automaticamente; badges coloridos nos resultados de tarefa.
