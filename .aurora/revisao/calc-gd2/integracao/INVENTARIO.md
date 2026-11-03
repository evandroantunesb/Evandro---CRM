# Inventário do pacote de integração — M2 P0 (calculadora GD II e rodadas anteriores não commitadas)

Base: HEAD `2780a53`. Fonte: `git status` do worktree `R:/wt-m2-p0-calc` (sem `.aurora/` e sem `supabase/config.toml`, que só
muda durante a stack descartável). SHA-256 do conteúdo com fim de linha LF. Diff: `pacote-consolidado.diff`.

## Migrations (7)

| Arquivo | Situação | + | − | SHA-256 (LF) |
|---|---|---:|---:|---|
| `supabase/migrations/20261022100000_propostas_emissoes.sql` | novo | 216 | 0 | `f8f8b8dd0949d917…` |
| `supabase/migrations/20261022110000_produtividade_confirmada.sql` | novo | 105 | 0 | `5d3982519ebd57e6…` |
| `supabase/migrations/20261023200000_calculos_estimativa_incompleta.sql` | novo | 63 | 0 | `dfadfa264073f867…` |
| `supabase/migrations/20261023210000_calculo_gd2_fio_b.sql` | novo | 189 | 0 | `d5dbb752bd6fb848…` |
| `supabase/migrations/20261023220000_calculos_solares_gravacao_servidor.sql` | novo | 108 | 0 | `19e3dbc944435888…` |
| `supabase/migrations/20261023230000_calculos_solares_exclusao_historico.sql` | novo | 79 | 0 | `7943e59f19002a62…` |
| `supabase/migrations/20261023240000_calculos_solares_revogar_escrita_direta.sql` | novo | 16 | 0 | `809fda4ba4f083e1…` |

## Aplicação (39)

| Arquivo | Situação | + | − | SHA-256 (LF) |
|---|---|---:|---:|---|
| `src/app/(app)/configuracoes/calculadora/formularios.tsx` | alterado | 62 | 30 | `8d74368d4541a6e7…` |
| `src/app/(app)/configuracoes/calculadora/page.tsx` | alterado | 10 | 1 | `c7d2732c3c3bb871…` |
| `src/app/(app)/negocios/[id]/contrato.tsx` | alterado | 12 | 3 | `57cef96ba895126c…` |
| `src/app/(app)/negocios/[id]/emitir-proposta.tsx` | novo | 138 | 0 | `2341ae3327d200fb…` |
| `src/app/(app)/negocios/[id]/kit-personalizado.tsx` | alterado | 787 | 94 | `f838b05052479145…` |
| `src/app/(app)/negocios/[id]/page.tsx` | alterado | 143 | 6 | `42a38e5746eb6915…` |
| `src/app/(app)/negocios/[id]/proposta.tsx` | alterado | 27 | 14 | `2d7cf6da50a08d9a…` |
| `src/app/(app)/negocios/novo/formulario.tsx` | alterado | 23 | 47 | `005c1371c3807204…` |
| `src/app/proposta/[token]/emitida.tsx` | novo | 123 | 0 | `bc0115eb6c57df07…` |
| `src/app/proposta/[token]/page.tsx` | alterado | 80 | 9 | `be019ed9e21dde5b…` |
| `src/app/proposta/[token]/pdf/route.ts` | alterado | 31 | 6 | `6d3c7c632e0a0e30…` |
| `src/lib/acoes/calculadora.ts` | alterado | 30 | 4 | `c8a07069aae6b1ae…` |
| `src/lib/acoes/propostas-emissoes.ts` | novo | 140 | 0 | `ddb83b5ea4690658…` |
| `src/lib/acoes/propostas.ts` | alterado | 11 | 6 | `a97b26f3ebd18629…` |
| `src/lib/calculadora.ts` | alterado | 147 | 31 | `4f9618b25f10cf5b…` |
| `src/lib/calculo-gravacao.ts` | novo | 101 | 0 | `54ab9f6515b97648…` |
| `src/lib/calculo-reproduzivel.ts` | alterado | 230 | 36 | `695a78e7a6edf691…` |
| `src/lib/calculo-servidor.ts` | alterado | 13 | 22 | `fe7c598235dd262d…` |
| `src/lib/calculo-vigencia.ts` | novo | 423 | 0 | `941cc6aa0272adc1…` |
| `src/lib/contexto-estimativa.ts` | novo | 27 | 0 | `dbd99c3e62f18d67…` |
| `src/lib/contratos-geracao.ts` | alterado | 17 | 3 | `529b22900213bb9b…` |
| `src/lib/estimativa-financeira.ts` | alterado | 102 | 91 | `0701b3687eb4b688…` |
| `src/lib/fio-b-gd2.ts` | renomeado de src/lib/fio-b-hipotese.ts | 38 | 26 | `3ebf3258a67f3bfe…` |
| `src/lib/kit-formulario.ts` | alterado | 22 | 5 | `b9c539285f996f15…` |
| `src/lib/negocios-gravacao.ts` | alterado | 157 | 65 | `d25d5eec9578833b…` |
| `src/lib/pdf-proposta.tsx` | alterado | 56 | 39 | `af8a3ced9367dc3a…` |
| `src/lib/propostas/emissao-preservada.ts` | novo | 60 | 0 | `ec11879d225ab268…` |
| `src/lib/propostas/emissao-simples-pdf.ts` | novo | 15 | 0 | `a47262f0c530f9a2…` |
| `src/lib/propostas/emissoes-dados.ts` | novo | 38 | 0 | `75d80b52f0208425…` |
| `src/lib/propostas/emissoes-gravacao.ts` | novo | 87 | 0 | `9e929d2fb9900458…` |
| `src/lib/propostas/fontes-pdf.ts` | novo | 12 | 0 | `c36a5c194c878423…` |
| `src/lib/propostas/imagens-emissao.ts` | novo | 61 | 0 | `3f7c34f51b086713…` |
| `src/lib/propostas/pdf-dados.ts` | alterado | 65 | 15 | `c31c6496b14117f9…` |
| `src/lib/propostas/pdf-simples.tsx` | novo | 370 | 0 | `f10e1b918a053bcd…` |
| `src/lib/propostas/pdf-tipos.ts` | alterado | 11 | 7 | `0dfaa1f1e19d0157…` |
| `src/lib/propostas/pdf.tsx` | alterado | 57 | 30 | `9196dc3b26912a98…` |
| `src/lib/propostas/proposta-simples.ts` | novo | 423 | 0 | `ebf3a210e1178db9…` |
| `src/lib/supabase/database.types.ts` | alterado | 319 | 18 | `8902e73ab37466ab…` |
| `src/lib/tarifa-gd.ts` | novo | 215 | 0 | `e670245df5775d39…` |

## Testes (vitest) (28)

| Arquivo | Situação | + | − | SHA-256 (LF) |
|---|---|---:|---:|---|
| `tests/calculadora-db.test.ts` | alterado | 17 | 2 | `7200847a66c85ea4…` |
| `tests/calculadora-persistencia-db.test.ts` | alterado | 91 | 72 | `e6fd58a79d6b8031…` |
| `tests/calculadora.test.ts` | alterado | 147 | 71 | `582f6bd3e13fb328…` |
| `tests/calculo-gd2-db.test.ts` | novo | 358 | 0 | `c512418f29e84709…` |
| `tests/calculo-gravacao-confiavel-db.test.ts` | novo | 412 | 0 | `57af6b54fcf39683…` |
| `tests/calculo-preco.test.ts` | alterado | 19 | 6 | `a96491882a887796…` |
| `tests/calculo-reproduzivel.test.ts` | alterado | 273 | 206 | `4dc32c793dd297f1…` |
| `tests/calculo-vigencia-db.test.ts` | novo | 434 | 0 | `5966989995ffd3c3…` |
| `tests/calculo-vigencia.test.ts` | novo | 560 | 0 | `d183d70dd1bc54ee…` |
| `tests/calculos-estimativa-incompleta-db.test.ts` | novo | 104 | 0 | `68cc87a33193b68e…` |
| `tests/contrato-db.test.ts` | alterado | 22 | 11 | `fd846d307997aa07…` |
| `tests/emissao-preservada.test.ts` | novo | 110 | 0 | `000dfc376b7b2bfe…` |
| `tests/estimativa-financeira.test.ts` | novo | 183 | 0 | `584d71b1a93070d7…` |
| `tests/fio-b-copel-casos.test.ts` | novo | 259 | 0 | `63afde0090454bdf…` |
| `tests/fio-b-gd2.test.ts` | novo | 509 | 0 | `565f587b5815ee29…` |
| `tests/imagens-emissao.test.ts` | novo | 128 | 0 | `7efa2aa0c4c6c9d0…` |
| `tests/negocios-acoes-db.test.ts` | alterado | 13 | 2 | `ea52e2fc79355a38…` |
| `tests/negocios-gravacao-db.test.ts` | alterado | 426 | 43 | `30d91fbc0cee3457…` |
| `tests/negocios-gravacao.test.ts` | alterado | 47 | 10 | `1140787109fa2c39…` |
| `tests/numeros-br.test.ts` | alterado | 4 | 3 | `60458deb01e6485e…` |
| `tests/parametros-regulatorios-db.test.ts` | novo | 60 | 0 | `21d21ea62e33556c…` |
| `tests/produtividade-confirmada-db.test.ts` | novo | 122 | 0 | `b3f8dfa1f4600d9f…` |
| `tests/proposta-db.test.ts` | alterado | 2 | 1 | `0b3940cac1988692…` |
| `tests/proposta-simples.test.ts` | novo | 403 | 0 | `669d4b132f7c9506…` |
| `tests/propostas-emissoes-db.test.ts` | novo | 303 | 0 | `9b62ca321c9a0357…` |
| `tests/propostas-emissoes-fluxo-db.test.ts` | novo | 181 | 0 | `323f5b9a36fab1df…` |
| `tests/propostas-pdf-dados.test.ts` | alterado | 133 | 0 | `6d68ac65fe2741f8…` |
| `tests/travas-kit-sdr-db.test.ts` | alterado | 48 | 23 | `460d2902119e19f5…` |

## Testes de navegador (7)

| Arquivo | Situação | + | − | SHA-256 (LF) |
|---|---|---:|---:|---|
| `e2e/06-calculadora-numeros.spec.ts` | alterado | 137 | 27 | `55e1b989e2779b9f…` |
| `e2e/09-preco-desatualizado.spec.ts` | alterado | 39 | 20 | `ce75fdda61985f49…` |
| `e2e/10-calculo-estados.spec.ts` | novo | 388 | 0 | `86047caea3cec4a9…` |
| `e2e/11-kit-consumo-fatura-salvos.spec.ts` | novo | 153 | 0 | `299a54c470649809…` |
| `e2e/12-proposta-emitida.spec.ts` | novo | 169 | 0 | `be85e506a568b042…` |
| `e2e/13-calculo-gd2-fluxo.spec.ts` | novo | 282 | 0 | `d24fef476347dd95…` |
| `e2e/ajuda.ts` | alterado | 11 | 0 | `d8070cf262ab5be9…` |

## Scripts de teste (2)

| Arquivo | Situação | + | − | SHA-256 (LF) |
|---|---|---:|---:|---|
| `scripts/e2e-relogio.mjs` | novo | 45 | 0 | `f79ef44017836cda…` |
| `scripts/e2e-servidor.mjs` | alterado | 12 | 2 | `887f8d090105b468…` |

## Configuração de teste (1)

| Arquivo | Situação | + | − | SHA-256 (LF) |
|---|---|---:|---:|---|
| `playwright.config.ts` | alterado | 1 | 1 | `97e89f2551d9baf5…` |

Total: 84 arquivos (42 novos), +12064 / −1108 linhas.
