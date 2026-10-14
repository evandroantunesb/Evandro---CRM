# Raion CRM — agendamento diário protegido de backups

**Estado desta mudança:** PR para revisão. **Nenhum agendamento foi habilitado**. O mero merge publica os cron jobs, mas eles **ignoram os backups agendados** enquanto as três variáveis de segurança não estiverem definidas como `true`.

## Testes já realizados antes desta PR

- Backup lógico PostgreSQL exportado, baixado do Backblaze B2, SHA-256 validado e restaurado em Supabase local isolado. Testes adicionais: 172 usuários/perfis conciliados, 182 FKs sem órfãos, 59 tabelas protegidas por RLS, 153 políticas presentes, papel anônimo sem linhas em `empresas`/`perfis`.
- Backup de bytes do Supabase Storage exportado, baixado do B2 e recuperado em Storage isolado (`public.ecr.aws/supabase/storage-api:v1.77.0`): 7/7 objetos acessados pela API com HTTP 200 e SHA-256 correto.
- **Atenção:** os testes não demonstram recuperação integral de todos os serviços do Supabase, nem snapshot simultâneo entre PostgreSQL e Storage.

## Fluxos e horários propostos

| Workflow | Cron UTC | Cascavel/PR (UTC−3) | Duração máxima do job |
|---|---|---|---|
| `.github/workflows/backup-producao.yml` | `23 3 * * *` | 00h23 | 60 minutos |
| `.github/workflows/backup-storage-producao.yml` | `41 4 * * *` | 01h41 | 90 minutos |

O GitHub Actions pode atrasar ou até **descartar execuções agendadas**; cron não é garantia de RPO de 24h. Os workflows usam `concurrency` para evitar duas execuções do **mesmo tipo** simultâneas e mantêm os prefixos de backup separados `postgres/` e `storage/`. Como os cron jobs são independentes e o Storage é exportado por listagem/download, não são snapshots transacionais entre si.

**Disparo manual preservado:** somente `workflow_dispatch` na `main` com `iniciar-backup` ou `iniciar-backup-storage`, independentemente das variáveis do agendamento. Sem gatilho em push ou pull_request. CI de PR não acessa secrets de produção.

## Trava de habilitação

Antes de ativar uma rotina diária, é preciso primeiro revisar e mesclar a PR **com autorização**, e depois configurar **as três variáveis no nível do repositório**:

GitHub → Settings → Secrets and variables → Actions → Variables:

| Variável | Valor exigido | Critério para autorização |
|---|---|---|
| `BACKUP_DIARIO_HABILITADO` | `true` | Aprovação explícita do responsável |
| `BACKUP_RETENCAO_VERIFICADA` | `true` | Política B2 inspecionada, retenção e recuperação histórica definidas |
| `BACKUP_ALERTAS_VERIFICADOS` | `true` | GitHub Issues/Notificações testadas e responsável designado |

**Não defina essas variáveis durante a criação/revisão da PR.** Quando alguma delas estiver ausente ou com valor diferente de `true`, cada execução agendada terminará na etapa de autorização, com `backup` **skipped** e resumo "Backup diário não habilitado". Atenção: o workflow pode aparecer verde mesmo sem gerar backup; conferir os **jobs e os objetos novos no B2**, nunca apenas a cor do workflow.

Depois de ativar, o job `backup` utiliza o mesmo environment protegido `backup-producao`. **Conferir previamente se o environment exige aprovação manual**: revisores obrigatórios podem impedir execuções realmente automáticas até aprovarem cada job.

Desabilitar urgentemente sem alterar código: alterar `BACKUP_DIARIO_HABILITADO` para `false` (o agendamento pode continuar disparando, mas não acessará produção). Isto não cancela uma execução já iniciada; use GitHub Actions → Cancel run se necessário.

## Retenção e imutabilidade Backblaze B2 — pendentes de configuração

**Esta PR NÃO cria, altera nem apaga políticas do bucket, arquivos ou chaves de acesso.** Proposta para aprovar separadamente:

1. Retenção operacional de **no mínimo 30 dias de pontos de recuperação diários** para **ambos** os prefixos `postgres/` e `storage/`, avaliando também recuperação de incidentes descobertos tardiamente.
2. Revisar no Backblaze B2 a configuração de **Lifecycle Rules** aplicável a chaves novas de backup (nomes únicos por execução). **Somente manter versões anteriores por 30 dias NÃO expira automaticamente objetos com nomes distintos**, portanto usar regra consistente para expiração dos objetos de backup, com testes antes de habilitar exclusão.
3. Preferir bucket/Object Lock com retenção imutável e chave B2 de backup sem permissão de apagar objetos. Verificar suporte, duração, custos e regras do Backblaze; não presumir que SSE-AES256 fornece imutabilidade.
4. **Não habilitar exclusão/expiração até confirmar** política no painel e garantir pelo menos um ponto restaurável por dia durante a janela desejada. Proceder com acesso administrativo separado.
5. Os backups já criados não devem ser modificados nem removidos nesta PR.

**Não marcar `BACKUP_RETENCAO_VERIFICADA=true` até essa revisão externa estar concluída.**

## Alertas de falha pelo GitHub Issues

O job `alertar_falha` é executado após uma falha do backup autorizado ou falha de validação de execução agendada e usa apenas o `GITHUB_TOKEN` com permissão `issues:write`. O script `.github/scripts/alertar-falha-backup.mjs` cria a issue pública `[Backup Raion] Falha PostgreSQL` ou `[Backup Raion] Falha Storage`; se já houver issue aberta do mesmo tipo, adiciona um comentário com link para a execução. **Nunca inclui caminho/nome de arquivo, chaves ou detalhes sensíveis de produção**. Fechar a issue manualmente só após confirmar recuperação da rotina.

Para que a issue seja um alerta recebido de verdade:

1. Garantir que **Issues** está habilitado e a permissão `issues:write` está disponível aos jobs da Actions.
2. Uma pessoa responsável deve ativar **Watch → Custom → Issues** no repositório e conferir suas notificações GitHub/e-mail.
3. **Testar o fluxo de falha de forma controlada e autorizada** antes de marcar `BACKUP_ALERTAS_VERIFICADOS=true`. CI verde não valida envio das notificações.
4. Verificar separadamente alertas de workflows agendados que **não chegaram a rodar** (GitHub pode atrasar/omitir schedules) e falhas por interrupção do próprio GitHub Actions. O job de Issues, sozinho, não cobre esses casos. Recomenda-se monitor externo de "último backup concluído" a ser especificado em uma etapa futura.
5. Os resumos de sucesso do Actions **não substituem** monitoramento de execução ou teste periódico de restore.

## Critérios para ativação (somente após aprovação separada)

- [ ] PR revisada e CI aprovada.
- [ ] Merge autorizado, sem executar produção na própria PR.
- [ ] Repositório e environment mantidos restritos à `main`, credenciais em environment secrets.
- [ ] Compatibilidade com revisores obrigatórios do environment conferida.
- [ ] Retenção no B2 conferida e mecanismo antiexclusão avaliado.
- [ ] Alertas recebidos e tratamento de falha definido/testado.
- [ ] Monitoramento de **ausência de execuções** definido.
- [ ] Responsável autoriza definir as três variáveis de ativação.
- [ ] Após primeiro ciclo automático, verificar **ambos** os pares `tar.gz`/`sha256.txt` no Backblaze B2 e agendar restauração isolada periódica.

**Migrations de produção:** a inclusão do cron não constitui liberação de migrations, não é cópia completa da plataforma Supabase e não modifica automaticamente políticas de retenção/backups já existentes.
