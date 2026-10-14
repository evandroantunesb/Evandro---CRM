# Backup dos arquivos físicos do Supabase Storage → Backblaze B2

## Estado

**PR de preparação, NÃO mesclada e NÃO executada.** Nenhum backup de Storage é disparado por push, CI, merge ou agendamento. Exige autorização separada para merge e para o primeiro teste real.

Complementa, mas **não substitui**, o backup lógico PostgreSQL em `.github/workflows/backup-producao.yml`.

## Inventário e escopo

Inventário conhecido da restauração lógica isolada (13/10/2026):

| Bucket (privado) | Objetos | Bytes informados nos metadados |
|---|---:|---:|
| `anexos` | 2 | 489270 |
| `avatares` | 1 | 23500 |
| `proposta-marca` | 1 | 205376 |
| `recompensas` | 3 | 208406 |

Total conhecido: **7 objetos**, **926552 bytes** de metadados. O workflow **não fixa** nomes nem quantidade: consulta todos os buckets do banco de produção em tempo de execução. Como a fonte pode mudar, os totais do primeiro teste devem ser conferidos com o inventário dessa execução.

### Método

1. Na `main`, mediante `workflow_dispatch` e confirmação `iniciar-backup-storage`, valida repositório, ref, URL e project ref do Supabase e destino B2 previamente aprovado.
2. Usa a URL Session Pooler já configurada em `SUPABASE_BACKUP_DB_URL` para obter um inventário **somente leitura** de `storage.buckets` e `storage.objects` (também documenta buckets vazios).
3. Faz download de cada objeto privado pela API `GET /storage/v1/object/authenticated/<bucket>/<path>` com chave administrativa **apenas no runner efêmero**. Download por streaming, com até 3 tentativas. Se qualquer objeto falhar ou o tamanho não corresponder aos metadados, **aborta sem publicar pacote completo**. Nomes e URLs não são impressos nos logs.
4. Grava os bytes com nomes opacos sequenciais `objetos/00000001.bin`, independentemente do caminho original, evitando travessia de diretório. Dentro de `manifest.json`, guarda nome original do bucket, caminho, número de bytes, SHA-256 por objeto, MIME e visibilidade do bucket.
5. Compacta `manifest.json`, `info.json` e `objetos/` no `storage.tar.gz`; calcula `sha256.txt`; envia ao bucket privado `raion-crm-backups` com SSE-AES256. Confere tamanho remoto via `head-object` e publica checksum por último.
6. Elimina do runner os arquivos temporários ao finalizar o job. **Não** usa artifacts GitHub para disponibilizar o backup.

Prefixo B2: `storage/<data UTC>/run-<run ID>-<tentativa>/`, com `storage.tar.gz` e `sha256.txt`.

### O que não garante

- Arquivos podem mudar entre a consulta SQL e o download: **não é snapshot atômico** e não substitui uma estratégia de consistência entre PostgreSQL e Storage. Divergência de tamanho causa falha; atualização concorrente de mesmo tamanho pode passar despercebida.
- Apenas bytes e manifesto são exportados; restaurar requires **recriar/conciliar buckets e metadados** no destino. Não reproduz automaticamente owner, políticas, versões antigas, timestamps, cache, nem permissões/segredos da plataforma.
- Checksum remoto ainda deve ser **validado após download**; restaurar bytes em um Storage **isolado** e verificar acessibilidade/integridade antes de declarar recuperação validada.
- Se forem usados sistemas de armazenamento fora do Supabase Storage, não são cobertos.
- A credencial administrativa é de leitura ampla via API (não existe papel service_role somente-leitura), embora o script execute apenas GET e SELECT; revisar acesso e rotacionar conforme política.
- Ainda não há execução agendada, Object Lock imutável, retenção definida, alerta de falha nem teste automático de restauração.

## Configuração do environment protegido

Reutilizar GitHub → Settings → Environments → `backup-producao` (restrito à branch `main`, sem bypass de administradores).

**Secrets existentes:**
- `SUPABASE_BACKUP_DB_URL` (Session Pooler projeto `wswpxdmgfdamvqhyztrm`);
- `B2_KEY_ID`;
- `B2_APPLICATION_KEY`.

**Novo secret necessário** em `backup-producao`:
- `SUPABASE_SERVICE_ROLE_KEY`: chave administrativa do mesmo projeto, obtida no painel Supabase → API Keys. Idealmente a chave `service_role` JWT compatível com `Authorization: Bearer` para Storage. O validador de destino também aceita `sb_secret_`, mas a compatibilidade da chave com o endpoint de download deverá ser confirmada no primeiro teste.

**Variables existentes:**
- `B2_BUCKET=raion-crm-backups`;
- `B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com`;
- `B2_REGION=us-east-005`.

Não adicionar segredos ao arquivo `.env`, código, logs, capturas de tela, comentários da PR ou conversa. Não reutilizar chaves públicas `anon`/publishable; não são suficientes para downloads privados sob RLS.

## Plano do primeiro teste (depende de autorizações)

1. Aprovação/merge da PR com CI verde.
2. Confirmar secret novo e variáveis no environment. Pedir autorização separada antes do disparo.
3. GitHub → Actions → **Backup arquivos Supabase Storage para B2 (manual)** → `main` → confirmar `iniciar-backup-storage`.
4. Validar job e resumo: totais de arquivos/bytes, ausência de erros, prefixo privado B2 e dois objetos.
5. Em estação segura, baixar `storage.tar.gz` e `sha256.txt`, comparar SHA-256 do arquivo **baixado**, extrair e verificar cada objeto usando `manifest.json`.
6. Testar **restauração em projeto Supabase Storage isolado**, nunca no projeto de produção, conferindo paths, contagem, bytes, hashes e permissões. Preparar procedimentos específicos de metadados, buckets e políticas RLS.
7. Só depois propor PR separada para agendamento, retenção, falhas/alertas e recuperação periódica.

**Não liberar migrations de produção por causa desta PR.** A restauração lógica PostgreSQL de 13/10/2026 foi demonstrada em isolamento, mas a estratégia completa ainda depende de Storage, operação recorrente e proteção contra exclusão/ransomware.
