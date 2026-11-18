/**
 * Colunas que o link público e o PDF do contrato leem (pelo token, com o cliente admin). `contratos` tem duas chaves
 * para `negocios` (a simples e a composta de 20261015100000_integridade_contratos.sql): o embed precisa nomear a
 * relação, senão o PostgREST recusa por ambiguidade (PGRST201) e a página cai em 404.
 */
export const SELECAO_CONTRATO_PUBLICO = "conteudo, status, negocios!contratos_negocio_id_fkey(titulo)";
export const SELECAO_CONTRATO_PDF = "conteudo, empresa_id, negocios!contratos_negocio_id_fkey(titulo)";
