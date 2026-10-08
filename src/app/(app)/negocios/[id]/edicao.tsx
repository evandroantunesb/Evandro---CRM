"use client";

import { useActionState, useState } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { useEnvioSemReset } from "@/components/envio-sem-reset";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { editarNegocio } from "@/lib/acoes/negocios";

type Opcao = { id: string; nome: string };

/** A etapa não é editada aqui: só pelo "Mover etapa"/Kanban, que exige comentário e respeita o papel. */
export function EdicaoNegocio({
  negocio,
  origens,
  responsaveis,
  podeEditarValor = true,
}: {
  negocio: {
    id: string;
    titulo: string;
    origemId: string | null;
    responsavelId: string | null;
    valor: number | null;
    descricao: string | null;
    tipoTelhado: string | null;
    unidadeConsumidora: string | null;
    padraoCliente: string | null;
    consumoMedioKwh: number | null;
    valorContaEnergia: number | null;
  };
  origens: Opcao[];
  responsaveis: Opcao[];
  /** SDR não pode alterar o valor financeiro do negócio (spec RAION_SDR_REGRAS_PERMISSOES §39). */
  podeEditarValor?: boolean;
}) {
  const [resultado, acao, pendente] = useActionState(editarNegocio, null);
  const enviar = useEnvioSemReset(acao);
  // Sem o reset automático, o arquivo escolhido ficaria no campo: limpa só ele quando salva.
  const [versaoArquivo, setVersaoArquivo] = useState(0);
  const [ultimoResultado, setUltimoResultado] = useState(resultado);
  if (resultado !== ultimoResultado) {
    setUltimoResultado(resultado);
    if (resultado?.ok) setVersaoArquivo((v) => v + 1);
  }
  return (
    <form onSubmit={enviar} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="negocioId" value={negocio.id} />
      <Campo rotulo="Nome do negócio" name="titulo" defaultValue={negocio.titulo} required />
      <Selecao rotulo="Origem" name="origem_id" defaultValue={negocio.origemId ?? ""}>
        <option value="">Sem origem</option>
        {origens.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </Selecao>
      {responsaveis.length > 0 && (
        <Selecao rotulo="Responsável" name="responsavel_id" defaultValue={negocio.responsavelId ?? ""}>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </Selecao>
      )}
      <Campo
        rotulo="Valor (R$)"
        name="valor"
        inputMode="decimal"
        required
        readOnly={!podeEditarValor}
        defaultValue={negocio.valor != null ? String(negocio.valor).replace(".", ",") : ""}
      />
      <Campo
        rotulo="Valor da conta de energia (R$)"
        name="valor_conta_energia"
        inputMode="decimal"
        placeholder="ex.: 450,00"
        defaultValue={negocio.valorContaEnergia != null ? String(negocio.valorContaEnergia).replace(".", ",") : ""}
      />
      <Campo
        rotulo="Consumo médio (12 meses, kWh)"
        name="consumo_medio_kwh"
        inputMode="decimal"
        placeholder="ex.: 450"
        defaultValue={negocio.consumoMedioKwh != null ? String(negocio.consumoMedioKwh).replace(".", ",") : ""}
      />
      <Campo rotulo="Unidade consumidora" name="unidade_consumidora" defaultValue={negocio.unidadeConsumidora ?? ""} />
      <Campo rotulo="Padrão do cliente" name="padrao_cliente" defaultValue={negocio.padraoCliente ?? ""} />
      <Campo
        rotulo="Tipo do telhado"
        name="tipo_telhado"
        placeholder="Ex.: cerâmico, metálico, laje, solo"
        defaultValue={negocio.tipoTelhado ?? ""}
      />
      <CampoArquivo key={versaoArquivo} rotulo="Fatura de energia (opcional)" name="anexo_fatura_energia" accept="image/*,.pdf" />
      <label className="flex flex-col gap-1 text-sm md:col-span-2">
        <span className="font-medium text-zinc-700">Descrição</span>
        <textarea
          name="descricao"
          rows={3}
          defaultValue={negocio.descricao ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2"
        />
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <Botao type="submit" disabled={pendente}>
          Salvar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}
