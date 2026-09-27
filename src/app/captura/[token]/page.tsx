import { notFound } from "next/navigation";
import { LogoRaion } from "@/components/marca";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { FormularioCaptura } from "./formulario";

export const dynamic = "force-dynamic";

/** Página pública do formulário de captura de leads: sem login. */
export default async function CapturaPublica({ params }: PageProps<"/captura/[token]">) {
  const { token } = await params;
  const admin = criarClienteAdmin();

  const { data: formulario } = await admin.from("formularios").select("nome, ativo").eq("token", token).maybeSingle();
  if (!formulario || !formulario.ativo) notFound();

  return (
    <main className="min-h-screen bg-offwhite">
      <div className="bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.35),_transparent_60%),linear-gradient(180deg,#0F0F10_0%,#0F0F10_100%)] px-6 pt-10 pb-16">
        <div className="mx-auto max-w-md">
          <LogoRaion tom="claro" altura={32} />
          <p className="mt-6 text-xs font-medium tracking-[0.3em] text-dourado uppercase">Energia solar</p>
          <h1 className="mt-1 text-3xl leading-tight font-semibold text-offwhite">
            Transforme sua economia de energia em realidade
          </h1>
          <p className="mt-2 text-sm text-offwhite/70">
            Preencha o formulário e fale com nosso time. É rápido e sem compromisso.
          </p>
        </div>
      </div>
      <div className="mx-auto -mt-8 max-w-md px-6 pb-10">
        <FormularioCaptura token={token} />
      </div>
    </main>
  );
}
