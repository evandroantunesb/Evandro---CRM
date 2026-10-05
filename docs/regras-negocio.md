# Regras de negócio — Raion CRM

Não altere nenhuma destas regras sem pedido explícito do Evandro.

- **Funil padrão** (criado com cada empresa): Novo lead → Contato feito → Visita agendada → Proposta enviada. Configurável só por admin.
- **Ganho e perda não são etapas:** o resultado fica em `negocios.status` (`aberto`/`ganho`/`perdido`); perda exige `motivo_perda_id`. Uma etapa pode ter `fecha_como` (`ganho` ou `perdido`) para fechar o negócio ao receber o card: "ganho" fecha direto, "perdido" sempre abre o popup com comentário e motivo.
- **Distribuição de leads:** rodízio automático entre vendedores ativos, com fila de aprovação do gestor; prazo de auto-aprovação configurável por origem (padrão 1h). Expiração via `pg_cron` a cada 5 min.
- **Status do vendedor:** Ativo / Inativo / Desligado; só ativos entram no rodízio.
- **Distribuição por papel** (por origem): somente vendedores (padrão), somente SDR (com fallback para vendedor), parcial (%) ou aleatório.
- **Leads sem contato:** 1ª etapa, nenhuma nota e atribuído há mais que `empresas.horas_considerado_sem_contato` (padrão 3h).
- **SDR:** não fecha negócio, não altera valor depois de criado e não gera/edita proposta ou contrato. "Enviar para vendas" só com negócio qualificado; cria handoff pendente que o closer (ou admin/gestor em nome dele) aceita ou devolve com motivo. O feedback do closer sobre o lead nunca é visível ao SDR.
- **Leads parados:** negócio aberto sem mudar de etapa nem ganhar nota há mais que `empresas.dias_considerado_parado` (padrão 7).
- **Propostas paradas:** proposta gerada sem o cliente abrir de novo nem mudar etapa no mesmo prazo.
- Parados aparecem no Painel (com botão Reatribuir), na Início e no sininho de notificações.
- **Gamificação (pontos padrão):** negócio criado 5, etapa avançada 2, negócio ganho 50, tarefa concluída 3, nota 1. Os valores vigentes ficam em `gamification_rules` (configurável por empresa). Há níveis, conquistas, ranking, loja de recompensas, metas e comissões.
- **Gamificação — regras causais:**
  - Pontuação só nasce de ação real; nunca inserir em `point_ledger`/`eventos` manualmente.
  - XP (progressão, ranking, nível, conquista; nunca gasto) é separado de moedas (saldo da loja).
  - Crédito vai para o responsável congelado no fato (ex.: closer na assinatura do contrato; SDR de origem via `negocios.handoff_origem_id`), nunca para o responsável atual.
  - Metas e comissões leem só `eventos.created_at` real.
  - Conquista desbloqueada e seu bônus de XP são permanentes, mesmo se o evento for estornado.
  - Saldo negativo na loja é válido (resgate pode ser revertido); a UI mostra "em ajuste".
  - Ranking exclui admin/gestor.
  - "Proposta enviada", "contato efetivo" e "reunião agendada" não pontuam (falta sinal confiável).
- **Pagamento confirmado:** marco após contrato assinado; só gestor/admin confirma, nunca o próprio closer do contrato. "Negócio encerrado" é estado calculado (ganho + assinado + pago). Contrato com pagamento ativo não sai de "assinado".
- **WhatsApp:** só botão `wa.me` + registro manual (sem API oficial).
- **Cobrança:** super-admin define plano/valor por empresa; sem gateway de pagamento.
- **Proposta e contrato** "fotografam" o modelo na geração; editar o modelo depois não muda o documento já gerado. Contrato só pode ser regerado em rascunho.
- **Notas** não podem ser excluídas.
- CNH e documentos pessoais são dado sensível (LGPD): acesso restrito.
- **Dados de teste:** Equipe Cascavel em produção (Camila, Rafael, Bruno; e-mails `*.teste@raioncrm-demo.com.br`), criada por `scripts/seed-equipe-cascavel.mjs`. O repositório é público: senhas não ficam aqui. A PR #132 (não mesclada) propõe substituí-la por uma base demo fictícia — ver `docs/PROJECT_STATUS.md`.
