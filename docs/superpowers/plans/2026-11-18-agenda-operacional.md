# Agenda operacional — plano (18/11/2026)

Item 4 do roadmap. Prévia aprovada pelo Evandro em 18/11/2026 (https://claude.ai/artifact/AqMCMkaNj5JB3wnAmP9ucs),
com a observação para a equipe e o "Trocar equipe" mantidos.

## Decisões do Evandro (18/11/2026)

1. Duas partes: agendar a instalação na obra e a tela "Agenda" (semana e mês).
2. Quem agenda: Operacional, admin e gestor.
3. Equipe: cadastro de equipes de instalação **e** texto livre só para a obra.
4. Quem vê a Agenda: setores da obra, admin e gestor; o vendedor, só as obras dos próprios clientes.
5. Prazos continuam em dias úteis (sem horário).
6. Só no PRO.

A branch `backup/wt-calendario-operacional-20261103-wip` só tinha documentos de 26/10, já superados pelo código; nada
dela é reaproveitado.

## Banco (`20261217100000_agenda_operacional.sql`)

- `equipes_instalacao` (nome, telefone, ativa): leem admin, gestor e Operacional; escrevem admin, gestor e quem atua no
  setor Operacional. Não se apaga: inativa.
- `obra_instalacoes` (uma por obra): equipe do cadastro ou digitada (nome e telefone gravados na obra), início,
  término e observação. Lê quem vê a obra; escreve só `agendar_instalacao_obra`.
- `agendar_instalacao_obra`: mesma permissão de escrita do Operacional da obra (`preparar_escrita_obra`), recusa obra
  pausada, cancelada ou de empresa Solo; só com o Operacional em "Liberada para agendamento" ou "Agendada". Reagendar
  (mudar datas) exige motivo. Tudo vai para o histórico da obra (`instalacao_agendamento`). Primeiro agendamento passa
  o Operacional para "Agendada".
- `sugerir_termino_instalacao`: 3 dias úteis contando o início (feriados nacionais e da empresa).
- `cronograma_obra`: a previsão da etapa Instalação passa a usar as datas agendadas (o real continua vindo dos status
  "Em instalação" e "Instalação concluída").
- `agenda_operacional(empresa, de, até)`: instalações, vistorias agendadas, entregas do material previstas (Compras
  ainda sem entrega) e entregas contratadas (alerta quando a previsão do cronograma passa da data), só das obras que
  quem chama vê; até 62 dias por consulta.

## App

- `/obras/agenda`: semana (padrão) e mês, navegação por período, filtros por tipo e equipe; no celular, lista por dia.
  Aba "Agenda" ao lado de Gestão e Apresentação. Solo não tem a aba.
- Obra → cartão do Operacional: "Instalação" (agendar, reagendar com motivo, trocar equipe, previsto × real).
- `/obras/agenda/equipes`: cadastro de equipes (admin, gestor e Operacional).

## Testes

Banco: permissões de agendar e de cadastrar equipe, motivo no reagendamento, status, histórico, sugestão com feriado,
cronograma, Agenda por visibilidade (vendedor só os próprios), isolamento entre empresas, Solo recusado. Puros: semana,
mês e agrupamento por dia.
