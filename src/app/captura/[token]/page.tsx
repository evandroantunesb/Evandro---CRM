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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <LogoRaion altura={32} />
      <div>
        <p className="text-xs font-medium tracking-[0.3em] text-zinc-500 uppercase">Energia solar</p>
        <h1 className="mt-1 text-2xl font-semibold text-carvao">Fale com um consultor</h1>
        <p className="mt-1 text-sm text-zinc-600">Deixe seus dados que retornamos com uma proposta.</p>
      </div>
      <FormularioCaptura token={token} />
    </main>
  );
}
