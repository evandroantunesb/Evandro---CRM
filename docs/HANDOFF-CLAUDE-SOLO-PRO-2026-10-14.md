# Handoff para Claude Code — Raion Solo/Pro: iniciar desenvolvimento controlado

**Data:** 14/10/2026. **Solicitante/decisor de produto:** Evandro.  
**Status:** autorização para **planejar e iniciar desenvolvimento em branches/PRs revisáveis**, com as decisões já aprovadas. **NÃO É autorização para merge, migration em produção, deploy, execução de workflow de produção, acesso a dados de produção, seed ou backfill.**

## Instrução de início

Claude **Opus** recomendado para a revisão de arquitetura, devido a mudanças interligadas em RLS/RPC, cobrança, fluxo de vendas e eventos de gamificação; Sonnet pode executar UI/testes depois que contratos de dados e plano estiverem estabilizados.

1. Leia `CLAUDE.md`, `AGENTS.md`, `docs/PROJECT_STATUS.md` da `main` e confira `git status`, branch, remotes, histórico recente e PRs abertas **antes de modificar**. Não resetar nem sobrescrever alterações locais. Leia a documentação de Next.js 16 indicada em `AGENTS.md` antes de codar.
2. Consulte estes três documentos **ainda em branch documental, não mesclados**:
   - `docs/ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md` (**main**: D1–D12);
   - `docs/DECISOES-D21-D24-DOWNGRADE-2026-10-14.md` (**branch `docs/decisoes-d21-d24-downgrade-20261014`**: D21–D24);
   - `docs/MATRIZ-SOLO-PRO-ESCOLHAS-APROVADAS-2026-10-14.md` (**mesma branch**: A–D e definição posterior de pagamento Solo).
3. Reconciliar as fontes reais de D13–D20 antes de reinterpretá-las; não inventar decisões ausentes. Código/RPC atuais prevalecem como diagnóstico da implementação existente; **decisões de produto aprovadas** definem o comportamento futuro desejado, nunca justificam quebrar segurança por atalho.
4. Produza primeiro **diagnóstico conciso e plano técnico por PR** com conflitos, migrations potenciais, efeito no legado, RLS/role, cronologia e testes. Pode prosseguir com implementação local/branches quando o escopo estiver inequívoco, **sem merge nem produção**. Submeta ao Evandro as escolhas comerciais ainda não fechadas em vez de decidir sozinho.

## Comportamento comercial aprovado: Solo

**Solo = um único administrador ativo**, que consegue conduzir o próprio ciclo comercial sem outro aprovador. Pode criar/editar leads, contatos e negócios; marcar venda **ganha**; registrar **pago/recebido manualmente**; gerar propostas; gerar e administrar contratos. Não exigir segunda aprovação ou dupla confirmação do mesmo pagamento; não depender de atendimento Raion.

**Ordem flexível entre marcos comerciais:**
- O administrador pode marcar **ganho**, marcar **pago** e **gerar contrato** em qualquer ordem operacionalmente válida; registro manual de pagamento não depende de existência de contrato nem de assinatura.
- **Solo e Pro podem gerar contrato antes ou depois do pagamento**, desde que o modelo e todos os campos obrigatórios estejam válidos. Não adicionar trava por status ganho ou por pagamento.
- O código atual `src/lib/contratos-geracao.ts` já permite gerar/regenerar apenas em rascunho, validando campos; **preservar essa proteção**, não sobrescrever conteúdo após saída do rascunho.
- **Gerar contrato ≠ assinar contrato.** A assinatura efetiva mantém suas regras.
- A criação automática de **exatamente um Pedido**, e Obra condicional, continua aguardando **três marcos: negócio ganho + contrato assinado + pagamento registrado**, não importando a ordem dos marcos. Não criar Pedido/Obra só por ganho+pago, e jamais duplicar nos eventos/retries concorrentes.
- **Nova Obra** só com módulo habilitado **e** escopo assinado `com_execucao`. A lógica transacional/idempotente e compatibilidade de `garantir_obra` são obrigações D1–D12.
- O registro de pagamento Solo é uma **declaração manual**, não uma conciliação bancária automatizada. Deve ter autor real, timestamp servidor, rastreabilidade, estorno/correção e prevenção de duplicidade sem uma segunda pessoa.

**Pro com equipe** mantém regras de papéis, permissões e segregação de funções existentes; confirmação atual pode depender de contrato assinado e aprovador distinto. Não relaxar globalmente as proteções do Pro. A regra "aprovadores só quando há múltiplos usuários" é princípio de produto, mas o critério técnico final (plano contratado, quantidade de membros ou ambos) precisa ser explicitamente descrito nos testes de transição e configuração — não inferir por contagem bruta sem considerar convites, vínculos inativos e downgrades agendados.

## Conflito central existente — pagamento

O banco atual (`supabase/migrations/20261001250000_gamificacao_pagamento_confirmado.sql`) tem:
- `confirmar_pagamento(p_contrato_id)` exigindo contrato **assinado**;
- proibição de autoconfirmação do beneficiário/responsável;
- constraint de beneficiário diferente do ator em `confirmacoes_pagamento` e `eventos pagamento.*`;
- evento causal para gamificação, timeline e controle de estorno.

Esses vínculos não suportam o pagamento Solo **antes da geração do contrato**.

**Solicitação de implementação:** desenhar fonte de verdade/registro manual por negócio (ou arquitetura equivalente robusta) no Solo; preservar trilha de pagamento e reconciliação quando o contrato vier depois, sem criar evento `pagamento.confirmado` falsificado, beneficiário fictício, pontuação artificial ou dois pagamentos independentes. Idempotência/concorrência, reversão/estorno, RLS por empresa e integridade de gatilhos são obrigatórios. A implementação deve distinguir **recebimento registrado** de **pagamento validado por outra pessoa**; no Solo não exigir este segundo passo. Não enfraquecer o Pro.

**Verificar impactos adicionais:** `status_pagamento_contrato`, status de fechamento calculado, `garantir_obra`, contratos assinados antigos, eventos/point_ledger, histórico de estornos, propostas/contratos públicos, permissões comerciais, interface do negócio, mudanças de plano com pagamentos históricos.

## Solo × Pro e downgrade

Diretrizes **aprovadas de alto nível**:
- Solo tem 1 admin ativo, CRM comercial/contatos/leads, funil, tarefas/agenda, calculadora solar no **mesmo motor do Pro**, propostas, contratos básicos, operação da própria venda, confirmação manual e Pedidos.
- Pro soma multiusuários, equipes, permissões e acompanhamento gerencial, distribuição/handoff, metas/comissões/gamificação e **módulos opcionais** da operação (Obras e futuros Engenharia/Compras). O nível de maturidade de recursos em roadmap **não** equivale à sua implementação atual.
- A listagem fina de **entitlements, limites, preços, addons, contrato "básico" vs avançado, relatórios, integrações e modelos de cobrança** ainda exige verificação/decisão; não ativar bloqueios de recursos que não foram catalogados/validados.

**Downgrade D19 + D21–D24:**
- Prévia **personalizada** mostra perdas reais de recursos, membros impactados, Obras/Pedidos e responsabilidades, preservação/consulta/exportação de dados, valores e data efetiva; ciência expressa, admin remanescente e auditoria.
- Downgrade entra no **próximo ciclo de cobrança**; mantém Pro até lá e permite cancelar antes da vigência. Data exata do ciclo e documentos de cobrança permanecem para fechamento; não presumir pró-rata V1.
- Suspender **somente vínculos na empresa**, nunca deletar conta global/membros de outras empresas.
- Históricos de módulos desabilitados ficam consultáveis/exportáveis conforme RLS, D17 e proteção de PII, sem novas operações. **Exceção expressa:** concluir Obras **já existentes**.
- Admin remanescente pode assumir/concluir Obras abertas **por transição autorizada/auditada**, sem reescrever autoria, criar Obra retroativa, remover dados nem ganhar acesso financeiro extra. A RPC `atribuir_participante_obra` atual exige alvo ativo de papel `operacao`; desenhar compatibilização, não simular usuário/ator `operacao`.
- Escopo contratual assinado imutável; alteração posterior segue D20 (autorização, justificativa, aditivo/acordo e auditoria).

## Plano de execução sugerido (não fazer uma PR gigante)

1. **Revisão técnica Opus:** mapa do estado atual e plano de migrations compatíveis com produção, contratos do modelo de pagamento Solo, impacto nos gatilhos/Obras/eventos e estratégia de rollout seguro. Bloqueios comerciais devem ser devolvidos ao Evandro, sem inventar regras.
2. **PR de núcleo do pagamento Solo** em branch própria: registro e RPC autorizada, trilha/estorno, separação do Pro, compatibilidade de eventos e testes de banco. Sem disparar aplicação remota.
3. **PR de UI comercial**: ação simples ganho/pago, contrato gerável independentemente, mensagens claras; sem aprovação redundante, sem alterar fluxos do Pro.
4. **PR(s) de entitlement Solo/Pro** somente após matriz exata de recursos/limites ser fechada; migração compatível com `gratuito/pago` existente, sem desativar clientes legados por default.
5. **PR(s) de downgrade** depois de D24 operacionalizada: simulador/aceite, agenda de vigência, suspensão por empresa, continuidade de Obras, consulta/exportação, auditoria. Separar Obra/RLS e billing conforme risco.
6. Em cada PR: lint, typecheck, testes unitários/DB/RLS/integração pertinentes, build e CI; se job falhar, ler **log completo** antes de corrigir. Reportar hashes, arquivos, CI real e pendências sem declarar "verde" sem verificação.

### Casos de teste mandatórios (mínimo)

- Solo: ganho → pago → contrato gerado → assinado; pago → contrato gerado → assinado → ganho; contrato gerado/assinado → ganho → pago; contrato gerado sem pagamento; pagamento sem contrato; pagamento com contrato ainda não assinado.
- Pro: closer não autoconfirma quando a regra de equipe proíbe; gestor/admin autorizados; eventos/ledger com ator e beneficiário verdadeiros; estorno/reconfirmação.
- Pedido: nasce **uma vez** somente após os três marcos; sem Obra quando módulo desabilitado ou escopo `sem_execucao`/indefinido; transições repetidas/concorrrentes não duplicam.
- Downgrade: dois admins → um, colaboradores com vínculo em outra empresa não perdem acesso lá; Obras abertas continuam concluíveis; histórico protegido por RLS; não criar Obras novas; permissões restritas continuam restritas.
- Evolução: upgrade não reativa automaticamente permissões perigosas; pendências de cobrança não ativam downgrade antes do ciclo.

## Fronteiras de autorização e impedimentos

- **Autorizado nesta conversa:** preparar handoff, revisar arquitetura, desenvolver e testar em ambiente local/branch e apresentar PR(s) para aprovação.
- **NÃO autorizado:** merge, deploy, migrations/consultas no banco de produção, `workflow_dispatch` de produção, acesso a secrets, seeds, operações destrutivas, modificar ambientes/proteções, ou aplicar a PR #101 (13 migrations pendentes) sem trilha específica.
- Conferir o primeiro ciclo de backups agendados previsto para 15/10/2026 e a obrigação da auditoria D10 **antes de qualquer implementação de Pedido com migração em produção**; exigem autorização específica. Não tratar resultados manuais de backup como confirmação da execução schedule.
- Nunca usar preview da Vercel como ambiente de teste de migration se a preview usa banco de produção.
- **Se faltar uma decisão de produto para codar uma etapa**, não presumir; entregar diagnóstico/PRs seguras de pré-requisito e apontar a decisão específica.

## Entrega esperada do Claude

Resumo técnico objetivo do que existe e do que mudará; plano de PRs; implementação e testes locais da primeira fatia quando viável; links de PRs; CI aferida; bloqueios residuais com opções. **Parar antes de merge/produção e solicitar autorização específica ao Evandro.**
