"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { adicionarAdmin, criarEmpresa, editarEmpresa } from "./actions";

export function FormularioEmpresa() {
  const [resultado, acao, pendente] = useActionState(criarEmpresa, null);
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <Campo rotulo="Nome da empresa" name="nome" required />
      <Campo rotulo="CNPJ (opcional)" name="cnpj" />
      <Campo rotulo="Nome do admin" name="admin_nome" required />
      <Campo rotulo="E-mail do admin" name="admin_email" type="email" required />
      <div className="flex flex-col gap-2 md:col-span-2">
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={pendente} className="self-start">
          {pendente ? "Criando..." : "Criar empresa e convidar admin"}
        </Botao>
      </div>
    </form>
  );
}

export function FormularioAdmin({ empresaId }: { empresaId: string }) {
  const [resultado, acao, pendente] = useActionState(adicionarAdmin, null);
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <input type="hidden" name="empresaId" value={empresaId} />
      <Campo rotulo="Nome" name="nome" required />
      <Campo rotulo="E-mail" name="email" type="email" required />
      <Botao type="submit" disabled={pendente}>
        Adicionar admin
      </Botao>
      <div className="md:col-span-3">
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

export function FormularioEdicaoEmpresa({ empresa }: { empresa: { id: string; nome: string; cnpj: string | null } }) {
  const [resultado, acao, pendente] = useActionState(editarEmpresa, null);
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end">
      <input type="hidden" name="empresaId" value={empresa.id} />
      <Campo rotulo="Nome da empresa" name="nome" defaultValue={empresa.nome} required />
      <Campo rotulo="CNPJ" name="cnpj" defaultValue={empresa.cnpj ?? ""} />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        Salvar
      </Botao>
      <div className="md:col-span-3">
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
