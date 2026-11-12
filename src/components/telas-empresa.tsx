"use client";

import { BarChart3, HardHat, Inbox, LayoutDashboard, PlugZap, QrCode, Receipt, ShoppingCart, Sun, Trophy, Wrench, type LucideIcon } from "lucide-react";
import { INFO_SETOR, INFO_TELA, SETORES_DESLIGAVEIS, TELAS_OPCIONAIS, avisoTelas, type SetorDesligavel, type TelaOpcional } from "@/lib/telas-empresa";

const ICONE: Record<TelaOpcional, LucideIcon> = {
  painel: LayoutDashboard,
  leads: Inbox,
  forecast: BarChart3,
  obras: Sun,
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

const ICONE_SETOR: Record<SetorDesligavel, LucideIcon> = { engenharia: Wrench, administrativo: Receipt };

/** Setores que nunca desligam (decisão do Evandro de 11/11/2026): textos do quadro "OnboardingProTelas". */
const SETORES_FIXOS: { rotulo: string; descricao: string; Icone: LucideIcon }[] = [
  {
    rotulo: "Compras",
    descricao: "Sempre na obra. Sem equipe de Compras, escolha quem atende em Configurações › Compras.",
    Icone: ShoppingCart,
  },
  { rotulo: "Operacional", descricao: "A instalação: sempre na obra", Icone: HardHat },
];

/**
 * Cartão "Setores da obra" do quadro aprovado "OnboardingProTelas" (setores da obra, 20261206100000_setores_da_obra.sql):
 * chaves de Engenharia e Administrativo; Compras e Operacional ficam sempre ligados. Usado em Configurações › Telas da
 * empresa e no passo Telas do assistente.
 */
export function CartaoSetoresObra({
  desligados,
  obrasLigada,
  onChange,
}: {
  desligados: readonly SetorDesligavel[];
  obrasLigada: boolean;
  onChange: (desligados: SetorDesligavel[]) => void;
}) {
  const alternar = (setor: SetorDesligavel) =>
    onChange(desligados.includes(setor) ? desligados.filter((s) => s !== setor) : SETORES_DESLIGAVEIS.filter((s) => s === setor || desligados.includes(s)));
  return (
    <section className="painel flex flex-col p-5">
      <h2 className="font-titulo text-[17px] font-semibold text-texto">Setores da obra</h2>
      <p className="mb-3 mt-1 text-xs text-texto-2">
        Desligue o setor que a sua empresa não tem. A obra nasce sem ele, a tela dele some do menu e o prazo da obra conta só as etapas que ficam.
      </p>
      <ul className="flex flex-col divide-y divide-linha">
        {SETORES_DESLIGAVEIS.map((setor) => {
          const Icone = ICONE_SETOR[setor];
          const ligado = !desligados.includes(setor);
          return (
            <li key={setor} className="flex items-center gap-3.5 py-3 first:pt-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-superficie-2 text-dourado-texto">
                <Icone size={17} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-texto">{INFO_SETOR[setor].rotulo}</span>
                <span className="block text-xs text-texto-2">{INFO_SETOR[setor].descricao}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={ligado}
                aria-label={`Setor ${INFO_SETOR[setor].rotulo}`}
                onClick={() => alternar(setor)}
                className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-raion focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dourado ${
                  ligado ? "bg-carvao" : "bg-linha"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-[3px] h-4 w-4 rounded-full transition-all duration-200 ease-raion ${ligado ? "left-[19px] bg-dourado" : "left-[3px] bg-white"}`}
                />
              </button>
            </li>
          );
        })}
        {SETORES_FIXOS.map(({ rotulo, descricao, Icone }) => (
          <li key={rotulo} className="flex items-center gap-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-superficie-2 text-texto-2">
              <Icone size={17} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-texto">{rotulo}</span>
              <span className="block text-xs text-texto-2">{descricao}</span>
            </span>
            <span className="shrink-0 rounded-full bg-superficie-2 px-2.5 py-1 text-[11px] font-medium text-texto-2">Sempre ligado</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl bg-superficie-2 px-3 py-2.5 text-xs text-texto-2">
        Vale para obras novas. As obras em andamento continuam com os setores que já têm. Sem o Administrativo, o admin e o gestor pagam fornecedores e cuidam
        da NF.
      </p>
      {!obrasLigada && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          As obras estão desligadas; os setores só valem quando Obras estiver ligada.
        </p>
      )}
    </section>
  );
}
