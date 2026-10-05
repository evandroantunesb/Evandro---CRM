# Roadmap de produto — Raion CRM

Visão consolidada do produto. **Última atualização: 2026-10-05.** Percentuais são estimativas aproximadas para orientar prioridade, não medições. Estado detalhado e PRs em `docs/PROJECT_STATUS.md`.

## Indicadores gerais

- **MVP comercial atual:** ~79%
- **Produto completo (considerando o roadmap):** ~58%

## Progresso por módulo

| Módulo | Progresso |
| --- | --- |
| CRM Comercial | 85% |
| Calculadora Solar | 72% |
| Catálogo Técnico | 75% |
| Propostas | 50% |
| Gamificação | 88% |
| Interface/UX geral | 55% |
| Base Demo | 85% |
| Segurança/Produção | 70% |
| Onboarding | 15% |
| Tipos de Solução | 10% |
| Pós-venda/Obras | 8% |
| Engenharia | 5% |
| Administrativo/Pós-vendas | 5% |
| Documentos configuráveis | 5% |
| Concessionárias | 10% |
| Agenda Operacional | 15% |
| Integrações/Automações | 15% |

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

- **Onboarding:** primeiro login e configuração inicial de empresa nova.
- **Tipos de solução:** além de fotovoltaico residencial/comercial.
- **Documentos configuráveis.**
- **Concessionárias.**
- **Agenda operacional.**
- **Integrações/automações:** Meta Ads → CRM (a confirmar), assinatura eletrônica real (gov.br/ZapSign), notificações externas por e-mail/WhatsApp, leitura de documentos por IA (bloqueada por falta de chave de API com visão).

Ordem de prioridade entre essas frentes ainda não definida pelo Evandro.
