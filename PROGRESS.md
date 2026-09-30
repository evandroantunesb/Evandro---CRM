# Progresso — Raion CRM

Resumo do estado do desenvolvimento. **Atualize ao concluir cada funcionalidade:** alterações (com número da PR), arquivos modificados, decisões técnicas e próximas tarefas. Última atualização: 2026-09-30.

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
- #65 campos obrigatórios: valor do negócio (> 0) ao criar/editar e telefone do contato, no formulário e no servidor (`src/lib/acoes/negocios.ts`, `src/lib/acoes/contatos.ts` e os 3 formulários). Captura pública, rodízio e regras por etapa não mudam.
- #44 dashboard unificado de Gamificação (`/gamificacao`) · #48 inclui a redistribuição da carteira ao desligar vendedor.
- Correção definitiva das migrations travadas: `--include-all` fixo em `banco-producao.yml`.
- **#69 estilo dos cards do Kanban** (borda colorida por etapa, hover, etiquetas em pílula) **+ "Adicionar negócio" só na etapa inicial de cada funil + "Editar etiquetas" no menu de 3 pontinhos do card** (popup reaproveitando a mesma tabela/ação de etiquetas da página do negócio).
- **#74 regra de leitura direcionada no `CLAUDE.md`** (seção Contexto): localizar o símbolo antes de ler, evitar ler arquivo inteiro acima de ~300 linhas por padrão, nunca dividir/refatorar só por token, nunca editar arquivo gerado à mão.
- **#75 comentário obrigatório ao mudar de etapa + contagem no card:** mover um negócio de etapa (arrastando ou pelo "Mover para") abre um popup pedindo um comentário obrigatório, salvo como nota do negócio (`moverEtapa` em `src/lib/acoes/negocios.ts` agora exige `comentario`); o card do Kanban mostra um ícone de balão com a contagem de comentários. Notas viraram histórico imutável — não é mais possível apagar (removido da tela e da policy de RLS `autor apaga nota`; editar continua permitido).

## Em andamento

- **PR #62 — backup diário do banco de produção** para o repositório privado `raion-crm-backups`. Aguardando o Evandro criar os secrets `BACKUP_ENCRYPTION_KEY` e `BACKUP_REPO_TOKEN`.
- **PR #68 — atualização do PROGRESS.md** pós-revisão do Dependabot (aberta, aguardando merge).
- **PR #70 — correção do travamento ao mudar a cor da etapa** em Configurações > Funis e etapas (aberta, aguardando merge).
- **PR #71 — botão único "Salvar" em Funis e etapas**, empilhada sobre a #70 (aberta, aguardando merge da #70 primeiro).
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
- Apagar a variável `NEXT_PUBLIC_SITE_URL` antiga no Vercel (não é mais usada).

## Próximos passos

1. Criar os secrets do backup, mesclar a PR #62 e rodar o backup uma vez manualmente.
2. Mesclar as PRs #68, #70 e #71 (nesta ordem de dependência: #71 está empilhada sobre a #70).
3. Revisar as PRs do Dependabot (#60 e #61 são versões maiores).
4. **Em andamento agora (nova thread, 2026-09-30):** redesenho da tela Início dos vendedores a partir de uma imagem de referência que o Evandro enviou. Faltam duas seções novas que não existem hoje: "Resumo do funil" (barras por etapa) e o card expandido "Meta comercial do mês" (aro circular + Meta/Realizado/Faltam/Contratos/Ticket médio). A visão de equipe (`?visao=equipe`, já existe desde a #51) precisa de metas de exemplo cadastradas pros vendedores pra deixar de aparecer vazia — combinado gerar dados de teste (não é preciso o Evandro configurar nada em Configurações > Metas antes). Também checar responsividade/CSS contra a imagem. Ver `src/app/(app)/inicio/page.tsx` (648 linhas) e `src/lib/metas.ts`.
