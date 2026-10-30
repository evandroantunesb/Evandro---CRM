# Checkpoint — pontos de UX da calculadora/negócio (Nora), atualizado 2026-10-21

Estado: **em andamento; sessão reiniciada a pedido do Evandro com o Kevin do kit ainda rodando** (interrompido). Nada commitado nem enviado. Tudo só existe neste notebook (R:).

## Pedidos do Evandro (aprovados)
1. Kit personalizado acima de "Valor do negócio" (ficha). 2. Qtd. de módulos automática pela potência do kit (6,2 kWp / 620 W = 10; mais próximo, mínimo 1). 3. Qtd. de inversor automática com overload até 50%: ceil(kWp / (kW inversor × 1,5)), mínimo 1; editável, e a automação não sobrescreve depois de edição manual. 4. Anexos: 5 MB para CNH e comprovante de residência; fotos e outros 20 MB (bucket não muda; sem migration). 5. Indicador de etapas do wizard clicável. 6. Qualificação SDR recolhível/recolhida. 7. Tarefas e linha do tempo na coluna direita, abaixo do contato. 8. Proposta e Contratos no mesmo container, lado a lado, sem espremer.
Frontend = Kevin; revisão de design = Sam (criado hoje; só revisa).

## Worktrees (base origin/main d960703a59afcfdb651882432b3d3721e9ebea03), sem commit
- **R:/wt-layout · feat/negocio-layout-navegacao — ENTREGUE pelo Kevin (itens 1, 5, 6, 7, 8).** Alterados: [id]/page.tsx, [id]/qualificacao.tsx, novo/formulario.tsx (só IndicadorEtapas, irParaEtapa, guarda de Enter), tests/fechamento-marcos.test.ts (3 asserções atualizadas por Nora para a nova grade; verificadas com script node, vitest não roda sem Supabase); novos: [id]/bloco-recolhivel.tsx, tests/negocio-layout.test.ts, .aurora/checkpoints/negocio-layout-navegacao.md. Typecheck e eslint passaram numa cópia limpa em scratchpad/verif. Vitest NÃO rodou (trava fail-closed, sem Supabase local). Aceite visual NÃO feito. Resto: pasta node_modules_parcial_pnpm/ (install interrompido, não rastreada) — remoção autorizada pelo Evandro, mas falhou/ficou em segundo plano (links pnpm no disco R:); tentar de novo com caminhos literais (robocopy /MIR de pasta vazia + Remove-Item), nada fora de R:/wt-layout.
- **R:/wt-kit-auto · feat/kit-quantidade-automatica — INCOMPLETO (itens 2, 3, 4).** Alterados: enviar-anexo.tsx, kit-componentes.tsx, anexos-regras.ts, kit-linhas.ts; novos: src/lib/kit-quantidade-automatica.ts, tests/anexos-regras.test.ts, tests/kit-quantidade-automatica.test.ts, .aurora/checkpoints/kit-quantidade-automatica.md (do agente, ler primeiro). Relatório final do agente NÃO recebido. Provável falta: ligar a quantidade automática em novo/formulario.tsx (só trecho de sugestão de quantidade) e [id]/kit-personalizado.tsx (que também precisa da linha "Montar kit" quando não há kit — pedido do layout/Sam), anexos-servidor.ts (limite no servidor), typecheck/lint/testes puros.
- Arquivo compartilhado: novo/formulario.tsx (layout = IndicadorEtapas/Enter; kit = trecho de quantidade). Integrar por patch, sem reformatar.

## Sam (Design) — revisão entregue
.aurora/revisoes-ui/ficha-negocio-e-wizard-2026-10-21.md (em R:/raion-crm/raion-crm; só por leitura de código). Achados altos de acessibilidade FORA do escopo desta rodada: input de arquivo display:none (teclado), foco dourado ~2:1, zinc-400 ~2,6:1, green-600 com branco ~3,3:1, rótulos faltando. Borda de campo zinc-200 ~1,2:1 é decisão visual global do Evandro.

## Time Aurora (sem commit, só R:/raion-crm/raion-crm/.claude/)
agents/sam-design.md e AURORA.md (4 subagentes). Reiniciar neste repositório para kevin-frontend, jay-backend, kara-qa e sam-design serem reconhecidos como agentes de projeto. Decidir se esses arquivos entram em branch (precisa autorização do Evandro).

## Decisões pendentes do Evandro
- Qualificação recolhida também para o papel `sdr`? (hoje: recolhida para todos, com "Enviar para vendas" visível quando Qualificado).
- Consumo médio e valor da conta duplicados entre Dados e editor do kit: são o mesmo dado?
- Proposta e Contrato empilham entre 1280 e ~1535 px (@3xl); aceitar, ou usar @2xl/lateral menor?
- Apagar R:\tmp1.txt (cópia de leitura criada por engano pelo Sam; fora do repo; a verificação de segurança bloqueou a minha remoção): Evandro apaga com `Remove-Item R:\tmp1.txt`.
- Próxima frente (adiada a pedido): formulários mais sucintos no mobile (wizard e edição da ficha); Sam especifica, Kevin implementa.
- Commit/push/PR de qualquer dessas branches: só com autorização explícita; merge e produção, autorização específica. Aceite funcional é do Evandro.

## Fio B (conversa; nada implementado)
- Hoje (main): custoFioB = kwhCompensado × tarifaKwh × percentualFioB (percentual global sobre a tarifa inteira). #205 (Fio B só sobre a parte Fio B da tarifa) entrou e foi revertida (#206) em 20/10. #207 cita erro de economia/Fio B visto em teste manual (pendência separada). #197 (parser/validador ANEEL, Draft, sem banco) não está na main.
- Ideia do Evandro: tarifa por concessionária (ex.: Copel R$ 1,02 COM impostos; ~0,72 sem impostos). Proposta de Nora: tabela por concessionária com tarifa sem impostos, parcela Fio B sem impostos e fator de impostos (~1,42 na Copel); mesma base de impostos nos dois valores. Precisa do Evandro: regra de incidência do Fio B e por que a #205 foi revertida; percentual por ano; se ICMS incide sobre o Fio B no estado; parcela Fio B da Copel em R$/kWh; casos de conferência por estado (consumo, kWp, tarifa, resultado esperado); decidir entre "só tarifa cheia como estimativa explícita" e cálculo correto com Fio B. Migration/tabela nova exige o fluxo de autorização de produção.

## Próximo passo exato
1. Abrir a sessão em R:\raion-crm\raion-crm e conferir `git status` dos dois worktrees (preservar; nada de limpeza destrutiva).
2. Ler os checkpoints dos agentes (layout e kit) e reativar o Kevin do kit com o registro de tarefa acima, retomando do que está no worktree (arquivos permitidos: os listados; formulario.tsx só o trecho de quantidade; kit-personalizado.tsx liberado a ele para a linha "Montar kit").
3. Nora revisa os diffs, roda typecheck/lint/testes puros (usar cópia limpa fora do R: se o pnpm travar), integra, e só então pede autorização de commit/push/PR ao Evandro.
4. Quando o Evandro enviar os dados do Fio B, abrir tarefa separada (Jay contrato/servidor, Kevin tela, Kara casos por estado).
