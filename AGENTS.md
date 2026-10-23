<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Raion CRM — guia técnico para agentes e desenvolvedores

Regras de trabalho (autorização, merges, produção, gamificação) estão no `CLAUDE.md` e valem para qualquer agente. Estado atual: `docs/PROJECT_STATUS.md`. **Código e GitHub são a fonte da verdade**; documentação pode estar atrasada.

**Escopo integral aprovado e obrigatório antes de qualquer trabalho:** [`docs/RAION_CRM_PLANO_MESTRE.md`](docs/RAION_CRM_PLANO_MESTRE.md). Identifique ID da frente (A01–G08), marco (M0–M15), aceite funcional e dependências; siga a regra completa em `CLAUDE.md`. Nada é descartado do inventário como "fora do escopo". Não iniciar outra frente sem autorização.

## Stack

- **Next.js 16** (App Router — ver aviso acima) · **React 19** · **TypeScript** · **Tailwind 4**
- **Supabase:** Postgres, Auth, RLS e Storage (região São Paulo)
- Zod 4 · `@react-pdf/renderer` · `@dnd-kit/core` · `lucide-react` · Vitest · pnpm · Node 22
- **Vercel** (deploy da `main` + preview por PR) · GitHub Actions (`ci.yml`, `banco-producao.yml`)
- Produção: `raion-crm-roan.vercel.app` (`raion-crm.vercel.app`, sem "-roan", é de terceiros)

## Multiempresa

- Todo dado operacional tem `empresa_id`; isolamento por políticas de RLS em `supabase/migrations/`. Toda tabela nova precisa de `empresa_id` + RLS.
- Papéis por empresa em `empresa_membros.papel`: `admin`, `gestor`, `vendedor`, `sdr`. Perfil de gamificação: `sdr`, `closer`, `cs_farmer`. Status: `ativo`, `inativo`, `desligado`.
- Visibilidade de negócio: `pode_ver_responsavel()` (admin da empresa, o responsável ou o gestor da equipe dele).
- Super-admin (`plataforma_admins`) **não fura RLS**: só libera `/super-admin/*`. Um 404 em negócio costuma ser permissão.
- Rotas públicas sem login ficam em `ROTAS_PUBLICAS` (`src/lib/supabase/proxy.ts`).

## Banco e migrations

- `supabase/migrations/` é a **fonte da verdade do banco** (schema, funções, triggers, RLS). Leia a migration mais recente do módulo antes de criar outra.
- Nome: `AAAAMMDDHHMMSS_nome.sql`. **Confira as migrations das PRs abertas antes de escolher o prefixo** — versões duplicadas quebram o `db push`.
- `src/lib/supabase/database.types.ts` é **gerado** (`pnpm db:types`). Não edite à mão; o CI compara byte a byte.
- **Migrations em produção só pelo fluxo existente, sempre manual e aprovado:** `banco-producao.yml` não roda em push. Cada disparo (`workflow_dispatch`) exige a ref (`main` ou tag `migracao-<nome>`, sem `/`), o SHA completo e a aprovação do Evandro no environment `producao-banco`, inclusive para o dry-run. São dois disparos independentes: modo `conferir` (`supabase db push --include-all --dry-run`) e modo `aplicar` (`--include-all`, com a confirmação `aplicar-<sha7>`). `--include-all` aplica **todas** as migrations pendentes da ref, não só a mais recente: o conjunto é o que o dry-run lista. Merge na `main` não aplica nada sozinho. Nunca aplique manualmente.
- **Seeds em produção** (`seed-*.yml`): só da `main`, com SHA confirmado e aprovação no environment `producao-seed`. Os secrets de produção ficam nesses environments e só as etapas que conectam ao banco os recebem; o validador comum é `.github/scripts/validar-disparo-producao.sh`. Antes de conectar, `.github/scripts/validar-destino-producao.mjs` confere que `SUPABASE_PROJECT_ID` é o projeto de produção e que `SUPABASE_DB_URL` é o Session Pooler de `sa-east-1` (porta 5432, banco `postgres`, usuário `postgres.<ref>` — o pooler roteia pelo usuário); nos seeds, que a chave JWT é `service_role` do mesmo projeto. Agentes nunca aprovam deployments (ver `CLAUDE.md`).
- Migration aplicada em produção antes do merge só com autorização explícita do Evandro; enquanto isso, produção fica à frente da `main` — confira antes de criar ou reaplicar migration.
- **O preview da Vercel usa o banco de produção.** PR com migration nova quebra no preview até a migration ser aplicada; código que depende de coluna nova não pode chegar antes da migration.
- `point_ledger` e `eventos` são imutáveis até para `service_role` (só a função motor `security definer` escreve, sempre com `now()`). `atividades` é imutável para todos. `negocios.updated_at` é sempre sobrescrito por `tocar_updated_at()`.

## Comandos

| Comando | Uso |
| --- | --- |
| `pnpm dev` | servidor de desenvolvimento (recusa Supabase não local) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm test` | Vitest (suítes `*-db` e `rls` precisam de Supabase local/Docker) |
| `pnpm build` | build de produção |
| `pnpm db:reset` | recria o banco local a partir das migrations |
| `pnpm db:types` | regenera `database.types.ts` (formata com `oxfmt`) |
| `pnpm super-admin <email> <senha> "<nome>"` | cria/promove super-admin (só no Supabase local; recusa outro host antes de conectar) |

### Ambiente local e trava de segurança

- **`.env.local` aponta exclusivamente para o Supabase local** (`pnpm exec supabase status -o env` mostra URL, anon key e service role). Nunca coloque credenciais remotas nele. Produção usa só as variáveis da Vercel e os secrets do GitHub.
- **Trava fail-closed:** `pnpm dev`, `pnpm start`, `pnpm super-admin` e `pnpm test` recusam, antes de iniciar o app ou conectar, qualquer ambiente efetivo com URL Supabase ausente, inválida ou fora de `127.0.0.1`/`localhost`/`::1` (inclusive `SUPABASE_DB_URL` e qualquer valor que cite domínio remoto do Supabase). Também exigem que `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sejam as chaves JWT do Supabase local (emissor `supabase-demo`, papéis `anon`/`service_role`, sem claim `ref`); chaves de projeto remoto e o formato `sb_…` são recusados, o que cobre também um túnel/proxy em host local. O ambiente é resolvido com a precedência real de cada ferramenta (processo > arquivos `.env*`; Next dev, `next start` e Vite/Vitest/super-admin têm ordens diferentes). Código: `scripts/lib/guard-supabase-local.mjs` (fonte única; `tests/guard-supabase-local.ts` só reexporta) e `scripts/lib/ambiente-local.mjs`.
- **Limites da trava:** a checagem das chaves só lê o payload do JWT; **não verifica assinatura** e não protege contra um token forjado de propósito. Essa trava pura só prova que cada destino é local; quem prova que **API e Postgres são da mesma stack** é `scripts/lib/stack-supabase-local.mjs`, chamado por `tests/global-setup.ts` (via `tests/preparar-banco.ts`) e por `e2e/global-setup.ts` antes de qualquer escrita: compara `NEXT_PUBLIC_SUPABASE_URL`, as chaves e `SUPABASE_DB_URL` com o que `pnpm exec supabase status -o env` reporta para este repositório (host literal e porta; usuário, senha e banco; sem presumir `54321`↔`54322`). Sem `SUPABASE_DB_URL`, o banco usado é o `DB_URL` do CLI (não há mais padrão `127.0.0.1:54322`); variáveis `PG*`/`DATABASE_URL` são recusadas; falha ao obter o status (Docker/stack parados, saída incompleta) aborta. As suítes `*-db` só obtêm a conexão por `tests/banco-local.ts` (`urlBancoLocal()`), e `tests/banco-local-uso.test.ts` falha se uma suíte ler `SUPABASE_DB_URL` ou fixar porta. O que o CLI reporta (configuração) é conferido com o que o **Docker publica de fato** (`scripts/lib/docker-stack-local.mjs`): contêineres `supabase_kong_<id>`/`supabase_db_<id>` rodando e saudáveis, rótulos e rede do projeto, porta do host única e só em loopback, nenhum outro contêiner na mesma porta, e Docker local (socket unix/npipe). O CLI roda pelo binário real do pacote `supabase`, sem shell e sem o shim (`SUPABASE_CLI_BINARY_OVERRIDE` é ignorada). **e2e:** o `webServer` do Playwright é `scripts/e2e-servidor.mjs`, que verifica a stack, apaga `.next`, reconstrói com o ambiente verificado (o Next embute a URL da API no build) e só então inicia o app; o `globalSetup` prova, antes de criar a base, que os scripts servidos são idênticos aos do build em disco e embutem a API verificada (`scripts/lib/bundle-servido.mjs`); servidor já de pé na porta é recusado. Limites: não há consulta de volta ao banco, nem checagem de processos fora do Docker que escutem as mesmas portas; módulos carregados pelo Playwright não podem usar `import.meta` (transpilador CJS). `pnpm test` e o e2e exigem Docker com a stack deste repositório no ar e o host `127.0.0.1` (não `localhost`) no `.env.local`.
- **Portas do Docker só em loopback (a trava recusa `0.0.0.0` e `::`):** o Supabase CLI publica as portas sem IP (`-p <porta>:<porta-interna>`), então vale o padrão do Docker (todas as interfaces). A opção `"ip"` do `daemon.json` **só vale para a bridge padrão (`docker0`)**; o CLI usa uma rede bridge **personalizada** (`supabase_network_<project_id>`), cujo padrão vem de `default-network-opts`. Configure o daemon (Docker Desktop: Settings → Docker Engine; Linux: `/etc/docker/daemon.json`; preserve as chaves que já existem) com `{"default-network-opts": {"bridge": {"com.docker.network.bridge.host_binding_ipv4": "127.0.0.1"}}}` e reinicie o Docker. **Só afeta redes criadas depois**: a rede e os contêineres de uma stack já existente mantêm `0.0.0.0` e precisam ser recriados (`pnpm exec supabase stop` e `pnpm exec supabase start`; sem `--no-backup` o stop preserva os dados). Confirme o resultado real, nunca presuma: `docker network inspect supabase_network_<project_id> --format '{{json .Options}}'` deve mostrar `host_binding_ipv4` = `127.0.0.1` e `docker inspect supabase_kong_<project_id> supabase_db_<project_id> --format '{{json .NetworkSettings.Ports}}'` só `127.0.0.1`/`::1`. A mudança vale para **todas** as redes novas da máquina (um serviço que precise ser acessível pela rede local deve publicar com IP explícito). **Host literal:** a publicação precisa incluir o IP do host da URL que os testes usam (`127.0.0.1` ou `[::1]`, conforme `supabase status`); publicar só em `::1` não comprova uma URL `127.0.0.1` (e vice-versa), e `localhost` é recusado. **Destino do Docker:** `DOCKER_HOST`, `DOCKER_CONTEXT` e `DOCKER_CONFIG` não podem existir só em arquivo `.env*` nem divergir do `process.env` (o `docker` e o Supabase CLI herdam o ambiente explícito do processo); `DOCKER_HOST` e `DOCKER_CONTEXT` definidos juntos são recusados (a precedência entre eles não é garantida entre versões do CLI) e o endpoint efetivo é o que o próprio `docker context inspect` reporta. No CI (`ci.yml` e `navegador-obras.yml`, runner descartável) um passo faz isso antes do `supabase start`, prova o efeito com uma rede de sonda e confere as portas de Kong e PostgreSQL depois; não há variável de ambiente que libere a trava.
- **Não há override.** `pnpm build`, os comandos da Vercel, o CI e os workflows de produção não passam por essa trava. Se houver necessidade real de executar algo contra o remoto, não afrouxe a trava: proponha um fluxo separado, com autorização explícita do Evandro.
- **Cuidado com** `vercel env pull` (pode reescrever o `.env.local` com valores de produção) e com arquivos como `.env.production.local` (o `next build`/`next start` os carregam sozinhos). Para guardar valores remotos fora do carregamento automático, use um nome que nenhuma ferramenta leia sozinha, como `.env.remoto`, e nunca o versione.

Sem Docker (sessões na nuvem), valide com lint + typecheck + testes puros + build e deixe o CI ser a referência. Falha "rate limit exceeded" no `supabase/setup-cli` é limite do GitHub: relance o job.

## Onde olhar antes de alterar cada módulo

| Módulo | Consultar |
| --- | --- |
| Negócios, Kanban, contatos, tarefas, notas | `src/app/(app)/negocios`, `contatos`, `tarefas` · `src/lib/acoes/*` · `src/lib/crm.ts` · `src/lib/linha-do-tempo.ts` |
| SDR, qualificação, handoff | `src/lib/qualificacao.ts` · `src/app/(app)/negocios/[id]/qualificacao.tsx`, `feedback-handoff.tsx` · migrations `*_sdr*`, `*handoff*` |
| Distribuição e leads parados | `src/lib/distribuicao-leads.ts`, `leads-parados.ts`, `leads-sem-contato.ts`, `propostas-paradas.ts` · `src/app/(app)/painel` |
| Calculadora, kit, proposta | `src/lib/calculadora.ts` · `src/lib/acoes/calculadora.ts`, `propostas.ts` · `src/lib/propostas/` · `src/components/kit-componentes.tsx` · `src/app/(app)/configuracoes/{calculadora,propostas}` |
| Contrato e pagamento | `src/lib/contrato.ts` · `src/lib/acoes/contratos.ts` · `src/app/contrato/[token]` · trigger `travar_contrato_com_pagamento` · RPC `confirmar_pagamento` |
| Gamificação | `src/lib/gamificacao.ts` · `src/app/(app)/gamificacao` — visões em `_gerencial/` (admin/gestor) e `_pessoal/` (participantes), componentes, tema escuro e CSS em `_compartilhado/` (`gamificacao.css`, `tema-gamificacao.tsx`), telas admin em `administracao/` · imagem das recompensas: `administracao/_compartilhado/imagem-recompensa-admin.tsx`, `menu-imagem-recompensa.tsx`, `src/components/editor-imagem.tsx`, `src/lib/recortar-imagem.ts`, `imagem-recompensa-gf.tsx`, `src/lib/imagem-upload.ts`, `src/lib/storage-imagens.ts`, migration `20261006120000_recompensas_imagem.sql` · migrations `*gamificacao*` · testes `tests/gamificacao-*`, `tests/imagem-upload.test.ts`, `tests/recompensas-imagem-db.test.ts` |
| Metas e comissões | `src/lib/metas.ts`, `src/lib/comissoes.ts` · `calcular_realizado_meta`, `calcular_receita_causal_comissao`, `fechar_comissao` |
| Captura de leads | `src/lib/acoes/captura.ts` · `src/app/captura/[token]` · `src/app/(app)/configuracoes/captura` |
| Super-admin e cobrança | `src/app/(app)/super-admin` · `src/lib/cobranca.ts` |
| Auth, sessão, empresa atual | `src/lib/sessao.ts` · `src/lib/supabase/*` · `src/proxy.ts` |
| Componentes e identidade visual | `src/components/ui.tsx`, `marca.tsx` · `src/app/globals.css` |
| Scripts de seed | `scripts/` — leia o script inteiro antes de qualquer execução; Base Demo em `seed-base-demo.mjs` (PR #132) |

Estrutura de diretórios completa e armadilhas: `docs/arquitetura.md`.

## Branches, PRs e clones

- Antes de editar: `git fetch`, parta de `origin/main` (ou da branch correta da PR) e confira `git status/log/diff`.
- Há muitas **branches antigas e PRs empilhadas** já mescladas ou superadas. Antes de retomar ou mesclar qualquer uma, compare o diff com a `main` atual; não reintroduza lógica substituída nem migrations com prefixo conflitante.
- Apagar a branch de uma PR mesclada que tem PRs filhas abertas faz o GitHub mudar a base delas para `main`.
- **Clone local antigo (Windows):** pode ter centenas de arquivos "modificados" só por diferença de CRLF. Não use como base de desenvolvimento; sincronize um clone limpo a partir do remoto antes de editar e nunca commite mudanças de quebra de linha junto com trabalho real.
