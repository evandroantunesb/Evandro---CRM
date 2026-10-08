"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { reservarAnexos } from "@/lib/acoes/anexos";
import { editarNegocio } from "@/lib/acoes/negocios";
import { enviarArquivosReservados } from "@/lib/anexos-navegador";
import { arquivosEscolhidos, metaArquivo, problemaArquivo } from "@/lib/anexos-regras";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { ResultadoAcao } from "@/lib/tipos";

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
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciar] = useTransition();
  // Sem o reset automático, o arquivo escolhido ficaria no campo: limpa só ele depois de tentar enviar.
  const [versaoArquivo, setVersaoArquivo] = useState(0);

  /**
   * Salva sem limpar o formulário (nada do que foi digitado se perde se o servidor recusar).
   * A fatura não passa pela ação (limite de 1 MB): depois de salvar, vai direto ao Storage.
   */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);
    const [fatura] = arquivosEscolhidos(formulario, "anexo_fatura_energia");
    formulario.delete("anexo_fatura_energia");
    const problema = fatura ? problemaArquivo(metaArquivo(fatura)) : null;
    if (problema) return setResultado({ ok: false, mensagem: `${problema} Escolha outro arquivo.` });
    iniciar(async () => {
      const r = await editarNegocio(null, formulario);
      if (!r?.ok || !fatura) return setResultado(r);
      const reserva = await reservarAnexos(negocio.id, [{ ...metaArquivo(fatura), categoria: "fatura_gerador" }]);
      const falhas = reserva.ok
        ? await enviarArquivosReservados(criarClienteNavegador(), [{ caminho: reserva.reservas[0].caminho, arquivo: fatura }])
        : [fatura.name];
      setVersaoArquivo((v) => v + 1);
      router.refresh();
      setResultado(
        falhas.length
          ? {
              ok: false,
              mensagem: reserva.ok
                ? "Dados salvos, mas a fatura não chegou. Ela aparece como “não recebido” em Arquivos: remova e envie de novo."
                : `Dados salvos, mas a fatura não foi anexada (${reserva.mensagem}). Envie de novo.`,
            }
          : { ok: true, mensagem: "Salvo." },
      );
    });
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
