---
name: projeto-obras-opr
description: Tela Obras como OPR (One Page Result), visão Completa e Apresentação (Gantt) — CONCLUÍDA em 03/11/2026 (#290, #291, #292, aviso #295)
metadata:
  node_type: memory
  type: project
  originSessionId: 995d9a0a-90f9-457d-b51b-cbbfb59a9e28
  modified: 2026-11-02T21:14:27.491Z
---

**Status (03/11/2026): concluída.** #290, #291 e #292 mescladas com as migrations aplicadas; aviso no sininho da justificativa (#295; pedido/cobrança → responsável + gestor da equipe dele, resposta → quem pediu). Detalhes em `docs/PROJECT_STATUS.md`.

A tela Obras (`/obras`) vira um **OPR — One Page Result** (informado pelo Evandro em 2026-11-02). Duas visões:
- **Completa:** etapas, custos, custo programado × custo real, gargalos etc.
- **Apresentação:** resumo simplificado com **gráfico de Gantt** das etapas da obra, no estilo do acompanhamento de obra de construtora (homologação, compra, entrega, construção da usina do cliente…), com previsão de entrega, problemas e atrasos.

Atualização (2026-11-02): são SÓ 2 telas, só admin e gestor (vendedor não vê). **Completa** = painel geral de todas as obras: 7 números (em execução, vermelhas, amarelas, verdes, escalonamentos abertos, valor em execução, margem projetada) + lista por semáforo. **Apresentação** = uma obra, 1 tela sem rolagem nem zoom: progresso no topo e todas as etapas (chegada na Engenharia → projeto → homologação → compra → entrega do material → instalação → vistoria → conexão) com tempo em cada uma. Semáforo: verde = no prazo; amarelo = custo ou prazo perto do limite ou algum prazo levemente estourado; vermelho = obra atrasada ou margem negativa por custo não programado. Limites numéricos ainda a definir. Apresentação também traz: kit resumido; custos por categoria com valores planejado × realizado em R$ e barras; justificativa de cada atraso ao passar o mouse (gestor solicita ao responsável; estado "pendente" + "cobrar justificativa"; atrasos em cascata têm motivo calculado pelo sistema); card "Lucro líquido previsto" no topo. Apresentação percorre as obras na ordem/filtro da Completa e tem botão Tela cheia (aprovado). Apresentação é NAVEGÁVEL como slides: setas do teclado, botões Anterior/Próxima e bolinhas por obra; ao trocar, barras e gráficos ANIMAM (deslizam, em cascata). Completa: "obras em execução" na faixa preta + "Margem líquida prevista" em R$ (definição de impostos/comissões pendente).

Decisões do Evandro (2026-11-02), limites e cores "conforme Claude definir":
- Semáforo: VERDE = no prazo e custo < 90% do planejado; AMARELA = custo ≥ 90%, prazo (etapa ou entrega) vencendo em ≤ 3 dias úteis, ou atraso de até 5 dias úteis; VERMELHA = entrega prevista > 5 dias úteis após a contratada, ou margem projetada negativa. Vale a pior cor.
- Cores: exceção à regra de marca só em Obras/semáforo — verde = `energia` (#1f7a4d), vermelho = `erro` (#b42318), amarelo = dourado. Registrar no CLAUDE.md junto do PR de Obras.
- Escalonamento: abrem gestor e operacional; fecha o gestor (interpretação de "gestor, operacional" — confirmar se o operacional também fecha).
- Margem líquida/lucro: o que se desconta (impostos, comissões etc.) o gestor define em Configurações (tela nova).

Respostas ao diagnóstico (2026-11-02):
- Entrega contratada = chegada da obra + N dias úteis configurados pela empresa; o gestor pode ajustar.
- Cada etapa tem prazo padrão em dias úteis; o previsto corre em cascata e o atraso herdado vira motivo calculado ("atraso em cascata"). Os prazos da Engenharia continuam valendo.
- "Material entregue" fica em Compras, como no desenho: é o passo final depois de "faturado".
- Telas aprovadas no canvas: `ObrasCompleta.dc.html` e `ObrasApresentacao.dc.html`. O desenho tem 7 etapas e 5 categorias de custo (Equipamentos, Estrutura e materiais, Mão de obra, Homologação, Frete).
- Prazos das etapas: valem os padrões (projeto 7, homologação 15, compra 5, entrega do material 7, instalação 5, vistoria 7, conexão 5; entrega contratada 51 dias úteis). O gestor pode editar, e não só o admin.
- Escalonamento: gestor e Operacional abrem e fecham.
- Custo planejado vem pré-preenchido da estimativa da calculadora e o gestor ajusta.
- Custo real: lançamentos (categoria, valor, data, descrição), sem apagar (erro = estorno). Lançam o admin ou o setor Operacional.
- Na OPR, o gestor vê todas as obras da empresa, com valores.
- Entrega proposta em 3 PRs: (1) prazos e etapas, (2) custos e deduções, (3) visão Completa, semáforo e escalonamento.
- PR 1 (#290) mesclada em 02/11/2026 (main `ff72744`). A migration `20261104100000_obras_cronograma.sql` foi aplicada antes do merge. Próximas: PR 2 (custos) e PR 3.

**Why:** gestor ou engenheiro apresenta ao CEO um relatório de uma página por obra com tudo resumido.

**How to apply:** não tratar a lista/tabela atual de Obras (nem o quadro "Obras" do canvas [[referencia-canvas-nova-interface]]) como o desenho final. A rota atual já tem o seletor Gestão/Apresentação e "Percorrer as N obras", ponto de partida provável. Antes de desenhar: confirmar de onde vêm custos programado/real e as datas previstas/reais de cada etapa. Ver [[projeto-nova-interface]].
