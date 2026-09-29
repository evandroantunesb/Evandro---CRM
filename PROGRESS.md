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
- #63 contexto do Claude (`CLAUDE.md` enxuto, `docs/`, `PROGRESS.md`, `HANDOFF.md`, `.claude/settings.json`).
- Dependabot revisado: #55–#57 mescladas; #67 aplicou `actions/checkout@v7` e TypeScript 6.0.3 (substituiu #58 e #60); #61 fechada e #66 faz o Dependabot ignorar versões maiores de `@types/node` (runtime é Node 22).
- #64 leads sem contato: 1ª etapa, sem nota, atribuído há mais de 3h (`empresas.horas_considerado_sem_contato`). Card no Painel com Reatribuir, prioridade na Início e sininho. Migration aplicada em produção e testada pelo Evandro.
- #65 campos obrigatórios: valor do negócio (> 0) ao criar/editar e telefone do contato, no formulário e no servidor (`src/lib/acoes/negocios.ts`, `src/lib/acoes/contatos.ts` e os 3 formulários). Captura pública, rodízio e regras por etapa não mudam.
- #44 dashboard unificado de Gamificação (`/gamificacao`) · #48 inclui a redistribuição da carteira ao desligar vendedor.
- Correção definitiva das migrations travadas: `--include-all` fixo em `banco-producao.yml`.

## Em andamento

- **PR #62 — backup diário do banco de produção** para o repositório privado `raion-crm-backups`. Aguardando o Evandro criar os secrets `BACKUP_ENCRYPTION_KEY` e `BACKUP_REPO_TOKEN`.

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
- Estilo dos cards do Kanban.
- Apagar a variável `NEXT_PUBLIC_SITE_URL` antiga no Vercel (não é mais usada).

## Próximos passos

1. Criar os secrets do backup, mesclar a PR #62 e rodar o backup uma vez manualmente.
2. Escolher o próximo item com o Evandro (candidato: mais estilo nos cards do Kanban). Contexto completo da troca de thread em `HANDOFF.md`.
