# Raion CRM — D21–D24: transparência e confirmação de downgrade

**Data da aprovação:** 14/10/2026  
**Estado:** D21, D22, D23 e D24 **aprovadas por Evandro** como decisões de produto.  
**Natureza:** registro documental complementar, **sem autorização de implementação**, migrations, alterações em produção, merge, seed ou backfill.

## Escopo e precedência

Este registro complementa, **sem substituir nem reabrir**, as decisões D1–D20. Em especial:

- **D5 — Obras:** desabilitar o módulo impede novas Obras, mas não apaga, cancela nem impede concluir Obras existentes; acesso e edição seguem os papéis já autorizados.
- **D17 — dados financeiros:** não ampliar leitura de custos, margens, estimativas financeiras ou documentos financeiros; SDR permanece sem acesso a dados financeiros internos.
- **D19 revisada — Solo/Pro:** upgrade Solo → Pro permite selecionar módulos; downgrade Pro → Solo mantém **um administrador ativo** com gestão de leads e geração de propostas, suspende os demais acessos de usuários na empresa e preserva dados, configurações e históricos. Downgrade comercial não se confunde com desativação voluntária de módulo.
- **D20 — alteração de escopo pós-assinatura:** autorização, justificativa e documentação do acordo contratual; preservar escopo original, trilha histórica e Obras existentes.

**Observação documental:** o ADR `docs/ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md` disponível na `main` consultada ainda consolidava D1–D12. Este arquivo não pretende reconstruir ou alterar a redação completa de D13–D20. Essa consolidação deve ser conciliada com as aprovações originais antes de atualizar o ADR principal.

## Decisões aprovadas

### D21 — Transparência obrigatória do impacto

**Aprovada.** Antes da confirmação, apresentar uma comparação **personalizada para a empresa** entre plano atual e plano pretendido, com:

1. Funcionalidades e módulos que permanecem disponíveis e os que ficarão indisponíveis, distinguindo **perda de acesso** de **preservação dos dados**.
2. Usuários afetados, quantidade de acessos a suspender e indicação do administrador que permanecerá ativo.
3. Pedidos e Obras em andamento, responsáveis potencialmente afetados e riscos de continuidade operacional.
4. Informações sobre histórico/dados/configurações preservados e sobre o acesso posterior, conforme a matriz de cada recurso.
5. Valor atual, novo valor, impacto financeiro e data prevista de vigência.

Informações exibidas como impacto efetivo precisam vir de dados reais autorizados da empresa, não de números fictícios ou avisos genéricos.

### D22 — Confirmação e autoridade

**Aprovada.** O fluxo de downgrade é autorizado somente ao **administrador da empresa** ou **super-admin Raion devidamente autorizado**. **Gestor sem permissão específica não pode efetivá-lo.** O fluxo exige:

1. Escolha explícita do **único administrador que permanecerá ativo** no Solo.
2. Aceite expresso de ciência dos impactos em usuários, recursos/dados e operações/cobrança.
3. Registro auditável da identidade que solicitou/confirmou e das condições apresentadas.
4. Respeito ao isolamento por empresa e às autorizações reais no banco. A suspensão dos demais usuários deve afetar os **vínculos/acessos dessa empresa**, não excluir contas globais ou outros vínculos empresariais.

**Detalhe residual:** a condição exata de um *gestor com permissão específica* para solicitar/visualizar ou efetivar o downgrade precisa de definição explícita. Não inferir concessão de escrita pelo texto acima.

### D23 — Continuidade operacional e Obras preexistentes

**Aprovada.** Durante o downgrade:

1. Preservar Obras existentes e seus históricos, sem cancelar, apagar ou recriar automaticamente.
2. Identificar Obras em andamento cujos responsáveis serão suspensos.
3. Exigir um **encaminhamento de continuidade autorizado**, sem transferência automática de responsabilidade, autoria ou participação.
4. Manter a proteção da D5 para as Obras já existentes; não criar novas Obras quando o novo plano não habilitar o módulo.
5. Não ampliar permissões de operação, RLS ou acesso financeiro só porque restará um administrador ativo.

**Detalhe residual:** especificar operacionalmente como o administrador remanescente conclui fluxos pendentes quando colaboradores são suspensos, garantindo a continuidade autorizada **sem** quebrar a matriz de papéis/PII vigente.

### D24 — Vigência e cobrança do downgrade

**Aprovada.** O downgrade deve:

1. **Entrar em vigor no próximo ciclo de cobrança**, não imediatamente.
2. Manter o plano contratado até a data efetiva indicada ao cliente.
3. Informar antes da confirmação a data de mudança, o preço atual, o futuro e as condições financeiras relevantes.
4. Permitir **cancelar a solicitação pendente** antes da efetivação.
5. **Não presumir cobrança proporcional (*pró-rata*) na V1.**

**Detalhe residual:** definir de modo inequívoco o que determina o início do próximo ciclo, especialmente enquanto o Raion tem cobrança/fechamento mensal operados manualmente.

## Prévia e confirmação — requisitos derivados para especificação técnica futura

A interface final deve explicar as perdas de funcionalidades em termos concretos, indicar usuários e operações reais afetados, exigir confirmação não genérica e guardar um resumo versionado das condições aceitas. No momento da efetivação, o servidor deve revalidar autorizações e impactos relevantes; alterações materiais desde o aceite exigem nova avaliação/ciência. O processamento precisa ser auditável, idempotente e evitar estados parciais entre plano, cobrança e acessos.

Estes são **critérios para projeto e validação**, não autorização de código, migration, deploy ou merge.

## Pendências residuais (não resolvidas por D21–D24)

1. **Matriz comercial Solo/Pro:** relação final de recursos, módulos opcionais, limites, permissões de leitura/escrita e diferenças entre plano e habilitação voluntária por empresa. Sem isso, não existe cálculo de perdas exato.
2. **Obras em execução e equipe suspensa:** fluxo de continuidade, reassociação voluntária de responsáveis, papéis/PII e eventual bloqueio de efetivação quando não houver responsável apto — sem alterar a D5.
3. **Ciclo de cobrança:** critério para data de virada, tratamento de faturas/fechamentos já emitidos, e comportamento da solicitação agendada e seu cancelamento; o módulo atual é manual, sem gateway.
4. **Autoridade do gestor:** se pode somente visualizar e solicitar avaliação ou também efetivar com permissão específica; nenhuma ampliação tácita.
5. **Seleção do administrador único:** casos de múltiplos admins atuais, ausência de admin elegível, convites pendentes e preservação de acesso a outras empresas.
6. **Acesso a dados preservados fora de Obras:** para cada módulo exclusivo do Pro, definir se há consulta, exportação, bloqueio de novas operações ou read-only.
7. **Upgrade posterior e reativação:** data de efetivação, cobrança, escolha de módulos, usuários e permissões a restaurar; não reativar direitos perigosos silenciosamente.
8. **Consolidação documental:** reconciliar D13–D20 e D21–D24 no registro mestre, sem inventar texto para decisões não verificadas e sem misturar isso com a PR #167 desatualizada.

## Critérios de não execução

- Aprovação destas decisões é **exclusivamente de produto**.
- **Nenhuma** migration, alteração de RLS, implementação de planos, modificação de cobrança, operação em produção ou merge está autorizada.
- Revisar e autorizar separadamente qualquer PR futura; seguir as práticas de CI, backups, revisão de segurança e autorização específica de produção já estabelecidas no projeto.
