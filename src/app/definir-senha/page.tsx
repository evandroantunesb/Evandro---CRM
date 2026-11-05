import { TelaPublica } from "@/components/tela-publica";
import { obterSessao } from "@/lib/sessao";
import { FormularioSenha } from "./formulario";

export default async function DefinirSenha() {
  const sessao = await obterSessao();
  return (
    <TelaPublica titulo="Crie sua senha" empresaId={sessao.atual?.empresaId ?? null}>
      <FormularioSenha nome={sessao.nome === sessao.email ? "" : sessao.nome} />
    </TelaPublica>
  );
}
