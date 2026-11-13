# Roadmap de produto — Raion CRM

Visão consolidada do produto. **Última atualização: 2026-11-13** (só a coluna Situação e as frentes; os percentuais são de 2026-10-06 e estão desatualizados, a revisar com o Evandro). Percentuais são estimativas aproximadas para orientar prioridade, não medições. Estado detalhado e PRs em `docs/PROJECT_STATUS.md`.

Legenda da coluna Situação: **produção** = mesclado na `main` e em produção · **branch** = implementado em PR ainda não mesclada (não está na `main` nem em produção) · **—** = roadmap, não iniciado ou só esboçado.

## Indicadores gerais

- **MVP comercial atual:** ~79%
- **Produto completo (considerando o roadmap):** ~58%

## Progresso por módulo

| Módulo | Progresso | Situação |
| --- | --- | --- |
| CRM Comercial | 85% | produção |
| Calculadora Solar | 72% | produção: calculadora, kit pela tabela de preços (Compras P4b) e proposta · o motor reconciliado da PR #101 (fechada) não está na `main` |
| Catálogo Técnico | 75% | **PR #101 fechada sem merge** (13 migrations nunca aplicadas); retomada só com revisão própria |
| Propostas | 50% | produção |
| Gamificação | 88% | produção: motor, dashboards gerencial/pessoal, menu e tema escuro e imagem nas recompensas (#130, #131, #136–#139) |
| Interface/UX geral | 55% | produção |
| Base Demo | 85% | **produção:** empresa separada "Raion Solar Demo" criada e validada (35 negócios, ranking conferido) · script (PR #132) fechado sem merge em 13/11/2026 |
| Segurança/Produção | 70% | produção |
| Onboarding | 15% | produção: concluído em 13/11/2026 (telas por empresa, marca e cores, assistente de primeiro acesso, setores da obra e obra do Solo) |
| Tipos de Solução | 10% | — |
| Pós-venda/Obras | 8% | produção: Obras (OPR, Apresentação, cronograma, financeiro da obra), Compras P1 a P4 e obra do Solo |
| Engenharia | 5% | produção: Engenharia em Obras (P1 a P6), enquadramento e prazos da Copel, obra de rede |
| Administrativo/Pós-vendas | 5% | produção: setor Administrativo, contas a pagar e tela Financeiro |
| Documentos configuráveis | 5% | — |
| Concessionárias | 10% | produção: só a Copel, dentro da Engenharia |
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

### Perfis futuros

- **Engenharia**
- **Administrativo/Pós-vendas**
- **Gerência/Admin** com visão completa
- **Vendedor** apenas consultando o andamento dos próprios clientes, quando aplicável

Engenharia e Pós-vendas ficam **fora da gamificação comercial** inicialmente.

## Outras frentes do roadmap

- **Tipos de solução:** além de fotovoltaico residencial/comercial.
- **Documentos configuráveis.**
- **Concessionárias** (além da Copel).
- **Agenda operacional.**
- **Integrações/automações:** Meta Ads → CRM (a confirmar), assinatura eletrônica real (gov.br/ZapSign), notificações externas por e-mail/WhatsApp, leitura de documentos por IA (bloqueada por falta de chave de API com visão).

Ordem de prioridade entre essas frentes ainda não definida pelo Evandro.
