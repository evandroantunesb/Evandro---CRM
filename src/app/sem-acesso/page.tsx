import { TelaPublica } from "@/components/tela-publica";

export default function SemAcesso() {
  return (
    <TelaPublica titulo="Sem empresa vinculada">
      <p className="mb-6 text-sm text-zinc-600">
        Sua conta não está ativa em nenhuma empresa. Fale com o administrador da sua empresa.
      </p>
      <form action="/sair" method="post">
        <button className="text-sm text-zinc-600 hover:underline">Sair</button>
      </form>
    </TelaPublica>
  );
}
