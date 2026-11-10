"use client";

import { MARCA_PADRAO, textoSobre, validarMarca } from "@/lib/marca-cores";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * As duas cores da marca (barra e faixa; destaque), com a prévia do quadro aprovado "Onboarding PRO · passo 2" e o
 * contraste na hora. Campo vazio = padrão Raion. Usado na identidade da proposta e no assistente de primeiro acesso.
 * Os campos de texto se chamam `cor_primaria` e `cor_destaque` (os da identidade da proposta).
 */
export function CamposMarcaCores({
  corPrimaria,
  corDestaque,
  onChange,
  logoUrl,
  nomeEmpresa,
}: {
  corPrimaria: string;
  corDestaque: string;
  onChange: (cores: { corPrimaria: string; corDestaque: string }) => void;
  logoUrl: string | null;
  nomeEmpresa: string;
}) {
  const barra = HEX.test(corPrimaria) ? corPrimaria : MARCA_PADRAO.barra;
  const destaque = HEX.test(corDestaque) ? corDestaque : MARCA_PADRAO.destaque;
  const problemas = validarMarca({ barra, destaque });
  const campo = (rotulo: string, nome: "cor_primaria" | "cor_destaque", valor: string, padrao: string, mudar: (v: string) => void) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{rotulo}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX.test(valor) ? valor : padrao}
          onChange={(e) => mudar(e.target.value.toUpperCase())}
          className="h-9 w-9 rounded border border-zinc-200"
          aria-label={`Selecionar ${rotulo.toLowerCase()}`}
        />
        <input
          type="text"
          name={nome}
          value={valor}
          onChange={(e) => mudar(e.target.value)}
          placeholder={padrao}
          pattern="^#[0-9a-fA-F]{6}$"
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-carvao outline-none focus:border-dourado focus:ring-2 focus:ring-dourado/20"
        />
      </div>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {campo("Cor da barra e da faixa (e títulos da proposta)", "cor_primaria", corPrimaria, MARCA_PADRAO.barra, (v) => onChange({ corPrimaria: v, corDestaque }))}
        {campo("Cor de destaque (botões, abas, gráficos e proposta)", "cor_destaque", corDestaque, MARCA_PADRAO.destaque, (v) => onChange({ corPrimaria, corDestaque: v }))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-zinc-700">Prévia no app</span>
          <button type="button" onClick={() => onChange({ corPrimaria: "", corDestaque: "" })} className="text-xs text-texto-2 underline">
            Voltar ao padrão Raion
          </button>
        </div>
        <div className="flex h-56 overflow-hidden rounded-2xl ring-1 ring-linha" aria-hidden data-testid="previa-marca">
          <div className="flex w-36 shrink-0 flex-col gap-1 p-3 text-[11px] text-[#FAF8F3]/65" style={{ background: barra }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage
              <img src={logoUrl} alt="" className="mb-2 h-5 w-auto max-w-full object-contain object-left" />
            ) : (
              <b className="mb-2 truncate text-[10px] tracking-[0.15em] text-[#FAF8F3] uppercase">{nomeEmpresa}</b>
            )}
            <span className="rounded-md bg-white/10 px-2 py-1.5 text-[#FAF8F3]" style={{ boxShadow: `inset 2px 0 0 ${destaque}` }}>
              Início
            </span>
            {["Tarefas", "Negócios", "Propostas", "Obras"].map((t) => (
              <span key={t} className="px-2 py-1.5">
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-2 bg-[#FAF8F3] p-3">
            <div className="flex h-20 items-end justify-between rounded-xl p-3" style={{ background: barra }}>
              <span className="font-titulo text-base font-light text-[#FAF8F3]">Bom dia</span>
              <span className="rounded-full px-3 py-1 text-[10px] font-semibold" style={{ background: destaque, color: textoSobre(destaque) }}>
                + Novo negócio
              </span>
            </div>
            <div className="flex flex-1 items-end gap-1.5 rounded-xl bg-white p-3">
              {[40, 55, 35, 70, 62].map((h) => (
                <i key={h} className="flex-1 rounded-t bg-[#E5E2DA]" style={{ height: `${h}%` }} />
              ))}
              <i className="flex-1 rounded-t" style={{ height: "85%", background: destaque }} />
            </div>
          </div>
        </div>
        {problemas.length ? (
          <ul role="alert" className="flex flex-col gap-1 text-xs text-erro">
            {problemas.map((p) => (
              <li key={p}>{p} Não dá para salvar assim.</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-energia">✓ Contraste bom: o texto da barra e dos botões continua legível.</p>
        )}
        <p className="text-xs text-texto-2">Verde do WhatsApp, vermelho de erro e os avisos de atenção não mudam: eles têm significado.</p>
      </div>
    </div>
  );
}
