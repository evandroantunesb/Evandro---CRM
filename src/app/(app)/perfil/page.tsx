import Link from "next/link";
import { Botao, Cartao } from "@/components/ui";
import { desconectarGoogleAgenda } from "@/lib/acoes/google-agenda";
import { integracaoConfigurada } from "@/lib/google-agenda";
import { obterSessao } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { FormularioPerfil } from "./formulario";

const MENSAGENS_GOOGLE: Record<string, { texto: string; erro: boolean }> = {
  conectado: { texto: "Conta do Google conectada.", erro: false },
  erro: { texto: "Não foi possível conectar com o Google. Tente de novo.", erro: true },
  "nao-configurado": { texto: "Integração com o Google Agenda ainda não está configurada.", erro: true },
};

export default async function Perfil({ searchParams }: PageProps<"/perfil">) {
  const sessao = await obterSessao();
  const { google } = await searchParams;
  const mensagemGoogle = typeof google === "string" ? MENSAGENS_GOOGLE[google] : undefined;

  let emailGoogleConectado: string | null = null;
  if (sessao.atual && integracaoConfigurada()) {
    const admin = criarClienteAdmin();
    const { data } = await admin
      .from("google_agenda_conexoes")
      .select("email_google")
      .eq("membro_id", sessao.atual.membroId)
      .maybeSingle();
    emailGoogleConectado = data?.email_google ?? null;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Meu perfil</h1>
      <Cartao>
        <FormularioPerfil nome={sessao.nome === sessao.email ? "" : sessao.nome} email={sessao.email} />
      </Cartao>
      <Cartao titulo="Senha">
        <Link href="/definir-senha" className="text-sm font-medium text-amber-700 hover:underline">
          Trocar minha senha →
        </Link>
      </Cartao>
      {sessao.atual && integracaoConfigurada() && (
        <Cartao titulo="Google Agenda">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-600">
              {emailGoogleConectado
                ? `Tarefas com prazo viram evento na sua Agenda automaticamente (conectado como ${emailGoogleConectado}).`
                : "Conecte sua conta Google para que as tarefas que você criar virem evento na sua Agenda."}
            </p>
            {mensagemGoogle && (
              <p role="status" className={`text-sm ${mensagemGoogle.erro ? "text-red-700" : "text-green-700"}`}>
                {mensagemGoogle.texto}
              </p>
            )}
            {emailGoogleConectado ? (
              <form action={desconectarGoogleAgenda}>
                <Botao type="submit" variante="secundario">
                  Desconectar
                </Botao>
              </form>
            ) : (
              <a href="/api/google-agenda/conectar">
                <Botao type="button">Conectar Google Agenda</Botao>
              </a>
            )}
          </div>
        </Cartao>
      )}
    </div>
  );
}
