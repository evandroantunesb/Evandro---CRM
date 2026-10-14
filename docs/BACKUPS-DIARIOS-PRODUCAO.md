# Raion CRM — agendamento diário protegido de backups

**Estado em 2026-10-14:** workflows e monitoramento externo implantados; o responsável autorizou a ativação diária e confirmou ter definido as três Repository variables como `true`. Esses valores não puderam ser relidos pela integração GitHub; **o primeiro ciclo automático por evento `schedule` ainda NÃO foi comprovado**. Execuções manuais e pings do Healthchecks foram testados.

## Recuperação e testes já realizados

- Backup lógico PostgreSQL exportado, baixado do Backblaze B2, SHA-256 validado e restaurado em Supabase local isolado. Testes adicionais: 172 usuários/perfis conciliados, 182 FKs sem órfãos, 59 tabelas protegidas por RLS, 153 políticas presentes, papel anônimo sem linhas em `empresas`/`perfis`.
- Backup de bytes do Supabase Storage exportado, baixado do B2 e recuperado em Storage isolado (`public.ecr.aws/supabase/storage-api:v1.77.0`): 7/7 objetos acessados pela API com HTTP 200 e SHA-256 correto.
- **Atenção:** os testes não demonstram recuperação integral de todos os serviços do Supabase, nem snapshot simultâneo entre PostgreSQL e Storage.

## Fluxos e horários do agendamento diário

| Workflow | Cron UTC | Cascavel/PR (UTC−3) | Duração máxima do job |
|---|---|---|---|
| `.github/workflows/backup-producao.yml` | `23 3 * * *` | 00h23 | 60 minutos |
| `.github/workflows/backup-storage-producao.yml` | `41 4 * * *` | 01h41 | 90 minutos |

O GitHub Actions pode atrasar ou até **descartar execuções agendadas**; cron não é garantia de RPO de 24h. Os workflows usam `concurrency` para evitar duas execuções do **mesmo tipo** simultâneas e mantêm os prefixos de backup separados `postgres/` e `storage/`. Como os cron jobs são independentes e o Storage é exportado por listagem/download, não são snapshots transacionais entre si.

**Disparo manual preservado:** somente `workflow_dispatch` na `main` com `iniciar-backup` ou `iniciar-backup-storage`, independentemente das variáveis do agendamento. Sem gatilho em push ou pull_request. CI de PR não acessa secrets de produção.

## Trava de habilitação e controle de produção

Os workflows foram incorporados à `main` via PR #173. Uma execução de evento `schedule` só acessa a produção quando **todas** as três variáveis abaixo, no **nível do repositório**, forem exatamente `true`. O responsável confirmou a configuração em 14/10/2026; validar o efeito no primeiro ciclo agendado.

| Variável | Valor exigido | Evidência operacional |
|---|---|---|
| `BACKUP_DIARIO_HABILITADO` | `true` | Ativação diária explicitamente autorizada |
| `BACKUP_RETENCAO_VERIFICADA` | `true` | Object Lock Compliance / 30 dias verificado em novos objetos dos dois tipos |
| `BACKUP_ALERTAS_VERIFICADOS` | `true` | Simulação de falha + e-mails GitHub e Healthchecks validados |

GitHub → Settings → Secrets and variables → Actions → **Variables** (Repository variables). A integração usada para documentação **não lê os valores atuais dessas variáveis**; não afirmar verificação independente.

Se alguma delas não for `true`, o job `validar` pode encerrar **verde**, mas marcar `autorizado=false` e pular o job `backup`. **Nunca tomar a cor verde do workflow, sozinha, como prova de que houve backup.** Conferir jobs, B2 e ping.

O environment `backup-producao` foi conferido pelo responsável: **Selected branches and tags = apenas `main`**, nenhuma tag e `Required reviewers` desativado; os segredos de acesso à produção e pings ficam nesse environment. O backup manual continua permitido na `main` com confirmação `iniciar-backup` ou `iniciar-backup-storage` (não depende das três variáveis).

**Pausa emergencial:** mudar `BACKUP_DIARIO_HABILITADO=false` impede novos backups agendados; execução que já iniciou não é cancelada por essa mudança (cancelar manualmente no GitHub Actions se autorizado). Nenhuma alteração de environment, segredo, migração ou retenção é implícita nessa autorização.

## Retenção e imutabilidade Backblaze B2

- Bucket `raion-crm-backups` nos prefixos `postgres/` e `storage/`. **Object Lock habilitado com retenção padrão de 30 dias em modo Compliance**.
- Teste real com dois arquivos de cada tipo (`backup.tar.gz` + `sha256.txt` e `storage.tar.gz` + `sha256.txt`) confirmou a retenção de novos uploads: PostgreSQL [run 38500844122](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38500844122); Storage [run 38500063581](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38500063581). No primeiro teste a expiração foi 13/11/2026; verificar individualmente uploads posteriores.
- **A retenção não protege retroativamente** versões anteriores à regra e **não apaga** os objetos ao expirar. Lifecycle mantém **todas as versões**, sem exclusão automática: monitorar custo e crescimento. Nunca alterar regra, apagar arquivos ou impor lifecycle sem análise de recuperação e autorização específica.
- Os objetos são enviados com `--sse AES256`, que cifra no armazenamento, mas não substitui Object Lock. Cada upload usa prefixo exclusivo e checksum SHA-256.

**Limites:** 30 dias é tempo mínimo de bloqueio de exclusão de cada nova versão, **não** política automática de expiração ou garantia de 30 snapshots completos. PostgreSQL e Storage têm horários diferentes e não formam snapshot transacional; o dump lógico não é PITR nem cópia de todos os serviços da plataforma.

## Alertas de falha pelo GitHub Issues

O job `alertar_falha` usa `GITHUB_TOKEN` com `issues: write`, **sem credenciais do Supabase ou do B2**, para criar Issue pública `[Backup Raion] Falha PostgreSQL` ou `[Backup Raion] Falha Storage`, ou comentar na Issue aberta do mesmo tipo. Não inclui dados de clientes, nomes dos arquivos privados ou segredos. Só fechar a Issue após corrigir a falha e confirmar novo backup útil.

**Validado:** o responsável ativou **Watch → Custom → Issues** e e-mail nas notificações; Issue produzida pelo `github-actions[bot]` foi recebida. O workflow manual isolado da PR #178 simulou falha: [run 38503323578](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38503323578), job de falha vermelho de propósito, job de alerta concluído com sucesso, e-mail recebido. Essa simulação não mexeu na produção.

**Limite:** se o GitHub Actions deixar de disparar um workflow agendado ou houver interrupção global, pode não haver job `alertar_falha`; o Healthchecks.io complementa essa cobertura.

## Monitor externo — Healthchecks.io

Monitores criados: `Raion CRM - PostgreSQL` e `Raion CRM - Storage`. Ambos configurados em **Cron UTC idêntico ao respectivo workflow** e `Grace Time` de **3 horas**. Alertas de e-mail ativos em ambos e **envio de e-mail de teste recebido** pelo responsável.

| Monitor | Cron UTC | Limite de atraso aproximado, em Cascavel | Secret no environment `backup-producao` |
|---|---|---|---|
| PostgreSQL | `23 3 * * *` | 03h23 | `HEALTHCHECKS_POSTGRES_PING_URL` |
| Storage | `41 4 * * *` | 04h41 | `HEALTHCHECKS_STORAGE_PING_URL` |

A PR #180 inseriu os pings de sucesso **somente depois** de publicar o arquivo principal e o `sha256.txt` no B2, com comparação de tamanho remoto dos dois. URL deve ter formato oficial `https://hc-ping.com/<uuid>`; jamais versionar, imprimir ou enviar os valores privados. Ping do PostgreSQL confirmado em [run manual 38540411558](https://github.com/evandroantunesb/Evandro---CRM/actions/runs/38540411558) às 06h13 de 14/10/2026 (Cascavel). O monitor Storage recebeu ping às 06h20 no mesmo dia, segundo captura enviada pelo responsável.

Se a chamada ao Healthchecks falhar, o job de backup falha e pode abrir Issue **mesmo com os arquivos já publicados com sucesso no B2**. Nesse caso, conferir primeiro os objetos/checksums antes de repetir a exportação. Os pings não comprovam restauração, consistência de dados ou inviolabilidade futura; alertam sobre ausência de conclusão comunicada.

## Situação de ativação e critérios para encerrar a validação

- [x] Workflows mesclados na `main` com aprovação e CI; proteção de execução manual/agendada.
- [x] Environment `backup-producao` restrito à `main`, sem revisores obrigatórios; segredos no environment.
- [x] Recuperação isolada de PostgreSQL (172 usuários/perfis) e de Storage (7/7 objetos) demonstrada.
- [x] Retenção B2 Object Lock Compliance 30 dias conferida em novos backups de ambos os tipos.
- [x] Alertas GitHub Issues e falha simulada validados com e-mail.
- [x] Dois monitores Healthchecks com pings reais e e-mail de teste recebido.
- [x] Autorização para criar três variáveis `true` de agendamento; **configuração relatada pelo responsável**, sem leitura direta dos valores.
- [ ] **Primeiro ciclo real `schedule`** em ambos os workflows: conferir que job `backup` rodou (não `skipped`), novos pares `tar.gz`/`sha256.txt` estão no B2, hashes/versões e Object Lock Compliance 30 dias aplicados, e pings dos monitores atualizados no horário.
- [ ] Definir cadência para novas restaurações isoladas e governança de crescimento/custos do B2, **sem habilitar exclusão automática agora**.

Após cada incidente ou ausência de ping: verificar GitHub Actions, **eventos `schedule`**, destino B2 e retenção individual, revisar Issue e só então resolver. Se houver diferença entre este documento e os arquivos de workflow, **o código da `main` é a fonte da verdade**.

**Migrations de produção:** a inclusão do cron não constitui liberação de migrations, não é cópia completa da plataforma Supabase e não modifica automaticamente políticas de retenção/backups já existentes.
