"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { MODELOS_COBRANCA, ROTULO_MODELO_COBRANCA, type ModeloCobranca, type TipoPlano } from "@/lib/tipos";
import { adicionarAdmin, criarEmpresa, editarEmpresa, salvarPlano } from "./actions";

type Plano = {
  tipo: TipoPlano;
  modelo_cobranca: ModeloCobranca | null;
  valor_fixo: number | null;
  valor_por_usuario: number | null;
  dia_vencimento: number | null;
  limite_usuarios: number | null;
} | null;

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

export function FormularioPlano({ empresaId, plano }: { empresaId: string; plano: Plano }) {
  const [resultado, acao, pendente] = useActionState(salvarPlano, null);
  const [tipo, setTipo] = useState<TipoPlano>(plano?.tipo ?? "gratuito");

  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="empresaId" value={empresaId} />
      <Selecao
        rotulo="Tipo de plano"
        name="tipo"
        value={tipo}
        onChange={(e) => setTipo(e.target.value as TipoPlano)}
      >
        <option value="gratuito">Gratuito</option>
        <option value="pago">Pago</option>
      </Selecao>
      {tipo === "pago" && (
        <>
          <Selecao rotulo="Modelo de cobrança" name="modeloCobranca" defaultValue={plano?.modelo_cobranca ?? ""} required>
            <option value="" disabled>
              Selecione
            </option>
            {MODELOS_COBRANCA.map((m) => (
              <option key={m} value={m}>
                {ROTULO_MODELO_COBRANCA[m]}
              </option>
            ))}
          </Selecao>
          <Campo
            rotulo="Valor fixo (R$)"
            name="valorFixo"
            type="number"
            step="0.01"
            min="0"
            defaultValue={plano?.valor_fixo ?? ""}
          />
          <Campo
            rotulo="Valor por usuário (R$)"
            name="valorPorUsuario"
            type="number"
            step="0.01"
            min="0"
            defaultValue={plano?.valor_por_usuario ?? ""}
          />
          <Campo
            rotulo="Dia de vencimento"
            name="diaVencimento"
            type="number"
            min="1"
            max="28"
            defaultValue={plano?.dia_vencimento ?? ""}
          />
          <Campo
            rotulo="Limite de usuários (opcional)"
            name="limiteUsuarios"
            type="number"
            min="1"
            defaultValue={plano?.limite_usuarios ?? ""}
          />
        </>
      )}
      <div className="flex flex-col gap-2 md:col-span-2">
        <Mensagem resultado={resultado} />
        <Botao type="submit" disabled={pendente} className="self-start">
          {pendente ? "Salvando..." : "Salvar plano"}
        </Botao>
      </div>
    </form>
  );
}
