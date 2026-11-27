# Proposta completa, PR 4: geração e consumo mês a mês

Data: 25/11/2026. Decisões do Evandro nesta data; o que é escolha minha está marcado como **(minha escolha)**.

## Por quê

O "depois" da proposta aprovado em 24/11/2026 (https://claude.ai/artifact/GF3sEXXvGsThZePPpVsNZQ, página "Seu sistema") tem o gráfico **"Geração e consumo mês a mês"**, deixado como "A definir" porque faltava a fonte da variação mensal. Hoje a geração é um número só (potência × produtividade da empresa), igual em todos os meses, e o cliente não vê que no verão o sistema gera mais e no inverno menos, nem como o crédito do verão cobre o inverno.

O CO₂, que era a outra metade desta PR, **saiu do sistema** (decisão de 25/11/2026, PR #426). Esta PR não tem CO₂.

## Metas

1. A empresa cadastra **uma curva de geração** com 12 valores mensais da região dela.
2. O vendedor pode informar, no negócio, o **consumo dos 12 meses** da conta de luz (opcional).
3. A proposta emitida (PDF e página on-line) mostra o gráfico **geração estimada × consumo** de janeiro a dezembro, com a nota aprovada no desenho.

## Fora do escopo

- Irradiação por cidade ou por estado (opções 2 e 3, descartadas pelo Evandro).
- Usar a curva ou os 12 meses em qualquer número financeiro: economia, payback, 25 anos e cobertura continuam pela média, como hoje.
- A ficha do kit (painel de 25 anos) não ganha o gráfico mensal.
- O renderizador antigo de modelos (`src/lib/propostas/pdf.tsx`, usado pela rota legada da tabela `propostas` e pela amostra de modelos) continua como está, com as 12 barras iguais e os 12 valores de consumo digitados no modelo.
- CO₂ de qualquer forma.

## Anti-metas (seria falha mesmo funcionando)

- Mudar o total anual da geração: a curva só **redistribui** o ano; a soma dos 12 meses tem que ser igual a geração mensal × 12, com tolerância só de arredondamento.
- Uma proposta já emitida mudar depois porque a empresa editou a curva ou o vendedor editou o consumo.
- Mudar a curva deixar cálculos de kit "desatualizados" ou pedir recálculo.
- Mostrar gráfico com dado inventado: sem curva cadastrada, não há gráfico; sem produtividade confirmada (proposta sem geração), não há gráfico.

## Caminhos considerados

- **A. Ler na emissão e congelar na proposta (escolhido pelo Evandro).** A curva fica nos parâmetros da calculadora da empresa e os 12 meses no negócio; ambos são lidos ao emitir e copiados para a emissão (esquema 8). O cálculo do kit não muda.
- **B. Gravar a curva dentro do cálculo do kit**, como o ICMS: rastreável, mas trocar a curva deixaria todos os cálculos desatualizados por causa de um gráfico. Descartado.
- **C. Calcular na hora de mostrar, sem cópia:** uma proposta enviada mudaria sozinha. Quebra a regra de proposta congelada da PR 3. Descartado.

## Como funciona (decidido)

### Curva da empresa

- Fica em **Configurações › Kits e calculadora**, junto da produtividade.
- A empresa digita os **12 números da fonte dela, em qualquer unidade** (por exemplo a irradiação diária média de cada mês do SunData). O sistema usa só a **proporção** entre os meses: `fator_m = valor_m / soma(12 valores)`.
- Todos os 12 valores precisam ser maiores que zero. Os 12 juntos ou nenhum (curva vazia = sem gráfico).
- Gravação: coluna nova em `parametros_calculadora`, por exemplo `curva_geracao_mensal numeric(8,3)[]`, nula ou com exatamente 12 elementos positivos (check no banco). Quem edita segue a política atual da tabela (só o admin da empresa) **(minha escolha: não muda a regra de quem edita)**.
- A curva **não** entra na confirmação da produtividade e não apaga essa confirmação.

### Consumo de 12 meses no negócio

- Campo opcional em **"Conta de luz e local"** (edição do negócio, `edicao-dados.tsx` / `edicao.tsx`): 12 campos de janeiro a dezembro, em kWh.
- Gravação: coluna nova em `negocios`, por exemplo `consumo_mensal_kwh numeric(10,2)[]`, nula ou com 12 elementos maiores ou iguais a zero. Mesmas regras de escrita do `consumo_medio_kwh` (RLS e `empresa_id` já existentes da tabela).
- Os 12 meses **não** mudam o consumo médio nem o cálculo: só alimentam o gráfico. Ao lado dos campos aparece a média dos 12 como dica **(minha escolha: sem recalcular o consumo médio automaticamente, porque ele move economia e payback)**.
- **12 ou nenhum:** com alguns meses preenchidos e outros vazios, a gravação é recusada com a mensagem de que faltam meses **(minha escolha, igual à curva da empresa)**. Mês sem consumo se informa como 0.
- Se a média dos 12 meses ficar longe do consumo médio, nada é bloqueado nem avisado na emissão: a dica da média ao lado dos campos é o único sinal **(minha escolha)**.
- Não entram no cadastro do novo negócio, só na edição **(minha escolha: mantém o cadastro curto)**.
- Mudar os 12 meses não deixa o cálculo do kit desatualizado (não é motivo de vigência).

### Na emissão (esquema 8)

- Novo esquema de emissão `8` = esquema 7 + campo `mensal`, nulo ou:
  - `geracaoKwh`: 12 números inteiros, `geracao.kwhMes × 12 × fator_m`, arredondados pelo maior resto para que a soma dê exatamente o total anual arredondado **(minha escolha)**;
  - `consumoKwh`: 12 números;
  - `consumoOrigem`: `"informado"` (os 12 do negócio) ou `"media"` (os 12 iguais ao consumo médio).
- `mensal` só existe quando a proposta tem geração (`sistema.geracao != null`, isto é, produtividade confirmada) **e** a empresa tem curva cadastrada. Senão é nulo e a proposta sai como hoje.
- `montarDadosEmissaoSimples` recebe a curva e os 12 meses na entrada e monta `mensal`; nunca completa dado ausente com padrão. Faltar curva **não é pendência**: a proposta é emitida sem o gráfico.
- O renderizador passa a `simples-v8`. Esquemas 4 a 7 continuam legíveis e renderizados como hoje.
- Função pura própria para a distribuição (por exemplo em `src/lib/geracao-mensal.ts`), com testes da soma anual, dos arredondamentos e da recusa de curva inválida.

### No PDF e na página on-line

- PDF (`pdf-simples.tsx`, em "Seu sistema", depois de "Seu sistema solar em números simples"): seção **"Geração e consumo mês a mês"**, barras douradas (geração) e cinzas (consumo) por mês, eixo em kWh, legenda, e a nota aprovada: "No verão o sistema gera mais e no inverno, menos. O excedente vira crédito na distribuidora e compensa os meses de menor geração (validade de 60 meses)."
- Com `consumoOrigem = "media"`, a legenda diz "Seu consumo médio".
- Página on-line (`src/app/proposta/[token]/emitida.tsx` e componente próprio): a mesma seção.
- O desenho exato das telas (Configurações, edição do negócio, PDF e página) é mostrado ao Evandro numa prévia antes de qualquer código de interface.

## Restrições

- Multiempresa: as colunas novas ficam em tabelas que já têm `empresa_id` e RLS; nenhuma tabela nova.
- Migration nova com prefixo depois de `20261221100000` (conferir PRs abertas). Atualizar junto `MIGRATIONS_AUTORIZADAS` em `.github/workflows/banco-producao.yml` e `AUTORIZADAS` em `tests/validar-conjunto-migrations.test.ts`.
- O preview da Vercel usa o banco de produção: o código que lê as colunas novas só funciona depois da migration aplicada. Aplicação em produção só pelo `banco-producao.yml`, com aprovação do Evandro.
- `database.types.ts` regenerado com `pnpm db:types`.
- Identidade visual: dourado para a geração e cinza para o consumo, como no desenho aprovado.

## Fica para quem constrói

- Nome final das colunas e das funções, onde ficam os componentes e o formato dos campos (12 inputs, grade de 3 × 4 no celular).
- Como a ação de gravar parâmetros e a de gravar o negócio validam os 12 valores (Zod no servidor + check no banco).
- Testes: puros da distribuição e da montagem do esquema 8; de banco para os checks das colunas; e2e só se couber.
