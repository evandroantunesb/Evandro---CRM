# M0 — Inventário funcional: matriz consolidada (registro provisório)
**Raion CRM · 15/10/2026 · associado ao Plano Mestre v3.0 · marco M0**
> **PROVISÓRIO.** Este arquivo preserva **somente a matriz e os achados do resumo apresentado pelo responsável** após o diagnóstico somente leitura do Claude. **Não é o relatório detalhado original de 253 linhas.** O original, com sete itens por frente, está em um scratchpad local do computador e ainda precisa ser anexado ao repositório. Não marcar M0 como encerrado antes dessa incorporação e da revisão.
## Metodologia e limites
- 64 frentes A01–G08 incluídas; `main` analisada no relato: `515b68b`; PRs e documentação consultadas.
- Nenhuma funcionalidade foi comprovada em navegador. Os testes existentes **não foram rodados nesta rodada**.
- Categoria `Código + teste existente` corresponde à palavra `funcional` usada no relatório original. **Não equivale a aceite funcional nem a entregue**.
- Sem alteração de código, migrations, banco, PRs operacionais ou produção durante o diagnóstico.
- A contagem reportada foi **11 com código + teste, 4 falhas reportadas/confirmadas, 35 parciais, 13 planejadas, 1 não verificada**.
## Matriz das 64 frentes (transcrição resumida do relato)
| ID | Frente | Situação nesta leitura | Achado principal / dependência |
|---|---|---|---|
| A01 | Multiempresa | Código + teste existente | Segurança #190–#192 pendente; sem varredura sistemática |
| A02 | Identidade e acesso | Parcial | Sem teste de autenticação; senha temporária fraca |
| A03 | Papéis e equipes | Parcial | Papel operacao sem cadastro pela UI |
| A04 | Planos Solo/Pro | Parcial | Solo nas PRs; limite_usuarios não imposto |
| A05 | Billing | Parcial | Cobrança manual; sem gateway |
| A06 | Super-admin | Código + teste existente | Sem trilha de intervenção |
| A07 | Onboarding | Planejada | Fluxo inexistente |
| A08 | Infra/CI | Código + teste existente | Preview Vercel usa banco de produção |
| A09 | Backups | Parcial | Job 15/10 passou; comprovação dos objetos B2, checksum e retenção pendente |
| A10 | Observabilidade | Parcial | Sem páginas de erro/404/loading |
| A11 | Segurança/LGPD | Parcial | LGPD sem estrutura; tokens públicos sem expiração |
| A12 | UX transversal | Parcial | Sem auditoria de acessibilidade |
| A13 | Docs/suporte | Planejada | Sem termos e ajuda no app |
| B01 | Captura | Parcial | Sem teste e sem antispam |
| B02 | Contatos | Parcial | excluirContato pode falhar silenciosamente |
| B03 | Negócios/funil | Código + teste existente (núcleo) | Wizard mostra exemplo fictício; PRs #70/#71 |
| B04 | Distribuição | Parcial | Cron pode bloquear fila por erro em item; hipótese não reproduzida |
| B05 | SDR/handoff | Código + teste existente | PR #192 pendente |
| B06 | Tarefas/agenda | Parcial | Sem edição de tarefa; integração Agenda sem teste |
| B07 | Arquivos | Código + teste existente | Sem restrição de tipo relatada |
| B08 | Indicadores | Parcial | Início mistura fonte causal e valores atuais |
| B09 | Comunicação | Parcial | WhatsApp falha quando DDD é 55; reportado como verificado |
| C01 | Calculadora | Falha confirmada | Interpretação de milhar pt-BR: 1.200 pode virar 1,2 |
| C02 | Dados solares | Planejada | Implementação somente na PR #101 |
| C03 | Catálogo | Parcial | PR #101 divergente da main |
| C04 | Compatibilidade | Planejada | Implementação somente na PR #101 |
| C05 | Kit | Falha reportada | Fluxo até proposta incompleto; sem preço por item |
| C06 | Precificação | Parcial | Custos apenas sugerem valor em tela |
| C07 | Tipos de solução | Planejada | Tipos de instalação não equivalem aos tipos de solução |
| C08 | Rastreabilidade | Parcial | Um cálculo por negócio; sobrescrito |
| D01 | Modelos de proposta | Código + teste existente | Sem comprovação visual |
| D02 | Proposta real | Falha reportada | Documento em branco no uso; cinco causas candidatas não reproduzidas |
| D03 | Documentos | Parcial | Somente proposta e contrato |
| D04 | Contrato | Falha reportada | Texto livre; divergência possível de preços com proposta |
| D05 | Assinatura/versões | Parcial | A+B+C ainda é proposta |
| D06 | Pagamento Pro | Código + teste existente | Correções #190/#191 pendentes de liberação |
| D07 | Pagamento Solo | Parcial | PRs #186 → #188 → #189 |
| D08 | Passagem operacional | Parcial | Pedido inexistente |
| E01 | Motor causal | Código + teste existente | Seed de regras para empresa nova a confirmar |
| E02 | Participantes | Código + teste existente | Nenhuma prova em navegador |
| E03 | Loja | Código + teste existente | Nenhuma prova em navegador |
| E04 | Metas/comissões | Parcial | Metas apenas por pessoa |
| E05 | Painéis | Parcial | Sem conferência no navegador |
| F01 | Pedido | Planejada | ADR aprovada; ainda não implementado |
| F02 | Módulos/escopo | Planejada | Venda pode gerar Obra sem regra de módulo/escopo |
| F03 | Pós-venda | Parcial | Apenas dois marcos binários |
| F04 | Engenharia | Parcial | Somente máquina de estados |
| F05 | Compras | Parcial | Somente status |
| F06 | Obras — motor | Parcial | Sem escritor para pausada_em/cancelada_em; operacional sem liberação |
| F07 | Obras — Gestão | Parcial | Sem tarefas, orçamento, custo e riscos |
| F08 | Obras — Apresentação | Parcial | Prazos, custos e margem sem dados reais |
| F09 | Campo | Parcial | Somente status |
| F10 | Vistoria/entrega | Planejada | Sem implementação completa |
| F11 | Agenda operacional | Planejada | Sem implementação |
| F12 | Custos | Planejada | Sem implementação |
| F13 | Múltiplas obras | Planejada | Evolução futura |
| G01 | Landing | Não verificada | Projeto externo à main do CRM |
| G02 | Jornada SaaS | Planejada | Sem gateway |
| G03 | Preços | Parcial | Hipóteses, sem política final aprovada |
| G04 | Demo | Parcial | Seed #132 com riscos de governança |
| G05 | Relatórios/BI | Parcial | Sem CSV |
| G06 | Integrações | Parcial | Google Agenda e OpenSolar |
| G07 | Móvel | Parcial | Sem service worker |
| G08 | Suporte | Planejada | Sem implementação |
## Evidências e problemas prioritários informados
### C01/C05 — Conversão e persistência de números
O diagnóstico relata execução da lógica pura e aponta que uma entrada formatada com ponto de milhar, como `1.200`, pode ser convertida para `1,2`, e `15.000` para `15`. O ciclo **salvar → reabrir → salvar sem editar** pode modificar consumo, fatura, valores de negócio e preço. Falta reproduzir o caso exato observado pelo responsável, escrever testes e definir regra pt-BR aprovada. **Não fazer correção em lote de registros históricos sem auditoria e autorização.**
### C02–C04 — PR #101, catálogo e motor
O relato aponta que a #101 diverge da `main` (237 commits atrás, oito conflitos, 13 migrations pendentes na ocasião) e que ela substitui caminho OpenSolar. Não mesclar, aplicar migrations ou substituir integração sem revisão específica. Kit atual não precifica cada item individualmente.
### D02 — Proposta em branco
Falha reportada pelo responsável; **não reproduzida** no inventário. Causas candidatas: rota pública não utiliza modelos; PDF condiciona motor de blocos ao modelo completo; regeração não atualiza modelo; omissão silenciosa de blocos; leitura dinâmica dos números.
### D04 — Contrato
Modelo livre com 24 campos, cláusulas não estruturadas, possibilidade de o preço do contrato (valor do negócio) divergir da proposta (valor do cálculo). Falta modelo inicial para empresa nova.
### A07 — Onboarding
Não identificado fluxo completo para nova empresa, modelos de proposta e contrato, identidade, catálogo, gamificação e equipe.
### F01–F12 — Pedido/Obras
Pedido e escopo contratado não implementados; Obras sem escritor de pausa/cancelamento, cadastro de papel operacional/setores na UI, liberação do fluxo operacional e dados reais suficientes em Gestão/Apresentação. A ADR aprovada não autoriza implementação.
### Demais achados e riscos
- B04: possível travamento da fila do cron por item com usuário desligado; **não reproduzido**.
- B09: WhatsApp pode produzir telefone inválido com DDD 55; indicado como verificado.
- B08: Receita do mês pode divergir das metas por uso de responsável atual e data UTC em contraste com eventos históricos.
- G04: script de seed demo #132 usa parâmetros inseguros e aceita configuração produtiva; não executar sem revisão/autorização.
- E01: criação de regras iniciais de gamificação para empresa nova não identificada; requer confirmação.
- PRs legadas: #104–#118 potencialmente substituídas, #62 conflita com backup atual, #68/#76 apenas documentação, #71 conflita com main. **Não fechar nem mesclar automaticamente**.
- A09: workflow agendado 15/10 com sucesso no GitHub; objetos e checksums B2, retenção Object Lock e Healthchecks continuam não comprovados.
## Pendências para encerrar M0
1. **Obter o arquivo original `M0-inventario-completo.md` (253 linhas) do scratchpad do Claude no computador**, anexar nesta PR como `docs/M0-INVENTARIO-COMPLETO.md` sem reescrever ou substituir seus detalhes.
2. Confrontar a matriz com o original e, quando necessário, registrar divergências e `A INVENTARIAR` no Plano Mestre por alteração versionada.
3. Rever o resultado com o responsável e obter aceite explícito de encerramento do M0.
4. **Em seguida, M1**, conforme Plano Mestre: segurança e pagamento Solo; não antecipar o M2 por iniciativa de agente.
## Governança
Este registro **não** autoriza nova implementação, migração, seed, merge, deploy, execução de workflow manual ou acesso a produção. O Plano Mestre v3 continua sendo a referência aprovada de abrangência.
