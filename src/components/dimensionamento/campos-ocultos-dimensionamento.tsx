import { CAMPOS_DIMENSIONAMENTO } from "@/lib/dimensionamento-campos";
import type { CamposFormularioDimensionamento } from "@/components/dimensionamento/usar-dimensionamento";

/**
 * Só renderiza os `<input type="hidden">` com a escolha do painel de dimensionamento — sem
 * nenhuma lógica própria (a decisão de automático/manual/quantidade mora em `useDimensionamento`,
 * `src/components/dimensionamento/usar-dimensionamento.ts`). Nomes dos campos vêm de
 * `CAMPOS_DIMENSIONAMENTO` (`src/lib/dimensionamento-campos.ts`), a mesma constante usada pelo
 * schema Zod de `criarNegocio` (`src/lib/acoes/negocios.ts`) — nunca strings soltas aqui.
 */
export function CamposOcultosDimensionamento({ campos }: { campos: CamposFormularioDimensionamento | null }) {
  if (!campos) return null;
  return (
    <>
      <input type="hidden" name={CAMPOS_DIMENSIONAMENTO.moduloId} value={campos.moduloId} />
      <input type="hidden" name={CAMPOS_DIMENSIONAMENTO.inversorId} value={campos.inversorId} />
      <input type="hidden" name={CAMPOS_DIMENSIONAMENTO.quantidadeModulos} value={campos.quantidadeModulos} />
      <input type="hidden" name={CAMPOS_DIMENSIONAMENTO.origemEscolha} value={campos.origemEscolha} />
      {campos.origemProdutividade && campos.produtividadeKwhKwpMes != null && (
        <>
          <input
            type="hidden"
            name={CAMPOS_DIMENSIONAMENTO.produtividadeKwhKwpMes}
            value={campos.produtividadeKwhKwpMes}
          />
          <input type="hidden" name={CAMPOS_DIMENSIONAMENTO.origemProdutividade} value={campos.origemProdutividade} />
        </>
      )}
    </>
  );
}
