"use client";

import { BarChart3, Inbox, LayoutDashboard, PlugZap, QrCode, Sun, Trophy, Wrench, type LucideIcon } from "lucide-react";
import { INFO_TELA, TELAS_OPCIONAIS, avisoTelas, type TelaOpcional } from "@/lib/telas-empresa";

const ICONE: Record<TelaOpcional, LucideIcon> = {
  painel: LayoutDashboard,
  leads: Inbox,
  forecast: BarChart3,
  obras: Sun,
  engenharia: Wrench,
  gamificacao: Trophy,
  eletroposto: PlugZap,
  captura: QrCode,
};

/**
 * Cartão "Telas opcionais" do quadro aprovado "Onboarding PRO · passos 4 e 5": uma chave por tela. Usado em
 * Configurações › Telas da empresa e no assistente de primeiro acesso. A linha do Eletroposto só aparece com o módulo
 * liberado pelo super-admin.
 */
export function CartaoTelasOpcionais({
  ligadas,
  eletropostoLiberado,
  onChange,
}: {
  ligadas: readonly TelaOpcional[];
  eletropostoLiberado: boolean;
  onChange: (ligadas: TelaOpcional[]) => void;
}) {
  const telas = TELAS_OPCIONAIS.filter((t) => t !== "eletroposto" || eletropostoLiberado);
  const aviso = avisoTelas(ligadas);
  const alternar = (tela: TelaOpcional) =>
    onChange(ligadas.includes(tela) ? ligadas.filter((t) => t !== tela) : TELAS_OPCIONAIS.filter((t) => t === tela || ligadas.includes(t)));
  return (
    <section className="painel flex flex-col p-5">
      <h2 className="mb-3 font-titulo text-[17px] font-semibold text-texto">Telas opcionais</h2>
      <ul className="flex flex-col divide-y divide-linha">
        {telas.map((tela) => {
          const Icone = ICONE[tela];
          const ligada = ligadas.includes(tela);
          return (
            <li key={tela} className="flex items-center gap-3.5 py-3 first:pt-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-superficie-2 text-dourado-texto">
                <Icone size={17} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-texto">{INFO_TELA[tela].rotulo}</span>
                <span className="block text-xs text-texto-2">{INFO_TELA[tela].descricao}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={ligada}
                aria-label={INFO_TELA[tela].rotulo}
                onClick={() => alternar(tela)}
                className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-raion focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dourado ${
                  ligada ? "bg-carvao" : "bg-linha"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-[3px] h-4 w-4 rounded-full transition-all duration-200 ease-raion ${ligada ? "left-[19px] bg-dourado" : "left-[3px] bg-white"}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
      {aviso && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          {aviso}
        </p>
      )}
    </section>
  );
}
