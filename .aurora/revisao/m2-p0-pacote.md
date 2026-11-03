# Pacote de revisão — M2 P0 integração (versão local de 22/10/2026)

Para conferir esta versão sem depender de logs. Estado: **validada tecnicamente; NÃO pronta para uso comercial** (propostas novas bloqueadas; links antigos indisponíveis, PDF 409). Sem commit, push, PR ou merge.

## 1. Identificação da versão
- Worktree `R:/wt-m2-p0-int`, branch `aurora/m2-p0-integracao`, base `2780a53cf828caad5a41b5f5931ffa32a95c5695`.
- 42 arquivos fora de `.aurora` (33 modificados, 9 novos em relação à base). Quatro têm parte das mudanças no índice (`MM`/`AM`, herança do cherry-pick -n): **use `git diff HEAD`**, não `git diff`.
- `m2-p0-integracao.patch` (nesta pasta): diff completo base → versão, incluindo os 9 novos (gerado com índice temporário; o índice real não foi tocado). SHA-256 do patch: `34f7f3d3d8cf56de813de964e30d85c960f7cc013e143de0dbef637d37f9d5bb`.
- `m2-p0-manifesto-lf.sha256`: SHA-256 de cada um dos 42 arquivos **com fim de linha normalizado para LF** (o working copy mistura CRLF/LF).
- Conferido em 22/10: o patch aplica limpo sobre `git archive 2780a53` e os 42 arquivos resultantes batem com o manifesto (42/42).

Conferência independente (fora do repositório):
```
git -C R:/wt-m2-p0-int archive 2780a53 | tar -x -C <dir-vazio>
cd <dir-vazio> && git apply --whitespace=nowarn R:/wt-m2-p0-int/.aurora/revisao/m2-p0-integracao.patch
while read h f; do [ "$(tr -d '\r' < "$f" | sha256sum | cut -c1-64)" = "$h" ] || echo "DIFERE $f"; done < R:/wt-m2-p0-int/.aurora/revisao/m2-p0-manifesto-lf.sha256
```

## 2. O que muda (por assunto)
| Assunto | Arquivos | Contrato |
| --- | --- | --- |
| Motor real devolve estimativa incompleta (sem número financeiro) | `src/lib/calculadora.ts`, `estimativa-financeira.ts`, `calculo-servidor.ts`, `calculo-reproduzivel.ts`; telas `negocios/novo/formulario.tsx`, `negocios/[id]/kit-personalizado.tsx` | `m2-p0-motor-estimativa.md`, `m2-p0-diagnostico-b7.md` |
| Vigência do cálculo salvo (toda linha = legado) | `src/lib/calculo-vigencia.ts` (novo), `negocios/[id]/page.tsx`, `contratos-geracao.ts`, `negocios/[id]/contrato.tsx` | `m2-p0-calculo-vigencia.md` |
| Propostas: nova bloqueada; emitida = indisponível / PDF 409 | `src/lib/acoes/propostas.ts`, `src/lib/propostas/emissao-preservada.ts` (novo), `app/proposta/[token]/page.tsx`, `pdf/route.ts`, `negocios/[id]/proposta.tsx`, `pdf-proposta.tsx`, `propostas/pdf*.ts(x)` | `m2-p0-propostas-emissao.md` |
| kWh e fatura do kit preservados; editor abre do negócio | `src/lib/negocios-gravacao.ts`, `src/lib/kit-formulario.ts`, `kit-personalizado.tsx` | `m2-p0-kit-consumo-fatura.md` |
| Hipótese de Fio B (isolada, sem chamada em produção) | `src/lib/fio-b-hipotese.ts` | `m2-p0-conta-solar.md`, `m2-p0-arredondamento-economia.md` |
| Testes | 16 arquivos em `tests/` (4 novos puros, 1 novo db) e `e2e/06`, `09`, `10` (novo), `11` (novo) | — |

## 3. Evidência de validação (versão integrada, banco descartável `aurora-m2-q1`)
| Etapa | Resultado | Sobre qual versão |
| --- | --- | --- |
| typecheck, lint (0 erros; 3 avisos preexistentes), build | ok | antes do ajuste do editor; typecheck/lint repetidos depois: ok |
| Suíte completa | 2038/2040 | antes do ajuste do editor |
| e2e completo | 64/64 | antes do ajuste do editor |
| Ajuste do editor do kit: puros afetados | 128/130 (130/130 em cópia LF) | versão final |
| `negocios-gravacao-db` | 30/30 | versão final |
| e2e 06, 10, 11 | passaram (06: 4/4) | versão final |

Baseline conhecido: as 2 falhas ("regressões de tela" em `tests/negocios-gravacao.test.ts`) vêm só do CRLF do working copy; passam em cópia LF. Suíte completa e e2e completo **não** foram repetidos após o ajuste do editor (decisão do Evandro); o ajuste mexe só em `kit-formulario.ts` e nos testes listados no checkpoint.

## 3b. Conferência no notebook (22/10/2026) — separada da seção 3
Resultados abaixo foram obtidos **no notebook** (Node v24.20.0; `pnpm` e Docker/Supabase não preparados, por decisão do Evandro). Não substituem nem se somam aos da seção 3, obtidos no outro computador.
| Etapa | Resultado |
| --- | --- |
| Manifesto SHA-256 (LF) dos 42 arquivos, sobre o worktree `R:/wt-m2-p0-int` | 42/42 conferem |
| `tsc --noEmit` (direto, sem `next typegen`) | ok |
| lint, testes, build, banco, e2e | **não executados no notebook** |

## 4. Riscos de publicação conhecidos
1. **Comercial**: propostas novas bloqueadas e links antigos sem conteúdo (409). O conjunto não é publicável sozinho para venda.
2. **Obras mostra consumo e geração do cálculo legado** (ver seção 5).
3. Snapshot comercial da obra (`obra_dados_comerciais.snapshot`) guarda economia/payback/contas/Fio B do cálculo legado; nenhuma tela exibe; único consumidor é `marcar_venda_alterada_obra` (só compara igualdade); a RLS permite SELECT via API a admin/vendedor/gestor.
4. `definirExibicaoProposta` altera modo de preço/seções de proposta já emitida (sem efeito hoje; relevante para o desenho de emissão).
5. Tarifa e tipo de ligação do editor do kit ainda vêm do cálculo legado (tarifa não existe em `negocios`).

## 5. Obras: consumo e geração legados (risco 2)
- Onde: `src/lib/obras/tecnico.ts:94-95` (`consumoMedioKwh` = cálculo **antes** do negócio; `geracaoEstimadaKwhMes` = cálculo) → exibidos em `src/app/(app)/obras/[id]/page.tsx:245-246` ("Consumo médio", "Geração estimada"). Fonte: snapshot técnico gravado na venda (`obra_snapshot_tecnico`), que copia `calculos_solares`.
- Consequência: negócio com 450 kWh e cálculo legado de 700 kWh → a obra mostra 700 kWh como consumo do cliente, e a geração da fórmula antiga sem aviso.
- Menor correção (sem migration, sem mexer no snapshot):
  - `tecnico.ts:94`: inverter a prioridade — `negocio.consumo_medio_kwh ?? calculo.consumo_medio_kwh`;
  - `obras/[id]/page.tsx:246`: rótulo "Geração estimada (cálculo da venda, não validado)".
- Testes afetados: `tests/obras-detalhe.test.ts` (caso "snapshot completo" espera 500 do cálculo → passa a 450 do negócio; acrescentar caso só com cálculo) e a checagem do rótulo na página (teste de fonte ou e2e de obras, se houver).
- Alternativa só de rótulo (zero lógica): "Consumo médio (registro da venda)" e "Geração estimada (cálculo da venda, não validado)".
