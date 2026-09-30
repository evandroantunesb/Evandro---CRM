@AGENTS.md

# Raion CRM — guia para o Claude

CRM de funil de vendas para empresas de energia solar, multiempresa (SaaS revendável + uso interno). Todo o código é escrito pelo Claude; o Evandro revisa e mescla as PRs.

**Onde está cada coisa:** estado atual e pendências em `PROGRESS.md` · estrutura, segurança, banco e CI em `docs/arquitetura.md` · regras de negócio em `docs/regras-negocio.md`. Leia só a seção que a tarefa exige.

## Contexto (economia de tokens)

- Não refaça pesquisas sobre o que já está nesses arquivos. Não releia arquivo que não mudou.
- Busque antes de abrir (`grep`/Glob) e leia só o intervalo de linhas necessário; não carregue o projeto inteiro para mudanças pontuais.
- Não leia `node_modules/`, `.next/`, `dist/`, `build/`, `out/`, `coverage/`, `pnpm-lock.yaml`, arquivos gerados ou logs longos sem necessidade. Exceção: a página relevante de `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- Nas respostas, prefira resumo ou diff a arquivos inteiros.

## Agentes

- Execute direto quando um único agente resolve. Nada de agentes paralelos para tarefas simples.
- Se precisar de agentes, dê escopo fechado e sem sobreposição; não crie agentes só para revisar de novo o que já foi validado.

## Modelos

O modelo principal é escolhido pelo Evandro; nunca diga que trocou de modelo se a troca não foi executada de fato.

- **Sonnet (padrão):** telas e componentes, CSS/responsividade, formulários, CRUD, bugs simples e intermediários, ajustes em funcionalidades existentes, refatorações pequenas, docs pontuais e tudo com requisitos e arquitetura já definidos.
- **Opus (só com justificativa técnica):** arquitetura, planejamento de funcionalidade ou regra de negócio complexa, bug difícil entre vários módulos ou que o Sonnet não resolveu, refatoração estrutural, decisões de segurança/escalabilidade. Concluído o planejamento, a implementação volta ao Sonnet.
- Muitos arquivos não justificam Opus: antes, tente dividir a tarefa em etapas menores. Ao receber uma tarefa, avalie a complexidade e, se Opus fizer sentido, recomende-o dizendo por quê.
- Agentes: quando forem mesmo necessários, passe `model: "sonnet"` para trabalho de implementação; Opus só nos casos acima.

## Execução

- Uma funcionalidade por vez, com alterações mínimas e só nos arquivos dela. Sem refatoração fora do escopo.
- Rode os testes relacionados à mudança; amplie a validação se houver impacto em outras áreas. Diante de erro, investigue a causa antes de tentar de novo.
- Nunca remova arquivos, dependências, componentes, funcionalidades ou regras de negócio para economizar tokens, nem pule verificações necessárias.
- Nunca mescle PR sem aprovação do Evandro, nem decida sozinho dado técnico da calculadora solar — pergunte antes. Nunca peça senhas, tokens ou chaves no chat.
- Pendência pequena que não bloqueia a funcionalidade atual: registre (`PROGRESS.md`, ver Continuidade) e siga construindo, sem travar o ritmo esperando resposta.

## Respostas

Objetivas: o que mudou, arquivos envolvidos, testes feitos e pendências. Não repita o que já está documentado nem o histórico do projeto.

## Continuidade

Política de atualização de documentação (evita gastar token documentando à toa):

- Não atualize toda a documentação a cada alteração de código. Ajuste pequeno (CSS, espaçamento, cor, texto, componente, correção pontual) não exige atualizar `PROGRESS.md` nem `CLAUDE.md`, a menos que mude uma regra documentada.
- Atualize o `PROGRESS.md` só: ao concluir uma funcionalidade/etapa relevante, em mudança significativa de andamento, em bloqueio importante, antes de encerrar ou trocar de thread, ou quando o Evandro pedir. Numa sequência de alterações pequenas da mesma funcionalidade, acumule e registre de uma vez só ao concluir a etapa. Conteúdo: alterações (com número da PR), arquivos modificados, decisões técnicas e próximas tarefas — curto.
- Atualize o `CLAUDE.md` só com decisão permanente de arquitetura, novo padrão de desenvolvimento, mudança relevante nas regras gerais ou pedido explícito do Evandro. Atualize a documentação de um módulo em `docs/` só quando suas regras de negócio, contratos ou comportamentos documentados mudarem.
- Prefira edição pontual a reescrever o arquivo inteiro; preserve a estrutura existente. Evite repetir a mesma informação em documentos diferentes. Sem auditoria completa da documentação sem pedido explícito.
- Exceção às regras acima: nunca deixe a documentação desatualizada quando uma mudança importante afeta o funcionamento ou a continuidade do desenvolvimento.

## Threads

- Mantenha a mesma thread durante implementação, ajustes e testes da mesma funcionalidade.
- Recomende nova thread só ao iniciar uma funcionalidade independente, ou quando o histórico da atual estiver excessivamente extenso.
- Nunca crie uma thread nova por conta própria sem autorização do Evandro.
- Antes de trocar de thread, registre no `PROGRESS.md` o estado atual, pendências e a próxima ação — uma nova thread deve conseguir continuar só com `CLAUDE.md`, `docs/` e `PROGRESS.md`, sem depender do histórico da conversa.

## Stack e comandos

Next.js 16 (App Router, **APIs mudaram** — ver `AGENTS.md`) + React 19 + TypeScript + Tailwind 4 · Supabase (Postgres/RLS/Auth/Storage, São Paulo) · Zod 4 · `@react-pdf/renderer` · `@dnd-kit/core` · `lucide-react` · Vitest · pnpm · Node 22 · Vercel + GitHub Actions.

`pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm db:reset` · `pnpm db:types` · `pnpm super-admin <email> <senha> "<nome>"`

## Regras permanentes

- **Multiempresa:** todo dado tem `empresa_id` e é isolado por RLS; o código nunca é a única barreira.
- **Migrations:** confira os prefixos das PRs abertas antes de criar uma; depois rode `pnpm db:types`. Detalhes em `docs/arquitetura.md`.
- **Identidade visual (não alterar):** Carvão `#0F0F10`, Dourado Solar `#D4AF37`, Off-white `#FAF8F3`, Cinza `#6B7280`, Cinza claro `#E5E7EB` (em `src/app/globals.css`); Manrope nos títulos, Inter nos textos; logo em `src/components/marca.tsx` + `public/marca/`. **Verde só no WhatsApp, vermelho só para perda e erro.**
- Interface, rotas, nomes e commits em português. Mobile é prioridade; reutilize `src/components/ui.tsx`.
- Repositório público: nenhuma senha ou segredo em arquivos.
