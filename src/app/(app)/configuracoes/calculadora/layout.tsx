import { exigirPapel } from "@/lib/sessao";
import { AbasCalculadora } from "./abas";

/**
 * "Kits e calculadora" organizada em abas (Evandro, 2026-10-01), no mesmo padrão de
 * layout + sub-rotas de Configurações → Propostas: Calculadora (simulação do motor, sem criar
 * negócio) | Kits (pacotes comerciais prontos) | Catálogo (módulos e inversores que o motor
 * combina sozinho) | Parâmetros (margem, overload, temperatura, disponibilidade, custos).
 */
export default async function LayoutCalculadora({ children }: { children: React.ReactNode }) {
  await exigirPapel("admin");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Kits e calculadora</h1>
      <AbasCalculadora />
      {children}
    </div>
  );
}
