# Regras de negócio — Raion CRM

Não altere nenhuma destas regras sem pedido explícito do Evandro.

- **Funil padrão (atual na `main`):** 4 etapas criadas para cada empresa nova — Novo lead → Contato feito → Visita agendada → Proposta enviada. Configurável só por admin.
- **Ganho e Perdido não são etapas do funil:** são valores de `negocios.status` (`aberto`/`ganho`/`perdido`). A perda exige motivo (`motivo_perda_id`). Uma etapa pode ter `fecha_como` (`ganho` ou `perdido`) para fechar o negócio ao receber o card; "perdido" sempre passa pelo motivo.
- **Funil de 9 etapas (só na empresa "Raion Solar Demo", criada pelo seed da PR #132):** Novo Lead → Qualificação → Contato Realizado → Levantamento/Diagnóstico → Proposta Enviada → Follow-up → Negociação → Assinado (`fecha_como='ganho'`) → Pago. Não altera o funil de nenhuma empresa existente.
- **Distribuição de leads:** rodízio automático entre vendedores ativos, com fila de aprovação do gestor; prazo de auto-aprovação configurável por origem (padrão 1h). Expiração via `pg_cron` a cada 5 min.
- **Status do vendedor:** Ativo / Inativo / Desligado; só ativos entram no rodízio.
- **Leads parados:** negócio aberto sem mudar de etapa nem ganhar nota há mais que `empresas.dias_considerado_parado` (padrão 7).
- **Propostas paradas:** proposta gerada sem o cliente abrir de novo nem mudar etapa no mesmo prazo.
- Parados aparecem no Painel (com botão Reatribuir), na Início e no sininho de notificações.
- **Gamificação (pontuação):** não há tabela fixa de pontos; XP e moedas vêm das regras ativas configuradas por empresa em `gamification_rules`. Eventos elegíveis, como `deal.won`, pontuam conforme a regra ativa. `deal.created`, `deal.stage_changed`, `deal.owner_changed`, `task.created` e `note.created` nunca pontuam. `task.completed`, `reuniao.realizada` e `visita.realizada` só pontuam se a regra tiver teto (`limite_periodo` + `limite_quantidade`). Há níveis, conquistas, ranking, loja de recompensas, metas e comissões.
- **Imagem da recompensa:** opcional; só admin adiciona, edita, substitui ou remove. Arquivo de até 3 MB, somente JPEG, PNG ou WebP (SVG recusado), sempre recortado em 4:3 antes do envio.
- **WhatsApp:** só botão `wa.me` + registro manual (sem API oficial).
- **Cobrança:** super-admin define plano/valor por empresa; sem gateway de pagamento.
- **Proposta e contrato** "fotografam" o modelo na geração; editar o modelo depois não muda o documento já gerado. Contrato só pode ser regerado em rascunho.
- CNH e documentos pessoais são dado sensível (LGPD): acesso restrito.
- **Dados de teste (legado):** Equipe Cascavel em produção (Camila, Rafael, Bruno; e-mails `*.teste@raioncrm-demo.com.br`), criada por `scripts/seed-equipe-cascavel.mjs`. A base de demonstração da PR #132 (`scripts/seed-base-demo.mjs`) não a substitui nem apaga: cria uma empresa separada, "Raion Solar Demo". O repositório é público: senhas não ficam aqui.
