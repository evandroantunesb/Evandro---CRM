# Contrato — estimativa financeira GD II (Copel, B1 convencional): fonte, regra, entradas e estados

Estado: **revisão 2, aguarda aceite do Evandro**. Nada aqui está ligado ao motor real (`calcular` continua devolvendo só
estimativa incompleta). Nora, 22/10/2026. Escopo inalterado: B1 residencial convencional, GD II, Copel.

---

## 1. Fonte do Fio B e rastreabilidade

Três categorias, nunca misturadas:

**A. Extraído da ANEEL (dado bruto)** — `.aurora/fontes/aneel-componentes-2026-copel-reh3592-b1.json`
- Conjunto "Componentes Tarifárias" (pacote `613e6b74-1a4b-4c48-a231-096815e96bd5`), recurso `componentes-tarifarias-2026`
  (id `e8717aa8-2521-453f-bf16-fbb9a16eea39`, last_modified 2026-10-22T05:29:22), `DatGeracaoConjuntoDados` 2026-10-22.
- Extração: 22/10/2026 20:58:09 (-03:00), API `datastore_search`. Consulta reproduzível e SHA-256 da resposta completa
  (7.380 registros B1 da Copel: `6f0c3eff…0a02eef`) estão no arquivo.
- 12 linhas guardadas verbatim (TUSD_FioB, TUSD e TE; detalhes "SCEE" e "Não se aplica"; cada uma em duplicata).
- Linha do Fio B: `_id` 887694 (dup. 923614), REH 3.592 de 23/06/2026, COPEL-DIS, CNPJ 04368898000106,
  vigência 2026-06-24 a 2027-06-23, "Tarifa de Aplicação", B1, Convencional, Residencial/Residencial, SCEE, R$/MWh,
  `TUSD_FioB`, valor bruto `"214,53560037400001"` (ruído de ponto flutuante do campo numeric(18,9); valor = 214,535600374).
- Mesma linha: TE `"310,85…"`, TUSD `"457,17…"`; SCEE: TE `"30,19999…"`, TUSD `"457,17…"`.

**B. Cálculo aritmético (meu, sobre A)**
- T = (310,85 + 457,17) / 1000 = **0,76802 R$/kWh**.
- N(p) = p × 214,535600374 / 1000 → **0,1287214 R$/kWh (p = 60%)**; **0,1609017 R$/kWh (p = 75%)**.
- p vem da Lei 14.300, art. 27 (texto compilado do Planalto, lido em 22/10/2026).

**C. Ainda NÃO lido (não usado como dado)**
- Tabela 4 (descontos SCEE GD II) e art. de PIS/Cofins da REH 3.592: o PDF não foi obtido (403 a acesso automatizado).
  Em duas REHs lidas (Equatorial GO 3.544, Enel CE 3.445) o desconto publicado coincide com `1 − p × FioB / TUSD_SCEE`;
  para a Copel isso **prevê** 71,84% (2026) e 64,80% (2027) na TUSD e 100% na TE. É previsão, não verificação.
- Pendência registrada `tabela4_nao_conferida`. Fecha quando o arquivo da REH 3.592 estiver em `.aurora/fontes/` e eu o ler;
  ninguém atesta o anexo no lugar dessa leitura. Se divergir de B, vale a Tabela 4 (art. 655-Q).

## 2. Entradas: definições e correspondência com o CRM (base mensal média)

| Símbolo | Definição | Origem no CRM |
| --- | --- | --- |
| `Ct` | consumo total da unidade no mês (kWh) | `negocios.consumo_medio_kwh` (kWh informado; cliente hoje sem GD). Consumo só estimado pela conta em R$ = sem `Ct` → incompleto |
| `G` | geração do sistema no mês (kWh) | `kit_potencia_kwp × produtividade` confirmada pela empresa |
| `A` | autoconsumo simultâneo: parte da geração consumida no instante, que não passa pelo medidor | **não existe no CRM** |
| `C = Ct − A` | consumo retirado da rede (medido pela distribuidora, REN 1.000, art. 655-G, §2º) | derivado |
| `E = G − A` | energia injetada = disponível para compensação no ciclo (sem banco de créditos) | derivado |
| `D` | custo de disponibilidade em kWh (art. 291): 30 mono/bifásico 2 condutores; 50 bifásico 3 condutores; 100 trifásico | `tipo_ligacao`; o CRM não distingue bifásico 2/3 condutores |
| `K` | energia compensada no ciclo: `min(E, C, limite do piso)` | calculado |
| `E − K` | injetado e não compensado no ciclo (vira crédito na distribuidora; **não valorado** aqui) | calculado |

**Hipótese declarada: `A = 0`.** Efeito: todo consumo vem da rede (`C = Ct`) e toda geração é injetada (`E = G`), de modo
que a energia que na prática seria autoconsumida paga N como se fosse compensada. Fora do piso, a conta com solar fica
maior em `A × N` (ex.: caso 3 com `A = 100` → 179,35 em vez de 192,22); no piso, não muda (caso 5 com `A = 30` → 38,40).
O resultado deve exibir "autoconsumo simultâneo não considerado". `A` informado só entra com origem declarada.

Outras simplificações declaradas: média mensal (sazonalidade e o piso mês a mês não são modelados); posto único
(convencional); `D` do bifásico assume 3 condutores (50 kWh).

## 3. Regra aplicável ao piso (fundamento atualizado)

- **Lei 14.300, art. 16, caput**: a energia compensada é usada "até o limite em que o valor em moeda relativo ao faturamento
  da unidade consumidora seja maior ou igual ao valor mínimo faturável". **§1º**: para a GD II, o valor mínimo "deve ser
  aplicado se o consumo medido … desconsideradas as compensações … for inferior ao consumo mínimo faturável".
- **REN 1.000, art. 655-I, §1º e §2º, I**: parcela de consumo = maior entre custo de disponibilidade e faturamento;
  a energia compensada vai até o faturamento ≥ custo de disponibilidade.
- **Interpretação oficial da ANEEL** (voto do Diretor-Relator da REN 1.059/2023, 07/02/2023, itens 204–210, com parecer
  da Procuradoria Federal junto à ANEEL): o caput vale para **todas** as unidades do SCEE e impede que a compensação leve
  o faturamento abaixo do mínimo; o §1º "foi utilizado não com o intuito de estabelecer uma exceção, mas sim de confirmar
  o disposto no caput". A leitura "§1º isenta quem consome acima do mínimo" foi apresentada na consulta pública e
  rejeitada.
- **Situação em 22/10/2026**: Lei 14.300 (compilado do Planalto) sem alteração nos arts. 16 e 27 (a Lei 15.269/2025
  alterou os arts. 22 e 25, CDE). REN 1.000: a cópia compilada é de ago/2025; depois dela, a REN 1.148/2026 altera os
  arts. 439 a 449-B (vigência 2027) e a REN 1.162/2026 (armazenamento) altera os arts. 127 e 148, segundo resumo
  jurídico (texto da 1.162 não lido). Nenhuma das duas toca 291, 655-I ou 655-Q. O PDL 59/2023, que sustaria o 655-I,
  §§1º–3º, está parado desde 31/10/2023 (API da Câmara: "Aguardando Encaminhamento").

**Regra do contrato:** o piso do art. 655-I, §2º, I vale para toda unidade GD II, como a distribuidora fatura. Não é
parâmetro nem escolha: é a regra vigente com a interpretação oficial. A contestação (PDL 59/2023) fica registrada como
risco regulatório; se a regra mudar, muda o contrato.

### Quinto caso (distingue as leituras)

`C = 100`, `E = 100`, `D = 50`, `A = 0`, T = 0,76802, N = 0,1287214:
- Sem solar: max(100, 50) × T = **76,80**.
- Limite do piso: (100 − 50) × T / (T − N) = 38,401 / 0,6392986 = **60,07 kWh** → K = min(100, 100, 60,07) = 60,07.
- Com solar: (100 − 60,07) × T + 60,07 × N = 30,668 + 7,732 = **38,40** (= piso 50 × T). Economia **38,40**.
- Não compensados no ciclo: **39,93 kWh** (crédito não valorado).
- Compensar os 100 kWh a N daria 12,87: isso é a leitura rejeitada pela ANEEL, não um resultado do contrato.

## 4. Percentual anual × vigência tarifária

- `dataReferencia` = data do cálculo (America/Sao_Paulo). Duas consultas independentes:
  1. componente vigente: linha da REH cuja vigência contém a data (REH 3.592: 24/06/2026 a 23/06/2027);
  2. percentual legal do **ano** da data: 2026 → 60%; 2027 → 75%.
- Data sem REH carregada (antes de 24/06/2026 ou depois de 23/06/2027): pendência `fio_b_vigencia_fora`
  ("Sem tarifa vigente da Copel para dd/mm/aaaa") → estimativa incompleta. Nunca reaproveitar a componente fora da vigência.
- **Payback**: a economia é de **um mês**, o de referência. Multiplicá-la até o retorno do investimento pressupõe tarifa e
  percentual constantes, o que contradiz a própria lei (75% em 2027, 90% em 2028, regra do art. 17 em 2029). No P0 o
  payback fica **indisponível**, com o motivo "depende de projeção de tarifas e da transição da Lei 14.300", até existir
  regra de projeção aprovada.

## 5. Tarifas: o que cada campo representa

| Campo | Representa | Base | Uso |
| --- | --- | --- | --- |
| `negocios.tarifa_efetiva_kwh` | conta em R$ ÷ kWh da conta | **com** tributos | só estimar consumo; nunca entra na conta financeira |
| Campo "Tarifa (R$/kWh)" do kit → `calculos_solares.tarifa_kwh` | tarifa base TE + TUSD usada como T; **personalizável pelo vendedor (mantida)** | hoje **não declarada** | T da conta, depois de declarada a base |
| T oficial (ANEEL, REH 3.592) | TE + TUSD B1 convencional = 0,76802 | **sem** tributos | valor sugerido do campo acima |
| N (B) | Fio B GD II | **sem** tributos | energia compensada |

Regras:
- O campo personalizável continua editável; abre preenchido com a T oficial e a origem "ANEEL REH 3.592". Se o vendedor
  muda o valor, a origem passa a "informada pelo vendedor".
- A base tributária de T é declarada e gravada (`sem_tributos` | `com_tributos`) com a origem.
- A conta só fecha com base(T) = base(N). Como N só existe sem tributos, T com tributos gera a pendência
  `base_tributaria_divergente` (estimativa incompleta). Sem conversão automática: o tratamento tributário da energia
  compensada segue em aberto.
- `D × T` (piso) usa a mesma T. Linhas antigas sem base declarada continuam `legado`.

## 6. Histórico e desatualização

- **R6.1** Linha `legado` ou `completo` nunca é sobrescrita por resultado incompleto: fica como histórico.
- **R6.2** Ao salvar com entradas diferentes das gravadas na linha (kit, consumo/fatura, tarifa e base, ligação,
  parâmetros, Fio B/vigência da data) e com resultado novo incompleto, a linha recebe `financeiro_desatualizado_em` e
  o motivo. A vigência passa a ter o motivo `desatualizado_por_entradas`, que bloqueia proposta e preço e impede exibir
  a linha como resultado atual. O contrato segue a regra atual (só kit, consumo e produtividade).
- **R6.3** A marca só sai quando a linha for regravada como `completo` com as entradas atuais.
- **R6.4** Linha `incompleto` anterior é substituída pela nova incompleta (não há dado financeiro a perder).
- No worktree hoje: R6.1 vale para `legado` (o `completo` ainda não existe); R6.4 vale; R6.2 e R6.3 **não estão
  implementados**. A linha legada já bloqueia proposta e preço pelo motivo `legado`, mas uma tarifa nova digitada sem linha
  nova não fica registrada. R6.2 e R6.3 exigem uma coluna e a comparação de entradas, depois do aceite.

## 7. Fórmula e casos de conferência

- Sem solar: `max(Ct, D) × T`.
- Com solar: `K = min(E, C, max(0, (C − D) × T / (T − N)))`; conta = `max(D × T, (C − K) × T + K × N)`.
- Economia = sem − com, sobre as contas arredondadas; payback conforme a seção 4.

| Caso (D = 50, A = 0) | Sem solar | Com solar | Economia | Não compensado |
| --- | --- | --- | --- | --- |
| 1. Ct 300, G 0 | 230,41 | 230,41 | 0,00 | 0 |
| 2. Ct 40, G 200 (abaixo do piso) | 38,40 | 38,40 | 0,00 | 200 |
| 3. Ct 500, G 300 (parcial) | 384,01 | 192,22 | 191,79 | 0 |
| 4. Ct 400, G 500 (total) | 307,21 | 51,49 | 255,72 | 100 |
| 4b. Ct 200, G 400 (piso limita) | 153,60 | 38,40 | 115,20 | 219,80 |
| **5. C 100, E 100** | **76,80** | **38,40** | **38,40** | **39,93** |

Todos conferidos à mão e pelo módulo isolado (`tests/fio-b-copel-quatro-casos.test.ts`, 6/6).

## 8. Recomendação técnica para aceite

Aceitar, como regra do P0:
1. **Fonte**: N = p × `TUSD_FioB` extraído (seção 1A/1B), com a linha bruta e a consulta preservadas; Tabela 4 registrada
   como não conferida, fechando pela leitura do arquivo, não por atestação.
2. **Piso**: art. 655-I, §2º, I da REN 1.000 para toda GD II, pela interpretação oficial da ANEEL (seção 3); caso 5 =
   38,40.
3. **Entradas**: definições da seção 2, com `A = 0` declarado e exibido; média mensal; bifásico = 50 kWh.
4. **Datas**: percentual pelo ano e componente pela vigência da data de referência; fora da vigência = incompleto;
   payback indisponível no P0.
5. **Tarifa**: campo personalizável mantido, com base tributária declarada e gravada; mistura de bases = incompleto.
6. **Histórico**: R6.1 a R6.4 (R6.2 e R6.3 implementados depois do aceite).

Depois do aceite: cadastrar a linha da Copel (com a fonte), implementar R6.2/R6.3, a seção 5 e a ligação ao motor
(`m2-p0-ligacao-motor.md`), e testar prévia → salvar → reabrir → proposta no banco descartável.
