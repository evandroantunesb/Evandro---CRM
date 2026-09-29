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
- Correção definitiva das migrations travadas: `--include-all` fixo em `banco-producao.yml`.

## Em andamento

- **Leads sem contato:** negócio na 1ª etapa, sem nota, atribuído há mais de 3h (prazo configurável). Card no Painel com Reatribuir, prioridade na Início e contagem no sininho.
- **PR #62 — backup diário do banco de produção** para o repositório privado `raion-crm-backups`. Aguardando o Evandro criar os secrets `BACKUP_ENCRYPTION_KEY` e `BACKUP_REPO_TOKEN`.
- **PRs do Dependabot abertas:** #55–#58 (Actions), #60 (TypeScript 6), #61 (`@types/node` 26). Atualizações maiores: revisar com cuidado antes de mesclar.
- **Dashboard unificado de Gamificação** (`/gamificacao`): iniciado em 2026-09-27; confirmar se ficou completo conforme a referência.

## Pendências (dependem do Evandro ou sem prazo)

- Gestão de carteira ao desligar vendedor (transferir para outro ou distribuir entre ativos).
- E-mail de convite não chega: configurar SMTP próprio no Supabase (Resend/Postmark/SendGrid).
- Leitura automática de CNH/fatura por IA: falta chave de API com visão e definição dos campos.
- Assinatura eletrônica do contrato (gov.br; ZapSign/Clicksign depois).
- Notificações fora do app (e-mail/WhatsApp) e aba de notificações com lido/não lido.
- Planilha real de kits/preços e validação dos parâmetros da calculadora com o engenheiro.
- Estilo dos cards do Kanban; tornar campos como "Valor (R$)" obrigatórios.
- Apagar a variável `NEXT_PUBLIC_SITE_URL` antiga no Vercel (não é mais usada).

## Próximos passos

1. Concluir e mesclar "Leads sem contato".
2. Criar os secrets do backup e mesclar a PR #62.
3. Revisar as PRs do Dependabot.
4. Escolher o próximo item das pendências com o Evandro.
