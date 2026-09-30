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
- #77 Início: cards "Resumo do funil" (barras por etapa do funil ativo, cor de `etapas.cor`, mais barra "Fechado" com negócios ganhos no mês) e "Meta comercial do mês/da equipe" (anel de progresso + Meta/Realizado/Faltam/Contratos/Ticket médio), nas visões Pessoal e Equipe. Testado e aprovado pelo Evandro. Pendente: rodar o workflow manual "Popular metas comerciais dos vendedores" (`.github/workflows/seed-metas-vendedores.yml`) na aba Actions pra popular metas de exemplo (a visão de equipe fica vazia até então).
- #78 etapa fecha o negócio automaticamente: cada etapa do Kanban pode ser marcada (Configurações > Funis e etapas) para fechar o negócio sozinha ao receber um card — "Marca como ganho" fecha na hora, "Marca como perdido" sempre passa pelo popup obrigatório de comentário, agora exigindo também o motivo da perda. Corrige o caso em que mover um card pra uma etapa "Ganho" não contava na meta da equipe (etapa e status são conceitos separados desde a fundação; agora dá pra linká-los por etapa, sem mudar funis existentes). Migration `20260930013500_etapa_marca_ganho.sql` adiciona `etapas.fecha_como` e atualiza o gatilho `preparar_negocio()`. Testado e aprovado pelo Evandro.
- #79 Ganhos recentes na Início do gestor: card com os últimos 5 negócios ganhos (contato, vendedor, valor, há quanto tempo), só na visão Equipe. Pedido do Evandro depois de testar a meta da equipe (PR #77) e não conseguir ver quem tinha fechado o contrato.
- #80 redesenho visual da tela de Tarefas: 4 KPIs (Hoje/Atrasadas/Próximas/Concluídas na semana), painel "Minhas prioridades", Hoje/Próximas lado a lado — a partir de spec e mockup enviados pelo Evandro. Escopo só visual; automações/recorrência/notificação push da spec ficaram de fora de propósito (o sininho já reflete tarefas atrasadas automaticamente).
- #82 redesenho visual da tela de Contatos: 4 KPIs (Total, Novos no mês, Com negócio, Sem negócio), tabela restilizada (avatar, badge de negócios) — a partir de spec extensa enviada pelo Evandro. Escopo só visual; restrição de acesso, filtros avançados, export e auditoria ficaram de fora de propósito. Ainda não testado visualmente no navegador.
- #84 Contatos — gestor passa a ver a carteira inteira da empresa (igual admin); vendedor sem mudança. Exclusão de contato nova (botão na ficha, confirmação), liberada para admin+gestor (RLS e UI). Migration `20260930094500_contatos_visibilidade_gestor.sql`. Ainda não testado com banco real.
- #85 papel SDR (fase 1 da spec `RAION_SDR_REGRAS_PERMISSOES`): novo valor `sdr` no enum `papel_membro`, selecionável em Configurações > Usuários. Sem RLS nova — o padrão já existente para papéis fora de `{admin,gestor}` (visibilidade restrita ao próprio) cobre o comportamento recomendado pela spec. `/contatos` (carteira geral) redireciona SDR pra `/inicio`; link "Contatos" some do menu para SDR. Corrigido de passagem: bug do sininho que mandava qualquer papel não-vendedor pra `/painel` (agora só admin/gestor). Fases futuras da spec (qualificação, handoff, SLA, automações, gamificação/métricas própria do SDR, visibilidade configurável, motor ABAC) documentadas como próximos passos.
- #86 Qualificação SDR + handoff (fases 4 e 5 da spec): seção "Qualificação SDR" na ficha do negócio (12 campos novos em `negocios`, reaproveitando os campos que a calculadora solar já usa em vez de duplicar — confirmado com o Evandro) com selo de status (3 critérios fixos: telefone válido, objetivo confirmado, decisor identificado). Ação "Enviar para vendas" — só habilitada com negócio "Qualificado" — registra o handoff numa tabela própria (`handoffs`, com snapshot da qualificação) e atualiza o responsável do negócio. Critérios configuráveis, notificação ao vendedor e lista de handoffs na tela ficam para fase futura. Ainda não testado com banco real nem visualmente.
- #88 SDR fases 2-3: bloqueado fechar negócio (ganho/perdido, inclusive via etapa que fecha sozinha) e alterar valor do negócio após criado; bloqueado gerar/editar proposta e contrato. Fase 3 (visibilidade por escopo) já satisfeita pelo default "Restrito" da fase 1.
- #89 SDR fase 6: trigger cria tarefa "Realizar primeiro contato" (15 min) quando `responsavel_id` vira SDR. Corrigiu 2 bugs órfãos da #85 (sininho e toggle "Equipe" da Início tratavam SDR como gestor).
- #90 Distribuição de leads por papel (fora da spec SDR, pedido à parte do Evandro): 4 modos configuráveis em Configurações > Origens — Somente vendedores (padrão), Somente SDR (fallback pro vendedor sem SDR ativo), Parcial (% configurável) e Aleatório. Corrigiu o rodízio, que antes não filtrava por papel nenhum.
- #91 SDR fase 7 (escopo parcial): tabela `notificacoes` nova + 2 dos 8 tipos da spec (§45) — "novo lead atribuído" e "gestor atribuiu tarefa". Sininho vira dropdown quando há notificação não lida. "Lead devolvido"/"handoff aceito-rejeitado"/"reunião-visita próxima" ficaram fora por dependerem de fluxo ainda não construído.
- #94 Notificação e feedback do vendedor no handoff SDR (pedido à parte, fora da spec de 60 seções): vendedor recebe notificação (`notificacoes.tipo = 'handoff_recebido'`) ao receber o handoff; sem botão de aceitar/recusar — recusa continua manual via gestor, fora do app. Card "Feedback do lead (handoff)" na ficha do negócio: quem recebeu escreve um texto sobre a qualidade do lead, visível só a admin/gestor e ao próprio autor (tabela `handoffs_feedback`, RLS própria — o SDR nunca vê; métrica futura pra avaliar o SDR). O formulário só libera depois que o vendedor registra uma nota de contato com o lead (pedido do Evandro).

Todas as PRs de #85 a #94 mescladas em 2026-09-30 (`pode dar merge`). Nenhuma testada com banco real nem visualmente no navegador ainda — RLS/triggers/UI dependem de confirmação do Evandro.

## Em andamento

- **PR #96 — motor único de dimensionamento (branch `feature/negocio-kit-automatico`):** unifica o cálculo do kit (módulo+inversor) numa tabela própria (`dimensionamentos_solares`), sempre recalculado no servidor. Commits já mesclados na PR (CI verde, sem review pendente, ainda não mesclada na `main`):
  - `8c937bb` completa campos técnicos de inversor em "Equipamentos ativos" (tipo on-grid/híbrido, tensão de partida, entradas por MPPT, tensão/fases/corrente CA, eficiência) — antes o formulário de inversor era quase idêntico ao de módulo.
  - `30e15d8` separa `dc_ac_ratio` de `overload_pct` (painel mostrava 210,8% em vez de 110,8% — o cálculo já estava certo, só faltava separar os campos), esconde o editor de kit manual atrás de um botão, e mostra os campos técnicos específicos que faltam em vez de "não verificado" genérico.
  - `378ec4c` regra de negócio: overload acima do limite (`overload_maximo_pct`, padrão 30%) nunca aparece mais como sugestão automática — só via seleção manual explícita (novo seletor módulo+inversor no painel), com auditoria automática na linha do tempo do negócio (trigger `dimensionamentos_solares_registrar_overload`, tipo `dimensionamento_overload_manual`).
  - `c71b192` base (schema + função pura, **sem UI/action conectada ainda**) pra resolver a distribuidora automaticamente a partir do município (Etapa 1 do wizard) — `src/lib/distribuidoras.ts`, migration `20260930220000_municipios_distribuidoras.sql`. Pausado a pedido do Evandro pra priorizar o redesenho do wizard (próximo item). Faltam: action server (`resolverDistribuidoraPorMunicipio`), reaproveitar `buscarTarifaHomologada` por sigla/distribuidora, wiring no wizard, e importar os dados reais do IBGE/ANEEL (esta sandbox não tem acesso à rede).
- **PR #63 — contexto do Claude:** `CLAUDE.md` enxuto (regras permanentes + seleção de modelos), `docs/arquitetura.md`, `docs/regras-negocio.md`, `PROGRESS.md`, `HANDOFF.md` e `.claude/settings.json`. 
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

1. **Prioridade atual (nova thread, a pedido do Evandro 2026-09-30):** redesenho visual do wizard "Adicionar negócio" em 3 etapas (Cliente e consumo / Sistema recomendado / Dados técnicos e complementares), conforme spec detalhada enviada pelo Evandro no chat. Regras explícitas: **não alterar motor de cálculo, fórmulas, regras elétricas, integrações existentes nem persistência/banco** — só interface, com dados mockados na Etapa 2 (resumo do sistema, kit cards, alertas ✓/⚠/❌) e placeholders visuais de "Documentos inteligentes" (CNH, conta de energia) sem OCR. Etapa 1 ganha bloco Cliente (existente/novo, nome, WhatsApp com máscara/validação BR, e-mail validado) e endereço estruturado (CEP/Rua/Número/Complemento/Bairro/Cidade/Estado, com autofill por CEP) e bloco Consumo (kWh médio OU valor médio da conta em R$); remove dessa tela: valor estimado, tarifa manual, unidade consumidora, tipo de ligação, padrão do cliente, tipo de telhado, documentos obrigatórios, dados técnicos (tudo isso vai pra Etapa 3). Manter os atalhos existentes (Início, Kanban, Contato → "Novo negócio") abrindo o mesmo wizard. Após validação visual pelo Evandro, retomar os ajustes do motor/integrações abaixo.
2. Depois da validação visual do wizard: retomar a Etapa 1 de tarifa automática (município → distribuidora → tarifa ANEEL), pausada em `c71b192` — falta a action server, o wiring no wizard e os dados reais do IBGE/ANEEL.
3. Conferir visualmente as telas restilizadas (Tarefas #80, Contatos #82), o papel SDR completo (#85/#86/#88/#89/#91), a distribuição de leads (#90) e o motor único de dimensionamento (PR #96) — nada testado em navegador nem contra banco real ainda (sem Docker local).
4. Rodar o workflow manual "Popular metas comerciais dos vendedores" (Actions) pra popular a Início (#77) com metas de exemplo.
5. Mesclar a PR #63 (documentação de contexto) e a PR #96 (motor único de dimensionamento, quando o Evandro aprovar).
6. Criar os secrets do backup, mesclar a PR #62 e rodar o backup uma vez manualmente.
7. Fases futuras da spec de SDR (fase 8 gamificação, fase 9 métricas, fase 10 testes RLS, visibilidade configurável, devolução de lead, aceite/rejeição de handoff, SLA, motor de permissões ABAC).
8. Revisar as PRs do Dependabot (#60 e #61 são versões maiores).
