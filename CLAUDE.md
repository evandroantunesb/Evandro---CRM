@AGENTS.md

# Raion CRM — guia para o Claude

CRM de funil de vendas para empresas de energia solar, multiempresa (SaaS revendável + uso interno). Todo o código é escrito pelo Claude; o Evandro revisa e mescla as PRs.

**Onde está cada coisa:** estado atual, PRs abertas e pendências em `docs/PROJECT_STATUS.md` · o que ainda não foi construído em `docs/ROADMAP.md` · estrutura, segurança, banco e CI em `docs/arquitetura.md` · regras de negócio em `docs/regras-negocio.md`. Leia só a seção que a tarefa exige. `PROGRESS.md` e `HANDOFF.md` da raiz são históricos: consulte só para entender uma decisão antiga, nunca como estado atual.

**Fonte da verdade:** o código (`src/`, `supabase/migrations/`). Documentação pode estar atrasada; antes de editar, rode `git status`, `git log` e confira o estado real da branch e das PRs.

## Contexto (economia de tokens)

- Não refaça pesquisas sobre o que já está nesses arquivos. Não releia arquivo que não mudou.
- Busque antes de abrir (`grep`/Glob) e leia só o intervalo de linhas necessário; não carregue o projeto inteiro para mudanças pontuais.
- Não leia `node_modules/`, `.next/`, `dist/`, `build/`, `out/`, `coverage/`, `pnpm-lock.yaml`, arquivos gerados ou logs longos sem necessidade. Exceção: a página relevante de `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- Nas respostas, prefira resumo ou diff a arquivos inteiros.
- Leitura direcionada: localize primeiro o símbolo, função ou componente da tarefa, depois leia o trecho relevante (com o contexto necessário pra entender dependências). Em arquivos acima de ~300 linhas, evite ler o arquivo inteiro por padrão — leia completo quando a implementação, investigação ou segurança da alteração exigir.
- Não divida arquivos nem refatore só para reduzir consumo de tokens; isso é decisão de arquitetura, não de economia de contexto. Nunca edite manualmente arquivo gerado (ex.: `database.types.ts`) — regenere com o comando correspondente (`pnpm db:types`).

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
- Nunca mescle PR sem aprovação explícita do Evandro para aquela PR específica, mesmo com CI verde; revisão visual segue até ele dizer "pode mesclar". Nem decida sozinho dado técnico da calculadora solar — pergunte antes. Nunca peça senhas, tokens ou chaves no chat.
- Nunca execute operação destrutiva em produção (reset, seed real, deleção em massa) sem autorização explícita e separada; uma aprovação anterior não cobre nova execução.
- Implementação complexa segue: diagnóstico read-only → aprovação ponto a ponto → implementação → checagem final antes do merge. Depois de um merge, não avance sozinho para o próximo passo ou módulo; espere o comando do Evandro.
- Antes de continuar uma branch existente, sincronize (fetch + fast-forward limpo): o Evandro e a equipe às vezes commitam direto nela.
- Pendência pequena que não bloqueia a funcionalidade atual: registre em `docs/PROJECT_STATUS.md` (ver Continuidade) e siga construindo, sem travar o ritmo esperando resposta.

## Respostas

Objetivas: o que mudou, arquivos envolvidos, testes feitos e pendências. Não repita o que já está documentado nem o histórico do projeto.

## Continuidade

Política de atualização de documentação (evita gastar token documentando à toa):

- Não atualize toda a documentação a cada alteração de código. Ajuste pequeno (CSS, espaçamento, cor, texto, componente, correção pontual) não exige atualizar `docs/PROJECT_STATUS.md` nem `CLAUDE.md`, a menos que mude uma regra documentada.
- Atualize o `docs/PROJECT_STATUS.md` só: ao concluir uma funcionalidade/etapa relevante, em mudança significativa de andamento, em bloqueio importante, antes de encerrar ou trocar de thread, ou quando o Evandro pedir. Numa sequência de alterações pequenas da mesma funcionalidade, acumule e registre de uma vez só ao concluir a etapa. Ele descreve o estado atual, não um diário: substitua o que mudou em vez de acrescentar histórico. Item que sai do roadmap para execução passa de `docs/ROADMAP.md` para `docs/PROJECT_STATUS.md`.
- Não acrescente nada em `PROGRESS.md` nem em `HANDOFF.md` (históricos). Não crie novos arquivos de handoff: o estado de troca de thread vai em `docs/PROJECT_STATUS.md`.
- Atualize o `CLAUDE.md` só com decisão permanente de arquitetura, novo padrão de desenvolvimento, mudança relevante nas regras gerais ou pedido explícito do Evandro. Atualize a documentação de um módulo em `docs/` só quando suas regras de negócio, contratos ou comportamentos documentados mudarem.
- Prefira edição pontual a reescrever o arquivo inteiro; preserve a estrutura existente. Evite repetir a mesma informação em documentos diferentes. Sem auditoria completa da documentação sem pedido explícito.
- Exceção às regras acima: nunca deixe a documentação desatualizada quando uma mudança importante afeta o funcionamento ou a continuidade do desenvolvimento.

## Threads

- Mantenha a mesma thread durante implementação, ajustes e testes da mesma funcionalidade.
- Recomende nova thread só ao iniciar uma funcionalidade independente, ou quando o histórico da atual estiver excessivamente extenso.
- Nunca crie uma thread nova por conta própria sem autorização do Evandro.
- Antes de trocar de thread, registre em `docs/PROJECT_STATUS.md` o estado atual, pendências e a próxima ação — uma nova thread deve conseguir continuar só com `CLAUDE.md` e `docs/`, sem depender do histórico da conversa.

## Stack e comandos

Next.js 16 (App Router, **APIs mudaram** — ver `AGENTS.md`) + React 19 + TypeScript + Tailwind 4 · Supabase (Postgres/RLS/Auth/Storage, São Paulo) · Zod 4 · `@react-pdf/renderer` · `@dnd-kit/core` · `lucide-react` · Vitest · pnpm · Node 22 · Vercel + GitHub Actions.

`pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm db:reset` · `pnpm db:types` · `pnpm super-admin <email> <senha> "<nome>"`

## Regras permanentes

- **Multiempresa:** todo dado tem `empresa_id` e é isolado por RLS; o código nunca é a única barreira.
- **Migrations:** confira os prefixos das PRs abertas antes de criar uma; depois rode `pnpm db:types`. Produção só via `banco-producao.yml`, nunca manual. Detalhes em `docs/arquitetura.md`.
- **Gamificação:** nunca insira pontos em `point_ledger` nem registros em `eventos` (nem para viabilizar teste); toda pontuação nasce de ação real disparando o motor. Nunca use papel, perfil ou valor atual para reinterpretar fatos históricos. Regras causais em `docs/regras-negocio.md`.
- Não adicione travas técnicas que funcionem como limite de produto não pedido; exija prova concreta de necessidade.
- **Identidade visual (não alterar):** Carvão `#0F0F10`, Dourado Solar `#D4AF37`, Off-white `#FAF8F3`, Cinza `#6B7280`, Cinza claro `#E5E7EB` (em `src/app/globals.css`); Manrope nos títulos, Inter nos textos; logo em `src/components/marca.tsx` + `public/marca/`. **Verde só no WhatsApp, vermelho só para perda e erro.** Exceção confirmada pelo Evandro em 2026-10-01: dentro da área `/gamificacao`, verde é a cor contextual principal (sensação de "entrar em outra área", competitiva), com dourado reservado a prestígio/conquistas e vermelho limitado a alertas (queda de posição, meta em risco) — carvão/dourado continuam sem mudança no resto do produto.
- Interface, rotas, nomes e commits em português. Mobile é prioridade; reutilize `src/components/ui.tsx`.
- Repositório público: nenhuma senha ou segredo em arquivos.
