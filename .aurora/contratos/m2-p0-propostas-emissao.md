# Desenho para decisão — proposta simples e emissão preservada (M2 P0, Nora, 22/10/2026)

Estado: **DESENHO, não implementado.** Exige migration e bucket novos. Não entra no worktree de 42 arquivos; vai em branch própria a partir da versão integrada, depois do aceite.

## Regra central
O cliente só vê o que foi **gravado na emissão**: dados (JSON) e o PDF gerado uma única vez. Nada é recalculado nem relido do negócio, do kit ou do cálculo depois de emitir. Corrigir = emitir nova versão.

## 1. Propostas antigas: existe PDF original?
Verificado em 22/10 no código, nas migrations e no histórico do git: **não.**
- O PDF sempre foi gerado na hora, a cada acesso (`app/proposta/[token]/pdf/route.ts`); nenhuma linha de código grava PDF de proposta no Storage.
- Buckets existentes: `anexos`, `proposta-marca` (logo e foto de capa), recompensas, avatares. Nenhum guarda proposta emitida.
- `git log -S".upload("` nos caminhos de proposta: nenhum commit.
- Única fonte possível: um PDF que o vendedor tenha anexado ao negócio por conta própria (`anexos`, categoria `geral`). Não tem vínculo com o link nem prova que foi o que o cliente recebeu.

Consulta só leitura para o Evandro rodar em produção (a sessão não tem acesso e não deve ter):
```sql
select p.token, p.created_at as proposta_em, a.nome, a.created_at as anexo_em
from public.propostas p
join public.anexos a on a.negocio_id = p.negocio_id
where a.tipo_mime = 'application/pdf' and a.nome ilike '%propost%'
order by p.created_at;
```
Conclusão: sem achado nessa consulta, o 409 com mensagem é a única saída honesta para links antigos. Com achado, a decisão é do Evandro: o vendedor pode reenviar esse PDF manualmente, mas o sistema **não** liga o anexo ao link antigo (não há como provar que é o mesmo documento).

## 2. Proposta simples (o que o cliente recebe)
Até 3 páginas A4. Reaproveita os blocos e renderizadores existentes (`src/lib/propostas/blocos.ts`, `pdf.tsx`): é um **modelo restrito**, não um layout novo. Os renderizadores já omitem economia, payback e contas quando o valor é nulo.

| Página | Conteúdo | Blocos |
| --- | --- | --- |
| 1 — Capa e sistema | Logo e identidade; cliente (nome, cidade); nº da proposta, versão, data de emissão e validade; **o sistema**: potência (kWp), módulos (qtd × W), inversor, geração estimada (kWh/mês e kWh/ano), consumo informado (kWh/mês), tipo de ligação, estrutura do telhado | `cover`, `proposal_identity`, `system_summary` (sem card de economia), `generation_summary` |
| 2 — Itens e escopo | Tabela do kit (qtd, tipo, potência, descrição); o que está incluso (projeto, homologação na distribuidora, instalação, frete…); garantias; detalhes técnicos: "Geração distribuída — GD II; Fio B: 60% em 2026 (Lei 14.300), sem valor em R$" | `equipment_table`, `included_services`, `warranties`, `scope_inclusions_exclusions` |
| 3 (ou fim da 2) — Investimento | **Preço total** em destaque (valor do negócio); condições de pagamento (à vista / parcelado, como configurado); validade; próximos passos e contato. Rodapé fixo: "Esta proposta não inclui estimativa de economia." | `investment_main`, `payment_options`, `validity_timeline`, `next_steps`, `company_contacts` |

Proibidos enquanto o cálculo financeiro estiver incompleto: `before_after_bill`, `savings_summary`, `cashflow_payback`, `long_term_generation`, e o modo de preço `sem_preco` (seria uma proposta vazia). A ação de emitir **recusa** modelo com bloco proibido; não basta esconder.

Exigido para emitir: kit salvo; potência > 0; geração calculada; consumo do negócio informado; preço (valor do negócio) > 0; contato com nome. Não exige estimativa financeira.

## 3. Preservação exata de cada versão (inclusive PDF)
Migration (aditiva):
- Tabela `propostas_emissoes`: `id`, `empresa_id`, `proposta_id`, `versao` (unique por proposta), `token` (unique), `tipo` (`simples`; `completa` só no futuro), `dados jsonb` (tudo o que página e PDF exibem: cliente, sistema, kit, preço e modo, pagamento, validade, blocos e configs do modelo, identidade), `dados_sha256`, `pdf_caminho`, `pdf_sha256`, `pdf_bytes`, `renderizador` (versão do layout), `emitida_em`, `emitida_por`.
- Imutável: RLS só com SELECT e INSERT (o INSERT só pela ação de emitir); trigger que recusa UPDATE e DELETE.
- Bucket privado `propostas-emitidas`, caminho `{empresa_id}/{proposta_id}/v{versao}.pdf`; sem policy de UPDATE/DELETE; leitura só pela rota pública (chave de serviço) ou por quem vê o negócio.

Fluxo de emissão (ação `emitirPropostaSimples`):
1. Conferir os requisitos e o modelo (sem bloco proibido).
2. Montar `dados` no servidor e copiar logo e foto de capa para dentro do PDF (imagens embutidas; o PDF não depende de arquivos que mudam depois).
3. Gerar o PDF **uma vez**, enviar ao bucket e calcular `pdf_sha256`.
4. Inserir a linha da emissão com tudo junto. Se a inserção falhar, o PDF órfão não tem link e não aparece em lugar nenhum.

Leitura:
- `GET /proposta/{token}/pdf` → busca a emissão, baixa o arquivo, confere o `pdf_sha256` e **devolve os bytes gravados**. Nunca renderiza de novo. Hash divergente → 409 com a mensagem de indisponibilidade.
- Página pública: renderiza só a partir de `dados` (com `dados_sha256` conferido) e oferece o PDF gravado.
- Token antigo (de `propostas`, sem emissão) → continua indisponível / 409.
- `definirExibicaoProposta` deixa de alterar emissões: modo de preço e blocos são escolhidos **antes** de emitir e congelam na versão.

## 4. Menor conjunto de mudanças para voltar a emitir
1. Migration: `propostas_emissoes`, bucket `propostas-emitidas`, RLS e trigger, com testes de RLS (outra empresa, SDR, update e delete recusados).
2. Ação `emitirPropostaSimples` + modelo restrito (lista permitida de blocos).
3. Rotas públicas (página e PDF) lendo só a emissão; `situacaoDaEmissao` passa a reconhecer o token da emissão.
4. Ficha do negócio: botão "Emitir proposta", lista de versões e selo "emitida antes da preservação" nas antigas; `gerarLinkProposta` antiga fica bloqueada como hoje.
5. Testes: emitir → alterar kit, consumo e preço → link e PDF iguais ao emitido (comparar o hash dos bytes); link antigo → 409; bloco proibido → recusado; e2e do fluxo do vendedor.

Fora: economia, payback, Fio B em R$, Copel e qualquer mudança no motor de cálculo.

## 5. Decisões do Evandro
1. Aprovar a proposta simples (sem economia) como proposta comercial desta fase, com a estrutura acima.
2. Aprovar a migration e o bucket (tabela imutável e PDF gravado).
3. Textos: rodapé "Esta proposta não inclui estimativa de economia." e a linha de Fio B nos detalhes técnicos.
4. Validade padrão (dias) e de onde vêm as condições de pagamento: do modelo da empresa ou digitadas pelo vendedor em cada emissão.
5. Propostas antigas: rodar a consulta da seção 1 e decidir o que fazer com eventuais anexos; sem achado, manter o 409.
