# Roadmap — Raion CRM

O que ainda não foi construído. Só comece um módulo com pedido explícito do Evandro; a ordem de prioridade e os percentuais atuais ficam em `docs/PROJECT_STATUS.md`. Tudo abaixo é direção de produto, não especificação fechada: antes de implementar, faça diagnóstico e desenho para aprovação.

## Fluxo do produto

```
Aquisição → CRM Comercial → Venda → Pedido → Pós-venda/Engenharia → Compras → Obra → Vistoria → Entrega
```

Hoje existe até **Venda** (negócio ganho + contrato assinado + pagamento confirmado). Daí em diante é roadmap.

## Curto prazo (continuidade do que existe)

- Base Demo: execução real e validação (PR #132).
- Redesign visual das ~9 telas restantes de `/gamificacao`, no padrão da PR #130.
- Revisão de UX geral e Kanban.
- Calculadora + Propostas: motor real no wizard e catálogo técnico (PR #101, depende do backup), planilha real de equipamentos/preços, validação com o engenheiro.
- Deduplicação de contatos por telefone/e-mail.
- SDR — fases futuras da spec: métricas próprias, visibilidade configurável, devolução de lead, SLA, motor de permissões ABAC.

## Onboarding e tipos de solução

- Onboarding de empresa: primeiro login e configuração inicial.
- Tipos de solução além de fotovoltaico residencial/comercial.

## Pedido

Depois de **negócio ganho + contrato assinado + pagamento confirmado**, o sistema cria automaticamente um Pedido.

- O Pedido fica vinculado ao negócio comercial de origem. O negócio não é transformado, movido para outro funil nem apagado.
- Histórico comercial, faturamento, comissão e gamificação continuam no negócio.
- O Pedido é a entidade operacional: Pós-vendas e Engenharia assumem a operação a partir dele.

Campos e relacionamentos previstos: cliente, negócio de origem, vendedor, valor vendido, potência/sistema, kit vendido, endereço, contrato, pagamento, responsável do pós-vendas, engenheiro responsável, status operacional, documentos e timeline.

## Pós-venda, Engenharia e Obras

Arquitetura: `negocio` → cria → `pedido` (projeto operacional). Não usar um segundo funil de negócios.

Etapa principal do fluxo operacional:

```
Documentação → Projeto/Engenharia → Em homologação → Homologado → Material/Logística → Material entregue
→ Instalação agendada → Em instalação → Aguardando vistoria → Entrega técnica → Finalizado
```

Além da etapa principal, cada pedido tem **frentes paralelas** com status próprio: Documentação, Engenharia, Material, Instalação, Vistoria e Entrega. Engenharia e Compras podem avançar ao mesmo tempo. Exemplo de um pedido em andamento:

| Frente | Status |
| --- | --- |
| Engenharia | Em homologação |
| Material | Comprado |
| Instalação | Não agendada |
| Vistoria | Não iniciada |
| Entrega | Não iniciada |

## Compras

Ligado ao Pedido. Acesso principalmente de Pós-vendas, Admin e Gerência.

- Itens: produto/material, quantidade, unidade, fornecedor, custo previsto, custo real, pedido de compra, nota fiscal, status, data da compra, previsão de entrega, recebimento, observações.
- Status: `A comprar → Cotando → Comprado → Em transporte → Recebido`.
- Ideal: `Kit vendido → Pedido → Lista de compras pré-preenchida` — módulos, inversores e componentes da proposta/calculadora alimentam a lista de compras automaticamente.

## Perfis futuros

- **Engenharia:** acessa pedido/projeto, documentos técnicos, projeto, concessionária, protocolo, homologação, pendências, datas e timeline técnica. Inicialmente fora de ranking, XP, metas comerciais, comissões e loja.
- **Administrativo/Pós-vendas:** formalização, documentação, compra, logística, material, agenda, instalação, vistoria e entrega.
- **Gerência/Admin:** visão completa.
- **Vendedor:** poderá consultar o andamento dos próprios clientes, sem necessariamente editar a operação.

## Documentos configuráveis

- Categorias: Cliente, Imóvel, Engenharia, Concessionária, Compra, Instalação, Vistoria, Entrega.
- Cada documento pode ser obrigatório, opcional, condicionado por concessionária ou condicionado por tipo de solução.

## Concessionárias

Arquitetura genérica para qualquer concessionária. **Não hardcode regras específicas da COPEL** (nem de outra): exigências variam por configuração.

## Agenda operacional

Agenda de instalação, vistoria e entrega ligada ao Pedido.

## Integrações e automações

- Meta Ads → CRM (ainda não confirmada).
- Assinatura eletrônica real (gov.br; ZapSign/Clicksign depois).
- Notificações externas por e-mail/WhatsApp e aba de notificações com lido/não lido.
- Leitura de documentos (CNH, fatura) por IA — bloqueada por falta de chave de API com visão.

## Gamificação — fora de escopo até existir sinal confiável

- "Proposta enviada" e "contato efetivo" não pontuam (decisão do Evandro): só com integração real de WhatsApp/telefonia ou outro sinal verificável.
- "Reunião agendada" não vira preset de pontos sem evento dedicado com proteção anti-farm.
