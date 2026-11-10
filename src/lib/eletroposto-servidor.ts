import "server-only";
import { areaLigada } from "@/lib/telas-empresa";
import { obterTelasEmpresa } from "@/lib/telas-empresa-servidor";

/**
 * Eletroposto disponível para quem está usando: módulo liberado pelo super-admin (`empresas.eletroposto_ativo`) e tela
 * ligada pelo admin (telas por empresa, 20261203100000_telas_empresa.sql). Vale para todos os papéis: o SDR também
 * abre negócio de eletroposto (sem modelos nem proposta). Com ele, "Novo negócio" pede a escolha entre solar e
 * eletroposto. Negócios de eletroposto que já existem continuam abrindo na ficha.
 */
export async function eletropostoDisponivel(): Promise<boolean> {
  return areaLigada(await obterTelasEmpresa(), "eletroposto");
}
