# RAION CRM — ESCOPO INTEGRAL E PLANO MESTRE DE PRODUTO

**Versão:** 3.0 — 15/10/2026  
**Estado:** inventário mestre inicial, sujeito a conferência funcional do produto; **não é declaração de que o levantamento do repositório terminou ou que as entregas estão prontas**.  
**Responsável por aprovar escopo, decisões de produto, merges e operações de produção:** responsável pelo Raion CRM.  
**Princípio:** **TUDO que pertence ao Raion deve estar no escopo mestre.** A priorização muda a ordem de execução, **não apaga módulos, pendências ou obrigações**.

> Este plano substitui as versões v1 e v2 como referência de **abrangência**. O documento v1 continua útil como histórico da entrega de segurança/Solo; a v2, como diagnóstico do fluxo calculadora → kit → proposta. Ambos são subconjuntos deste plano. Não declarar o Raion comercializável sem demonstrar os percursos relevantes de ponta a ponta.

## 1. O que sabemos e o que ainda precisamos confirmar

**Relatado pelo responsável em 15/10/2026:** a calculadora soma errado; a proposta sai em branco; não é possível concluir kit + proposta; o contrato ainda não está estruturado; falta onboarding; Obras não foi concluído. **Estas falhas têm precedência sobre percentuais otimistas de documentação antiga.**

**Verificado nos arquivos e no GitHub em 15/10/2026:** o código da `main` contém interfaces e bibliotecas para CRM, calculadora, propostas, contratos, captação, gamificação, Obras e configurações; o roadmap também prevê vários outros módulos. A presença de arquivos, testes ou telas **não prova** que a função está utilizável. As PRs #186, #188, #189, #190, #191 e #192 estavam abertas, em draft e sem merge no último levantamento desta versão. Não houve verificação funcional de todas as telas.

**Fontes de escopo consultadas:** `CLAUDE.md`, `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/ROADMAP.md`, `docs/ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md`, `docs/arquitetura.md`, `docs/regras-negocio.md`, `PROGRESS.md` (histórico), `HANDOFF.md` (histórico), `docs/HANDOFF-CLAUDE-2026-10-06.md` (histórico), estrutura de `src/app`, `src/lib`, `src/lib/acoes` e workflows, além do contexto mestre do projeto e dos relatos do responsável. Documentação de outubro pode estar desatualizada: verificar código, branches e comportamento antes de marcar como concluído.

**Critério de cobertura:** módulo, recurso, integração, requisito transversal, operação administrativa, plano comercial e dependência **entram no inventário mesmo se estiverem incompletos, bloqueados, só propostos ou sem prioridade imediata**. O desconhecido vira item explícito `A INVENTARIAR`; jamais desaparece do plano.

## 2. Registro integral de escopo (produto + plataforma)

**Legenda:** `FALHA REPORTADA` = não funciona no uso atual segundo responsável; `CÓDIGO EXISTE / VALIDAR` = arquivos/telas presentes, aceite real não comprovado; `PR PENDENTE` = desenvolvimento fora da `main`; `PLANEJADO` = decisão/documentação de produto, não implica implementação; `DEFINIR` = requisitos/decisões ainda por fechar.

### A. Plataforma, estrutura SaaS, usuários e infraestrutura

| ID | Frente integral | Subescopo mínimo a acompanhar | Situação-base |
|---|---|---|---|
| A01 | Multiempresa/isolamento | criação de empresa, empresa ativa, dados por `empresa_id`, RLS, isolamento, migração, integridade | CÓDIGO EXISTE / VALIDAR; segurança pendente |
| A02 | Identidade e acesso | login, recuperação/definição de senha, convites, ativação, sessão, saída, controle de acesso, permissões | CÓDIGO EXISTE / VALIDAR |
| A03 | Papéis, equipes, setores | admin, gestor, vendedor, SDR, `operacao`, super-admin; papéis futuros Engenharia/Administrativo; grupos, gerência, desativação, transferência | CÓDIGO EXISTE / VALIDAR; extensões PLANEJADAS |
| A04 | Planos e recursos Solo/Pro | limites, usuários, elegibilidade, módulos opcionais, UX por plano, upgrades/downgrades e preservação de histórico | PARCIAL / VALIDAR |
| A05 | Billing e assinaturas do SaaS | preços, planos, cobrança recorrente, gateway, webhooks, falha/retentativa, faturas, cancelamento, inadimplência, acesso | super-admin/cobrança existe; automação self-service PLANEJADA |
| A06 | Super-admin e suporte de plataforma | empresas, planos, usuários, cobrança, suporte e trilha de intervenções, sem furar RLS operacional | CÓDIGO EXISTE / VALIDAR |
| A07 | Onboarding guiado e primeiro uso | escolha de plano/módulos, empresa, identidade, equipe, catálogo, funil, modelos, primeira venda; Solo e Pro | **FALTA ESTRUTURAR** |
| A08 | Infraestrutura/CI/CD | Next, Supabase, Vercel, deploy, branches/PRs, migrations, compatibilidade preview-prod, ambientes | CÓDIGO EXISTE / VALIDAR |
| A09 | Backups e recuperação | PostgreSQL, Storage, B2, SHA256, Object Lock, Healthchecks, restauração testada, runbook | jobs executaram; conteúdo, retenção e pings **a comprovar** |
| A10 | Observabilidade e confiabilidade | logs, alertas, jobs, monitoramento, incidentes, erros, performance, capacidade, testes de restauração | PARCIAL / INVENTARIAR |
| A11 | Segurança, LGPD e governança | permissões, PII, arquivos, logs/auditoria, exclusão/retenção, acesso público, anti-fraude, revisão por release | CÓDIGO EXISTE; PRs #190/#191/#192 pendentes |
| A12 | Experiência transversal | navegação, mobile-first, acessibilidade, formulários, mensagens, estados vazios, desempenho, PWA, identidade carvão/dourado/off-white | CÓDIGO EXISTE / PARCIAL |
| A13 | Documentação, suporte e operação SaaS | ajuda, termos, política de privacidade, fluxos de suporte, treinamento, FAQ, documentação operacional | DEFINIR / INVENTARIAR |

### B. Captação, CRM comercial e produtividade

| ID | Frente integral | Subescopo mínimo a acompanhar | Situação-base |
|---|---|---|---|
| B01 | Aquisição e captura | fontes, formulários públicos, QR code, campanhas, indicação, integrações de leads | CÓDIGO EXISTE / VALIDAR |
| B02 | Contatos e clientes | cadastro, busca, telefone, dados cadastrais, deduplicação, histórico, anexos, permissões | CÓDIGO EXISTE / VALIDAR; deduplicação pendente |
| B03 | Negócios e funil comercial | criação/edição, pipeline configurável, Kanban/lista, status ganho/perdido, motivos, etapa, valor | CÓDIGO EXISTE / VALIDAR |
| B04 | Atribuição e distribuição | rodízio, fila do gestor, SLA/prazo, reatribuição, carteira, desligamento, transferência com aceite | CÓDIGO EXISTE; melhorias pendentes |
| B05 | Qualificação e SDR/handoff | qualificação, repasse, aceite/devolução, histórico, origem causal, delegação, regras por perfil | CÓDIGO EXISTE; PR #192 pendente |
| B06 | Tarefas, agenda e follow-up | tarefas, lembretes, compromissos, calendário Google, notificações, atrasos, leads/propostas parados | CÓDIGO EXISTE / VALIDAR |
| B07 | Documentos e arquivos comerciais | anexos, notas, registro de atividades, Storage privado, uploads, acesso por papel | CÓDIGO EXISTE / VALIDAR |
| B08 | Indicadores e gestão comercial | Início, painel, metas, funil, conversões, alertas, atribuições e resultados por equipe | CÓDIGO EXISTE / VALIDAR |
| B09 | Comunicação e integrações de vendas | WhatsApp `wa.me`, e-mail, Meta Ads/Google Ads e automações; regras de contato e registro | WhatsApp simples existe; integrações maiores PLANEJADAS |

### C. Motor técnico e formação da oferta solar

| ID | Frente integral | Subescopo mínimo a acompanhar | Situação-base |
|---|---|---|---|
| C01 | Calculadora solar | consumo, fatura/tarifa, localização, dimensionamento, fórmulas, resultados, arredondamentos, persistência, memória de cálculo | **FALHA REPORTADA: SOMA INCORRETA** |
| C02 | Dados solares e distribuidoras | municípios, concessionária/distribuidora, irradiância (PVGIS/NASA), tarifas ANEEL, origem manual/automática, atualização | PR #101 contém parte importante; PR pendente/antiga |
| C03 | Catálogo técnico | módulos, inversores, disponibilidade, fornecedores, status técnico, preços, importação CSV, validação de cadastro | EXISTE PARCIAL; PR #101 pendente |
| C04 | Compatibilidade e engenharia pré-venda | Voc frio, MPPT, corrente, inversor/módulo, limites técnicos, overload, regras aprovadas | PR #101 / REGRAS A VALIDAR; IA não define parâmetros |
| C05 | Kit solar e composição | criar, selecionar, dimensionar, listar itens/acessórios/serviços, quantidades, salvar, reabrir, editar, validar | **FALHA REPORTADA: FLUXO KIT→PROPOSTA NÃO FECHA** |
| C06 | Precificação e condições | custo equipamentos/serviços/frete/tributos, margem, desconto, impostos, condições comerciais, atualização e snapshot | PARCIAL / DEFINIR PARÂMETROS |
| C07 | Tipos de solução | fotovoltaico residencial/comercial, híbrido, baterias/BESS e futuras modalidades; catálogo/regra por tipo | PLANEJADO, prioridades técnicas a definir |
| C08 | Rastreabilidade do cálculo/kit | versões, origem dos dados, custos estimados históricos, vínculo negócio/proposta/pedido | PARCIAL; D11 aprovada para futuro Pedido |

### D. Propostas, contratos, venda e pagamentos

| ID | Frente integral | Subescopo mínimo a acompanhar | Situação-base |
|---|---|---|---|
| D01 | Modelos de proposta | identidade visual, blocos configuráveis, condições, inclusão de kit e cálculos, visualização, paginação | CÓDIGO EXISTE / VALIDAR |
| D02 | Proposta comercial real | montar conteúdo, preço, dados empresa/cliente, PDF, link público, salvar, enviar, histórico, versão | **FALHA REPORTADA: EM BRANCO** |
| D03 | Documentos configuráveis | modelos, campos, anexos, assinatura/versões, outros documentos comerciais/operacionais | PARCIAL / PLANEJADO |
| D04 | Contrato comercial | estrutura/cláusulas aprovadas, dados, escopo, valores, etapas, status, link público, consistência proposta | **FALHA REPORTADA: NÃO ESTRUTURADO** |
| D05 | Assinatura e versões | rascunho/aguardando/assinado, autoria, histórico de conteúdo, hash, reabertura auditada, assinatura eletrônica real | status manual existe; A+B+C PROPOSTA NÃO IMPLEMENTADA |
| D06 | Pagamento Pro | confirmar/estornar por autorizado, prova causal, ator e beneficiário, histórico, sigilo financeiro | EXISTE / VALIDAR; PR #190/#191 correções |
| D07 | Pagamento Solo | registro manual, correção, estorno, upgrade Solo→Pro, controle de permissões | PRs #186/#188/#189 pendentes |
| D08 | Estado comercial e passagem operacional | fechamento da venda, elegibilidade de Pedido, escopo contratado, auditoria, não gerar operações por dado incoerente | PARCIAL / DEPENDE DE PEDIDO |


#### D01 — Construtor visual de propostas por containers — decisão aprovada (16/10/2026)

- **Vínculo e momento:** evolução de **D01 — Modelos de proposta**, a executar **dentro de M4 — Propostas e documentos comerciais**, **depois** de estabilizar calculadora/kit/preço (M2–M3) e de reproduzir/corrigir a falha da proposta comercial (D02). É **registro de produto aprovado / implementação não iniciada**, sem antecipação do marco ou criação de frente paralela.
- **Reaproveitamento obrigatório:** partir do construtor já existente em `/configuracoes/propostas/modelos/[id]`, da biblioteca de **42 tipos** em `src/lib/propostas/blocos.ts`, do editor de configuração, da geração/preview de PDF, das tabelas `proposta_modelos` e `proposta_modelo_blocos` e de seus campos `tipo`, `ordem`, `ativo`, `quebra_pagina`, `config`. Não criar um segundo motor de modelos/PDF nem refazer o domínio.
- **Experiência aprovada:** mostrar a **biblioteca de containers** separada da **estrutura da proposta em edição**; apresentar containers como cartões visíveis e identificáveis; permitir **ativar/desativar sem perder conteúdo**, **arrastar e soltar (drag-and-drop)** para reorganizar livremente, e **abrir a edição individual** de cada container (preferencialmente painel lateral), exibindo somente opções adequadas ao tipo. Prever uso acessível por teclado e mobile. Preservar configurações de paginação e prévia do PDF com a sequência real.
- **Liberdade de composição:** o administrador escolhe quais blocos entram, em qual ordem e com qual conteúdo permitido. O container **Valor total da proposta** pode ficar **no início, no meio ou no final**; não fixar sua posição. Em propostas com valor, preservar a obrigatoriedade atual de bloco de investimento ativo para publicação. Tratar explicitamente os modos de preço sem inventar valores.
- **Edição por natureza do dado:** conteúdo institucional e livre (textos, listas, títulos, imagens permitidas, diferenciais, garantias) é personalizável pelo administrador; gráficos, equipamentos, geração, consumo, economia e **valor da proposta** continuam originados das fontes técnicas/comerciais autorizadas, sem valores manuais substituindo cálculos. Estilos/apresentações editáveis quando suportados, sem editor livre tipo Canva.
- **Papéis e ciclo:** administrador da empresa configura, revisa, pré-visualiza e publica seus modelos; vendedor escolhe modelo publicado ao gerar a proposta e só altera campos da negociação que suas permissões permitirem. Preservar RLS e isolamento por empresa. Reavaliar no M4 o fluxo **rascunho → publicação/revisão**, pois hoje existem ações de edição de modelo que não verificam estado publicado.
- **Integridade de emissão (D02):** `blocos_emitidos` já congela **estrutura/configuração** escolhida quando a proposta é criada, mas a rota de PDF ainda consulta **dados do cálculo ao vivo**. Portanto **não declarar hoje que a proposta inteira é imutável**. Corrigir snapshot/versão de valores/kit e coerência PDF × link público como parte de D02/M4, preservando documentos emitidos ao alterar modelos e dados posteriormente.
- **Aceite funcional de D01 em M4:** administrador consegue selecionar, editar, ativar/desativar e reordenar containers (incluindo preço no começo e no fim), salvar e reencontrar a mesma ordem/configuração; a prévia e o PDF gerado correspondem ao modelo publicado, sem seções vazias indevidas; vendedor seleciona somente modelos válidos; as informações automáticas conferem com o negócio/kit; documentos já emitidos não são alterados por revisão posterior. Testar permissões, diferentes empresas, mobile, teclado e regressão das propostas antigas.
- **Escopo e autorização:** **somente planejamento/documentação agora**; nenhuma mudança de tela, código, banco, migration, produção ou merge está autorizada por esta decisão. Na implementação futura, priorizar reaproveitar o armazenamento existente; qualquer nova RPC/migration para ordenação atômica, versionamento ou segurança exige análise e autorização próprias. Separar correção funcional de D02 da melhoria de UX de D01 em entregas verificáveis.

#### Leitura inteligente de documentos pessoais — escopo futuro aprovado (16/10/2026)

- **Vínculo:** M4 — Propostas e documentos comerciais, integrado ao cadastro de contatos/clientes (B02), aos anexos protegidos (B07), aos documentos configuráveis (D03) e à preparação de contratos (D04). **Status: PLANEJADO / BACKLOG FUTURO**; não iniciar a implementação durante a etapa atual da calculadora e das propostas.
- **Entrada:** cliente ou operador poderá anexar **CNH, RG ou CIN** em PDF (com texto ou digitalizado) ou imagem/foto (por exemplo JPG/PNG). **Preenchimento manual permanece sempre disponível**, inclusive quando a leitura automática não funcionar.
- **Extração assistida:** reaproveitar, quando implementado e autorizado, o serviço de leitura inteligente previsto para a conta de energia; identificar apenas os campos cadastrais necessários e efetivamente presentes (por exemplo nome completo, CPF, data de nascimento e número do documento), indicar campos ausentes/incertos e permitir conferência e correção antes de salvar ou utilizar em contratos. Não repetir preenchimentos já conferidos no CRM sem necessidade.
- **Limites:** OCR/IA e extração de texto **não comprovam autenticidade documental nem identidade**; nunca indicar “documento validado” sem verificação específica. Não inventar dados e não preencher automaticamente campos de baixa confiança.
- **Segurança e privacidade:** LGPD, minimização de dados, acesso por papel e empresa, Storage privado, controle de compartilhamento, logs adequados, retenção e exclusão. **Documentos pessoais reais não devem ser enviados a provedores externos de IA sem revisão jurídica/de privacidade e autorização específicas.**
- **Aceite futuro:** fluxo PDF + foto + manual demonstrado com documentos sintéticos/anonimizados; reconhecimento auditável, confirmação humana e integração ao cadastro/contrato sem afetar registros anteriores. Planejar e autorizar arquitetura, custos e eventual migration antes de desenvolver.


### E. Gamificação, metas e incentivos

| ID | Frente integral | Subescopo mínimo a acompanhar | Situação-base |
|---|---|---|---|
| E01 | Motor causal de eventos | ações→eventos→point_ledger, antifraude, deduplicação, reversões, origem SDR/closer | CÓDIGO EXISTE / VALIDAR; segurança PRs |
| E02 | Experiência dos participantes | XP, moedas, níveis, conquistas, jornada, ranking, extrato, perfil histórico | CÓDIGO EXISTE / VALIDAR |
| E03 | Recompensas e loja | catálogo, imagem, saldo, resgates, aprovação, auditoria | CÓDIGO EXISTE / VALIDAR |
| E04 | Metas e comissões | metas por empresa/equipe/pessoa, cálculo causal, comissões versionadas, contestação e histórico | CÓDIGO EXISTE / VALIDAR |
| E05 | Painéis e UX da gamificação | visão gerencial e pessoal, todas as subpáginas, responsividade/tema, consistência visual | PARCIAL / VALIDAR |

### F. Pedido, pós-venda, engenharia, compras e execução

| ID | Frente integral | Subescopo mínimo a acompanhar | Situação-base |
|---|---|---|---|
| F01 | Pedido | entidade, numeração por empresa, itens da venda, histórico, idempotência, geração da venda válida, PII | ADR D1–D12 aprovada; implementação NÃO AUTORIZADA |
| F02 | Módulos opcionais e escopo da venda | empresa habilita Obras, `com_execucao`/`sem_execucao`, legado, mudanças auditadas, ativação posterior | ADR APROVADA / NÃO IMPLEMENTADA |
| F03 | Pós-venda administrativo | documentos, NF cliente, garantia de equipamentos, pendências, responsáveis, status, histórico | PLANEJADO |
| F04 | Engenharia | projeto técnico, concessionária, protocolo/homologação, arquivos, pendências, aprovações, visão própria | PLANEJADO/PARCIAL |
| F05 | Compras, estoque e logística | lista de materiais do kit/pedido, fornecedores, cotações, pedido de compra, NF, custo real, entrega/recebimento | PLANEJADO |
| F06 | Obras — motor | criação condicional, vinculação Pedido, estados, setores, participantes, permissões, marcos, histórico | CÓDIGO EXISTE / PARCIAL |
| F07 | Obras — Gestão | tarefas/atribuições, controle operacional, riscos, pendências, orçamento, custo e intervenções | CÓDIGO EXISTE / PARCIAL |
| F08 | Obras — Apresentação / OPR | lista, detalhe, progresso fundado, Gantt, semáforo/SLA aprovados, prazos e dados reais, PDF | CÓDIGO EXISTE / DADOS INCOMPLETOS |
| F09 | Execução de campo | agendamento, instalação, fotos, terceiros, diário/atualizações, conclusão de marcos | PARCIAL / PLANEJADO |
| F10 | Vistoria, homologação e entrega técnica | checklist, documentos técnicos, vistoria, aceite, garantia de instalação, entrega | PLANEJADO |
| F11 | Agenda operacional | agendas por equipe/obra, instalação/vistoria, alocação, sincronizações | PLANEJADO |
| F12 | Custos e controles operacionais | estimativa histórica vs orçamento vs custo real, margem, relatórios, autorização financeira | ADR APROVADA PARCIALMENTE / NÃO IMPLEMENTADA |
| F13 | Múltiplas obras/escopos futuros | caso de múltiplas obras por pedido, manutenção, BESS, integração técnica específica | PLANEJADO / EVOLUÇÃO |

### G. Produto SaaS, canais, crescimento e operações

| ID | Frente integral | Subescopo mínimo a acompanhar | Situação-base |
|---|---|---|---|
| G01 | Landing e pré-cadastro Raion | site público, formulário Netlify Forms, domínio, mensagens, métricas, leads, integração futura | em desenvolvimento fora do app CRM; INVENTARIAR |
| G02 | Jornada de aquisição SaaS | site→plano→compra→webhook→empresa→e-mail→senha→onboarding→uso | PLANEJADO; gateway não implementado |
| G03 | Estratégia de preços e comercialização | planos Solo/Pro, limites, implantação, usuários operacionais, testes de preço e contrato comercial | HIPÓTESES, NÃO PREÇOS FINAIS |
| G04 | Ambiente demo e demonstração | empresa separada, dados fictícios causais, imagens/fluxo demo, script e governança de seed | demo relatada em produção; PR #132 pendente |
| G05 | Relatórios/BI/exports | indicadores empresariais, métricas de funil, operações, faturamento, exports e auditoria | INVENTARIAR requisitos e lacunas |
| G06 | Integrações e automações | Google Agenda, Meta/Google, e-mail, WhatsApp, assinatura eletrônica, APIs/integrações externas, IA documental | parcialmente existentes/PLANEJADAS |
| G07 | Aplicação móvel e acessibilidade | responsividade, PWA, notificações, acessibilidade, dispositivos e rede ruim | PARCIAL / INVENTARIAR |
| G08 | Suporte, manutenção e sustentabilidade | onboarding assistido, atendimento, SLA do produto, incidentes, monitoramento custos, termos, LGPD | DEFINIR / INVENTARIAR |

**Total do registro inicial:** 13 frentes A + 9 B + 8 C + 8 D + 5 E + 13 F + 8 G = **64 frentes**, cada qual com subcapacidades próprias. Não interpretar a contagem como número final de tarefas: o diagnóstico pode adicionar itens sem apagar os existentes.

## 3. Jornada íntegra que o Raion deverá demonstrar

1. **Aquisição:** chegar lead por captura/integração e atribuí-lo corretamente.
2. **Comercial:** qualificar, acompanhar contato/negócio, SDR→vendedor, tarefas, reunião, visita, etapas e relatórios.
3. **Oferta técnica:** informar fatura/consumo e localização → dimensionamento tecnicamente correto → catálogo válido → kit completo → custo/preço comercial coerente.
4. **Proposta:** gerar documento completo com valores, equipamento, dados da empresa e cliente; visualizar, enviar, rastrear e recuperar sem ficar em branco.
5. **Contrato:** gerar a partir da venda, com conteúdo estruturado, estados, autoria e rastreabilidade; evoluir assinatura/versionamento conforme decisão aprovada.
6. **Pagamento:** Pro e Solo com suas regras próprias, sem permitir fraude, duplicidade, vazamentos ou correção silenciosa do histórico.
7. **Pedido:** venda elegível abre exatamente um Pedido; Obras somente se habilitadas e contratadas, preservando legados.
8. **Operação:** documentos, engenharia/concessionária, compras/logística, agenda, instalação, vistoria, entrega, pendências, custos e histórico.
9. **Gestão:** metas, comissões, gamificação, painéis e indicadores conciliados com os eventos reais.
10. **SaaS:** empresa nova realiza escolha de plano e onboarding; equipe acessa apenas dados permitidos; plataforma tem cobrança, suporte, monitoramento e recuperação.

**A jornada só é considerada completa quando houver demonstração funcional.** Ter tabela, página, endpoint ou teste isolado não basta.

## 4. Plano de execução sequencial — sem excluir escopo

O objetivo de um **plano fechado** é ordenar as entregas, não fingir que os 64 itens já possuem diagnóstico ou estimativas precisas. Cada marco tem subtarefas e aceite; o início de um marco não autoriza executar mudanças de produção ou decisões de produto não aprovadas.

| Marco | Entrega verificável | Pré-requisito / limite de encerramento |
|---|---|---|
| **M0 — Inventário funcional integral** | Conferir cada linha do §2 com código, interface, banco, documentação e pendências; produzir matriz `funciona / falha / parcial / planejado / não verificado`, PR e critério de aceite. Registrar todas as descobertas. | Nenhum módulo some por “fora do MVP”. Deve existir dono da decisão e backlog por item. M0 é diagnóstico, não refatoração ampla. |
| **M1 — Fechar segurança e pagamentos já em PR** | Resolver M1 de beneficiário, revisar #190/#191/#192, comprovar backups; planejar e obter autorizações para implantação. Concluir #186/#188/#189 (Solo) sem regressões. | Aceite de operações seguras, commits/CI, migrations reais, produção somente mediante autorização, demonstração do Solo/Pro. |
| **M2 — Calculadora e parâmetros confiáveis** | Reproduzir soma errada, conferir regras técnicas autorizadas, referência faturamento/consumo/localização/tarifa, salvar/refazer cálculos sem diferença. | Casos de referência e tolerâncias aprovados pelo responsável. |
| **M3 — Catálogo, fornecedores, motor e kit** | Conferir PR #101 versus main; completar catálogo, dados solares/concessionárias e compatibilidade; construir kit com itens, quantidade, custo e preço corretos. | Testes de combinação e demonstração salvar/editar/reabrir kit. |
| **M4 — Propostas e documentos comerciais** | **Primeiro D02:** corrigir proposta em branco e garantir kit/valor, PDF, link, versão e histórico coerentes. **Depois D01:** aprimorar o construtor existente com containers visíveis, ativação/desativação, drag-and-drop livre (inclusive preço em qualquer posição), edição individual e prévia; sem novo motor. | Gerar proposta real completa e compará-la numericamente com o kit; validar a composição dos modelos, permissões e que alterações posteriores não modifiquem propostas emitidas. |
| **M5 — Contratos, assinatura e fechamento de venda** | Estruturar documento, cláusulas, escopo e conteúdo; estados e autoria, preservar evidências e ligar corretamente ao pagamento. Analisar proposta A+B+C para decisão de versão/assinatura real. | Contrato preenchido e coerente com proposta; nenhuma assinatura falsa ou campo essencial em branco. |
| **M6 — CRM comercial e produtividade completos** | Fechar pendências de captura, contato, negócios, funil, rodízio, qualificação, handoff, tarefas, Google Agenda, alertas, anexos, relatórios e permissões comerciais. | Cenário comercial completo sem banco/manualidades, inclusive troca de responsável e SDR. |
| **M7 — Gamificação, metas e comissões** | Conferir causalidade, pontuação, estornos, ranking, loja, metas, comissões, painéis e todas as telas, inclusive mobile. | Pontos e valores reproduzíveis a partir de ações, sem desvio multiempresa. |
| **M8 — Pedido e regras de módulos opcionais** | Implementar ADR D1–D12 após revisão arquitetural, habilitação por empresa, escopo, legado e Pedido idempotente. Reconciliar PR #167. | Venda qualificada gera Pedido; Obras condicional; histórico e permissão intactos. |
| **M9 — Pós-venda e Engenharia** | Obrigações/documentos comerciais, engenharia, concessionária, projeto, protocolos, homologação, históricos e permissões setoriais. | Pedido transita por pós-venda e engenharia sem planilha paralela obrigatória. |
| **M10 — Compras, logística e controle de custos** | Itens vindos do kit, fornecedor, pedido de compra, recebimento, nota, orçamento × realizado, custeio sem duplicação. | Material pode ser adquirido, recebido e rastreado por Pedido/Obra. |
| **M11 — Obras e campo completos** | Motor/RPCs, gestão, OPR com dados reais, equipes, programação, fotos, marcos, indicadores, vistoria, entrega e garantia. | Obra realista percorre criação → execução → vistoria → entrega e é auditável. |
| **M12 — Onboarding e administração SaaS** | Primeiro uso Solo/Pro, módulos opcionais, empresa, papéis, catálogo e modelos, fluxo assistido, billing/plano/limites, suporte e recuperação. | Empresa nova consegue se configurar e executar venda sem intervenção do desenvolvedor; regras de plano comprovadas. |
| **M13 — Integrações, canais e automações** | Landing/pré-cadastro, captura de leads, e-mail/WhatsApp, Google/Meta, assinatura real, IA documental onde autorizada, APIs e agenda operacional. | Cada integração aprovada funciona, tem tratamento de erros e limites definidos; integrações apenas propostas permanecem explicitamente registradas. |
| **M14 — Qualidade transversal e escala** | UX/identidade, mobile/PWA, acessibilidade, observabilidade, LGPD, logs, backups/restauração, performance, cenários multiempresa, base demo, suporte e documentação. | Requisitos operacionais críticos comprovados e riscos residuais documentados. |
| **M15 — Jornada integrada e pilotos** | Exercitar caminhos Solo e Pro, incluindo comerciais e operacionais aplicáveis, dados reais/simulados seguros, correção dos defeitos impeditivos e decisão comercial. | Só aqui avaliar disponibilidade para comercialização, com checklist por fluxo. |

**Dependências cruzadas:** algumas tarefas de segurança, onboarding mínimo e qualidade acontecem como critérios de aceite de cada marco sem antecipar o marco inteiro. **Os marcos M0–M15 não eliminam nenhum item do §2**. A ordem deve ser modificada só por decisão explícita e registrada, sem abrir trabalhos laterais automaticamente.

## 5. Padrão obrigatório para encerrar qualquer funcionalidade

Cada frente do §2 precisa ter uma ficha rastreável, com:

1. **Identificador** (A01…G08), módulo, dono da decisão, status `não verificado | planejado | parcial | bloqueado | pronto funcionalmente | entregue produção`.
2. **Comportamento esperado** escrito pelo negócio — incluídos casos normais, limites, erro, auditoria e exceções.
3. **Local no projeto:** páginas, actions, bibliotecas, migrations/RPCs, testes, configurações, PRs abertas e integrações.
4. **Demonstração obrigatória:** cenário de usuário executável do início ao fim; capturas/vídeo quando relevante, conferência de persistência e dos documentos resultantes.
5. **Proteção de dados:** papéis, multiempresa, fontes autorizadas, não exposição de custos ou PII, ações auditáveis.
6. **Aceite técnico:** testes específicos e de regressão + lint/typecheck/build/CI pertinentes; migração/deploy separados por autorização.
7. **Aceite funcional:** responsável verifica o resultado no produto. `CI verde` sozinho não muda o status para “pronto”.
8. **Pendências conhecidas:** bugs, dívida técnica, integrações, melhorias futuras, decisões de produto, dependências — **nenhuma é removida sem justificativa e aprovação**.

## 6. Regra absoluta contra desvio e contra omissão

- **Tudo no inventário; somente um marco de implementação ativo por vez.** Ter item listado não significa abrir a implementação dele agora.
- Cada bug/ideia nova deve ser associado à frente existente ou registrado como **nova frente** com ID, origem, classificação e impacto. Não sumir com demandas.
- **Não criar nova PR nem refatoração ampla fora do marco ativo** sem aprovação explícita. Uma vulnerabilidade crítica comprovada pode criar uma exceção pontual com escopo e aceite objetivos.
- Não chamar algo de concluído por estar em produção, por UI visível, por ter sido marcado em documentação antiga ou por CI verde: exigir aceite funcional.
- Não transformar propostas em decisões silenciosamente. Exemplos: fórmulas solares, margens, preços Solo/Pro, assinatura eletrônica, políticas de reabertura, SLAs, pesos de progresso e status de Obras precisam de aprovação antes de implementação.
- Migrations e deployments em produção somente pelo fluxo de autorizações específicas e backups verificados. Preview Vercel pode utilizar produção; não usá-la como banco de testes.
- **Nada de “fora do escopo” no Plano Mestre.** Algo pode estar `planejado para depois`, `dependente de decisão`, `não priorizado` ou `a inventariar`, mas permanece visível no mesmo registro.
- Mudança de escopo, exclusão, fusão de itens ou mudança da ordem exige atualização versionada e aprovação do responsável.

## 7. O que ainda não posso afirmar

- Não foi feita execução end-to-end no navegador de **todas** as 64 frentes, nem leitura de todos os arquivos do repositório. Portanto esta é uma **cobertura inicial ampla e explícita**, não uma promessa de que nenhum requisito desconhecido existe.
- Percentuais de `docs/ROADMAP.md` são datados de 06/10/2026 e não validam qualidade. O próprio responsável reportou falhas centrais.
- Não foi confirmada a implantação de todas as migrations e nem a prova completa dos backups B2/Healthchecks.
- Itens como preços, gateway, modalidades técnicas, escopo de integrações, política de assinatura eletrônica, documentação jurídica e SLA seguem como decisões pendentes — não preenchi lacunas com valores inventados.

**Fechamento do levantamento:** M0 deve produzir o inventário detalhado de todas as páginas, rotas, componentes, funções/RPCs, dados e PRs, mapeado para os IDs acima, com lista `SOBRE O QUE NÃO SABEMOS`. Só depois de revisar isso com o responsável se deve **congelar a baseline integral** para controle de entrega. Ao longo do desenvolvimento, qualquer descoberta entra como alteração rastreada, nunca como surpresa descartada.

## 8. Próxima ação única

**Primeiro:** concluir a execução já autorizada do Sonnet sobre M1 de segurança (PR #191) sem interrompê-la, se ainda estiver em andamento; depois obter seu resultado. **Em seguida:** usar Sonnet em modo **somente leitura** para fechar o inventário M0 das 64 frentes e localizar funcionalidades/bugs não listados, incluindo PR #101 e o módulo Obras real. Submeter inventário para aprovação antes de iniciar qualquer nova implementação. **Opus somente para controvérsia arquitetural real ou revisão de segurança de liberação.**

Este documento é a referência de escopo integral. Prioridades e marcos podem ser detalhados depois, mas nada deve desaparecer da visão do produto.