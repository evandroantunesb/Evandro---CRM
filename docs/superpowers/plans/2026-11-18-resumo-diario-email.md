# Avisos externos: resumo diário por e-mail — plano (18/11/2026)

Item 3 do roadmap (`docs/ROADMAP.md`), primeira parte (e-mail; WhatsApp pela API oficial fica para depois). Prévia
aprovada pelo Evandro em 18/11/2026: https://claude.ai/artifact/FHzSsGsk4EyewgNXBD12eC

## Decisões do Evandro (18/11/2026)

1. Só a equipe recebe (não o cliente final).
2. Só os avisos que pedem ação: `lead_atribuido`, `handoff_recebido`, `handoff_devolvido`, `desconto_solicitado`,
   `desconto_decidido`, `pagamento_aviso_confirmado`, `pagamento_aviso_devolvido`, `justificativa_atraso_pedida`,
   `justificativa_atraso_cobrada`.
3. Um resumo por dia, às 7h30 (Brasília), por pessoa e por empresa; dia sem pendência não manda nada.
4. Só entram avisos ainda não vistos no sininho (`lida_em is null`).
5. Cada pessoa liga ou desliga o próprio resumo em "Meu perfil"; ligado por padrão.
6. Envio pelo Resend com domínio próprio verificado. A chave fica só na Vercel (o Evandro cria).

## Desenho

- **Fonte única:** `notificacoes` (o sininho). Nada muda nos pontos do banco que criam avisos.
- **Banco (migration nova):**
  - `preferencias_resumo_email` (tabela própria, para não mexer em `empresa_membros`; sem linha = ligado) e
    `definir_resumo_email(p_empresa_id, p_ligado)` (`security definer`, só a própria linha de quem chama).
  - `resumos_email_envios`: um registro por pessoa, empresa e dia (`unique (membro_id, dia)`), com janela coberta,
    quantidade de itens, situação (`enviando`, `enviado`, `falhou`) e erro. RLS ligada sem políticas para o app (só a
    service role escreve e lê); `empresa_id` com FK.
  - `resumo_email_pendentes(p_dia, p_ate)`: só `service_role`; devolve, por membro ativo com resumo ligado, os avisos
    dos tipos acima, não lidos, criados desde o fim da janela do último resumo enviado (no máximo 7 dias; nas últimas
    24 h, no primeiro).
  - `reservar_resumo_email` e `concluir_resumo_email`: reserva antes de enviar (só uma execução por pessoa e dia;
    falha, ou "enviando" há mais de 1 h, pode tentar de novo) e fecha como enviado ou falhou.
- **Envio:** rota `GET /api/cron/resumo-diario`, chamada pelo Cron da Vercel (`vercel.json`, `30 10 * * *` = 7h30
  em Brasília). Confere `Authorization: Bearer ${CRON_SECRET}`; sem `RESEND_API_KEY`, `EMAIL_REMETENTE` ou
  `CRON_SECRET`, não envia nada (como o Google Agenda sem chave). Lê os pendentes com o cliente admin, busca o e-mail
  de login de cada pessoa, monta o HTML da prévia e envia pela API HTTP do Resend (`fetch`, sem dependência nova).
  Registra cada envio; repetir a rota no mesmo dia não manda de novo.
- **Perfil:** cartão "Resumo diário por e-mail" com a chave, gravando por `definir_resumo_email`.

## O que o Evandro faz (fora do código)

- Verificar o domínio de envio no Resend (registros DNS) e criar a chave.
- Na Vercel, em Production: `RESEND_API_KEY` (Sensitive), `EMAIL_REMETENTE` (ex.: `Raion <avisos@dominio>`) e
  `CRON_SECRET` (texto aleatório longo, Sensitive). Nada disso entra no repositório nem no chat.

## Testes

- Banco: pendentes só dos tipos escolhidos, não lidos, da empresa certa, de membro ativo com resumo ligado; janela a
  partir do último envio; `definir_resumo_email` só muda a própria linha; app não lê nem escreve
  `resumos_email_envios`; isolamento entre empresas.
- Puros: montagem do e-mail (agrupamento, assunto, escape de HTML, links absolutos) e a rota (sem segredo → 401;
  sem chave → não envia; segundo disparo no dia → não reenvia).

## Ordem

Uma PR. Migration aplicada em produção pelo fluxo aprovado antes do merge. O envio só começa quando as três
variáveis existirem na Vercel.
