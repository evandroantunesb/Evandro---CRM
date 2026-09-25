import { TelaPublica } from "@/components/tela-publica";
import { FormularioLogin } from "./formulario";

export default function Login() {
  return (
    <TelaPublica titulo="Entrar">
      <FormularioLogin />
    </TelaPublica>
  );
}
