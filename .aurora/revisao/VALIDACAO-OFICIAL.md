# Validação oficial da emissão preservada — roteiro para o outro computador

Esta validação **não foi feita no notebook**: o Docker Desktop dele publica portas em `0.0.0.0`, e a trava do repositório (`pnpm test`, `pnpm start`, e2e) recusa essa configuração. A trava não foi afrouxada. No notebook rodou uma configuração temporária de teste (removida), apontada só para um banco descartável em 127.0.0.1; isso **não substitui** o que está abaixo.

Sem commit, push, PR, merge nem produção. Nada aqui toca em produção, e nenhuma migration é aplicada em produção por este roteiro.

## Regra de ouro: o banco local que já existe com dados NUNCA é reiniciado

`pnpm db:reset` é só `supabase db reset` e `pnpm db:types` é só `supabase gen types --local`. Os dois agem sobre o `project_id` do `supabase/config.toml` **do diretório onde rodam**. O padrão do repositório é `project_id = "evandro---crm"`, portas 54321/54322…, que é a stack local do dia a dia, com dados. Por isso:

- **Proibido** rodar `pnpm db:reset` (ou `supabase db reset`, `supabase stop --no-backup`, `docker volume rm`…) com o `config.toml` padrão e uma stack `evandro---crm` existente.
- `pnpm db:reset` só é permitido **depois** de a stack descartável estar criada e identificada (passo B), com o `config.toml` do worktree já apontando para ela e as 4 conferências do passo B1 aprovadas. Numa stack nova e vazia nem é preciso: `supabase start` já aplica as 87 migrations.
- Parar a stack no fim: só a descartável, depois de reconferir o `project_id` (passo C).

## A. Antes de tocar em qualquer banco (ordem obrigatória)

1. **Conferir o pacote:** `cd <pacote> && sha256sum -c PACOTE.sha256` tem de passar para todos os arquivos.
2. **Ler os scripts** `aplicar-passagem.sh` e `verificar-passagem.sh` (são curtos) antes de executá-los. Eles não fazem commit, push, PR nem merge e não tocam em banco.
3. **Reconstruir o worktree na base exata:** `git worktree add <caminho> 2780a53cf828caad5a41b5f5931ffa32a95c5695 --detach` (`BASE.txt`).
4. `bash aplicar-passagem.sh <pacote> <worktree>`, depois `bash verificar-passagem.sh <pacote> <worktree>`. **Exigir `COINCIDE`** (manifesto de 103 arquivos e `git status` sem nada fora dele). Se não coincidir, parar: nada abaixo é executado.
5. `pnpm install --frozen-lockfile` (Node 22, pnpm 10.33.0), se o `node_modules` não vier do disco.

## B. Stack descartável (só depois do `COINCIDE`)

Pré-requisito: Docker com portas só em loopback (127.0.0.1).

1. **Identificar o que já existe:** `docker ps --format '{{.Names}} {{.Ports}}'`. Anotar os `project_id` em uso (sufixo dos contêineres `supabase_*_<project_id>`) e as portas ocupadas. Não mexer em nada disso.
2. **Escolher** um `project_id` que não exista (ex.: `aurora-validacao-m2p0`) e um bloco de portas livres (ex.: 58xxx; confirmar com `netstat -ano | findstr :<porta>` cada uma).
3. **No worktree**, guardar o original (`cp supabase/config.toml ../config.toml.original`; no base ele tem SHA-256 `ff715f8f061d17951867fc3b124ab1a16f59b6ff6354fc3d4cb11b6307f8a838`) e editar `supabase/config.toml` **só no worktree**: trocar `project_id` e **todas** as linhas `port`/`*_port` (`grep -nE '^\s*[a-z_]*port\s*=' supabase/config.toml`). Esse arquivo não pode ir para commit.
4. **Subir:** `pnpm exec supabase start` (aplica as migrations do worktree numa stack nova).
5. **Gerar `.env.local` do worktree** (ignorado pelo git, nunca versionado) com os valores de `pnpm exec supabase status -o env`: URL da API, chave anon, service role e `SUPABASE_DB_URL`. Nunca colar essas chaves em chat, commit ou documento.

### B1. Conferências obrigatórias antes de qualquer `db:reset`, `db:types`, teste ou e2e

Todas têm de passar; qualquer divergência = parar.
1. **`project_id`:** `grep '^project_id' supabase/config.toml` é o descartável escolhido, e `pnpm exec supabase status -o env` responde para ele.
2. **Portas:** API e banco do `status` são as portas do bloco escolhido, e `docker ps` mostra contêineres `supabase_*_<project_descartável>` publicando só em `127.0.0.1`.
3. **Destino do `.env.local`:** a URL da API e o `SUPABASE_DB_URL` apontam para `127.0.0.1` nessas mesmas portas (nunca para 54321/54322 da stack com dados, e nunca para host remoto).
4. **Banco selecionado:** `docker exec supabase_db_<project_descartável> psql -U postgres -tAc "select current_database(), (select count(*) from auth.users)"` retorna `postgres|0` (banco sem usuários). Se houver usuário, **não é descartável: parar**.

## C. Execução (nesta ordem)

1. `pnpm db:reset` — **só aqui**, depois de B1, e já confirmando antes que `pnpm exec supabase status -o env` mostra a stack descartável. Aplica as 87 migrations, incluindo `20261022100000_propostas_emissoes.sql` e `20261022110000_produtividade_confirmada.sql` (confirmação em valor, fonte e responsável).
2. `pnpm db:types` — o arquivo gerado tem de ficar **idêntico** ao do worktree (`git diff --stat src/lib/supabase/database.types.ts` não pode mostrar mudança nova em relação ao pacote; conferir também pelo manifesto).
3. `pnpm lint` (esperado: 0 erros e 3 avisos de variáveis não usadas, já conhecidos) e `pnpm typecheck`.
4. `pnpm test` — **com a configuração do repositório (trava ligada)**. Esperado: tudo verde, exceto as 2 falhas de CRLF já conhecidas em `tests/negocios-gravacao.test.ts` (passam em cópia LF). Suítes que importam aqui:
   - `tests/proposta-simples.test.ts` (origem de potência/geração, produtividade confirmada, limites, hash, PDF de 3 páginas, condição de pagamento obrigatória, rodapé sem geração)
   - `tests/propostas-emissoes-db.test.ts` (RLS, token/versão/datas forjados, usuário nas duas empresas, arquivado, imutabilidade, cascata da empresa com PDF órfão, bucket)
   - `tests/propostas-emissoes-fluxo-db.test.ts` (emitir → baixar → reabrir; muda negócio, kit, produtividade e modelo; mesmo PDF byte a byte)
   - `tests/imagens-emissao.test.ts` (logo configurado que falha recusa a emissão; foto ausente usa o fallback; arquivo de outra empresa nunca é lido; data da confirmação em São Paulo)
   - `tests/produtividade-confirmada-db.test.ts` (só admin confirma, informando valor atual, fonte e responsável; mudar o valor apaga; ninguém grava direto; apagar o membro que confirmou não é bloqueado)
5. `pnpm build`.
6. e2e completo (`pnpm exec playwright test`), com atenção ao novo `e2e/12-proposta-emitida.spec.ts` (vendedor emite, cliente abre o link sem login, baixa o PDF; muda negócio e kit; mesmo link e mesmo PDF; v2 com outro link; SDR não vê o card; sem produtividade confirmada o PDF e a página saem sem geração e com o rodapé alternativo). **Esse spec nunca foi executado**; se falhar por seletor, o produto não é a causa até prova em contrário.
7. Conferência manual (5 minutos), na stack descartável: abrir a ficha de um negócio de teste, emitir, baixar o PDF pelo link, comparar visualmente com `.aurora/revisao/pdfs/imagens/` e com `.aurora/revisao/referencia/`. Testar também:
   - confirmar a produtividade em Configurações › Calculadora (valor, fonte e responsável);
   - emitir com condições de pagamento em várias linhas (cada linha vira um item na página 3);
   - tentar emitir com o campo de condições vazio (tem de ser recusado);
   - apontar o logo da identidade para um arquivo inexistente (a emissão tem de ser recusada);
   - tirar a foto da capa (a capa sai com o fundo sólido);
   - conferir que o PDF mostra o logo e as cores da empresa quando a identidade está configurada.
8. **Encerrar:** reconferir o `project_id` do `config.toml` do worktree (o descartável) e então `pnpm exec supabase stop --no-backup` — **somente** a descartável. Restaurar `supabase/config.toml` (`cp ../config.toml.original supabase/config.toml`) e confirmar `git diff --exit-code supabase/config.toml` sem diferença e SHA-256 `ff715f8f…a838`. Apagar o `.env.local` do worktree se ele só existir para esta validação. Rodar de novo `verificar-passagem.sh`: tem de voltar a `COINCIDE`.

## D. Registrar (no checkpoint `.aurora/checkpoints/m2-p0-fio-b-nora.md`, como item novo; sem segredos)

| Etapa | Resultado |
| --- | --- |
| `PACOTE.sha256` na cópia | |
| `verificar-passagem.sh` (COINCIDE, 103 arquivos) | |
| `project_id` e portas da stack descartável; B1 (4 conferências) | |
| `pnpm db:reset` (87 migrations) | |
| `pnpm db:types` idêntico | |
| lint / typecheck | |
| `pnpm test` oficial (contagem e falhas) | |
| `pnpm build` | |
| e2e completo, incluindo `12-proposta-emitida` | |
| Conferência manual (itens do passo C.7) | |
| Stack descartável parada e `config.toml` restaurado | |

## E. Aceites de produto ainda pendentes (do Evandro; a validação técnica não os substitui)

Estas recomendações estão implementadas como proposta e **não foram aceitas funcionalmente** até hoje:
1. Rodapé sem geração: "Esta proposta apresenta o sistema. Não inclui estimativa de geração, economia ou prazo de retorno." (redação da Nora).
2. Confirmação da produtividade pelo admin, com valor atual, fonte e responsável, como condição para a geração aparecer. O padrão de 120 kWh/kWp/mês nunca vale sozinho, e o valor técnico por empresa é decisão dela.
3. Manrope (títulos) e Inter (textos) embutidas no PDF das propostas de clientes.
4. Negócio com proposta emitida só pode ser arquivado, não apagado.
5. Textos reais de inclusões, garantias e etapas da empresa (os dos PDFs de revisão são amostra) e a foto real da capa.
6. Decisão sobre exclusão de empresa (bloqueio e fluxo de limpeza do bucket; só proposta no contrato, seção 7).

Depois da validação e dos aceites, o próximo passo (commit em branch própria, PR, CI, migration em produção só pelo fluxo `banco-producao.yml` com aprovação do Evandro) **depende de autorização explícita dele**.
