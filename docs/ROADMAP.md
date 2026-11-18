# Roadmap de produto — Raion CRM

Visão consolidada do produto. **Última atualização: 2026-11-17** (coluna Situação, fluxo operacional e ordem das frentes; os percentuais são de 2026-10-06 e estão desatualizados, a revisar com o Evandro). Percentuais são estimativas aproximadas para orientar prioridade, não medições. Estado detalhado e PRs em `docs/PROJECT_STATUS.md`.

Legenda da coluna Situação: **produção** = mesclado na `main` e em produção · **branch** = implementado em PR ainda não mesclada (não está na `main` nem em produção) · **—** = roadmap, não iniciado ou só esboçado.

## Indicadores gerais

- **MVP comercial atual:** ~79% (2026-10-06, a revisar)
- **Produto completo (considerando o roadmap):** ~58% (2026-10-06, a revisar)

## Progresso por módulo

| Módulo | Progresso (06/10) | Situação |
| --- | --- | --- |
| CRM Comercial | 85% | produção: negócios, Kanban, contatos, tarefas, SDR e handoff, distribuição de leads, captura, Forecast, painel e tela de entrada configurável |
| Calculadora Solar | 72% | produção: calculadora, kit pela tabela de preços com preço sugerido (Compras P4b) e desconto com aprovação (P4c) · o motor reconciliado da PR #101 (fechada) não está na `main` · falta importar o CSV real de equipamentos |
| Catálogo Técnico | 75% | **PR #101 fechada sem merge** (13 migrations nunca aplicadas); retomada só com revisão própria |
| Propostas | 50% | produção: proposta e contrato por link, condições de pagamento, pagamento informado pelo vendedor |
| Gamificação | 88% | produção: motor, dashboards gerencial/pessoal, metas, comissões, loja, menu e tema escuro e imagem nas recompensas |
| Interface/UX geral | 55% | produção: nova interface, telas por empresa, marca e cores |
| Base Demo | 85% | **produção:** empresa separada "Raion Solar Demo" criada e validada (35 negócios, ranking conferido) · script (PR #132) fechado sem merge em 13/11/2026 |
| Segurança/Produção | 70% | produção: RLS multiempresa, trava do ambiente local, migrations e seeds só por environment aprovado, backups diários · pendente: tirar os secrets de produção do nível do repositório (público desde 12/11/2026) |
| Onboarding | 15% | produção: concluído em 13/11/2026 (telas por empresa, marca e cores, assistente de primeiro acesso, setores da obra e obra do Solo) |
| Tipos de Solução | 10% | produção: eletroposto como segundo tipo de negócio, com proposta própria (#223, 26/10/2026); outros tipos — |
| Pós-venda/Obras | 8% | produção: Obras (OPR, Apresentação, cronograma, financeiro da obra), Compras P1 a P4 e obra do Solo com link do cliente |
| Engenharia | 5% | produção: Engenharia em Obras (P1 a P6), enquadramento e prazos da Copel, obra de rede |
| Administrativo/Pós-vendas | 5% | produção: setor Administrativo, contas a pagar e tela Financeiro |
| Documentos configuráveis | 5% | produção: modelos de proposta e contrato configuráveis · **branch** `feat/procuracao`: modelo de procuração, PDF pelo negócio e pela obra (Engenharia) e logo da empresa nos PDFs de contrato e procuração |
| Concessionárias | 10% | produção: só a Copel, dentro da Engenharia |
| Agenda Operacional | 15% | — (status "agendada" e cronograma da obra existem; sem tela de agenda; há trabalho inacabado na branch `backup/wt-calendario-operacional-20261103-wip`) |
| Integrações/Automações | 15% | — (WhatsApp só por link pronto; sem e-mail, assinatura eletrônica, Meta Ads ou IA) |

## Fluxo operacional do cliente

```
Aquisição → CRM Comercial → Venda → Obra → Engenharia → Compras → Instalação → Vistoria → Entrega
```

Situação em 17/11/2026:

- **Obra:** nasce sozinha com negócio ganho + contrato assinado + pagamento confirmado; o negócio comercial fica preservado para histórico, comissão e gamificação. No Solo, a obra é um checklist de 10 etapas com link para o cliente.
- **Pedido como entidade própria:** a ADR `docs/ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md` (D1–D12, Pedido sempre e Obra opcional por empresa) **não foi implementada**; a Obra cumpre esse papel. Retomar ou arquivar a ADR é decisão do Evandro.
- **Compras:** concluída (P1 a P4c): pedidos de compra, orçamentos, NF e frete, tabela de preços, margens, kit pela tabela e desconto com aprovação.
- **Engenharia, Operacional e Administrativo:** concluídos como setores da obra (checklist de documentos, protocolos, vistoria, prazos, tarefas de setor e automáticas, contas a pagar).
- **Perfis:** Engenharia, Compras, Operacional e Administrativo (papel Operação com setores), gestor com visão completa. Engenharia e Operação ficam fora da gamificação comercial.

## Próximas frentes (ordem aprovada pelo Evandro em 17/11/2026)

0. **Segurança:** tirar os secrets de produção do nível do repositório (só o Evandro altera secrets).
1. **Documentos configuráveis:** contrato, proposta e **procuração** (em andamento: branch `feat/procuracao`, 17/11/2026).
2. **Contrato: conferir, editar e enviar** (redefinido pelo Evandro em 18/11/2026). A assinatura eletrônica saiu: nenhum serviço privado assina "gov.br" (a API de assinatura do gov.br não é aberta ao setor privado), e o cliente assina como conseguir (gov.br, cartório). No lugar: o vendedor confere e ajusta o texto no CRM e envia pelo WhatsApp.
3. **Avisos externos:** e-mail primeiro; WhatsApp pela API oficial depois (custo e aprovação da Meta).
4. **Agenda operacional:** avaliar antes o trabalho inacabado da branch de backup.
5. **Calculadora e catálogo técnico:** CSV real de equipamentos e preços, com o engenheiro.
6. **Concessionárias além da Copel:** quando houver cliente fora do Paraná.
7. **Meta Ads → CRM** (a confirmar) e **leitura de documentos por IA** (sem chave de API com visão).
