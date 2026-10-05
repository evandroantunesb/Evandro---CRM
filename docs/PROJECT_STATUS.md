# Estado do projeto — Raion CRM

Documento vivo. **Última atualização: 2026-10-05.** Código e GitHub prevalecem sobre este arquivo; ao divergir, corrija aqui.

Referência: `main` em `501f5fa` (merge da PR #130) · 67 migrations em `supabase/migrations/` (última `20261004233000_gamificacao_progresso_conquistas.sql`), todas aplicadas em produção.

## Concluído / avançado

- **CRM comercial base:** contatos, negócios, Kanban e lista, tarefas, notas imutáveis, anexos, funil configurável com etapas que fecham o negócio (`fecha_como`), perda com motivo obrigatório, distribuição de leads com aprovação do gestor, leads/propostas parados e leads sem contato, papel SDR completo (qualificação, handoff SDR→closer, tarefa automática), notificações in-app, Google Agenda, painel do gestor, super-admin e cobrança.
- **Calculadora, proposta e contrato:** calculadora solar com kit, proposta em PDF com modelos configuráveis e link público, contrato com status e assinatura protegida, confirmação de pagamento via RPC.
- **Gamificação funcionalmente avançada (fechada em 2026-10-02):** motor causal a partir de `eventos`, antifraude, XP e moedas separados, níveis, conquistas com progresso, ranking com histórico e streak de dias produtivos, loja com saldo negativo permitido, metas e comissões causais e versionadas (PR #131).
- **Redesign da Visão Geral de Gamificação concluído na PR #130** (inclui Extrato). Também redesenhadas: Início, Tarefas (#80) e Contatos (#82).

## PR #132 — Base Demo

- Script `scripts/seed-base-demo.mjs` pronto (branch `feature/seed-base-demo`).
- PR ainda **não mesclada** (draft).
- **Dry-run já executado com sucesso contra produção:**
  - empresa correta encontrada;
  - 3 vendedores/SDR atuais a remover;
  - 6 negócios a remover;
  - admin e configurações da empresa preservados;
  - nenhuma alteração feita (somente dry-run).
- Não é preciso repetir o dry-run.
- **Execução real (`CONFIRMAR_RESET_DEMO=sim`) pendente de autorização específica do Evandro.**

Resultado esperado após o seed (a validar contra o banco real):

| Item | Esperado |
| --- | --- |
| Usuários fictícios | 5 (4 closers + 1 SDR) |
| Negócios | 35 |
| Ganhos | 12 |
| Pagos | 7 |
| Perdidos | 5 |
| Em andamento | 18 |
| Handoffs do SDR | 5, originados por Gabriel Santos |
| Ranking | Lucas > Mariana > Rafael > Bruno |
| Gabriel (SDR) | pontua como SDR via handoffs reais |
| Metas e comissões | geradas pelos mecanismos reais (`calcular_realizado_meta`, `comissoes_calculadas`) |

Validação pós-execução: usuários, negócios, breakdown de status, handoffs, XP/ranking real, metas e comissões.

## PR #101 — Motor reconciliado do wizard

- Motor de dimensionamento real integrado ao wizard de negócio em 3 etapas, mais o catálogo técnico de equipamentos.
- **13 migrations pendentes** (`20260930150000` … `20261001050000`). Os prefixos são anteriores a migrations já aplicadas; dependem do `--include-all` do `banco-producao.yml`.
- **Depende de backup de produção antes de avançar.** Não há backup automático (PR #62 parada por falta de secrets).
- Aplicar as migrations **antes** de o app subir: o cadastro/edição de equipamento grava `status_tecnico` e quebra se a coluna não existir.
- Branch 108 commits atrás da `main`; conflito só em `PROGRESS.md`.

## Outras PRs (verificado em 2026-10-05)

| PR | Situação |
| --- | --- |
| #102 Imagem nas recompensas | 1 migration; conflita com a `main` |
| #114 Super-admin entrar na empresa | 1 commit fora da `main`; sem conflito; 108 commits atrás |
| #116 | sem diferença de arquivos em relação à `main` — candidata a fechar |
| #118 | aparentemente substituída pela #119 (já na `main`) — candidata a fechar |
| #103–#113, #115, #117, #119–#129 | conteúdo já está na `main` |
| #62 Backup do banco | bloqueada nos secrets `BACKUP_ENCRYPTION_KEY`/`BACKUP_REPO_TOKEN` |
| #68, #70, #71, #76 | antigas (29–30/09); #71 conflita; revisar relevância |
| #133 Handoff técnico | conteúdo incluído na PR de consolidação da documentação |

## Outras pendências

- Revisar PRs antigas/obsoletas antes de qualquer merge.
- Completar o redesign das demais telas de `/gamificacao` (jornada, loja, metas, comissões, resgates, administração).
- Melhorar a UX geral e validar telas em navegador real (Tarefas, Contatos, SDR, wizard, Loja).
- Consolidar Calculadora + Propostas: importar CSV real de equipamentos/preços e repetir o teste de referência de 1.500 kWh/mês (Cascavel/PR) com o engenheiro.
- Validar produção e migrations (estado aplicado × `main` × PRs).
- Deduplicação de contatos e hardening de concorrência em `unica_por_negocio` — sem data.
- `PROGRESS.md` e `HANDOFF.md` (raiz) estão desatualizados; servem só como histórico.

## Próximas prioridades

1. Executar o reset + seed real da PR #132 — **somente com autorização específica** — e validar os resultados esperados acima.
2. Backup do banco de produção → aplicar as 13 migrations da PR #101 → revisar e mesclar com autorização.
3. Decidir as PRs remanescentes (#102, #114, #116, #118, #62, #68, #70, #71, #76).
4. Redesign das demais telas de Gamificação.
5. Consolidar Calculadora + Propostas (CSV real e teste de referência).
6. Validação visual em navegador real e melhorias de UX.
7. Iniciar o roadmap operacional (Pedido → Compras), conforme `docs/ROADMAP.md`, quando o Evandro decidir.
