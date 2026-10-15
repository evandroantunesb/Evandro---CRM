# Roadmap de produto — Raion CRM

Visão consolidada do produto. **Última atualização do escopo de Obras: 2026-10-13.** Os percentuais e demais estados da tabela são estimativas anteriores e precisam de revisão para refletir todas as entregas recentes. Percentuais são estimativas aproximadas para orientar prioridade, não medições. Estado detalhado e PRs em `docs/PROJECT_STATUS.md`.

Legenda da coluna Situação: **produção** = mesclado na `main` e em produção · **branch** = implementado em PR ainda não mesclada (não está na `main` nem em produção) · **—** = roadmap, não iniciado ou só esboçado.

## Indicadores gerais

- **MVP comercial atual:** ~79%
- **Produto completo (considerando o roadmap):** ~58%

## Progresso por módulo

| Módulo | Progresso | Situação |
| --- | --- | --- |
| CRM Comercial | 85% | produção |
| Calculadora Solar | 72% | produção: calculadora, kit e proposta · **branch (PR #101):** motor de dimensionamento reconciliado no wizard de 3 etapas |
| Catálogo Técnico | 75% | **branch (PR #101):** parte relevante do avanço — catálogo de equipamentos, dados solares, tarifas ANEEL, municípios/distribuidoras (13 migrations pendentes); não está na `main` nem em produção |
| Propostas | 50% | produção |
| Gamificação | 88% | produção: motor, dashboards gerencial/pessoal, menu e tema escuro e imagem nas recompensas (#130, #131, #136–#139) |
| Interface/UX geral | 55% | produção |
| Base Demo | 85% | **produção:** empresa separada "Raion Solar Demo" criada e validada (35 negócios, ranking conferido) · **branch (PR #132):** script ainda não mesclado |
| Segurança/Produção | 70% | produção |
| Onboarding | 15% | — |
| Tipos de Solução | 10% | — |
| Pós-venda/Obras | 8% | — |
| Engenharia | 5% | — |
| Administrativo/Pós-vendas | 5% | — |
| Documentos configuráveis | 5% | — |
| Concessionárias | 10% | — |
| Agenda Operacional | 15% | — |
| Integrações/Automações | 15% | — |

## Roadmap operacional futuro

Fluxo completo do cliente:

```
Aquisição → CRM Comercial → Venda → Pedido → Pós-venda/Engenharia → Compras → Obra → Vistoria → Entrega
```

### Pedido

- Quando houver **negócio ganho + contrato assinado + pagamento confirmado**, o sistema cria automaticamente um **Pedido** vinculado ao negócio original.
- O negócio comercial permanece preservado para histórico, faturamento, comissão e gamificação.
- O Pedido passa a ser a entidade operacional de Pós-vendas/Engenharia.

### Compras

Módulo ligado ao Pedido, acessível principalmente por Pós-vendas, Admin e Gerência. Deve prever:

- produtos/materiais;
- quantidade;
- fornecedor;
- custo previsto;
- custo real;
- pedido de compra;
- nota fiscal;
- status;
- previsão de entrega;
- recebimento.

Idealmente pré-preenchido a partir do kit vendido.

### Pós-venda / Engenharia / Obras

Etapas e registros previstos:

- documentação;
- projeto técnico;
- homologação;
- material/logística;
- material entregue;
- instalação agendada;
- instalação;
- vistoria;
- entrega técnica;
- finalização;
- timeline/auditoria.

Frentes paralelas: **Engenharia**, **Material**, **Instalação**, **Vistoria** e **Entrega**.


### Obras — modos Gestão e Apresentação (escopo aprovado em 2026-10-13)

**Objetivo:** acompanhar a mesma obra em modo operacional (**Gestão**) e modo executivo, limpo, para reunião diária (**Apresentação**). O mockup de Apresentação aprovado em conversa é referência conceitual: poucos elementos, menos cores, indicadores sucintos, cronograma Gantt estilo construtoras e resumo financeiro. Não representa dados reais nem funcionalidade já entregue.

**Disponibilidade da obra e do relatório**
- Ao concluir a venda com **negócio ganho, contrato assinado e pagamento confirmado**, a obra deve ficar disponível, junto com os dois modos de visualização, mesmo antes de haver orçamento, prazos e execução informados.
- Auditar previamente o fluxo atual de geração de obra, Pedido e gatilhos de pagamento/contrato (incluindo a função garantir_obra); preservar idempotência e evitar obras duplicadas.
- Dados inexistentes aparecem como **“a definir”**, **“não informado”** ou **“sem orçamento”** — nunca simular números como se fossem reais.

**Listagem e navegação por várias obras**
- Na listagem de Obras, oferecer entradas claras para **Gestão** e **Apresentação**, por obra e/ou como modo de abertura do conjunto filtrado.
- Em **ambos os modos**, navegar sem voltar à listagem: botões **Anterior / Próxima**, indicador **“Obra X de N”**, seletor para saltar diretamente à obra.
- Preservar filtros e ordenação da lista (status, equipe/responsável, pesquisa etc.), incluindo tratamento de obra removida ou sem acesso entre navegações.
- No desktop: teclado e opção de tela cheia (principalmente na Apresentação). No celular: controles grandes e possibilidade de gesto horizontal sem atrapalhar o scroll.
- Revalidar autorização no servidor a cada transição: nunca listar ou revelar dados de obras de outra empresa ou fora do escopo do usuário.

**Modo Gestão — OPR 3**
- Aproveitar o detalhe de Obras atual, com resumo, setores, participantes, marcos, dados técnicos permitidos e histórico.
- Colocar operações próximas dos dados correspondentes usando **exclusivamente as RPCs já existentes**: alterar_status_fluxo_obra, marcar_parado_fluxo_obra, definir_aguardando_fluxo_obra, atualizar_marco_obra, atribuir_participante_obra e encerrar_participante_obra.
- Respeitar rigorosamente a autorização das RPCs: admin, coordenador do setor e executor ativo conforme regras efetivas do banco; não conceder escrita ao gestor/vendedor/SDR por conveniência de interface.
- Motivos obrigatórios quando exigidos pelo banco, confirmação de operações sensíveis, tratamento explícito de erro e atualização da página após sucesso; sem escrita direta nas tabelas.
- Layout responsivo para desktop, tablet e celular.

**Modo Apresentação — visão diária limpa**
- Design claro, poucas cores, leitura rápida e sem controles de edição; versões desktop (idealmente 16:9/tela cheia), tablet e celular.
- Cabeçalho: identificação, cliente, cidade/UF, responsável, status, prazo e dados técnicos essenciais, apenas conforme permissões.
- KPIs concisos: **avanço físico**, **prazo/SLA**, **custo realizado versus previsto**, **pendências críticas** e **próxima entrega**.
- **Cronograma visual tipo Gantt de construtora**: linhas por fase/atividade, escala de dias e semanas, barras de previsto x executado, destaque para hoje, marcos e atrasos. No celular, janela de período e rolagem horizontal controlada.
- Áreas, responsáveis, próximos passos, pendências e histórico recente em espaço reduzido; nomes de fases devem corresponder ao modelo real de Obras, não às fases apenas ilustrativas do mockup.
- **Custos por categoria:** no mínimo Material CA, Material CC, mão de obra, equipamentos/terceiros e logística quando aplicáveis; exibir estimado/orçado, realizado, desvio absoluto e percentual, com alerta discreto para estouro de custo.
- **Resultado financeiro:** receita contratada/prevista, custo total orçado, custo realizado até a data, custo final projetado, margem líquida **estimada** (R$ e %) e variação diante da margem originalmente planejada. Para estimar o custo final, considerar gastos realizados + custos ainda esperados. A margem deve contemplar tributos, comissões e demais despesas pertinentes — **nunca calcular margem definitiva como receita menos o gasto parcial**.
- Separar visualmente valor confirmado, orçado e projetado; se não houver informação suficiente, indicar que o cálculo está indisponível, sem criar valores artificiais.
- **Segurança dos valores:** receitas, custos e margens só para perfis já autorizados ao dado financeiro. O modo Apresentação não é um atalho para elevar privilégios. Evitar enviar números protegidos nos DTOs/props/JSON para operação, vendedor ou SDR sem permissão, mesmo ocultando na interface.

**Etapas e restrições de desenvolvimento**
1. **OPR 3A — pode iniciar:** ações de Gestão sobre RPCs existentes e navegação sequencial de obras, com testes no Supabase local; sem migrations.
2. **Apresentação V1 — pode iniciar localmente:** página responsiva, alternância de modos, navegação tipo slides, conteúdo real já disponível e estados vazios para métricas sem dados.
3. **Gantt avançado/SLA/custos — exige levantamento:** identificar fontes, definir regras de evolução, prazos, categorias financeiras e permissões; entregar contrato de dados e PRD antes de migrations. Sem alteração de banco/produção enquanto backup não estiver aprovado e não houver autorização.
4. **Entrada automática na operação:** validar a regra existente de criação da obra após três marcos comerciais, a disponibilidade imediata do relatório e a idempotência; mudança de trigger somente com aprovação específica.
5. **Aceite:** navegar entre ao menos 10 obras visíveis, testar filtros, ausência de dados, permissões por empresa/papel, responsividade, uso em reunião e mensagens de erro. CI e testes locais antes da PR; merge/deploy com autorização separada.

**Situação:** decisão de produto registrada; a tela de detalhe de Obras e as RPCs operacionais já estão na main. As novas interfaces de edição, modo Apresentação, cronograma executivo e controle de custos/margem ainda não estão implementados.


### Perfis futuros

- **Engenharia**
- **Administrativo/Pós-vendas**
- **Gerência/Admin** com visão completa
- **Vendedor** apenas consultando o andamento dos próprios clientes, quando aplicável

Engenharia e Pós-vendas ficam **fora da gamificação comercial** inicialmente.

## Outras frentes do roadmap

- **Onboarding:** primeiro login e configuração inicial de empresa nova.
- **Tipos de solução:** além de fotovoltaico residencial/comercial.
- **Documentos configuráveis.**
- **Concessionárias.**
- **Agenda operacional.**
- **Integrações/automações:** Meta Ads → CRM (a confirmar), assinatura eletrônica real (gov.br/ZapSign), notificações externas por e-mail/WhatsApp, leitura de documentos por IA (bloqueada por falta de chave de API com visão).

Ordem de prioridade entre essas frentes ainda não definida pelo Evandro.
