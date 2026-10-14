# Raion CRM — Matriz Solo/Pro: escolhas A–D aprovadas

**Data:** 14/10/2026  
**Estado:** quatro escolhas comerciais A–D aprovadas pelo responsável pelo produto. Decisões complementares às **D1–D24**, sem renumeração, substituição ou reabertura das regras anteriores.  
**Natureza:** registro de produto, **não** autorização de implementação, migrations, alterações de banco/RLS, deploy, backfill, seed, execução de produção ou merge.

**Referências de decisão:** `docs/ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md` (D1–D12), `docs/DECISOES-D21-D24-DOWNGRADE-2026-10-14.md` (D21–D24, nesta branch), e decisões D13–D20 em seus registros de origem. O ADR da `main` consultada ainda não reproduz integralmente D13–D20; **não reconstruir redações ausentes por suposição**.

## 1. Novas escolhas explicitamente aprovadas

### A — Contratos e confirmação de venda no Solo

- **Aprovado:** o plano Solo inclui contratos básicos e possibilidade de confirmar o pagamento/encerramento da venda.
- Continua valendo o fluxo de venda contratada e as condições aprovadas de Pedido; não permitir que a ausência de Obras impeça indevidamente a criação de Pedido.
- **Não aprovado por implicação:** retirar proteção antifraude da confirmação, autoconfirmar pagamento, alterar causalidade de gamificação ou chamar "confirmação de pagamento" de gateway financeiro. O que é "contrato básico" versus recurso avançado precisa de descrição objetiva.

### B — Calculadora solar: mesmo motor em Solo e Pro

- **Aprovado:** os dois planos compartilham **o mesmo motor de cálculo e a mesma fonte técnica de verdade**; não manter engines independentes com fórmulas divergentes.
- Limites e eventuais funções de interface/configuração por plano **não foram aprovados** nesta escolha. Nenhuma execução de migrations da PR #101 fica autorizada.

### C — Históricos após downgrade

- **Aprovado:** registros históricos preservados de módulos que não estão disponíveis no Solo permanecem **consultáveis e exportáveis**, sem início de novas operações desses módulos.
- **Exceção expressa:** D5 e D23 preservam o direito de continuar e concluir **Obras existentes**, inclusive alterações necessárias conforme autorização e auditoria; não interpretar "sem novas operações" como proibição de encerrá-las.
- Acesso de consulta/exportação precisa obedecer ao isolamento multiempresa, aos papéis autorizados, à matriz de PII e à D17 (custos/margens/documentos financeiros restritos). Preservação física de dados não é concessão irrestrita de leitura.
- Não excluir registros nem histórico, nem restaurar acesso global a usuários suspensos.

### D — Administrador remanescente e conclusão de Obras

- **Aprovado:** no downgrade para Solo, o **único administrador ativo** pode assumir responsabilidades e concluir **Obras já existentes**, **mediante mecanismo de autorização adequado e histórico auditável**.
- Não criar novas Obras se o módulo não estiver habilitado, não cancelar/duplicar Obras, não reescrever autoria passada e não assumir atribuições automaticamente.
- O processo deve identificar responsabilidades de colaboradores suspensos e registrar a transição efetiva para o administrador ou a ação administrativa de continuidade.
- Não abrir acesso de SDR, operação ou outros papéis a informações comerciais/financeiras restritas; respeitar permissões/RLS em banco.

## 2. Matriz de decisões realmente fechadas (não confundir com propostas anteriores)

| Capacidade | Solo | Pro | Base da decisão |
| --- | --- | --- | --- |
| Usuários ativos | Exatamente 1 administrador, demais vínculos suspensos na empresa após downgrade | Múltiplos conforme contratação | D19 revisada |
| Leads e propostas | Incluídos | Incluídos | D19 revisada |
| Contratos básicos e confirmação de venda | Incluídos | Incluídos | Escolha A |
| Motor da calculadora solar | Mesmo motor técnico | Mesmo motor técnico | Escolha B |
| Pedido depois da venda concluída | Criado quando os eventos contratuais/comerciais definidos ocorrerem | Idem | D1–D12; condicionado aos marcos do negócio, nunca à compra de Obras |
| Novas Obras | Não disponíveis se o módulo não estiver habilitado | Dependem do módulo opcional habilitado e do escopo contratado | D3–D5, D19 |
| Obras já existentes | Continuidade e conclusão pelo administrador, respeitadas autorizações e auditoria | Continuidade conforme permissões | D5, D23 e escolha D |
| Históricos de módulos indisponíveis | Consulta/exportação autorizadas por papel, sem criar novas operações, salvo exceção de conclusão de Obras | Conforme papel e módulos | D17, D21–D23 e escolha C |

**Ainda não foi aprovada integralmente** a inclusão/exclusão, precificação e limites de outros recursos na matriz Solo/Pro (p. ex., gamificação, metas, comissões, distribuição de leads, gestão de equipes, painéis avançados, compras, engenharia, catálogo, templates e integrações). A tabela comparativa anteriormente apresentada era **proposta**, não uma autorização de todo o seu conteúdo.

## 3. Conflitos reais detectados na arquitetura atual

### Bloqueio 1 — Só um administrador no Solo × regra anti-autoconfirmação

A migration `supabase/migrations/20261001250000_gamificacao_pagamento_confirmado.sql` implementa a RPC `confirmar_pagamento` com proibição explícita de o responsável congelado na assinatura confirmar o próprio pagamento (linha ~262). A PR #113 ainda usa beneficiário e ator distintos na trilha causal de gamificação.

**Cenário:** o único administrador do Solo também é o responsável pela venda e assinatura; não há outro usuário ativo para confirmar o pagamento.

**Consequência:** a escolha A, **do modo como o código está**, não é plenamente executável neste cenário.

**Pendente de solução aprovada:** desenhar um fluxo de confirmação do Solo com validação e auditoria adequadas, preservando antifraude, imutabilidade, beneficiário e sem gerar pontuação artificial. Separar corretamente "recebimento declarado" de "validação independente" se necessário. **Não** simplesmente remover a trava SQL, inventar segundo usuário nem liberar autoconfirmação no fluxo atual.

### Bloqueio 2 — "Assumir" Obra como administrador × vínculo operacional

Na migration `supabase/migrations/20261008100000_obras_escrita_operacao.sql`, `atribuir_participante_obra` exige alvo ativo com `papel='operacao'` e setor habilitado (linha ~400), enquanto `autorizacao_setor_obra` permite escrita administrativa em fluxos a `admin` (linha ~112).

**Consequência:** o admin pode realizar ações administrativas em Obras, mas não se torna automaticamente um participante operacional formal pelo mecanismo atual. A escolha D exige definir como registrar assunção de responsabilidade e execução pelo administrador **sem falsificar papel, atribuição ou autoria** e sem criar novas permissões desnecessárias.

**Pendente de solução aprovada:** diferenciar formalmente transição de responsável e ação administrativa temporária de continuidade; especificar RPC, autorização, auditoria e testes negativos.

### Compatibilizações obrigatórias (não conflitos que revogam escolhas)

- **C × D5/D23:** a regra geral "histórico somente consulta/exportação" não bloqueia o trabalho necessário para terminar Obras existentes.
- **C × D17/RLS/PII:** exportação requer escopo de dados autorizado, jamais um dump bruto de tabelas/snapshots com dados de outros setores/empresas.
- **A × D20:** contratos básicos não dispensam autorização, justificativa e registro do acordo se o escopo mudar depois da assinatura.
- **B × PR #101:** motor único não equivale a aprovação de migrations pendentes ou catálogo ainda não integrado.
- **D × D19:** conservar só um admin ativo significa suspender acessos dos demais **na empresa**, sem apagar contas globais nem alterar vínculos em outras empresas.
- **D21/D22:** simulador e aceite de downgrade devem refletir estes impactos reais e revalidá-los antes da efetivação.

## 4. Pendências antes de autorizar implementação

**Bloqueantes para implementação funcional Solo/Pro:**
1. Resolver a confirmação de pagamento de uma venda cujo único admin é também o vendedor/beneficiário (antifraude e gamificação).
2. Desenhar atribuição/continuidade de Obras do Solo quando responsável anterior for suspenso, sem violar RLS/participações.
3. Definir o significado e alcance de **contrato básico**, incluindo funcionalidades e limites relativos ao Pro.
4. Completar a matriz de demais recursos/limites/módulos para que o motor de entitlements e o aviso de perdas não trabalhem com suposições.
5. Detalhar como executar consulta/exportação histórica por módulo de modo sanitizado e autorizado.

**Pendências operacionais e financeiras:**
6. Precisar o início do próximo ciclo de cobrança para D24, faturas já fechadas e pedido cancelado antes da efetivação; não presumir pró-rata.
7. Definir claramente acesso/solicitação por gestor com permissão especial, e seleção do único admin elegível, inclusive convites pendentes.
8. Definir o procedimento de upgrade futuro e reativação revisada dos vínculos/permissões suspensos, sem reativação automática perigosa.
9. Reconciliar documentação completa de D13–D20 (sem preencher textos não verificados), D21–D24 e esta matriz com o ADR mestre e a PR #167 antes de merge.
10. Confirmar backups e executar a auditoria de produção da D10 **apenas depois de autorização separada e verificações exigidas**; este documento não a concede.

## 5. Limites deste registro

Esta aprovação encerra **as quatro escolhas A–D** como decisões comerciais do produto, não encerra todos os detalhes técnicos da matriz e não autoriza desenvolver ou operar funcionalidades, alterar RLS/migrations, fazer merge ou aplicar produção.

**Alterações feitas por este registro:** somente documentação em branch. **Nenhuma alteração na `main`.**
