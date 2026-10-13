# Backup PostgreSQL de produção — primeira validação

Estado: **preparado, NÃO executado ou validado**. O merge do workflow por si só **não** faz backup.

## Objetivo e fronteiras

- Projeto Supabase esperado: `wswpxdmgfdamvqhyztrm`.
- Destino: bucket privado do Backblaze B2, região `us-east-005`.
- Workflow: `.github/workflows/backup-producao.yml`, somente `workflow_dispatch`.
- Saída: `roles.sql`, `schema.sql`, `data.sql` e `info.txt` compactados, acompanhados de SHA-256.
- A leitura é feita com `supabase db dump`, que aplica filtros para schemas internos; **não equivale a um snapshot completo da plataforma Supabase**. O workflow não faz nenhuma escrita SQL nem alterações de banco.
- **Não cobre bytes de arquivos Supabase Storage**, nem garante restauração de todo Auth, extensões, migrations/histórico e outros serviços gerenciados. Estes exigem inventário e validação próprios.

## Pré-requisitos do ambiente GitHub `backup-producao`

Configurar em Settings → Environments → `backup-producao`.

Environment secrets (não compartilhar valores em chats, tickets, commits ou capturas):
- `B2_KEY_ID`: keyID de uma application key **restrita ao bucket**.
- `B2_APPLICATION_KEY`: chave secreta correspondente.
- `SUPABASE_BACKUP_DB_URL`: string Session pooler do PostgreSQL de produção, porta 5432, senha corretamente codificada na URL.

Environment variables:
- `B2_BUCKET`: nome **exato** do bucket existente. Confirmar no Backblaze se termina em `-backup` ou `-backups` antes do primeiro teste.
- `B2_ENDPOINT`: `https://s3.us-east-005.backblazeb2.com`.
- `B2_REGION`: `us-east-005`.

Configurar deployment branches do environment somente para `main`. O workflow exige explicitamente `main` e valida o nome do projeto Supabase, o usuário `postgres.<project_ref>` e o host/porta do Session pooler com o validador já existente no repositório.

Recomenda-se credencial de banco específica para backup, com privilégios mínimos, se for possível garantir acesso a todos os dados necessários; a URL com papel privilegiado permite a leitura de dados pessoais. Revisar quem tem acesso administrativo ao repositório e ao environment.

## Primeiro teste manual (somente após aprovação expressa)

1. Revisar e aprovar a PR do workflow. **Não mesclar sem autorização.**
2. Após o merge, abrir GitHub → Actions → **Backup PostgreSQL para Backblaze B2 (manual)**.
3. Selecionar a branch `main` e clicar em **Run workflow**.
4. Digitar exatamente `iniciar-backup` no campo de confirmação.
5. Conferir a execução, sem copiar logs sensíveis para canais públicos.
6. Confirmar no Backblaze o prefixo `postgres/<instante>/run-<número>-<tentativa>/`, contendo `backup.tar.gz` e `sha256.txt`.
7. Baixar ambos em ambiente seguro, validar o checksum SHA-256 e **restaurar em um banco de teste isolado**. Verificar schema, dados de amostra, papéis, RLS e dependências; nunca restaurar sobre produção.

O workflow confere a existência do objeto via tamanho remoto, mas **não comprova restauração nem verifica os bytes baixados**. A restauração isolada continua obrigatória antes de declarar o sistema protegido.

## Critérios de liberação para migrations e agendamento diário

- [ ] Nome real do bucket confirmado.
- [ ] Ambiente GitHub restrito a `main` confirmado.
- [ ] Conexão ao projeto correto validada sem vazamento de segredo.
- [ ] Dump gerado e upload realizado.
- [ ] Hash SHA-256 conferido após download.
- [ ] Restauração em banco isolado comprovada.
- [ ] Escopo complementar (Auth, Storage e histórico de migrations) avaliado e coberto conforme necessidade.
- [ ] Retenção, versionamento/Object Lock e alertas de falha definidos.
- [ ] Só então adicionar `schedule` diário em PR específica, após autorização.

Enquanto esses itens não estiverem verificados, **não considerar o backup operacional e manter migrations de produção bloqueadas**.
