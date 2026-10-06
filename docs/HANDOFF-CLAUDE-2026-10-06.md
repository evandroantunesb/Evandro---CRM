# Handoff — Raion CRM (2026-10-06)

> **Retrato de 2026-10-05, já desatualizado** (Base Demo, PRs #114/#136–#139). Estado atual em `docs/PROJECT_STATUS.md`.

Documento gerado para troca de conta/sessão. Complementa (e em caso de conflito, prevalece sobre) o `PROGRESS.md` (datado de 2026-09-30, desatualizado em vários pontos) e o `HANDOFF.md` da raiz (datado de 2026-09-29, obsoleto). Leia primeiro este arquivo, depois `CLAUDE.md`, `docs/arquitetura.md` e `docs/regras-negocio.md` só sob demanda da tarefa.

## 1. Visão geral

**Produto:** Raion CRM — funil de vendas para empresas de energia solar. Uso duplo: ferramenta interna do Evandro (gerente comercial, equipe de 3, deve escalar) e SaaS revendável multiempresa. App em produção: `raion-crm-roan.vercel.app` (atenção: `raion-crm.vercel.app`, sem "-roan", é de terceiros).

**Módulos principais:** captura/distribuição de leads, Kanban/lista de negócios, calculadora solar + proposta (PDF) + contrato, gamificação completa (pontos/XP/moedas, níveis, conquistas, ranking, loja, metas, comissões), tarefas, contatos, painel do gestor, configurações (funil, origens, usuários/equipes, calculadora, modelos de proposta/contrato, captura, gamificação, metas, comissões, resgates), super-admin (empresas/cobrança), Google Agenda.

**Stack:** Next.js 16 (App Router — **APIs mudaram em relação ao conhecimento de treino**, ver `AGENTS.md` e `node_modules/next/dist/docs/` antes de mexer em rotas/server actions) + React 19 + TypeScript + Tailwind 4 · Supabase (Postgres/RLS/Auth/Storage, região São Paulo) · Zod 4 · `@react-pdf/renderer` · `@dnd-kit/core` · `lucide-react` · Vitest · pnpm · Node 22 · Vercel + GitHub Actions.

**Multi-tenant:** todo dado operacional tem `empresa_id`; isolamento é via RLS (`supabase/migrations`), nunca só por código. Super-admin (`plataforma_admins`) **não fura RLS** de negócios/empresas — só libera `/super-admin/*`.

**Perfis:** por empresa, `empresa_membros.papel` ∈ {admin, gestor, vendedor, sdr}; `perfil_gamificacao` ∈ {sdr, closer, cs_farmer}; `status` ∈ {ativo, inativo, desligado} — só ativos entram no rodízio de leads. Visibilidade de negócio: admin da empresa, o próprio responsável, ou o gestor da equipe dele (`pode_ver_responsavel()`).

## 2. Estado atual do desenvolvimento

- **Concluído e em produção:** CRM comercial base (contatos/negócios/Kanban/lista/tarefas/notas), calculadora + proposta + contrato, rodízio de leads com aprovação do gestor, leads/propostas parados, papel SDR completo (qualificação, handoff SDR→closer, tarefa automática, distribuição por papel), notificações in-app, Google Agenda, gamificação **funcionalmente fechada** (motor antifraude, XP/moedas separados, níveis, conquistas, ranking com histórico/streak, loja com saldo negativo permitido, metas e comissões causais versionadas), redesign visual da Início, redesign visual do dashboard de gamificação (Visão geral + Extrato, PR #130).
- **Parcialmente concluído:** redesign visual das demais ~9 telas de `/gamificacao` (jornada, loja, metas, comissões, resgates, configurações de gamificação etc.) — só Visão geral e Extrato foram redesenhadas; o resto está no visual antigo. Wizard de negócio em 3 etapas com motor de dimensionamento real: PR #101, ainda não mesclada (ver §3/§4).
- **Não iniciado:** todo o roadmap listado em §10 (onboarding de empresa, pós-venda, compras, documentos configuráveis, concessionárias, agenda operacional, obras, vistoria, entrega técnica, integrações externas).
- Percentual aproximado: CRM comercial ~90%, calculadora/proposta/contrato ~85%, gamificação (motor + telas-chave) ~95%, gamificação (visual completo) ~20%, roadmap futuro ~0%.

## 3. PRs e branches (status ao vivo em 2026-10-05, consultado via API do GitHub)

`main` está em `501f5fa` (merge da PR #130), sincronizado com `origin/main`, árvore de trabalho limpa.

**Branches locais que já estão 100% mescladas em `main`** (confirmado via `git branch --merged main`): `feature/gamificacao-kpis-funcionais` (PR #131) e `feature/gamificacao-redesign-visual-fundacao` (PR #130). Podem ser apagadas quando o Evandro autorizar limpeza de branches antigas (pendência conhecida, nunca executada).

**PR aberta mais recente e relevante:**
- **#132 — "Script de seed: base fictícia de demonstração"** (draft, `feature/seed-base-demo` → `main`, head `7225910`). `mergeable_state: clean`, CI (`verificar`) e Vercel Preview verdes, sem review threads. **Não mesclar sem autorização explícita e separada do Evandro — além disso, mesmo depois de mesclada, o script só deve rodar em produção com `CONFIRMAR_RESET_DEMO=sim` sob autorização explícita à parte.** Detalhes completos em §8.

**Cadeia longa de PRs empilhadas da gamificação (todas draft, todas abertas, pré-datam o fechamento funcional de 2026-10-02 e a PR #131 que já consolidou/mesclou o conteúdo relevante em `main`):** #101 a #118 (ex.: #104 Fase B negociação/contrato, #105 Fase C qualificação, #106 aceite do closer, #107 perfis de gamificação, #108 fechamento de handoff, #110 bônus de contrato via SDR, #111 fix handoff.won, #112 eventos reunião/visita realizada, #113 pagamento confirmado, #114 super-admin entrar na empresa, #115 fix `unica_por_negocio`/reocorrência, #116 separação XP/moedas, #118 fecha ranking por perfil). **Estas provavelmente estão obsoletas/superadas** — o conteúdo equivalente já foi implementado e mesclado via PR #131 (`feature/gamificacao-kpis-funcionais`) em commit único `98a97d6`. Antes de mexer em qualquer uma: comparar o diff contra `main` atual — é provável que sejam fechadas como "superseded by #131" em vez de mescladas (PROGRESS.md já registrava essa intenção para #118 especificamente: "aguardando ser fechada 'superseded by #119'" — número pode estar desatualizado, confirmar).
- **#101 — "Reconciliação: motor de dimensionamento real no wizard de 3 etapas"**: a única desta cadeia que **não** é sobre gamificação; é o redesenho do wizard de negócio. Contém 13 migrations ainda não aplicadas em produção — só falta o backup do Evandro antes de aplicar. CI verde, draft. Esta é a próxima prioridade de banco (ver §4).
- **#102 — "Imagem nas recompensas da loja de gamificação"**: draft, isolada, não investigada a fundo nesta sessão.

**PRs antigas, de 2026-09-29/30, prováveis remanescentes abandonados (não citadas em nenhuma memória recente como ativas — confirmar status real com o Evandro antes de fechar ou mesclar):** #62 (backup do banco, bloqueada em secrets `BACKUP_ENCRYPTION_KEY`/`BACKUP_REPO_TOKEN` nunca criados), #68, #70, #71, #76 (todas atualizações pontuais de PROGRESS.md ou fixes de UI pequenos, non-draft).

**PRs do Dependabot** (#55–#58, #60, #61, citadas em PROGRESS.md) **não aparecem na listagem atual de PRs abertas** — provavelmente já mescladas ou fechadas; confirmar na aba Pull Requests do GitHub se for mexer em dependências.

## 4. Banco e migrations

67 arquivos em `supabase/migrations/`, do mais antigo (`20260925000100_fundacao.sql`) ao mais recente (`20261004233000_gamificacao_progresso_conquistas.sql`, da PR #131). Cobrem, em ordem: fundação/CRM base/operação → calculadora/proposta/kit/contrato → gamificação (pontos, níveis/conquistas, ranking, loja, metas, comissões) → captura de leads → modelos de proposta → Google Agenda → atribuição de leads/status de membro → leads/propostas parados → papel SDR completo (qualificação, handoff, tarefa automática, distribuição) → notificações → gamificação SDR/antifraude/fases B-C/aceite/perfis/handoff/contrato/reunião/pagamento → XP/moedas → níveis/conquistas fechamento → reversão de tarefas → correções de valor/beneficiário → metas/comissões causais versionadas → loja com saldo negativo → streak/ranking histórico/progresso de conquistas.

- **Aplicadas em produção:** todas as 67, **exceto** as 13 da PR #101 (motor de dimensionamento real do wizard) — essas estão prontas e com CI verde, mas aguardando o Evandro fazer o backup do banco de produção antes de aplicar. Produção normalmente fica sempre igual/à frente de `main` porque `banco-producao.yml` roda `supabase db push --include-all` a cada push na `main` que toque migrations; a PR #101 é a única exceção conhecida pendente.
- **Risco conhecido:** o preview do Vercel usa o **mesmo banco de produção** — uma PR com migration nova dá erro no preview até ser aplicada. Migrations duplicando prefixo de timestamp quebram `db push` — sempre conferir as PRs abertas com migrations antes de escolher um novo prefixo `AAAAMMDDHHMMSS`.
- **`database.types.ts`** é gerado (`pnpm db:types`) — nunca editar à mão; CI compara byte a byte.
- Dois limites de imutabilidade descobertos e documentados durante a implementação da PR #132 (ver §8), relevantes para qualquer trabalho futuro com dados retroativos/demo: `point_ledger` e `eventos` são imutáveis mesmo para `service_role` (só a função `security definer` do motor escreve, sempre `now()`); `atividades` é imutável para todos inclusive `service_role`; já `historico_etapas` (`entrou_em`/`saiu_em`) e `negocios.created_at`/`etapa_desde` podem ser retrodatados por `service_role`; `negocios.updated_at` **nunca** pode, porque o trigger `tocar_updated_at()` sobrescreve incondicionalmente para `now()` em todo UPDATE.

## 5. Gamificação

Considerada **funcionalmente fechada em 2026-10-02**; trabalho recente é redesign visual (não motor) e o fechamento final via PR #131 (streak de dias produtivos, ranking com histórico, progresso de conquistas).

**Arquitetura:** tudo nasce de `eventos` (log de domínio imutável) via trigger `eventos_aplicar_gamificacao`, que credita `point_ledger` (XP e moedas separados, decisão da PR #116). Pontos padrão documentados em `docs/regras-negocio.md`: negócio criado 5, etapa avançada 2, negócio ganho 50, tarefa concluída 3, nota 1 — mas os valores reais e vigentes estão em `gamification_rules` (configurável), não hardcoded.

**Regras causais que não podem ser alteradas sem pedido explícito:**
- `point_ledger`/`eventos`: **nunca inserir manualmente**; proibido mesmo para viabilizar testes automatizados (caso concreto: Evandro recusou qualquer backdating do ledger para testar o streak "sexta→fim de semana→segunda" na PR #131, 2026-10-04) — preferir compor regras + ler código.
- `calcular_realizado_meta(p_empresa_id, p_membro_id, p_metrica, p_desde, p_ate_exclusivo)` e `calcular_receita_causal_comissao` leem só de `eventos.created_at` (sempre real/imutável) — portanto metas e comissões nunca refletem datas retrodatadas cosmeticamente em `negocios`/`historico_etapas`.
- Marco permanente é imutável por definição: conquista desbloqueada e seu `xp_bonus` nunca são revogados.
- Saldo negativo na Loja é semântica válida (nunca bloqueia reversão de resgate); UI trata como "em ajuste".
- "Proposta enviada" foi explicitamente **rejeitada** por Evandro como evento de gamificação, por falta de sinal confiável.
- Trava técnica de segurança não é bem-vinda se na prática for um limite de produto não solicitado — exigir prova concreta de necessidade antes de manter qualquer cap arbitrário (caso: cap de 3650 dias no cálculo de streak, removido na PR #131 após confirmado que não havia risco real de loop infinito).
- Planos de comissão (`planos_comissao`/`comissoes_calculadas`) são versionados por `vigencia_inicio`; `fechar_comissao()` fecha o período (status aberta/fechada).
- Handoff SDR→closer usa a RPC `aceitar_handoff()`; só funciona via sessão autenticada do closer (não `service_role`).
- Confirmação de pagamento é insert-only via RPC `confirmar_pagamento`, com guarda contra autoconfirmação (quem assinou o contrato não pode confirmar o próprio pagamento).

## 6. Calculadora Solar

Motor de dimensionamento em `src/lib/calculadora.ts` (fórmula replicada manualmente em `scripts/seed-base-demo.mjs` — mantida em sincronia à mão, convenção já existente nos scripts de seed anteriores). Parâmetros em `parametros_calculadora` por empresa. Pendências técnicas conhecidas (de PROGRESS.md, ainda válidas): falta importar CSV real de equipamentos/preços; falta repetir e validar o teste de referência de 1.500 kWh/mês em Cascavel/PR com o engenheiro; nenhuma decisão de parâmetro da calculadora deve ser tomada sozinha pelo Claude — sempre perguntar ao Evandro antes (regra permanente do `CLAUDE.md`). PR #101 (não mesclada) traz o motor de dimensionamento real integrado ao wizard de 3 etapas — hoje o wizard em produção não usa esse motor reconciliado.

## 7. CRM Comercial

Contatos, negócios, Kanban e lista, handoffs, tarefas, comentários/notas (imutáveis desde PR de 2026-09-30, "notas sem exclusão"), propostas (PDF via `@react-pdf/renderer`, "fotografam" o modelo no momento da geração — editar o modelo depois não altera documentos já gerados), contratos (`status_contrato`: rascunho/aguardando_assinatura/assinado; campos de assinatura são write-once-frozen via trigger `travar_contrato_com_pagamento`; só pode ser regerado em rascunho).

**Perda/ganho:** nunca existe uma etapa literal "Perdido" no Kanban — é sempre `negocios.status` (`aberto`/`ganho`/`perdido`) + `motivo_perda_id` obrigatório na perda. Uma etapa pode ter `fecha_como` (`ganho` ou `perdido`) para fechar o negócio automaticamente ao entrar nela; "ganho" fecha silenciosamente, "perdido" sempre exige motivo.

**Distribuição de leads:** rodízio automático entre vendedores ativos, fila de aprovação do gestor, prazo de auto-aprovação configurável por origem (padrão 1h), expiração via `pg_cron` a cada 5 min. Leads parados = negócio aberto sem mudar de etapa nem receber nota há mais que `empresas.dias_considerado_parado` (padrão 7 dias); leads sem contato = 1ª etapa + nenhuma nota + atribuído há mais que `horas_considerado_sem_contato` (padrão 3h); propostas paradas = mesmo prazo, proposta gerada sem reabertura nem mudança de etapa.

## 8. Base Demo (PR #132)

**Objetivo:** substituir os dados reais atuais de vendedores por uma base fictícia de demonstração, mantendo o admin e toda configuração da empresa, com histórico de 90 dias gerado via mecanismos reais (triggers/RPCs/sessões autenticadas), nunca inserção direta de pontos ou eventos sintéticos.

**Estado:** PR #132 aberta como **draft**, CI e Vercel verdes, `mergeable_state: clean`. **Nenhuma execução real foi feita** — nem dry-run contra produção (esta sessão não tem credenciais Supabase; confirmado via `env` vazio e via `read_documentation` de secrets do ambiente). Evandro precisa rodar o dry-run localmente:

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=vando12star@gmail.com node scripts/seed-base-demo.mjs
```

(sem `CONFIRMAR_RESET_DEMO` → só imprime o plano, não apaga nem cria nada). Execução real exige `CONFIRMAR_RESET_DEMO=sim` — **nunca rodar sem autorização explícita e separada do Evandro**, e só depois que ele validar o resultado do dry-run.

**Script:** `scripts/seed-base-demo.mjs` (~860 linhas, 2 commits: `8f5a4a3`, `7225910`, branch `feature/seed-base-demo`). Fluxo: calcula plano de limpeza (só `empresa_membros` com `papel='vendedor'`; aborta se o admin aparecer na lista) → se `CONFIRMAR_RESET_DEMO=sim`, executa a limpeza (apaga eventos/negócios/contatos órfãos/membros — cascata — mas **preserva as contas de Auth antigas**, remove só o vínculo `empresa_membros`) → recria o funil com as 9 etapas novas → cria 5 membros fictícios (4 closers + 1 SDR, e-mails `*.demo@raioncrm-demo.com.br`, senha fixa) → monta e executa 35 negócios distribuídos (ver tabela abaixo) via sessões autenticadas reais (magic link) → calcula e fecha comissões → cria metas do mês → roda validação pós-seed lendo o banco real.

**Funil novo (substitui as 4 etapas atuais):** Novo Lead → Qualificação → Contato Realizado → Levantamento/Diagnóstico → Proposta Enviada → Follow-up → Negociação → **Assinado** (`fecha_como='ganho'`) → Pago (cosmética, pós-ganho).

**Distribuição dos 35 negócios:** Lucas Martins (closer, melhor desempenho): 10 negócios — 3 ganho+pago, 2 ganho aguardando pagamento, 1 perdido, 4 em andamento (2 via handoff do SDR). Mariana Costa: 9 — 2+2+1+4 (2 via SDR). Rafael Almeida: 8 — 1+1+1+5 (1 via SDR). Bruno Ferreira (desempenho mais baixo): 8 — 1+0+2+5 (0 via SDR). Gabriel Santos (SDR): não fecha negócios, origina handoffs (5 no total) para os closers. Totais: 35 negócios, 12 ganhos (7 pagos + 5 só assinados), 5 perdidos, 18 em andamento. Origens: Meta Ads, Google Ads, Indicação, Site, Prospecção ativa, Evento, Parceiro (mantidos como origens separadas, sem combinar Evento+Parceiro).

**Ranking de gamificação esperado (por construção, via volume real de eventos, não XP hardcoded):** Lucas > Mariana > Rafael > Bruno, com Gabriel recebendo XP/pontos coerentes com o papel de SDR via handoffs reais. A fila de atribuição de negócios "em andamento" foi deliberadamente ordenada em ordem decrescente de profundidade de etapa (closers com mais negócios recebem as etapas mais avançadas primeiro) para garantir essa dominância em todas as categorias de evento geradoras de XP — validado offline (fora do banco) antes de qualquer commit. Os valores exatos de XP/nível/comissão dependem das regras reais vigentes em `gamification_rules`/`niveis_gamificacao` da empresa, desconhecidas até a execução real.

**Validação pós-seed** (`validarPosSeed`, ao final do `main()`): confere contra o banco real — nunca contra a contagem de eventos do próprio script — 5 membros fictícios, 35 negócios, breakdown de status, 7 `confirmacoes_pagamento`, handoffs do Gabriel, soma real de `point_ledger.xp` por membro com ranking ordenado e alerta explícito se a ordem Lucas>Mariana>Rafael>Bruno não se confirmar, metas (alvo vs. realizado via `calcular_realizado_meta`), e `comissoes_calculadas` por closer.

**Relatórios de apoio (não código, não necessários para rodar o script):** `/mnt/project-files/auditorias/desenho-base-demo-2026-10-05.md` (design aprovado) e `/mnt/project-files/auditorias/implementacao-base-demo-2026-10-05.md` (relatório de implementação, com a tabela completa de distribuição e a tabela de ações geradoras de XP).

## 9. UX/UI

**Identidade visual (não alterar) — `src/app/globals.css`:** Carvão `#0F0F10`, Dourado Solar `#D4AF37`, Off-white `#FAF8F3`, Cinza `#6B7280`, Cinza claro `#E5E7EB`; Manrope nos títulos, Inter nos textos; logo em `src/components/marca.tsx` + `public/marca/`. **Verde só no WhatsApp, vermelho só para perda e erro — exceto** dentro de `/gamificacao`, onde verde é a cor contextual principal (sensação de "entrar em outra área", competitiva), dourado fica reservado a prestígio/conquistas, e vermelho limitado a alertas (queda de posição, meta em risco); essa exceção foi confirmada pelo Evandro em 2026-10-01 e **não se estende ao resto do produto**.

**Telas já redesenhadas (padrão novo):** Início (responsivo, seletor pessoal/equipe), Tarefas (PR #80), Contatos (PR #82), gamificação → **só** Visão geral e Extrato (PR #130): dashboard denso, hero "Minha posição" com fundo SVG, "Meu nível" compacto, Ranking com abas Semana/Mês/Geral, Metas+Loja em coluna lateral, KPIs em pílulas douradas/verdes por prestígio/XP, CSS refatorado de `nth-child` posicional para classes semânticas (`_compartilhado/ui.tsx`), breakpoint desktop-3-colunas estendido até 1280/1366px.

**Telas ainda no visual antigo:** as ~9 outras telas de `/gamificacao` (jornada, loja, metas, comissões, resgates, configurações de gamificação, etc.) — redesign ainda não agendado.

**Padrão de revisão visual do Evandro:** testa o preview em breakpoints específicos (1440/1366/1280/1024/390px) e pede ajustes pontuais um de cada vez, sempre dizendo explicitamente "não fazer merge ainda" até aprovação final ("pode mesclar"/"considere aprovado") — nunca mesclar por conta própria mesmo com CI verde.

**Mobile é prioridade** em qualquer tela nova; reutilizar `src/components/ui.tsx`.

## 10. Roadmap futuro (não iniciado, sem ordem de prioridade definida ainda)

Onboarding de empresa (primeiro login/configuração inicial de empresa nova); tipos de solução além de fotovoltaico residencial/comercial; pós-venda; pedidos; engenharia; administrativo/pós-vendas; compras; documentos configuráveis; concessionárias; agenda operacional; obras; vistoria; entrega técnica; integrações/automações (Meta Ads → CRM ainda não confirmada; assinatura eletrônica real via gov.br/ZapSign; notificações externas por e-mail/WhatsApp; leitura de documentos por IA, bloqueada por falta de chave de API com visão).

## 11. Decisões arquiteturais importantes

- RLS por `empresa_id` é a única barreira real de isolamento multiempresa — nunca confiar só em checagem de código/UI.
- Super-admin nunca fura RLS de negócios — selo só libera `/super-admin/*`.
- Migrations em produção só via `banco-producao.yml` (push em `main` ou `workflow_dispatch`), nunca manualmente.
- Preview do Vercel usa o banco de produção — cuidado ao testar PR com migration nova.
- `point_ledger`/`eventos` são imutáveis até para `service_role`; só a função motor (security definer) escreve, sempre com `now()`.
- `atividades` é imutável para todos, inclusive `service_role` — nunca backdatable por ninguém.
- `negocios.updated_at` é sempre sobrescrito para `now()` pelo trigger `tocar_updated_at()` — nunca confiar nele como data retrodatada.
- Perda nunca é uma etapa literal — sempre `status` + `motivo_perda_id`.
- Proposta/contrato fotografam o modelo no momento da geração.
- Cadastro público está desligado — só entra quem é convidado ou cadastrado pelo gestor.
- Padrão de implementação complexa aprovado pelo Evandro: auditoria/diagnóstico read-only → aprovação ponto a ponto → implementação → checagem final antes do merge. **Nunca avançar sozinho para o próximo passo/módulo**, mesmo após um merge aprovado — esperar comando explícito para retomar.
- Regra de ouro: nunca usar perfil/papel/valor atual para reinterpretar fatos históricos.

## 12. Riscos e armadilhas

- **PR #132 é destrutiva por natureza** (apaga vendedores/negócios/contatos reais da empresa) — nunca rodar `CONFIRMAR_RESET_DEMO=sim` sem autorização explícita e separada, mesmo que a PR já esteja mesclada em `main`.
- **PR #101 tem 13 migrations pendentes** — aplicar em produção só depois do backup do Evandro.
- Cadeia de PRs #102–#118 provavelmente obsoleta (superada por #131) — não mesclar nenhuma sem antes comparar contra `main` atual; risco real de reintroduzir lógica já substituída ou duplicar migrations com prefixo conflitante.
- Nunca inserir manualmente em `point_ledger` ou `eventos`, nem para viabilizar teste automatizado — Evandro já recusou isso explicitamente.
- Nunca mesclar nenhuma PR sem autorização explícita e específica do Evandro para aquela PR, mesmo com CI verde.
- Nunca decidir sozinho parâmetro/dado técnico da calculadora solar — sempre perguntar antes.
- Nunca pedir senha/token/chave no chat.
- Repositório é público — nenhum segredo em arquivo versionado.
- Suítes de integração com Supabase (`*-db`, `rls`) só passam no runner do GitHub Actions — não rodam no sandbox local/nuvem (sem Docker); validar com lint + typecheck + testes puros + build e confiar no CI.
- `supabase/setup-cli` pode falhar com "rate limit exceeded" — é limite do GitHub, relançar o job resolve.
- Imagem/logo dentro de `flex-col` sem largura própria estica — usar `alignSelf: "flex-start"`.
- A partir do CLI Supabase 2.118, `gen types` sai sem formatação — `db:types` já formata com `oxfmt`; cuidado com PRs do Dependabot que atualizem o CLI.
- Evandro e a equipe às vezes commitam direto na branch de uma PR fora de uma sessão do Claude — sempre sincronizar (fetch + confirmar fast-forward limpo) antes de continuar uma branch existente.
- `update_pull_request` muda a `base` de PRs empilhadas direto para `main` quando a branch anterior é apagada — cuidado ao apagar branches de PRs mescladas que têm filhas abertas.

## 13. Próximos passos recomendados (ordem de prioridade)

1. Evandro roda o dry-run local da PR #132 e envia o resultado (empresa alvo, vendedores a remover, contagens) para validação antes de qualquer execução real.
2. Evandro faz o backup do banco de produção → aplicar as 13 migrations da PR #101.
3. Decidir o destino da cadeia de PRs #102–#118 (fechar como superseded ou revisar diffs individualmente).
4. Fechar/revisar as PRs antigas de 2026-09-29/30 (#62, #68, #70, #71, #76) — confirmar se ainda são relevantes.
5. Continuar o redesign visual das ~9 telas restantes de `/gamificacao`.
6. Validar visualmente (navegador real) Tarefas, Contatos, papel SDR, wizard, Loja — nenhuma validação em navegador real registrada ainda.
7. Importar CSV real de equipamentos e repetir o teste de referência de 1.500 kWh/mês (Cascavel/PR) com o engenheiro.
8. Revisar PRs do Dependabot junto com o Evandro (quando reaparecerem).
9. Deduplicação de contatos (telefone/e-mail) — sem solução desenhada ainda.
10. Hardening de concorrência em `unica_por_negocio` e centralização de `point_ledger` — adiados, sem data.

## 14. Comandos úteis

```
pnpm dev            # ambiente de desenvolvimento
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:reset
pnpm db:types       # regenerar database.types.ts após mudar o banco
pnpm super-admin <email> <senha> "<nome>"

# dry-run da base demo (não destrutivo, só imprime o plano):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=vando12star@gmail.com node scripts/seed-base-demo.mjs

# execução real da base demo (DESTRUTIVA — exige autorização explícita do Evandro):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=vando12star@gmail.com CONFIRMAR_RESET_DEMO=sim node scripts/seed-base-demo.mjs
```

## 15. Arquivos importantes para a próxima sessão ler primeiro

- `CLAUDE.md` — regras permanentes (sempre carregado via `@AGENTS.md`/instruções de projeto).
- `AGENTS.md` — aviso de Next.js 16 com APIs diferentes do conhecimento de treino; ler `node_modules/next/dist/docs/` antes de mexer em rotas/server actions.
- `PROGRESS.md` — estado por entrega numerada (desatualizado desde 2026-09-30; usar este handoff para o que aconteceu depois).
- `docs/arquitetura.md` — estrutura de diretórios, segurança/permissões, banco/migrations, deploy/CI, armadilhas conhecidas.
- `docs/regras-negocio.md` — regras de negócio que não podem mudar sem pedido explícito do Evandro.
- `scripts/seed-base-demo.mjs` — script da PR #132, ler antes de qualquer execução.
- `supabase/migrations/` — schema e RLS, fonte da verdade do banco; ler a migration mais recente relevante ao módulo antes de criar uma nova.
- `src/lib/gamificacao*`, `src/lib/metas.ts`, `src/lib/comissoes.ts` — motor de gamificação/metas/comissões (ler o trecho relevante, não o módulo inteiro).
- `src/lib/calculadora.ts` — motor de dimensionamento solar.
- `src/components/ui.tsx` — componentes compartilhados, reutilizar antes de criar novo.

## REGRAS PARA A PRÓXIMA SESSÃO

- Rode `git status`, `git log` e `git diff` antes de editar qualquer coisa — nunca assuma o estado do repositório pela memória/documentação.
- Nunca reverta alterações recentes sem entender por que foram feitas.
- Nunca mescle PR sem autorização explícita do Evandro para aquela PR específica.
- Nunca execute operação destrutiva em produção (reset, seed real, deleção em massa) sem autorização explícita e separada — uma aprovação anterior não cobre uma nova execução.
- Preserve RLS e o isolamento multiempresa em qualquer mudança de banco — `empresa_id` sempre, política de RLS sempre, nunca confiar só em checagem de código.
- Nunca insira pontos/XP manualmente em `point_ledger` ou registros em `eventos` — toda pontuação nasce de ação real disparando o motor.
- Respeite a causalidade da gamificação: metas e comissões leem só `eventos.created_at` real; não espere que dados retrodatados cosmeticamente em `negocios`/`historico_etapas` mudem esses cálculos.
- Trate o código atual (`supabase/migrations/`, `src/`) como fonte da verdade — documentação pode estar desatualizada; o código nunca mente.
- Nunca decida sozinho parâmetro técnico da calculadora solar — pergunte ao Evandro.
- Nunca peça senha, token ou chave de API no chat.
- Pendência pequena que não bloqueia a funcionalidade atual: registre em `PROGRESS.md` e siga construindo, sem travar esperando resposta.
