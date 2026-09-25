# Raion CRM

CRM de funil de vendas para empresas de energia solar, multiempresa desde o primeiro dia.

- **App:** Next.js 16 (App Router) + TypeScript + Tailwind
- **Banco, login e arquivos:** Supabase (Postgres com RLS)
- **Testes:** Vitest contra o Supabase local

## Rodar localmente

Pré-requisitos: Node 22, pnpm e Docker.

```bash
pnpm install
pnpm supabase start                      # sobe Postgres, Auth e o Mailpit (e-mails em http://127.0.0.1:54324)
cp .env.example .env.local               # preencha com os valores de `pnpm supabase status`
pnpm super-admin voce@email.com senha "Seu Nome"   # cria o dono da plataforma
pnpm dev
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | App em http://localhost:3000 |
| `pnpm test` | Testes de isolamento entre empresas (precisa do Supabase local) |
| `pnpm lint` / `pnpm typecheck` | Verificações estáticas |
| `pnpm db:reset` | Recria o banco local a partir das migrations |
| `pnpm db:types` | Regenera `src/lib/supabase/database.types.ts` depois de mudar o banco |
| `pnpm super-admin <email> <senha> "<nome>"` | Cria ou promove um super-admin |

## Como a segurança funciona

- Todo dado operacional tem `empresa_id`, e as políticas de RLS em `supabase/migrations` impedem qualquer leitura ou escrita fora da empresa do usuário. O código da aplicação nunca é a única barreira.
- **Perfis:** super-admin (dono da plataforma), admin, gestor e vendedor (interno ou representante).
- O super-admin cria empresas e vê usuários, mas **não** terá acesso aos contatos e negócios das empresas.
- Empresa suspensa ou cancelada perde o acesso na hora.
- Mudanças em empresas, membros e equipes ficam em `logs_auditoria`, que ninguém consegue alterar ou apagar.
- A tabela `eventos` já existe para alimentar a gamificação (Fase 2).
- Cadastro público desligado: só entra quem for convidado.
