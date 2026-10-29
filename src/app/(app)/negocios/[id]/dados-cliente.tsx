"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { salvarDadosClienteContrato } from "@/lib/acoes/contatos";

export type DadosClienteFicha = {
  id: string;
  tipo: string;
  nome: string;
  documento: string | null;
  rg: string | null;
  data_nascimento: string | null;
  inscricao_estadual: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  cidade: string | null;
  uf: string | null;
};

/**
 * Dados do cliente que o contrato exige (regra em `@/lib/dados-cliente-contrato`; o banco trava o contrato também).
 * Salva parcial: o vendedor pode completar aos poucos. O CEP preenche rua, bairro, cidade e UF quando encontrado.
 */
export function DadosCliente({ negocioId, contato, pendencias }: { negocioId: string; contato: DadosClienteFicha; pendencias: string[] }) {
  const [resultado, acao, pendente] = useActionState(salvarDadosClienteContrato, null);
  const enviar = useEnvioSemReset(acao);
  const [tipo, setTipo] = useState(contato.tipo === "pj" ? "pj" : "pf");
  const [cep, setCep] = useState(contato.cep ? contato.cep.replace(/(\d{5})(\d{3})/, "$1-$2") : "");
  const [logradouro, setLogradouro] = useState(contato.logradouro ?? "");
  const [bairro, setBairro] = useState(contato.bairro ?? "");
  const [cidade, setCidade] = useState(contato.cidade ?? "");
  const [uf, setUf] = useState(contato.uf ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const pj = tipo === "pj";

  async function buscarCep(valor: string) {
    const limpo = valor.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();
      if (!dados.erro) {
        setLogradouro(dados.logradouro ?? "");
        setBairro(dados.bairro ?? "");
        setCidade(dados.localidade ?? "");
        setUf(dados.uf ?? "");
      }
    } catch {
      // Preenchimento automático é só conveniência: sem CEP encontrado, o vendedor preenche à mão.
    } finally {
      setBuscandoCep(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="negocioId" value={negocioId} />
      <input type="hidden" name="contatoId" value={contato.id} />
      {pendencias.length > 0 ? (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Falta para o contrato: {pendencias.join(", ")}.
        </p>
      ) : (
        <p role="status" className="text-xs text-zinc-500">
          Dados do cliente completos para o contrato.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Selecao rotulo="Tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="pf">Pessoa física</option>
          <option value="pj">Pessoa jurídica</option>
        </Selecao>
        <Campo rotulo={pj ? "Razão social" : "Nome completo"} name="nome" defaultValue={contato.nome} required minLength={2} />
        <Campo rotulo={pj ? "CNPJ" : "CPF"} name="documento" defaultValue={contato.documento ?? ""} inputMode="numeric" />
        {pj ? (
          <Campo rotulo="Inscrição estadual (opcional)" name="inscricao_estadual" defaultValue={contato.inscricao_estadual ?? ""} />
        ) : (
          <>
            <Campo rotulo="RG" name="rg" defaultValue={contato.rg ?? ""} />
            <Campo rotulo="Data de nascimento" name="data_nascimento" type="date" defaultValue={contato.data_nascimento ?? ""} />
          </>
        )}
        <Campo rotulo="E-mail" name="email" type="email" defaultValue={contato.email ?? ""} />
        <Campo rotulo="Telefone" name="telefone" type="tel" defaultValue={contato.telefone ?? ""} required />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo
          rotulo={buscandoCep ? "CEP (buscando...)" : "CEP"}
          name="cep"
          inputMode="numeric"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          onBlur={(e) => buscarCep(e.target.value)}
        />
        <div className="sm:col-span-2">
          <Campo rotulo="Rua" name="logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
        </div>
        <Campo rotulo="Número" name="numero" defaultValue={contato.numero ?? ""} />
        <Campo rotulo="Complemento (opcional)" name="complemento" defaultValue={contato.complemento ?? ""} />
        <Campo rotulo="Bairro" name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
        <div className="sm:col-span-2">
          <Campo rotulo="Cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
        <Campo rotulo="UF" name="uf" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} />
      </div>

      <Mensagem resultado={resultado} />
      <Botao type="submit" variante="secundario" disabled={pendente} className="self-start">
        {pendente ? "Salvando..." : "Salvar dados do cliente"}
      </Botao>
    </form>
  );
}
