<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Raion CRM — instruções para qualquer agente

As regras do projeto estão no `CLAUDE.md` e valem para todo agente (Claude, Codex ou outro), não só para o Claude. Leia-o antes de qualquer tarefa.

- Estado atual e PRs abertas: `docs/PROJECT_STATUS.md`. O que ainda não existe: `docs/ROADMAP.md`.
- Arquitetura: `docs/arquitetura.md`. Regras de negócio: `docs/regras-negocio.md`.
- `PROGRESS.md` e `HANDOFF.md` são históricos; não os use como estado atual nem os atualize.
- Nunca mescle PR, rode operação destrutiva em produção ou insira dados em `point_ledger`/`eventos` sem autorização explícita do Evandro.
- O bloco acima é gerado pelo `next dev`: não o edite; escreva instruções do projeto só abaixo dele.
