import { TelaPublica } from "@/components/tela-publica";
import { FormularioRecuperacao } from "./formulario";

export default function RecuperarSenha() {
  return (
    <TelaPublica titulo="Recuperar senha">
      <FormularioRecuperacao />
    </TelaPublica>
  );
}
