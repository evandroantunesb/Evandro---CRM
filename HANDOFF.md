# Handoff — Raion CRM (2026-09-29, ~20h UTC)

Contexto para uma nova sessão continuar sem repetir trabalho. Leia junto com `CLAUDE.md` (regras permanentes) e `PROGRESS.md` (estado atual). Arquitetura e regras de negócio detalhadas estão em `docs/`.

**Legenda:** ✅ **código** = conferido no repositório/GitHub nesta data · 💬 **conversa** = decisão registrada no chat com o Evandro · ❓ **não verificado** = relatado, mas não conferido agora.

## 1. Funcionalidades pedidas nas threads de 2026-09-29

| Pedido | Situação |
| --- | --- |
| Rodízio de leads com aprovação do gestor e prazo por origem | ✅ mesclado (#47) |
| Cadastro direto de vendedor + status Ativo/Inativo/Desligado + redistribuir carteira ao desligar | ✅ mesclado (#48) |
| Equipe Cascavel de teste + senha fixa + regras padrão de gamificação | ✅ mesclado (#49, #50) |
| Seletor Pessoal/Equipe na Início | ✅ mesclado (#51) |
| Lembrete de follow-up (leads parados + tarefas atrasadas) | ✅ mesclado (#52) |
| Proposta parada + prazo configurável + Reatribuir + sininho | ✅ mesclado (#53) |
| Dependabot | ✅ mesclado (#54); correção de formato do `db:types` em #59 |
| Backup diário do banco de produção | 🔄 PR #62 aberta |
| Check-in automático = "lead sem contato" (3h) | ✅ mesclado (#64) |
| Organização de contexto / economia de tokens / regra de modelos / este handoff | 🔄 PR #63 aberta |

## 2. Implementado e arquivos principais (✅ código)

- **Rodízio de leads:** `supabase/migrations/20260928120000_atribuicao_leads.sql` (fila + `pg_cron` a cada 5 min chamando `expirar_atribuicoes_leads()`), `src/app/(app)/configuracoes/origens/`, `src/app/(app)/painel/atribuicoes-pendentes.tsx`, `src/lib/painel.ts`, `src/lib/acoes/captura.ts`.
- **Status do vendedor e carteira ao desligar:** `supabase/migrations/20260928130000_status_membro.sql`, `src/app/(app)/configuracoes/usuarios/` (box "Distribuir aleatoriamente entre" com escolha dos vendedores, ou "Escolher manualmente por negócio").
- **Leads parados / propostas paradas:** `src/lib/leads-parados.ts`, `src/lib/propostas-paradas.ts`, `src/app/(app)/painel/linha-parado.tsx`, migration `20260929160000_dias_considerado_parado.sql`.
- **Leads sem contato:** `src/lib/leads-sem-contato.ts`, migration `20260929170000_horas_considerado_sem_contato.sql` (padrão 3h), integração em `src/lib/crm.ts`, Painel, Início, Configurações > Funis e etapas.
- **Sininho:** `src/lib/notificacoes.ts` + `src/app/(app)/menu.tsx`.
- **Dashboard de Gamificação:** `src/app/(app)/gamificacao/page.tsx` (PR #44).
- **Início com seletor:** `src/app/(app)/inicio/page.tsx` (`?visao=equipe`, só admin/gestor).
- **Backup (só na branch da PR #62):** `.github/workflows/backup-producao.yml` — ainda não existe na `main`.
- **Contexto do Claude (branch da PR #63):** `CLAUDE.md`, `PROGRESS.md`, `HANDOFF.md`, `docs/arquitetura.md`, `docs/regras-negocio.md`, `.claude/settings.json`.

## 3. Produção concluída

- ✅ Todas as PRs até #64 (exceto #55–#58, #60–#63) mescladas na `main`; Vercel faz o deploy sozinho.
- ✅ Migration de #64 aplicada em produção: workflow "Banco de produção" rodou com sucesso em 2026-09-29 19:51 UTC.
- 💬 Evandro testou o lead sem contato em produção e aprovou ("testei - ok").
- 💬 Equipe Cascavel (3 vendedores, 9 negócios, pontos retroativos) criada em produção.

## 4. Parcialmente desenvolvido

- **PR #62 — backup:** pronta, mas só funciona depois que o Evandro criar no GitHub os secrets `BACKUP_ENCRYPTION_KEY` e `BACKUP_REPO_TOKEN` (PAT fine-grained, só `raion-crm-backups`, Contents: Read and write). Repositório privado `raion-crm-backups` já criado por ele.
- **PR #63 — documentação de contexto:** CI verde; aguardando merge do Evandro.
- **PRs do Dependabot #55–#58, #60, #61:** abertas, não revisadas. #60 (TypeScript 6) e #61 (`@types/node` 26) são saltos de versão maior.

## 5. Pendências em ordem sugerida

1. PR #63 mesclada (este arquivo).
2. Evandro cria os 2 secrets → mesclar #62 → rodar o backup manualmente uma vez para validar.
3. Revisar as PRs do Dependabot (Actions primeiro; #60/#61 com cuidado, rodando o CI).
4. Escolher o próximo item com o Evandro. Candidatos já citados por ele: mais estilo nos cards do Kanban; tornar "Valor (R$)" e outros campos obrigatórios.
5. Sem prazo / dependem dele: leitura de CNH/fatura por IA (chave de API com visão + campos), assinatura eletrônica do contrato, notificações por e-mail/WhatsApp, planilha real de kits e validação da calculadora com o engenheiro, apagar `NEXT_PUBLIC_SITE_URL` antiga no Vercel.

## 6. Decisões técnicas e de arquitetura (💬 + ✅)

- Multiempresa com RLS por `empresa_id`; super-admin não fura RLS.
- Migrations em produção só via `banco-producao.yml` com `supabase db push --include-all` (✅ na linha 34 do workflow).
- Preview do Vercel usa o banco de produção.
- Prazos por empresa: `dias_considerado_parado` (padrão 7, leads e propostas) e `horas_considerado_sem_contato` (padrão 3).
- "Lead sem contato" = 1ª etapa do funil + nenhuma nota + atribuído há mais que o prazo; substituiu o contador antigo "aguardando primeiro contato" da Início.
- Notificações só dentro do app (sem tabela lido/não lido, sem e-mail/WhatsApp) — decisão explícita do Evandro; a arquitetura permite adicionar depois.
- Backup independente de plataforma (dump `supabase db dump`, criptografado, repositório privado, 30 dias).
- `db:types` formata com `oxfmt` desde o CLI Supabase 2.118.

## 7. Visual e regras de negócio aprovadas

- Identidade visual: ver `CLAUDE.md` (paleta, fontes, logo; verde só WhatsApp, vermelho só perda/erro).
- Regras de negócio: ver `docs/regras-negocio.md`. Aprovações de hoje: prazo de 3h para lead sem contato (💬), Reatribuir direto no Painel (💬), redistribuição ao desligar vendedor via seleção de quais vendedores recebem (💬, já atendida pela #48).

## 8. Problemas encontrados e soluções

- **Migrations travadas em produção** (28 e 29/09): histórico remoto fora de ordem → `--include-all` fixo no workflow. ✅
- **CI quebrado pelo CLI Supabase 2.118** (tipos sem formatação) → `oxfmt` no script `db:types`. ✅
- **CI de docs falhou com "rate limit exceeded" no `supabase/setup-cli`** → limite do GitHub; relançar o job resolve. ✅
- **E-mail de convite demorando:** 💬 Evandro confirmou que chegou, só demorou — tratado como resolvido; SMTP próprio deixou de ser urgente.
- **2 falhas em testes de storage/anexos** vistas localmente pela thread do lead sem contato: ❓ consideradas pré-existentes e não relacionadas; o CI da #64 ficou verde.

## 9. Instruções que não podem se perder (💬)

- Regras permanentes de merge/segredos, seleção de modelo, pendências pequenas, calculadora solar e atualização de `PROGRESS.md`/`CLAUDE.md`/`docs/`: ver `CLAUDE.md` (§Execução, §Modelos, §Continuidade) — não duplicadas aqui pra não desalinhar com o arquivo fonte.
- Gestão de thread (manter a mesma durante uma funcionalidade, nova thread só ao começar algo independente ou histórico muito extenso, nunca criar thread sozinho): ver `CLAUDE.md` §Threads.
- Quando o Evandro for limpar/trocar de conversa, oferecer um resumo ultra-conciso em tópicos (só aqui, não está no `CLAUDE.md`).

## 10. Tarefa em execução antes da troca de thread

- Thread de desenvolvimento: nenhuma tarefa aberta. Última entrega foi o lead sem contato (#64, mesclado e testado); o agente perguntou qual o próximo item e o Evandro pediu para mudar de thread.
- Thread de contexto: escrevendo este `HANDOFF.md` na PR #63.

## 11. Próxima ação

Confirmar com o Evandro se a PR #63 foi mesclada e se os secrets do backup foram criados; em seguida perguntar qual item do passo 4 da seção 5 ele quer atacar (sugestão: campos obrigatórios em negócio/contato, que é pequeno e já foi pedido duas vezes).
