---
name: projeto-nova-interface
description: "Decisões de interface aprovadas pelo Evandro (faixa escura em toda tela, Painel, Engenharia como início do engenheiro) e perguntas em aberto"
metadata:
  node_type: memory
  type: project
  originSessionId: 995d9a0a-90f9-457d-b51b-cbbfb59a9e28
  modified: 2026-11-03T10:50:44.853Z
---

Padrão de gráficos (2026-11-02, revisado a pedido do Evandro: "mais preto, sem exagerar"), em `raion.css` do canvas: cartões brancos, EXCETO o gráfico principal de cada tela, que fica num cartão escuro (`.r-escuro`, um por tela); aba/filtro ativo e cabeçalho de tabela em carvão; dourado #d4af37 = realizado/atual, dourado claro #eddb9f = anterior/secundário, cinza #d9d5cb = previsto/planejado, preto só para meta/limite/referência, vermelho só o que estourou; espessura 6 px (progresso) e 10 px (comparação); legenda em pílula; número sobre cada barra; barras crescem ao abrir a tela; respeita prefers-reduced-motion.

Decisões (2026-11-01/02):
- Toda tela ganha faixa escura no topo (paisagem `/marca/paisagem.jpg` + degradê carvão), como o cabeçalho do Início. Telas de detalhe/config: faixa mais baixa e foto mais apagada. Componente `CabecalhoPagina` em `src/components/cabecalho-pagina.tsx`: #284 (Painel) e #296 (Negócios, Contatos, Tarefas, Propostas e contratos, Leads; botão de vidro e seletor escuro; botão Forecast no lugar de Temperatura, `/forecast` provisória) e #297 (variante "detalhe" nas fichas do negócio, contato e obra) mescladas em 03/11/2026. #298 (Configurações e 17 telas internas, Tarefas dos setores, Engenharia lista/obra, Meu perfil, Super-admin) mesclada em 03/11/2026. #299 (faixa `gf` nas 13 telas da Gamificação) mesclada em 03/11/2026. Falta: conteúdo dinâmico dos desenhos da Gamificação (títulos com dados, menu interno, tabelas) e o redesenho "início do engenheiro".
- Indicadores sempre numa faixa única dividida por fios; número numa linha só (fonte encolhe), títulos sem corte e números alinhados.
- Engenharia (`/engenharia`) vira o "início do engenheiro" — nome continua "Engenharia". Aprovada a versão do canvas: Meu dia por urgência, próximos prazos (7 dias), obras por etapa, painel escuro "Sua trajetória" com 2 gráficos de barras (volume acumulado Obras/kWp; eficiência Velocidade/Qualidade) e próximo marco.

- Grupo 1 aprovado (2026-11-02): Novo negócio (passos 2 e 3/kit — o painel Resultado fica no visual claro de hoje, com paisagem e anel de autonomia; não escurecer), Ficha do contato, Ficha da obra (separada da Completa; vendedor vê só o valor vendido, margem só gestor/admin), Obra na Engenharia (8 passos), Tarefas dos setores. Gamificação (competição, aviso, comemoração, loja) também aprovada. Depois (2026-11-02) aprovados também: Novo negócio Eletroposto, páginas do cliente (celular; logo oficial, eletroposto com nome da empresa), resto da Gamificação (9 telas), acesso (logo FORA da imagem; imagem, frase e texto do login definidos pelo admin em Configurações › Empresa › Tela de entrada — recurso novo), modelos de Configurações (Origens simples, Usuários complexo, menu lateral interno). Super-admin desenhado, aguardando aprovação. Com isso o canvas cobre todas as telas.

**Why:** Evandro achou as telas internas "muito simples" comparadas ao cabeçalho do Início.

Definições do painel "Sua trajetória" (respostas do Evandro, 2026-11-02): só kWp (sem kWh); conta obra em que ele INICIOU ou PARTICIPOU na Engenharia; só obras CONCLUÍDAS; acumulado desde a primeira obra dele no sistema; gráfico esquerdo = acumulado (Obras/kWp), direito = concluídas mês a mês (velocidade/qualidade descartados por confusos); marcos mantidos (sem objeção). 3º número: potência média por obra.

Respostas ao levantamento (2026-11-03): "concluída" = Engenharia concluída (conexão confirmada; `obra_historico` fluxo_alterado engenharia→concluido; vale a 1ª conclusão); "participou" = registrado em `obra_participantes` da Engenharia antes da conclusão; prazos = os da Engenharia (P5), em dias úteis; blocos por etapa = as 7 fases do Kanban (admin ajusta tempos em Config › Engenharia); NADA sai da tela: abas de tarefas, Lista/Kanban e indicadores vão para a visão Equipe/"ver carteira" — o Evandro pediu para AJUSTAR O DESENHO antes de codar; executor só Pessoal, coordenador/admin/gestor com Pessoal/Equipe (admin/gestor abrem em Equipe); marcos padrão 25 obras / 250 kWp, EDITÁVEIS depois; esconder filtros 12/6 meses até haver histórico (começa out/2026); pedido de justificativa pendente entra no Meu dia; obra com ação sem prazo = "Esta semana". Trajetória exige RPC nova (migration só função): a RLS de `operacao` (`pode_ver_obra_operacao`, exige participação ativa) esconderia obras antigas.

**How to apply:** antes de codar, levantamento só de leitura de onde vem cada número (eventos reais com data — regra de causalidade); entregar em 2 PRs: (1) tela/organização com dados existentes, (2) painel "Sua trajetória". Ver [[feedback-previa-antes-de-ui]], [[referencia-canvas-nova-interface]].
