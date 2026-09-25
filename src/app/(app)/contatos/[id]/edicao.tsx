"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { editarContato } from "@/lib/acoes/contatos";

export type ContatoEdicao = {
  id: string;
  tipo: string;
  nome: string;
  telefone: string | null;
  telefone2: string | null;
  email: string | null;
  documento: string | null;
  cidade: string | null;
  uf: string | null;
};

export function EdicaoContato({ contato }: { contato: ContatoEdicao }) {
  const [resultado, acao, pendente] = useActionState(editarContato, null);
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="contatoId" value={contato.id} />
      <Selecao rotulo="Tipo" name="tipo" defaultValue={contato.tipo}>
        <option value="pf">Pessoa física</option>
        <option value="pj">Empresa</option>
      </Selecao>
      <Campo rotulo="Nome / razão social" name="nome" defaultValue={contato.nome} required />
      <Campo rotulo="Telefone / WhatsApp" name="telefone" type="tel" defaultValue={contato.telefone ?? ""} />
      <Campo rotulo="Telefone secundário" name="telefone2" type="tel" defaultValue={contato.telefone2 ?? ""} />
      <Campo rotulo="E-mail" name="email" type="email" defaultValue={contato.email ?? ""} />
      <Campo rotulo="CPF / CNPJ" name="documento" defaultValue={contato.documento ?? ""} />
      <Campo rotulo="Cidade" name="cidade" defaultValue={contato.cidade ?? ""} />
      <Campo rotulo="UF" name="uf" maxLength={2} defaultValue={contato.uf ?? ""} />
      <div className="flex items-center gap-3 md:col-span-2">
        <Botao type="submit" disabled={pendente}>
          Salvar contato
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
