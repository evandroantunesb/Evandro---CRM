import { ShieldCheck } from "lucide-react";
import { LogoRaion } from "@/components/marca";

/**
 * Pôster A4 de captação (mesma composição usada no PDF exportado): peça para o
 * cliente final ler, sem nenhum texto administrativo (nome do formulário, URL, status).
 *
 * `variante="cheio"` é usada na visualização em tela cheia — textos, QR Code e
 * espaçamentos maiores, proporcionais ao cartão bem maior (a variante "compacto"
 * usa valores pensados pra caber pequena, ao lado da lista ou dentro do modal do PDF).
 */
export function PosterFormulario({
  qrCode,
  className,
  variante = "compacto",
}: {
  qrCode: string | null;
  className?: string;
  variante?: "compacto" | "cheio";
}) {
  const cheio = variante === "cheio";
  return (
    <div
      className={`mx-auto flex aspect-[210/297] flex-col items-center bg-offwhite text-center ${cheio ? "px-10 py-14" : "px-6 py-8"} ${className ?? "w-full max-w-[320px]"}`}
    >
      <div className="flex w-full justify-center">
        <LogoRaion altura={cheio ? 44 : 26} />
      </div>
      <div className={`bg-dourado ${cheio ? "mt-6 h-px w-24" : "mt-4 h-px w-14"}`} />
      <h2 className={`leading-tight font-extrabold text-carvao ${cheio ? "mt-8 text-4xl" : "mt-5 text-xl"}`}>
        Fale com um
        <br />
        <span className="text-amber-800">especialista</span>
      </h2>
      <p className={`leading-snug text-zinc-600 ${cheio ? "mt-5 text-lg" : "mt-3 text-xs"}`}>
        Aponte a câmera do seu celular para o QR Code
        <br />e abra o formulário. É rápido e leva menos de 1 minuto.
      </p>
      <div className="mt-6 flex flex-1 items-center justify-center">
        {qrCode ? (
          <div className={`rounded-2xl border border-dourado bg-white ${cheio ? "p-6" : "p-3"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada localmente, sem otimização de imagem remota. */}
            <img
              src={qrCode}
              alt="QR Code para abrir o formulário"
              className={cheio ? "h-56 w-56" : "h-32 w-32"}
            />
          </div>
        ) : (
          <p className="text-xs text-zinc-400">QR Code indisponível</p>
        )}
      </div>
      <div className={`flex items-center gap-2 text-zinc-500 ${cheio ? "mt-8 text-sm" : "mt-6 text-[10px]"}`}>
        <ShieldCheck size={cheio ? 18 : 12} />
        <span className={`bg-dourado/60 ${cheio ? "h-4 w-px" : "h-3 w-px"}`} />
        Seus dados estão seguros com a Raion.
      </div>
    </div>
  );
}
