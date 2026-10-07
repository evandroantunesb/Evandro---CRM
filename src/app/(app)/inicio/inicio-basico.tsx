import { Cartao } from "@/components/ui";
import { ROTULO_PAPEL, type Papel } from "@/lib/tipos";

/**
 * Início neutra para quem não tem acesso comercial (ex.: papel futuro de Obras): só saudação
 * e identificação. Nenhum KPI, funil, proposta, meta, negócio ou atalho comercial — a página
 * principal retorna esta versão antes de qualquer consulta comercial.
 */
export function InicioBasico({ nome, saudacao, empresaNome, papel }: { nome: string; saudacao: string; empresaNome: string; papel: Papel }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
        {saudacao}, {nome}.
      </h1>
      <Cartao>
        <p className="text-sm text-zinc-600">Use o menu para acessar as áreas liberadas para você.</p>
      </Cartao>
      <p className="text-center text-xs text-zinc-400">
        Você está em <strong className="font-medium text-zinc-600">{empresaNome}</strong> como {ROTULO_PAPEL[papel] ?? papel}.
      </p>
    </div>
  );
}
