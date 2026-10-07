# Estado do projeto — Raion CRM

Documento vivo. **Última atualização: 2026-10-06.** Código e GitHub prevalecem sobre este arquivo; ao divergir, corrija aqui. `docs/HANDOFF-CLAUDE-2026-10-06.md` é um retrato de 2026-10-05 e está desatualizado em vários pontos (principalmente a Base Demo).

Referência: `main` em `3b8de5c` (merge da PR #139) · 68 migrations em `supabase/migrations/` (última `20261006120000_recompensas_imagem.sql`).

Histórico: a migration da #139 foi aplicada em produção antes do merge, com autorização explícita; no merge, o workflow Banco de produção #57 retornou `Remote database is up to date` (nada reaplicado). Produção e `main` estão alinhadas.

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
  - PR #139: **imagem opcional nas recompensas.** Storage privado (bucket `recompensas`), até 3 MB, só JPEG/PNG/WebP (SVG recusado), recorte 4:3 no navegador; envio, edição e remoção somente por admin, com policies restritas à pasta da própria empresa e a recompensa existente. Gerenciamento pela própria miniatura: adicionar, editar (reenquadrar a imagem atual), substituir e excluir com confirmação — menu flutuante no desktop e painel inferior no celular. Exibição na Loja e na prévia da Visão geral, com ícone quando não há imagem. Validada na Raion Solar Demo; CI #428 completo aprovado (inclui build). Substituiu a antiga PR #102.
- Outras telas redesenhadas: Início, Tarefas (#80) e Contatos (#82).

## Em andamento

### PR #132 — Base Demo

**A "Raion Solar Demo" está criada, completa e validada em produção.** O script (`scripts/seed-base-demo.mjs`) continua na PR #132, ainda **não mesclada**.

- `scripts/seed-base-demo.mjs` cria uma **empresa separada, "Raion Solar Demo", e não apaga nada** em nenhuma empresa. A empresa de origem (onde `ADMIN_EMAIL` é admin) só é lida, para copiar os parâmetros da calculadora. A demo tem gamificação própria (12 regras só com eventos pontuáveis, 5 níveis, 7 conquistas, 3 recompensas), criada pela sessão do admin.
- Modos: sem variável = dry-run só de leitura; `CRIAR_BASE_DEMO=sim` cria; `RETOMAR_BASE_DEMO=sim` completa uma demo parcial sem duplicar nem apagar.
- **Regra de segurança permanente:** antes de qualquer nova execução (`CRIAR` ou `RETOMAR`), rodar o dry-run e validar o resultado; executar só com **autorização específica** do Evandro.

Estado validado em produção (validação pós-retomada completa):

| Item | Resultado |
| --- | --- |
| Negócios | 35 |
| Ganhos | 12 |
| Perdidos | 5 |
| Em andamento | 18 |
| Pagamentos confirmados | 7 |
| Handoffs SDR→Closer | 5 |
| XP | Lucas 605 · Mariana 420 · Rafael 210 · Bruno 130 · Gabriel (SDR) 355 |

Membros fictícios: Lucas Martins, Mariana Costa, Rafael Almeida e Bruno Ferreira (`vendedor`/closer) e Gabriel Santos (`sdr`).

**Histórico de recuperação (não é pendência):**

1. A estratégia inicial (apagar vendedores/negócios da empresa real, `CONFIRMAR_RESET_DEMO=sim`) foi abandonada depois do dry-run e do diagnóstico de dependências (delete revogado em `eventos`, FKs `restrict` em etapas, confirmações de pagamento sem cascata). Nada foi apagado.
2. A primeira execução real da empresa separada parou no 1º negócio (erro de colunas em `calculos_solares`), corrigido no commit `83d4fbd`, que também criou o modo de retomada.
3. Dry-run de retomada aprovado → retomada real concluída (exit 0) → validação pós-retomada completa, com os números acima.

### PR #101 — Motor reconciliado do wizard

- Motor de dimensionamento real no wizard de 3 etapas + catálogo técnico de equipamentos.
- **Continua fora da `main`.** 13 migrations pendentes (`20260930150000` … `20261001050000`), com prefixos anteriores a migrations já aplicadas (dependem do `--include-all`).
- **Depende de backup de produção antes de avançar.** Não há backup automático (PR #62 parada por falta de secrets).
- Aplicar as migrations **antes** de o app subir: cadastro/edição de equipamento grava `status_tecnico`.
- PR #101 divergente da `main`: a `main` possui 124 commits que não estão no head da #101, enquanto a #101 mantém 39 commits próprios desde a base comum. Conflito com a `main` em `PROGRESS.md`.

## Outras PRs (estados verificados em 2026-10-06)

| PR | Estado | Observação |
| --- | --- | --- |
| #139 Imagem nas recompensas | mesclada | merge `3b8de5c` |
| #102 Imagem nas recompensas (antiga) | fechada, sem merge | superada pela #139 |
| #133 Handoff técnico | aberta, draft, não mesclada | conteúdo incluído nesta consolidação |
| #134 Docs (`docs/consolidar-contexto`) | fechada, sem merge | superada pela #140 |
| #116 | aberta, draft, não mesclada | sem diferença de arquivos em relação à `main` — candidata a fechar |
| #118 | aberta, draft, não mesclada | aparentemente substituída pela #119 (já na `main`) — candidata a fechar |
| #62 Backup do banco | aberta, não mesclada | bloqueada nos secrets `BACKUP_ENCRYPTION_KEY`/`BACKUP_REPO_TOKEN` |
| #68, #70, #71, #76 | abertas, não mescladas | antigas (29–30/09); #71 conflita; revisar relevância |
| #135 Dependabot (6 atualizações menores) | aberta, não-draft, não mesclada, mergeable | revisar com o Evandro |

## Outras pendências

- Revisar PRs antigas/obsoletas antes de qualquer merge.
- Validar em navegador real as telas novas (gamificação gerencial/pessoal, tema escuro, Tarefas, Contatos, SDR, Loja).
- Melhorar a UX geral fora da gamificação.
- Consolidar Calculadora + Propostas: importar CSV real de equipamentos/preços e repetir o teste de referência de 1.500 kWh/mês (Cascavel/PR) com o engenheiro.
- Validar produção e migrations (aplicadas × `main` × PRs).
- Deduplicação de contatos e hardening de concorrência em `unica_por_negocio` — sem data.
- `PROGRESS.md` e `HANDOFF.md` (raiz) estão desatualizados; servem só como histórico.
- PR 3b (papel `operacao`/setores de Obras): conferir se a RLS de `tarefas` precisa alinhar com o app da PR 3a (#146) — no app, só admin e gestor atribuem tarefa a outra pessoa e veem tarefas de outros; o SDR cria só para si.

## Próximas prioridades

1. Base Demo (PR #132): revisar e mesclar o script com autorização (a demo já está em produção). Qualquer nova execução exige dry-run antes e autorização específica.
2. Backup do banco de produção → aplicar as 13 migrations da PR #101 → revisar e mesclar com autorização.
3. Fechar/decidir as PRs remanescentes (#116, #118, #133, #135, #62, #68, #70, #71, #76).
4. Consolidar Calculadora + Propostas (CSV real e teste de referência).
5. Validação visual em navegador real e melhorias de UX.
6. Iniciar o roadmap operacional (Pedido → Compras), conforme `docs/ROADMAP.md`, quando o Evandro decidir.
