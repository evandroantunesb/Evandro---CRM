# Estado do projeto — Raion CRM

Documento vivo. **Última atualização: 2026-10-06.** Código e GitHub prevalecem sobre este arquivo; ao divergir, corrija aqui. `docs/HANDOFF-CLAUDE-2026-10-06.md` é um retrato de 2026-10-05 e está desatualizado em vários pontos (principalmente a Base Demo).

Referência: `main` em `5a31b30` (merge da PR #138) · 67 migrations em `supabase/migrations/` (última `20261004233000_gamificacao_progresso_conquistas.sql`).

**Produção está 1 migration à frente da `main`:** `20261006120000_recompensas_imagem.sql` (PR #139) já foi aplicada em produção antes do merge da PR. Ao mexer em migrations ou no `banco-producao.yml`, considere essa diferença.

## Concluído / avançado

- **CRM comercial base:** contatos, negócios, Kanban e lista, tarefas, notas imutáveis, anexos, funil configurável com etapas que fecham o negócio (`fecha_como`), perda com motivo obrigatório, distribuição de leads com aprovação do gestor, leads/propostas parados e leads sem contato, papel SDR completo (qualificação, handoff SDR→closer, tarefa automática), notificações in-app, Google Agenda, painel do gestor, super-admin e cobrança.
- **Super-admin:** botão "Entrar na empresa" (PR #114), reaproveitando a troca de empresa; sem impersonação e sem criar membros.
- **Calculadora, proposta e contrato:** calculadora solar com kit, proposta em PDF com modelos configuráveis e link público, contrato com status e assinatura protegida, confirmação de pagamento via RPC.
- **Gamificação — motor (fechado em 2026-10-02):** motor causal a partir de `eventos`, antifraude, XP e moedas separados, níveis, conquistas com progresso, ranking com histórico e streak, loja com saldo negativo permitido, metas e comissões causais e versionadas (PR #131).
- **Gamificação — interface:**
  - PR #130: redesign da Visão geral e do Extrato.
  - PR #136: Visão geral decidida pelo papel — **gerencial** para admin/gestor (KPIs, Ranking Closer e SDR lado a lado, metas, atividade e conquistas recentes, seletor Este mês / Mês passado; gestor vê só suas equipes) e **pessoal** para participantes. Sem mudança de banco/RLS.
  - PR #137: menu enxuto por papel (Visão geral, Desempenho, Recompensas/Administração) com abas internas (Desempenho = Ranking | Metas | Comissões; Recompensas = Loja | Extrato) e **tema escuro em todo o módulo**, incluindo `/configuracoes/{metas,comissoes,resgates}`. Rotas não mudaram.
  - PR #138: polimento visual de todas as telas do módulo (tipografia, pódio, metas, comissões, loja, extrato, jornada, administração); CSS consolidado em `_compartilhado/gamificacao.css`.
- Outras telas redesenhadas: Início, Tarefas (#80) e Contatos (#82).

## Em andamento

### PR #139 — Imagem nas recompensas

- Imagem opcional nas recompensas: bucket privado `recompensas` (3 MB; JPEG/PNG/WebP), recorte 4:3 no navegador, upload só por admin, policies de Storage restritas à pasta da própria empresa e de recompensa existente.
- **A migration `20261006120000_recompensas_imagem.sql` já está aplicada em produção**; a PR ainda não foi mesclada.
- Substitui a antiga PR #102 (migration `20261001120000_recompensas_imagem.sql`, nunca aplicada) — a #102 deve ser fechada, não mesclada, para não duplicar a migration.

### PR #132 — Base Demo

A estratégia mudou depois do handoff de 2026-10-05:

- **Antes:** apagar vendedores/negócios da empresa real e recriar (`CONFIRMAR_RESET_DEMO=sim`). O dry-run dessa versão rodou contra produção sem alterar nada, mas o diagnóstico encontrou bloqueios (delete revogado em `eventos`, FKs `restrict` em etapas, confirmações de pagamento sem cascata).
- **Agora:** `scripts/seed-base-demo.mjs` cria uma **empresa separada, "Raion Solar Demo", e não apaga nada** em nenhuma empresa. A empresa de origem (onde `ADMIN_EMAIL` é admin) só é lida, para copiar os parâmetros da calculadora. A demo tem gamificação própria (12 regras só com eventos pontuáveis, 5 níveis, 7 conquistas, 3 recompensas), criada pela sessão do admin.
- Modos: sem variável = dry-run só de leitura; `CRIAR_BASE_DEMO=sim` cria; `RETOMAR_BASE_DEMO=sim` completa uma demo parcial sem duplicar nem apagar.
- **Segundo o commit `83d4fbd`, uma primeira execução real parou no 1º negócio** (erro de colunas em `calculos_solares`, já corrigido). Portanto pode existir em produção uma "Raion Solar Demo" parcial — conferir com o dry-run antes de qualquer `RETOMAR_BASE_DEMO=sim`.
- PR ainda **não mesclada**. Qualquer execução (`CRIAR` ou `RETOMAR`) só com **autorização específica** do Evandro.

Resultado esperado após a conclusão (a validar contra o banco real):

| Item | Esperado |
| --- | --- |
| Usuários fictícios | 5 — Lucas, Mariana, Rafael, Bruno (`vendedor`/closer) e Gabriel (`sdr`) |
| Negócios | 35 |
| Ganhos | 12 (7 pagos + 5 assinados aguardando pagamento) |
| Perdidos | 5 |
| Em andamento | 18 |
| Handoffs do SDR | 5, originados por Gabriel |
| Ranking (XP esperado) | Lucas 605 > Mariana 420 > Rafael 210 > Bruno 130 · Gabriel 355 como SDR |
| Metas e comissões | geradas pelos mecanismos reais |

### PR #101 — Motor reconciliado do wizard

- Motor de dimensionamento real no wizard de 3 etapas + catálogo técnico de equipamentos.
- **Continua fora da `main`.** 13 migrations pendentes (`20260930150000` … `20261001050000`), com prefixos anteriores a migrations já aplicadas (dependem do `--include-all`).
- **Depende de backup de produção antes de avançar.** Não há backup automático (PR #62 parada por falta de secrets).
- Aplicar as migrations **antes** de o app subir: cadastro/edição de equipamento grava `status_tecnico`.
- Branch 120 commits atrás da `main`; conflito em `PROGRESS.md`.

## Outras PRs (verificado em 2026-10-06)

| PR | Situação |
| --- | --- |
| #133 Handoff técnico | conteúdo incluído nesta consolidação |
| #134 Docs (`docs/consolidar-contexto`) | consolidação documental anterior, aberta; avaliar fechar em favor desta |
| #135 Dependabot (6 atualizações menores) | aberta; revisar com o Evandro |
| #102 Imagem nas recompensas (antiga) | substituída pela #139 — fechar |
| #116 | sem diferença de arquivos em relação à `main` — candidata a fechar |
| #118 | aparentemente substituída pela #119 (já na `main`) — candidata a fechar |
| #62 Backup do banco | bloqueada nos secrets `BACKUP_ENCRYPTION_KEY`/`BACKUP_REPO_TOKEN` |
| #68, #70, #71, #76 | antigas (29–30/09); #71 conflita; revisar relevância |

## Outras pendências

- Revisar PRs antigas/obsoletas antes de qualquer merge.
- Validar em navegador real as telas novas (gamificação gerencial/pessoal, tema escuro, Tarefas, Contatos, SDR, Loja).
- Melhorar a UX geral fora da gamificação.
- Consolidar Calculadora + Propostas: importar CSV real de equipamentos/preços e repetir o teste de referência de 1.500 kWh/mês (Cascavel/PR) com o engenheiro.
- Validar produção e migrations (aplicadas × `main` × PRs), incluindo a migration da #139.
- Deduplicação de contatos e hardening de concorrência em `unica_por_negocio` — sem data.
- `PROGRESS.md` e `HANDOFF.md` (raiz) estão desatualizados; servem só como histórico.

## Próximas prioridades

1. Concluir a PR #139 (imagem nas recompensas) e mesclar com autorização — a migration já está em produção.
2. Base Demo (PR #132): rodar o dry-run da versão atual para diagnosticar a "Raion Solar Demo" parcial; depois `RETOMAR_BASE_DEMO=sim` **somente com autorização específica** e validar os resultados esperados.
3. Backup do banco de produção → aplicar as 13 migrations da PR #101 → revisar e mesclar com autorização.
4. Fechar/decidir as PRs remanescentes (#102, #116, #118, #134, #135, #62, #68, #70, #71, #76).
5. Consolidar Calculadora + Propostas (CSV real e teste de referência).
6. Validação visual em navegador real e melhorias de UX.
7. Iniciar o roadmap operacional (Pedido → Compras), conforme `docs/ROADMAP.md`, quando o Evandro decidir.
