---
name: projeto-forecast
description: "Tela Forecast (nova) — menu abaixo de Negócios, botão na faixa de Negócios no lugar de Temperatura; mostra negócios com chance real de fechar"
metadata:
  node_type: memory
  type: project
  originSessionId: 995d9a0a-90f9-457d-b51b-cbbfb59a9e28
  modified: 2026-11-02T13:52:52.383Z
---

Pedido do Evandro (2026-11-02): tela **Forecast** no menu lateral logo abaixo de Negócios, e botão "Forecast" na faixa preta de Negócios substituindo o botão "Temperatura". Mostra todos os negócios com chance real de fechamento. Prévia no canvas (quadro "Forecast (proposta)").

Proposta desenhada: categorias Compromisso (≥70%), Provável (40–69%), Possível (20–39%); previsto ponderado (valor × chance) × meta do mês; previsto por mês (3 meses) com linha de meta; por vendedor; lista com chance, ponderado, data prevista e risco; "Fora do forecast" (sem data prevista, sem valor, parado). Chance = base por etapa (configurável em Funis e etapas) ± temperatura.

Decidido (2026-11-02): chance base por etapa (Qualificação 20, Visita 40, Proposta 60, Negociação 80; configurável por empresa em Funis e etapas) + temperatura (quente +10, frio −10); entra só chance ≥ 20% com valor e data prevista; vendedor vê a própria carteira, gestor a equipe, admin tudo. Temperatura: config segue em Configurações; filtro vira chips destacados Quente/Morno/Frio na barra de ferramentas de Negócios.

**How to apply:** levantamento de dados antes do código (onde guardar a chance por etapa — provavelmente coluna nova na etapa do funil, com migration). Usar `negocios` "Previsto para mês/ano" existente. Ver [[projeto-nova-interface]].
