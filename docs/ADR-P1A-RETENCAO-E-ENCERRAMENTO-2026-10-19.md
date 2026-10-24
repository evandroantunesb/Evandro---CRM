# ADR: retenção, anonimização e encerramento de tenant (dependência da P1a-1)

Data: 2026-10-19 · Status: **direção aceita; implementação pendente** · Decisor: Evandro

## Contexto

A P1a-1 (`20261019120000_proposta_versoes.sql`) cria versões emitidas de proposta, imutáveis e protegidas por SHA-256. Cada versão congela dados pessoais do cliente final (nome, endereço, cidade, UF) e o nome de quem emitiu. As chaves estrangeiras de `proposta_versoes` para `empresas`, `negocios` e `propostas` não têm cascata (`NO ACTION`): depois da primeira versão emitida, nem a proposta, nem o negócio, nem **a empresa inteira** podem ser apagados por `DELETE`, em nenhum papel.

Já na P1a-0 (em produção desde 2026-10-19) um negócio arquivado não pode ser apagado, o que também impede apagar a empresa que o contém.

## Decisão

Seguir as duas direções abaixo, **em etapa separada e antes de permitir a emissão de versões em produção**:

- **B. Anonimização controlada.** Função restrita a administradores da plataforma, com trilha de auditoria só de inserção, que anonimiza os dados pessoais de uma versão preservando número, datas, valores e a existência do registro. O hash anterior fica guardado como evidência. É o único caminho que o gatilho de imutabilidade aceita.
- **D. Encerramento de tenant em duas fases.** (1) Encerramento lógico, com bloqueio de acesso e prazo de retenção. (2) Expurgo autorizado, depois do prazo, com anonimização prévia. Resolve também o bloqueio da P1a-0.

A migration da P1a-1 **não** implementa B nem D e não foi alterada para isso.

## Dependências e bloqueios

1. **Nenhuma emissão em produção antes de B + D.** A própria migration da P1a-1 instala `emitir_proposta_versao` e `reconstruir_proposta_legada` **sem `EXECUTE` para nenhum papel da aplicação** (`PUBLIC`, `anon`, `authenticated`, `service_role`); só o dono (`postgres`) executa. Provado na stack descartável: todos os perfis (admin, gestor, vendedor, SDR, operação, administrador da plataforma) recebem `permission denied` pela API. O `GRANT` a `authenticated` volta apenas na migration que liberar a emissão, junto com B + D.
2. A migration da P1a-1 não é autorizada para produção por este ADR nem pela PR.
3. **Política de retenção e anonimização depende de avaliação jurídica.** O hash não elimina os riscos relacionados a dados pessoais: ele só prova integridade, e o conteúdo identificável continua guardado. Prazo, finalidade, base legal e a regra para o link público por token precisam ser definidos com o jurídico.
4. Pendência da P1a-0: empresa com negócio arquivado não pode ser apagada por `DELETE`. Deve ser resolvida no mesmo desenho do encerramento de tenant.

## Consequências

- Até B + D existirem, encerrar um tenant exige desativação lógica e retenção dos dados.
- A tabela `proposta_versoes` está vazia, então B + D podem mudar o desenho sem migrar dados, desde que venham antes da primeira emissão real.
