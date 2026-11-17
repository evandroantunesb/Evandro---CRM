import Link from "next/link";
import { classeBotao, FOCO } from "@/components/ui";
import { MENSAGEM_SEM_MODELO_PROCURACAO } from "@/lib/procuracao";

/**
 * Cartão "Procuração" da aba Proposta e contrato (desenho aprovado em 17/11/2026): sem modelo, o aviso (e o atalho
 * para quem edita o modelo); com modelo, o que falta e o botão que baixa o PDF preenchido. Gera só quando precisar.
 */
export function Procuracao({
  negocioId,
  temModelo,
  faltando,
  podeCadastrarModelo,
}: {
  negocioId: string;
  temModelo: boolean;
  faltando: string[];
  podeCadastrarModelo: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-texto-2">
        A procuração permite que a empresa represente o cliente na distribuidora (pedido de acesso, vistoria e conexão).
        Gere só quando precisar.
      </p>
      {!temModelo ? (
        <>
          <p className="rounded-lg bg-dourado/10 px-3 py-2 text-sm text-texto" role="status">
            {MENSAGEM_SEM_MODELO_PROCURACAO}
          </p>
          {podeCadastrarModelo ? (
            <Link href="/configuracoes/procuracao" className={`self-start text-sm font-semibold text-dourado-texto ${FOCO}`}>
              Cadastrar o modelo em Configurações
            </Link>
          ) : (
            <p className="text-xs text-texto-2">Peça ao admin para cadastrar o modelo.</p>
          )}
        </>
      ) : (
        <>
          {faltando.length > 0 && (
            <div className="rounded-lg bg-dourado/10 px-3 py-2 text-sm text-texto" role="status">
              <p className="font-semibold">Faltam dados que o modelo usa:</p>
              <ul className="ml-4 list-disc">
                {faltando.map((campo) => (
                  <li key={campo}>{campo}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-texto-2">Dá para baixar assim mesmo: o campo sem dado sai como &quot;—&quot;, como no contrato.</p>
            </div>
          )}
          <a href={`/negocios/${negocioId}/procuracao`} target="_blank" rel="noopener noreferrer" className={`${classeBotao()} self-start`}>
            Baixar procuração (PDF)
          </a>
          <p className="text-xs text-texto-2">
            Imprima, colha a assinatura do cliente e, se a distribuidora pedir, reconheça firma. A assinatura eletrônica
            entra no próximo passo do roadmap.
          </p>
        </>
      )}
    </div>
  );
}
