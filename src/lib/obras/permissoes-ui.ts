import { OBRAS, RESPONSAVEL_COMERCIAL, pode } from "@/lib/permissoes";

/**
 * De onde a lista de Obras lê, por papel. É só roteamento de leitura no app: quem decide o que
 * cada pessoa enxerga é a RLS do banco. Não há nenhuma ação de edição nesta tela.
 *
 * - `tabelas_comerciais`: admin, gestor, vendedor e sdr leem `obras` direto, sob RLS (`pode_ver_obra`).
 * - `rpc_operacao`: `operacao` não pode ler a tabela `obras`; lê só pela RPC `obras_operacao`.
 * - `null`: papel desconhecido ou ausente — não consulta nada.
 */
export type FonteDadosObras = "rpc_operacao" | "tabelas_comerciais";

export function fonteDadosObras(papel: string | null | undefined): FonteDadosObras | null {
  if (!pode(papel, OBRAS)) return null;
  // Os dois caminhos são positivos: papel novo em OBRAS sem fonte definida aqui cai em null.
  if (papel === "operacao") return "rpc_operacao";
  return pode(papel, RESPONSAVEL_COMERCIAL) ? "tabelas_comerciais" : null;
}

export const podeVerObras = (papel: string | null | undefined): boolean => fonteDadosObras(papel) !== null;
