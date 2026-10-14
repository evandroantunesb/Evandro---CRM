# ADR em revisão — Pedido obrigatório, Obra opcional por empresa e por venda

**Data da decisão de produto:** 2026-10-14 · **Estado:** 12 decisões D1–D12 aprovadas pelo Evandro; arquitetura técnica ainda em revisão, sem autorização para implementar.  
**Natureza deste arquivo:** handoff entre computadores e para Claude Code. Não substitui `CLAUDE.md`, `AGENTS.md` ou o código da `main`.

## Diretriz central aprovada

Quando a venda cumprir **negócio ganho + contrato assinado + pagamento confirmado**, deve nascer **exatamente um Pedido**, de forma idempotente. **Obra somente é criada**, junto ao Pedido e na mesma transação, se (a) o módulo Obras estiver habilitado para a empresa e (b) o escopo contratado for `com_execucao`. Pedido é o pós-venda administrativo; Obra acompanha execução técnica; **Gestão e Apresentação são duas visões dos mesmos dados de uma Obra**. Não duplicar cronogramas, financeiros ou históricos.

A aprovação destas regras **não autoriza aplicação de migrations, alteração de gatilhos, escrita em produção, merge, seed ou backfill**.

## Decisões D1–D12 confirmadas

| ID | Decisão de produto aprovada |
| --- | --- |
| **D1 — Escopo** | Campo visível na negociação com padrão por empresa, editável pelo vendedor; mostrar na proposta e contrato e registrar/congelar na assinatura. Alterações após assinatura exigem fluxo explícito autorizado e auditável. |
| **D2 — Legado** | **Não** classificar automaticamente negócios antigos como `com_execucao`. Solicitar confirmação de escopo antes de enviar novos contratos. Preservar contratos/links de assinatura já existentes; caso legado com escopo indefinido conclua venda, gerar Pedido com pendência e **sem Obra automática**, sem impedir a assinatura pública. Obras existentes intactas. |
| **D3 — Onboarding** | Empresas **novas** iniciam com Obras **desabilitado até escolha no onboarding**; configuração alterável depois. Empresas **já existentes** preservam Obras habilitado na transição, sem perda de dados. |
| **D4 — Configuração** | Admin da empresa e super-admin Raion podem alterar habilitação de módulos, por operação autorizada e auditada. Permissão de configurar não concede acesso a dados operacionais/financeiros; RLS permanece independente. |
| **D5 — Desativação** | Desligar Obras bloqueia **somente criação de novas Obras**. **Obras existentes continuam legíveis e editáveis** pelos papéis já autorizados até conclusão; manter acesso por interface mesmo após desativação. Nunca apagar ou esconder irrecuperavelmente histórico. |
| **D6 — Estorno** | Estorno de pagamento gera **alerta financeiro**, mas **não bloqueia automaticamente compras**, nem cancela Pedido ou Obra. Preservar auditoria e decisões administrativas. |
| **D7 — Reativação** | Ao habilitar Obras depois, **não criar Obras retroativamente em massa**. Admin visualiza Pedidos antigos elegíveis e decide criar Obra por Pedido ou por lote, idempotente, auditável; escopo indefinido precisa de confirmação. Novas vendas seguem criação automática condicional. |
| **D8 — Responsabilidade** | **Pedido:** NF ao cliente, garantia dos equipamentos, documentos/obrigações comerciais. **Obra:** garantia da instalação, vistoria, registro e entrega técnica. Evitar dois estados independentes para a mesma obrigação. |
| **D9 — Tipos de escopo** | Primeira versão com apenas `com_execucao` e `sem_execucao`. Projeto de engenharia com acompanhamento entra em `com_execucao` mesmo sem instalação; setores aplicáveis serão refinados futuramente. |
| **D10 — Auditoria** | Auditoria **somente leitura** de Obras e vínculos existentes em produção **obrigatória antes de implantar Pedidos**, mas requer **primeiro ciclo automático de backups confirmado e autorização específica para a execução**. Aprovação desta decisão NÃO autoriza fazer a consulta agora. |
| **D11 — Estimativa histórica** | Guardar **custos internos estimados por venda** calculados pela calculadora, como referência histórica separada do orçamento operacional e dos custos efetivos; restringir acesso e impedir mudanças silenciosas ao alterar parâmetros posteriormente. |
| **D12 — Numeração e SDR** | Sequência própria de Pedidos **por empresa**, independente da sequência de Obras. SDR de origem pode consultar o andamento do Pedido **sem** custo interno, preço de compra, margem, estimativa financeira ou documentos financeiros restritos. |

## Implementação existente — não refazer

- `garantir_obra` possui três pontos de chamada (negócio ganho, contrato assinado, pagamento confirmado) e já fornece criação idempotente/transacional de Obra. A mudança proposta precisa preservar compatibilidade, autoria e todas as proteções atuais.
- Obras: base e RLS em migrations `20261006220000_obras_base`, `20261007200000_obras_acesso_operacao`, `20261008100000_obras_escrita_operacao`; a última está na `main` (PR #149 mesclada). **Confirmar seu estado efetivo na produção antes de depender dele; a presença do arquivo na `main` não prova aplicação.**
- Interfaces de lista/detalhe (PRs #150/#151), Gestão (PR #168) e Apresentação (PR #169) já mescladas. Dados avançados da Apresentação (Gantt, prazo, progresso e financeiro) permanecem sem origem real em produção; a demonstração fictícia é isolada ao ambiente local.
- `docs/ROADMAP.md` na `main` ainda é antigo. A PR **#167** com proposta de atualização do roadmap de Obras está **aberta** e foi escrita antes da conclusão das PRs #168/#169. Atualizá-la ou reconciliar a mudança **antes** de merge; não sobrepor inadvertidamente decisões.
- A calculadora já possui custos internos estimados configuráveis (`parametros_calculadora`), mas a origem histórica desses custos **ainda não é registrada por venda**; apenas aprovada como requisito futuro.

## Arquitetura técnica proposta para revisão, NÃO aprovada para execução

- Introduzir configuração `empresa_modulos` com auditoria e RPC controlada, checada no **banco** como restrição à criação de novas Obras, nunca como concessão extra de RLS nem impedimento de concluir Obras existentes.
- Campo de escopo explícito e registro da informação contratada; tratar contratos antigos/assinatura pública e nulos sem bloqueio indevido. Não inferir necessidade de Obra a partir do kit ou qualificação do SDR.
- Pedido independente da existência de Obra, com empresa e negócio vinculados por FKs compostas, idempotência, regras de acesso distintas para acompanhamento comercial, operação e informações financeiras.
- `garantir_pedido_e_obra`/mecanismo compatível com os gatilhos atuais: **Pedido sempre**, Obra condicional, ambos na transação comercial e sem duplicação. A ordem de travas proposta anteriormente é **hipótese a validar com testes de concorrência**, não uma garantia já estabelecida.
- Preparar possibilidade de múltiplas Obras por Pedido como **evolução**, que exige revisão de identificadores, RPCs, RLS e métricas — não basta remover `UNIQUE`.
- Razão único de custos por Pedido com atribuição opcional à Obra, sem dupla contagem. Estimativa histórica da calculadora, orçamento aprovado, custos lançados e margem final projetada são conceitos distintos. Restringir valores já no banco/DTO; nunca colocar dados financeiros em `obra_historico` acessível a SDR/`operacao`.
- Migrações e backfills em etapas pequenas, reversíveis quando possível. Não falsificar `created_at` de Pedidos antigos; manter datas históricas da venda em campos próprios. Considerar compatibilidade entre preview Vercel e banco de produção.

## Sequência sugerida, sujeita à revisão técnica

1. **P0 — somente documentos:** revisar este ADR, alinhar `PROJECT_STATUS.md` e PR #167/roadmap com as 12 decisões, sem mudanças operacionais. **Modelo Sonnet** para atualização documental depois da validação de arquitetura.
2. **M1 — módulos por empresa:** schema/RLS/RPC e compatibilidade do legado. **Modelo Opus**.
3. **E1 — escopo contratado:** negociação/proposta/contrato, congelamento e legado; validar assinatura pública. **Modelo Opus**.
4. **P1 — Pedido + Obra condicional:** transações, FK, migração de vínculos existentes, idempotência e casos de concorrência. **Modelo Opus**.
5. Depois: dados comerciais e itens do Pedido, interface de Pedidos, cronograma de Obras com dados reais, razão de custos e compras. Pedir autorização e revisar dependências **PR a PR**.

## Estado na troca de computador e próximo passo

- **Nenhuma das novas tabelas/rotinas de Pedido foi implementada nesta rodada**; até aqui o Claude realizou **análises somente leitura** e o Evandro aprovou **regras de produto**, não código.
- O fluxo de backup PostgreSQL/Storage, B2 e Healthchecks foi documentado/mesclado pela **PR #181**, commit `ca39fa1`. Três variáveis de agendamento foram informadas pelo Evandro como `true`; **primeiro ciclo `schedule` de 15/10/2026 ainda precisa ser comprovado** (00h23 PostgreSQL, 01h41 Storage; revisão às 05h45 horário Cascavel).
- No notebook: **antes de qualquer sincronização**, executar `git status`, `git branch --show-current`, `git remote -v`, `git fetch origin` e verificar mudanças/branches locais. Somente com worktree limpo e `main` confirmada, usar `git pull --ff-only origin main`. Nunca usar reset/force pull para substituir trabalho local.
- Quando a documentação desta ADR estiver aprovada/mesclada, pedir ao **Claude Opus** revisão final da arquitetura (sem editar código), com matrizes de casos legado × módulo × escopo, autorização por papel, concorrência, falhas/rollback e proposta de PR P0. **Não iniciar migrations nem consultas em produção.**
