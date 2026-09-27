"use client";

import { Gauge, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";
import { useActionState, type InputHTMLAttributes } from "react";
import { enviarCaptura } from "@/lib/acoes/captura";
import { Botao, Mensagem } from "@/components/ui";

function CampoComIcone({
  icone: Icone,
  rotulo,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icone: typeof User; rotulo: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{rotulo}</span>
      <span className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 focus-within:border-dourado focus-within:ring-2 focus-within:ring-dourado/20">
        <Icone size={16} className="shrink-0 text-zinc-400" />
        <input className="w-full min-w-0 text-carvao outline-none placeholder:text-zinc-400" {...props} />
      </span>
    </label>
  );
}

export function FormularioCaptura({ token }: { token: string }) {
  const [resultado, acao, pendente] = useActionState(enviarCaptura, null);

  if (resultado?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{resultado.mensagem}</div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,16,0.06)]">
      <p className="mb-1 text-sm font-semibold text-carvao">Seus dados</p>
      <p className="mb-4 text-xs text-zinc-500">Leva menos de 1 minuto.</p>
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <CampoComIcone icone={User} rotulo="Nome completo" name="nome" placeholder="Seu nome" required />
        <CampoComIcone icone={Phone} rotulo="Telefone (WhatsApp)" name="telefone" type="tel" placeholder="(00) 90000-0000" required />
        <CampoComIcone icone={Mail} rotulo="E-mail (opcional)" name="email" type="email" placeholder="voce@email.com" />
        <CampoComIcone icone={MapPin} rotulo="Cidade (opcional)" name="cidade" placeholder="Sua cidade" />
        <CampoComIcone
          icone={Gauge}
          rotulo="Número da unidade consumidora (opcional)"
          name="unidade_consumidora"
          placeholder="Está na sua conta de luz"
        />
        <Botao type="submit" disabled={pendente} className="mt-2 justify-center py-3">
          {pendente ? "Enviando..." : "Quero falar com um especialista →"}
        </Botao>
        <Mensagem resultado={resultado} />
        <p className="flex items-center justify-center gap-1 text-center text-[11px] text-zinc-400">
          <ShieldCheck size={12} /> Seus dados estão seguros com a Raion.
        </p>
      </form>
    </div>
  );
}
