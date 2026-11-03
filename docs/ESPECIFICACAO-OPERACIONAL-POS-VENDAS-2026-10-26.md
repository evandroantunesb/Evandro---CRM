# Operação, compras e pós-vendas — decisões de produto

Consolidação da conversa com Evandro em 26/10/2026. Estado: especificação de produto; implementação técnica e critérios pendentes ainda precisam de detalhamento. Este registro não afirma que as funcionalidades já existem e não autoriza produção, merge ou aplicação de migrations.

## 1. Empresa, usuários e responsabilidades

IBS e os nomes abaixo são exemplos hipotéticos. A configuração deve funcionar por empresa e por usuário autorizado, sem nomes fixos no código. O isolamento entre empresas permanece obrigatório.

| Função | Exemplo | Responsabilidades |
| --- | --- | --- |
| Comercial | Vendedor da venda | Levantamento técnico, fotos, solicitações à engenharia, resolução de pendências e contato com o cliente inclusive depois da venda. |
| Compras | Jackson | Cotação e pedido de compra gerados no sistema do fornecedor e anexados ao CRM. |
| Técnico / controle de obras | Vinicius | Aprovação técnica do kit, rastreamento e entrega, planejamento e registro da instalação, vistoria, medição, entrega ao cliente e abertura/triagem/validação de tickets. |
| Operacional / financeiro / pós-vendas | Talita | Autorizar e realizar pagamento ao fornecedor, anexar comprovante e nota fiscal, confirmar recebimentos do cliente e acompanhar chamados com fornecedores. |
| Engenharia | Soni | Projetos 3D, unifilar quando necessário, documentação e processo da concessionária; comentários técnicos sobre kit; solicitações de complementação ao vendedor. |
| Administração da operação | Felipe | Monitorar a operação, receber alertas, assumir aprovações, decidir exceção financeira, cancelamentos, estornos e ajustes de comissão já paga. |

Inicialmente Talita executa as tarefas de seu setor. O administrador poderá autorizar outros usuários desse setor a executar tarefas financeiras; pertencer ao setor não concede automaticamente todas as permissões. Felipe também pode executar essas tarefas na ausência dos responsáveis.

A equipe de instalação é terceirizada e não acessa o CRM. Vinicius registra o trabalho de campo. O vendedor, e não Vinicius, mantém o contato com o cliente. O vendedor consulta o andamento dos próprios clientes.

Usuários operacionais não precisam ter acesso ao funil comercial inteiro. Soni precisa acessar solicitações direcionadas a ele antes da venda e documentos necessários à engenharia. A matriz exata de leitura de dados pessoais, valores e documentos será detalhada na implementação.

## 2. Antes da liberação para operação

- No negócio, o vendedor envia diretamente ao Soni solicitações de Projeto 3D, Análise técnica ou Outros, com descrição e anexos. Não há aprovação intermediária.
- Soni acompanha a solicitação e entrega arquivos no registro. Prazo padrão por etapa em expediente; atraso avisa Soni e Felipe.
- O vendedor confirma visita técnica, inspeção do medidor/padrão de entrada e telhado, e anexa fotos. Não há validação prévia obrigatória do Soni para considerar o levantamento completo.
- Passagem para operação exige venda ganha, contrato assinado, levantamento completo e entrada ou pagamento integral confirmado conforme a condição da venda.
- Documentos, solicitações e histórico comercial necessários continuam vinculados ao processo após a liberação; evitar reenvio manual dos mesmos arquivos.
- Se Soni identificar informação faltante depois, abre uma pendência para o vendedor com descrição e prazo. Vendedor complementa e devolve; Soni confere e encerra. Não bloqueia as outras etapas. Atraso avisa vendedor e Felipe.

## 3. Engenharia e compras em paralelo

Todos os setores recebem o projeto após a liberação. Uma mesma obra é acompanhada por diferentes responsáveis; não criar cópias independentes do card por pessoa.

| Sequência de compras | Ação |
| --- | --- |
| 1. Cotação | Jackson anexa orçamento gerado com o fornecedor. |
| 2. Conferência técnica | Vinicius confere especificações e o combinado com o cliente. Pode solicitar comentários ao Soni, mas pode aprovar mesmo sem resposta dele. |
| 3. Pedido | Jackson gera o pedido com o fornecedor e anexa após o OK técnico. |
| 4. Financeiro | Talita autoriza e realiza o pagamento, anexa o comprovante e posteriormente a nota fiscal do fornecedor. |
| 5. Entrega | Vinicius acompanha o pedido até o recebimento. |

Reprovação retorna ao Jackson para ajuste com motivo registrado. Troca de equipamento ou quantidade exige nova aprovação técnica. Mudança de valor depois da autorização financeira exige nova autorização da Talita. Preservar versões anteriores e suas aprovações.

Soni recebe o projeto simultaneamente, consulta CNH/fatura e demais documentos necessários, elabora e anexa projetos e registros da concessionária. A instalação não depende de um OK do Soni nem da aprovação da concessionária como trava operacional do CRM. Essa decisão não equivale a autorização técnica/legal para conectar ou operar o sistema; o andamento da concessionária é registrado separadamente.

## 4. Recebimentos, bloqueios e encerramento

Permitir venda à vista ou com parcelas vinculadas aos marcos contratuais. Exemplo confirmado: R$ 10.000 de entrada, R$ 6.200 na entrega dos materiais e R$ 6.200 na entrega da instalação, totalizando R$ 22.400.

- Talita ou usuário financeiro autorizado confirma o recebimento e anexa o comprovante à parcela. O recebimento de uma foto de comprovante por outro usuário não quita automaticamente a dívida.
- Entrada confirmada pode liberar a operação; não significa quitação integral.
- Entrega do material aciona a cobrança conforme o contrato. Entrega parcial não aciona parcela que exige entrega completa.
- Parcela de entrega dos materiais pendente bloqueia o início da instalação e notifica Felipe. Ele pode manter o bloqueio ou liberar excepcionalmente, com justificativa, sem quitar a dívida.
- Confirmação do recebimento elimina o bloqueio financeiro correspondente; não elimina bloqueios técnicos independentes.
- A previsão de instalação pode permanecer no Gantt enquanto há bloqueio financeiro.
- Execução concluída com saldo mantém a obra aberta como “Execução concluída — pagamento pendente”.
- Tickets ainda não resolvidos da execução também impedem encerramento: “Execução concluída — pendência de pós-venda”. Exibir ambas as pendências quando coexistirem.
- Encerrar automaticamente após concluir as etapas finais, incluindo vistoria e entrega ao cliente, quitar o saldo e resolver os tickets da execução com validação do Vinicius.

Recebimentos do cliente e pagamentos ao fornecedor são controles distintos. Não presumir que o dinheiro recebido já foi pago ao fornecedor.

## 5. Instalação e cronograma

- Vinicius cadastra equipe terceirizada e início previsto enquanto o material está a caminho.
- Sugerir três dias de segunda a sexta, contando o início como primeiro dia: sexta → segunda → terça. Vinicius pode reduzir até um dia ou ampliar pelo término previsto.
- Salvar planejamento real para alimentar o Gantt existente. Separar datas previstas das datas reais; manter histórico de alterações.
- Apenas Vinicius registra início, interrupção e conclusão de campo neste fluxo. Fotos são obrigatórias para concluir a instalação.
- Vinicius registra vistoria, troca de medidor e entrega ao cliente.
- Pode pausar a instalação, justificar, ajustar previsão e registrar retomada. Se houver ocorrência, vincular a pausa ao ticket.
- Ao pausar, Felipe recebe notificação imediata: “Obra [identificação], pausada por: [usuário]. Motivo: [texto]”, com acesso ao card. Motivo, autoria e horário ficam no histórico.

## 6. Ocorrências e assistência

Na entrega, Vinicius identifica falta, avaria ou divergência, abre ticket para o setor da Talita e registra evidências. Talita abre e acompanha o chamado no fornecedor. Quando houver solução, Vinicius confere; somente sua validação encerra o ticket. Se não estiver resolvido, devolve com motivo.

Vinicius decide se uma ocorrência impede instalar. Se impedir, bloquear início ou permitir que ele registre a pausa de execução em andamento. Liberação financeira excepcional não remove esse impedimento técnico. Ticket não impeditivo continua acompanhado enquanto a instalação segue.

Depois de a obra já estar encerrada, Vinicius abre o chamado e faz triagem: Soni para engenharia, Talita para fornecedor ou próprio Vinicius para instalação/equipe de campo. Ele acompanha e valida o encerramento. Esses novos tickets têm acompanhamento próprio sem reabrir automaticamente a obra original.

Tickets possuem responsável atual, prazo, histórico, evidências e protocolo externo quando houver. Alertas de atraso chegam ao responsável e Felipe.

## 7. Pontuação, comissões, cancelamentos e estornos

- Pontuação por pagamento ocorre somente na quitação integral confirmada, uma vez. Entrada e parcelas intermediárias não pontuam por pagamento.
- Empresa configura liberação de comissão: na venda ganha, proporcional aos recebimentos ou na quitação total. IBS usa inicialmente venda ganha.
- Separar comissão prevista, liberada e paga. Congelar a política aplicável ao fechar a venda; alterações de configuração valem para novas vendas.
- Talita solicita cancelamento ou estorno com justificativa. Felipe aprova e efetiva ou rejeita; manter histórico de solicitação e decisão.
- Cancelamento não representa devolução bancária automática. Eventual devolução tem comprovante próprio.
- Se o estorno desfizer a quitação, reverter a pontuação correspondente; nova quitação recompõe sem duplicação. Não apagar o histórico original.
- Reavaliar comissão ainda não paga segundo a política da venda. Estorno de recebimento, por si só, não revoga a comissão da IBS baseada em venda ganha; cancelamento exige avaliação distinta.
- Comissão já paga gera pendência para Felipe decidir eventual compensação futura, com justificativa. Não descontar automaticamente nem apagar pagamento anterior.

O cálculo atual de comissão é mensal, com faixas, e não fornece diretamente a distribuição por venda. A fórmula de atribuição por venda para as novas modalidades permanece pendente; não inventar durante a implementação.

## 8. Expediente, prazos e comunicação

Gestor configura expediente no onboarding. Padrão: segunda a sexta, 08h–12h e 13h30–18h. Prazos contam somente dentro do expediente, com duração padrão distinta por etapa definida pelo administrador. Alertas de atraso para responsável e Felipe. O valor numérico de cada prazo ainda não foi definido.

Feriados pesquisados em [CALENDARIO-OPERACIONAL-BRASIL-2026.md](CALENDARIO-OPERACIONAL-BRASIL-2026.md). Não confundir pontos facultativos federais com feriados nacionais aplicáveis a todas as empresas.

Vendedor comunica entregas, agendamento, atrasos, vistoria e chamados ao cliente, apoiado nas informações atualizadas por Vinicius e demais responsáveis. Registrar contato com data, canal e resumo. Notificar o vendedor de mudanças que precisam chegar ao cliente é proposta alinhada à continuidade da conversa; eventos exatos e frequência devem ser fechados antes da implementação. Não foi solicitada integração automática com WhatsApp.

## 9. Base existente e sequência técnica proposta

Diagnóstico em origin/main, inicialmente 21d8c4a; documentação preparada em cópia isolada a partir de 6b534a5. Presença de migrations no repositório não comprova aplicação em produção.

- Obras já possui lista, detalhe, setores, participantes, histórico, Gestão e Apresentação. Reutilizar essa base.
- O Gantt existe visualmente, mas o planejamento avançado ainda não possui origem persistida real nesse fluxo.
- Papel operacional existe, porém seu cadastro, anexos e operações financeiras não cobrem estas responsabilidades.
- Parcelas por marco, solicitações de engenharia, tickets e calendário operacional precisam ser implementados.
- Reconciliar com a [ADR Pedido + Obra](ADR-PEDIDO-OBRA-MODULO-OPCIONAL-2026-10-14.md): Pedido administrativo é distinto do arquivo de pedido de compra; Obras opcional por empresa/escopo continua sendo uma decisão anterior a preservar na revisão. Não estender automaticamente as regras solares a eletropostos ou vendas sem execução.

Ordem proposta: base e permissões → documentos/engenharia → recebimentos e liberação → compras/aprovações → entrega/instalação/Gantt → monitoramento, tickets e encerramento. A infraestrutura de prazo e auditoria deve acompanhar cada fluxo desde sua entrega, mesmo que o quadro consolidado venha depois.

## 10. Pendências e critérios de validação

Antes de implementar, resolver: duração dos prazos; contagem em reenvio/pausa/espera externa; feriados na sugestão de instalação; fórmula de liberação de comissão mensal por venda; vencimento exato das parcelas conforme contrato; tratamento operacional de estorno depois do encerramento; documentos obrigatórios da entrega final; permissões de substituição técnica e visibilidade detalhada dos anexos. Não introduzir bloqueio adicional por pendência comum do vendedor.

Validar ao menos: venda à vista; entrada com duas parcelas; liberação financeira excepcional sem baixa da dívida; fotos ausentes; entrega parcial com ticket; mudança de kit após aprovação; comentário do Soni sem bloquear compra; pausa notificada ao Felipe; reprogramação atravessando fim de semana; ticket pós-encerramento; estorno e nova quitação sem pontos duplicados; isolamento entre empresas e negativa de acesso comercial indevido. Conferir autoria e histórico em todas as transições, além de repetição/cliques simultâneos sem duplicar obra, recebimento ou encerramento.

As mudanças de banco futuras devem preservar dados históricos e os fluxos de aprovação de produção existentes. Não houve implementação de código, migration, seed, publicação ou alteração de dados nesta consolidação.
