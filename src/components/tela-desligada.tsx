import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Cartao } from "@/components/ui";
import { obterSessao } from "@/lib/sessao";

/**
 * Aviso no lugar de uma tela desligada na empresa (Configurações › Telas da empresa, ou fora do plano Solo). O endereço
 * continua o mesmo; nada foi apagado. O admin ganha o atalho para religar.
 */
export async function TelaDesligada() {
  const { atual } = await obterSessao();
  const souAdmin = atual?.papel === "admin";
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina titulo="Tela desligada" detalhe />
      <Cartao>
        <div className="flex flex-col gap-3 text-sm text-texto-2">
          <p className="text-base font-medium text-texto">Esta tela está desligada na sua empresa</p>
          <p>Os dados dela continuam guardados. Ela volta assim que for ligada de novo.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/inicio" className="font-medium text-texto underline">
              Voltar ao Início
            </Link>
            {souAdmin && (
              <Link href="/configuracoes/telas" className="font-medium text-texto underline">
                Ligar em Configurações › Telas da empresa
              </Link>
            )}
          </div>
        </div>
      </Cartao>
    </div>
  );
}
