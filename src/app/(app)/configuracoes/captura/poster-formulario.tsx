import { ShieldCheck } from "lucide-react";
import { LogoRaion } from "@/components/marca";

/**
 * Pôster A4 de captação (mesma composição usada no PDF exportado): peça para o
 * cliente final ler, sem nenhum texto administrativo (nome do formulário, URL, status).
 */
export function PosterFormulario({ qrCode }: { qrCode: string | null }) {
  return (
    <div className="mx-auto flex aspect-[210/297] w-full max-w-[320px] flex-col items-center bg-offwhite px-6 py-8 text-center">
      <div className="flex w-full justify-center">
        <LogoRaion altura={26} />
      </div>
      <div className="mt-4 h-px w-14 bg-dourado" />
      <h2 className="mt-5 text-xl leading-tight font-extrabold text-carvao">
        Fale com um
        <br />
        <span className="text-amber-800">especialista</span>
      </h2>
      <p className="mt-3 text-xs leading-snug text-zinc-600">
        Aponte a câmera do seu celular para o QR Code
        <br />e abra o formulário. É rápido e leva menos de 1 minuto.
      </p>
      <div className="mt-6 flex flex-1 items-center justify-center">
        {qrCode ? (
          <div className="rounded-2xl border border-dourado bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada localmente, sem otimização de imagem remota. */}
            <img src={qrCode} alt="QR Code para abrir o formulário" className="h-32 w-32" />
          </div>
        ) : (
          <p className="text-xs text-zinc-400">QR Code indisponível</p>
        )}
      </div>
      <div className="mt-6 flex items-center gap-2 text-[10px] text-zinc-500">
        <ShieldCheck size={12} />
        <span className="h-3 w-px bg-dourado/60" />
        Seus dados estão seguros com a Raion.
      </div>
    </div>
  );
}
