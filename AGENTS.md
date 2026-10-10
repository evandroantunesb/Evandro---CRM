<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Raion CRM — guia técnico para agentes e desenvolvedores

Regras de trabalho (autorização, merges, produção, gamificação) estão no `CLAUDE.md` e valem para qualquer agente. Estado atual: `docs/PROJECT_STATUS.md`. **Código e GitHub são a fonte da verdade**; documentação pode estar atrasada.

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
- **Migrations em produção só pelo fluxo existente:** `banco-producao.yml` roda `supabase db push --include-all` em push na `main` que toque `supabase/migrations/**`, ou via `workflow_dispatch`. Nunca aplique manualmente.
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
- **Limites da trava:** a checagem das chaves só lê o payload do JWT; **não verifica assinatura** e não protege contra um token forjado de propósito. A porta de `SUPABASE_DB_URL` não é validada (vem do `supabase/config.toml` e pode variar entre desenvolvedores), então um túnel local na porta do banco passaria; essa variável só é usada pelas suítes `*-db`.
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
