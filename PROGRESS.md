# Progresso — Raion CRM

Resumo do estado do desenvolvimento. **Atualize ao concluir cada funcionalidade:** alterações (com número da PR), arquivos modificados, decisões técnicas e próximas tarefas. Última atualização: 2026-09-29.

## Em produção

- **Fundação (Entregas 1–4):** multiempresa com RLS, perfis, convites, funil configurável, contatos, negócios, tarefas, notas, anexos, identidade visual.
- **Entrega 5 — Calculadora e proposta:** calculadora solar, kit técnico, proposta em PDF com seções configuráveis, link público `/proposta/[token]`.
- **Entrega 6 — Captura de leads:** formulários públicos `/captura/[token]` com QR Code e pôster.
- **Entrega 7 — Painel de indicadores** do gestor.
- **Entrega 8 — Planos/cobrança (super-admin) + PWA.**
- **Entrega 9 (parcial) — Contrato:** modelo com campos `{{campo}}`, geração pelo negócio, link público `/contrato/[token]`, status manual.
- **Google Agenda** (PR #36).
- **Fase 2 — Gamificação:** pontos, níveis/conquistas, ranking, loja de recompensas, metas, comissões, extrato.
- **Kanban/Lista de negócios** e **redesign da Início**.
- #47 rodízio automático de leads com aprovação do gestor e prazo por origem (`pg_cron`).
- #48 cadastro direto de vendedor + status Ativo/Inativo/Desligado.
- #49 seed da Equipe Cascavel · #50 senha fixa dos testes + regras de gamificação.
- #51 seletor Pessoal/Equipe na Início (admin/gestor).
- #52 leads parados + tarefas atrasadas no Painel e na Início.
- #53 propostas paradas, prazo configurável, botão Reatribuir e sininho de notificações.
- #54 Dependabot · #59 atualização do CLI da Supabase (formatação de `db:types` com `oxfmt`).
- #64 leads sem contato: 1ª etapa, sem nota, atribuído há mais de 3h (`empresas.horas_considerado_sem_contato`). Card no Painel com Reatribuir, prioridade na Início e sininho. Migration aplicada em produção e testada pelo Evandro.
- #44 dashboard unificado de Gamificação (`/gamificacao`) · #48 inclui a redistribuição da carteira ao desligar vendedor.
- Correção definitiva das migrations travadas: `--include-all` fixo em `banco-producao.yml`.

## Em andamento

- **PR #63 — contexto do Claude:** `CLAUDE.md` enxuto (regras permanentes + seleção de modelos), `docs/arquitetura.md`, `docs/regras-negocio.md`, `PROGRESS.md`, `HANDOFF.md` e `.claude/settings.json`. CI verde, aguardando merge.
- **PR #62 — backup diário do banco de produção** para o repositório privado `raion-crm-backups`. Aguardando o Evandro criar os secrets `BACKUP_ENCRYPTION_KEY` e `BACKUP_REPO_TOKEN`.
- **PRs do Dependabot abertas:** #55–#58 (Actions), #60 (TypeScript 6), #61 (`@types/node` 26). Atualizações maiores: revisar com cuidado antes de mesclar.

## Decisões técnicas relevantes

- Migrations aplicadas em produção só via `banco-producao.yml` com `--include-all` (corrige o travamento de 28–29/09).
- Notificações só dentro do app (sininho); canais externos ficam para depois.
- Prazos por empresa: `dias_considerado_parado` (padrão 7, leads e propostas) e `horas_considerado_sem_contato` (padrão 3).
- Backup do banco independente de plataforma (dump criptografado em repositório privado).

## Pendências (dependem do Evandro ou sem prazo)

- E-mail de convite: chega com atraso (confirmado pelo Evandro); SMTP próprio só se voltar a incomodar.
- Leitura automática de CNH/fatura por IA: falta chave de API com visão e definição dos campos.
- Assinatura eletrônica do contrato (gov.br; ZapSign/Clicksign depois).
- Notificações fora do app (e-mail/WhatsApp) e aba de notificações com lido/não lido.
- Planilha real de kits/preços e validação dos parâmetros da calculadora com o engenheiro.
- Estilo dos cards do Kanban; tornar campos como "Valor (R$)" obrigatórios.
- Apagar a variável `NEXT_PUBLIC_SITE_URL` antiga no Vercel (não é mais usada).

## Próximos passos

1. Mesclar a PR #63 (documentação de contexto).
2. Criar os secrets do backup, mesclar a PR #62 e rodar o backup uma vez manualmente.
3. Revisar as PRs do Dependabot (#60 e #61 são versões maiores).
4. Escolher o próximo item com o Evandro (sugestão: campos obrigatórios em negócio/contato). Contexto completo da troca de thread em `HANDOFF.md`.
