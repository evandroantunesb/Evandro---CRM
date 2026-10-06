import { exigirPapel } from "@/lib/sessao";
import { DashboardGerencial } from "./_gerencial/dashboard-gerencial";
import { DashboardPessoal } from "./_pessoal/dashboard-pessoal";

/**
 * Roteador fino da Visão geral da Gamificação. A visão é decidida SÓ pelo papel
 * da sessão (sem alternador): admin e gestor veem o dashboard gerencial
 * (empresa / escopo da equipe); qualquer outro papel (vendedor, sdr...) vê o
 * dashboard pessoal. Cada visão carrega só as próprias consultas.
 */
export default async function GamificacaoDashboard({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { atual } = await exigirPapel();
  const { periodo } = await searchParams;

  if (atual.papel === "admin" || atual.papel === "gestor") {
    return <DashboardGerencial atual={atual} periodoParam={periodo} />;
  }
  return <DashboardPessoal atual={atual} periodoParam={periodo} />;
}
