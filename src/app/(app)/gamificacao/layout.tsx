import type { ReactNode } from "react";
import { TelaDesligada } from "@/components/tela-desligada";
import { telaPermitida } from "@/lib/telas-empresa-servidor";
import { TemaGamificacao } from "./_compartilhado/tema-gamificacao";

// Toda a árvore /gamificacao usa o mesmo ambiente escuro (fundo + texto + variáveis --gf-*,
// ver globals.css e _compartilhado/gamificacao.css). As páginas não pintam fundo próprio:
// a superfície é contínua. Gamificação desligada na empresa (ou plano Solo): só o aviso.
export default async function LayoutGamificacao({ children }: { children: ReactNode }) {
  if (!(await telaPermitida("gamificacao"))) return <TelaDesligada />;
  return <TemaGamificacao>{children}</TemaGamificacao>;
}
