"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { registrarAnexo } from "@/lib/acoes/anexos";
import { editarNegocio } from "@/lib/acoes/negocios";
import { enviarArquivos } from "@/lib/anexos-navegador";
import { arquivosEscolhidos, metaArquivo, problemaArquivo } from "@/lib/anexos-regras";
import { descontoTotal, formatarPercentual } from "@/lib/condicoes-pagamento-proposta";
import { formatarMesAno, formatarMoeda, lerNumeroBr } from "@/lib/formatacao";
import { MESES_ABREV, mediaDosMeses } from "@/lib/geracao-mensal";
import { percentualParaCampo } from "@/lib/percentual-exibicao";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { ResultadoAcao } from "@/lib/tipos";

type Opcao = { id: string; nome: string };

/**
 * Dados do negócio em duas partes, cada uma no seu cartão: "comercial" (Oportunidade) e "tecnico" (Conta de luz
 * e local, só energia solar). O servidor grava só a parte enviada. A etapa não é editada aqui: só pelo
 * "Mover etapa"/Kanban, que exige comentário e respeita o papel.
 */
export function EdicaoNegocio({
  secao,
  empresaId,
  negocio,
  origens,
  responsaveis,
  podeEditarValor = true,
  eletroposto = false,
  precoSugerido = null,
}: {
  secao: "comercial" | "tecnico";
  /** Empresa do negócio (pasta da fatura no Storage). */
  empresaId: string;
  negocio: {
    id: string;
    titulo: string;
    origemId: string | null;
    responsavelId: string | null;
    valor: number | null;
    descricao: string | null;
    tipoTelhado: string | null;
    enderecoInstalacao: string | null;
    unidadeConsumidora: string | null;
    padraoCliente: string | null;
    consumoMedioKwh: number | null;
    consumoEstimadoKwh: number | null;
    tarifaEfetivaKwh: number | null;
    valorContaEnergia: number | null;
    /** Autoconsumo (fração da geração); nulo = padrão residencial de 30%. */
    autoconsumoFracao: number | null;
    /** Consumo dos 12 meses (janeiro a dezembro), opcional; só para o gráfico da proposta. */
    consumoMensalKwh: number[] | null;
    /** Data prevista (AAAA-MM-DD) ou nula. */
    fechamentoPrevistoEm: string | null;
    /** Legado: mês previsto (AAAA-MM-01), de antes da data com dia. */
    fechamentoPrevisto: string | null;
  };
  origens: Opcao[];
  responsaveis: Opcao[];
  /** SDR não pode alterar o valor financeiro do negócio (spec RAION_SDR_REGRAS_PERMISSOES §39). */
  podeEditarValor?: boolean;
  /** Eletroposto: sem os campos de energia solar, e o valor fica opcional até o cliente escolher o modelo. */
  eletroposto?: boolean;
  /** Preço sugerido pela tabela de preços (Compras P4b/P4c), se o negócio tem. */
  precoSugerido?: number | null;
}) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoAcao>(null);
  const [pendente, iniciar] = useTransition();
  // Sem o reset automático, o arquivo escolhido ficaria no campo: limpa só ele depois que a fatura chega.
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
      if (!r?.ok || !fatura) {
        if (r?.ok) router.refresh();
        return setResultado(r);
      }
      const [falha] = await enviarArquivos(criarClienteNavegador(), registrarAnexo, { empresaId, negocioId: negocio.id }, [
        { arquivo: fatura, categoria: "fatura_gerador" },
      ]);
      router.refresh();
      if (falha) {
        // A fatura continua escolhida no campo: salvar de novo tenta outra vez (os dados não mudam).
        return setResultado({ ok: false, mensagem: `Dados salvos, mas a fatura não foi anexada (${falha}). Salve de novo para tentar outra vez.` });
      }
      setVersaoArquivo((v) => v + 1);
      setResultado({ ok: true, mensagem: "Salvo." });
    });
  }
  return (
    <form onSubmit={enviar} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="negocioId" value={negocio.id} />
      {secao === "comercial" ? (
        <>
          <div className="md:col-span-2">
            <Campo rotulo="Nome do negócio" name="titulo" defaultValue={negocio.titulo} required />
          </div>
          {responsaveis.length > 0 && (
            <Selecao rotulo="Responsável" name="responsavel_id" defaultValue={negocio.responsavelId ?? ""}>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
          )}
          <Selecao rotulo="Origem" name="origem_id" defaultValue={negocio.origemId ?? ""}>
            <option value="">Sem origem</option>
            {origens.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Selecao>
          <div className="flex flex-col gap-1">
            <Campo
              rotulo="Valor (R$)"
              name="valor"
              inputMode="decimal"
              required={!eletroposto}
              readOnly={!podeEditarValor}
              placeholder={eletroposto ? "Vazio até o cliente escolher o modelo" : undefined}
              defaultValue={negocio.valor != null ? String(negocio.valor).replace(".", ",") : ""}
            />
            {precoSugerido != null && (
              <p className="text-xs text-texto-2">
                Preço sugerido: <b className="tabular-nums">{formatarMoeda(precoSugerido)}</b>
                {negocio.valor != null && negocio.valor > 0 && negocio.valor < precoSugerido && (
                  <>
                    {" "}
                    · desconto de {formatarPercentual(descontoTotal(negocio.valor, negocio.valor, { precoSugerido }))}% (aprovação no{" "}
                    <a href="?aba=proposta#desconto" className="underline">
                      cartão Desconto
                    </a>
                    , se passar do seu limite)
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Campo rotulo="Data prevista de fechamento" name="fechamento_previsto_em" type="date" defaultValue={negocio.fechamentoPrevistoEm ?? ""} />
            {!negocio.fechamentoPrevistoEm && negocio.fechamentoPrevisto && (
              <p className="text-xs text-texto-2">Antes: previsto para {formatarMesAno(negocio.fechamentoPrevisto)}. Informe o dia.</p>
            )}
          </div>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium text-texto-2">Descrição</span>
            <textarea
              name="descricao"
              rows={3}
              defaultValue={negocio.descricao ?? ""}
              className="rounded-md border border-linha bg-superficie px-3 py-2 text-texto"
            />
          </label>
        </>
      ) : (
        <>
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
          <Campo
            rotulo="Tarifa efetiva da conta (R$/kWh, para estimar consumo)"
            name="tarifa_efetiva_kwh"
            inputMode="decimal"
            placeholder="ex.: 0,9500"
            defaultValue={negocio.tarifaEfetivaKwh != null ? String(negocio.tarifaEfetivaKwh).replace(".", ",") : ""}
          />
          <div className="flex flex-col gap-1">
            <Campo
              rotulo="Autoconsumo (% da geração)"
              name="autoconsumo_percentual"
              inputMode="decimal"
              placeholder="30"
              defaultValue={negocio.autoconsumoFracao != null ? percentualParaCampo(negocio.autoconsumoFracao) : ""}
            />
            <p className="text-xs text-texto-2">
              Parte da energia gerada que o cliente usa na hora, sem passar pela rede (chuveiro, ar ou geladeira durante o
              dia). Vazio vale 30%, o padrão residencial. Ao mudar, o cálculo do kit fica desatualizado até recalcular.
            </p>
          </div>
          <ConsumoMesAMes inicial={negocio.consumoMensalKwh} consumoMedio={negocio.consumoMedioKwh} />
          <Campo rotulo="Unidade consumidora" name="unidade_consumidora" defaultValue={negocio.unidadeConsumidora ?? ""} />
          {negocio.consumoEstimadoKwh != null && (
            <p role="status" className="text-xs text-amber-800 md:col-span-2">
              Consumo estimado pela conta: {negocio.consumoEstimadoKwh.toLocaleString("pt-BR")} kWh/mês. Informar os kWh reais
              substitui a estimativa; alterar a conta ou a tarifa efetiva recalcula a estimativa ao salvar.
            </p>
          )}
          <Campo rotulo="Padrão do cliente" name="padrao_cliente" defaultValue={negocio.padraoCliente ?? ""} />
          <Campo
            rotulo="Tipo do telhado"
            name="tipo_telhado"
            placeholder="Ex.: cerâmico, metálico, laje, solo"
            defaultValue={negocio.tipoTelhado ?? ""}
          />
          <div className="flex flex-col gap-1 md:col-span-2">
            <Campo
              rotulo="Endereço da instalação"
              name="endereco_instalacao"
              maxLength={300}
              placeholder="Deixe vazio se for o endereço do cliente"
              defaultValue={negocio.enderecoInstalacao ?? ""}
            />
            <p className="text-xs text-texto-2">Vazio, o contrato usa o endereço do cliente. Preencha só quando a usina for em outro lugar.</p>
          </div>
          <div className="md:col-span-2">
            <CampoArquivo key={versaoArquivo} rotulo="Fatura de energia (opcional)" name="anexo_fatura_energia" accept="image/*,.pdf" />
          </div>
        </>
      )}
      <div className="flex items-center gap-3 md:col-span-2">
        <Botao type="submit" disabled={pendente}>
          Salvar
        </Botao>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

/**
 * Consumo mês a mês (proposta completa, PR 4; prévia aprovada em 25/11/2026): os 12 meses da fatura, opcionais, só para
 * o gráfico "Geração e consumo mês a mês" da proposta. Campos `consumo_mes_01`…`12`; 12 ou nenhum (o servidor confere).
 */
function ConsumoMesAMes({ inicial, consumoMedio }: { inicial: number[] | null; consumoMedio: number | null }) {
  const [valores, setValores] = useState<string[]>(() => MESES_ABREV.map((_, i) => (inicial?.[i] != null ? String(inicial[i]).replace(".", ",") : "")));
  const numeros = valores.map((v) => lerNumeroBr(v));
  const completos = numeros.every((n) => n != null && n >= 0) ? (numeros as number[]) : null;
  return (
    <fieldset data-testid="consumo-mes-a-mes" className="flex flex-col gap-3 rounded-xl border border-dourado bg-dourado/10 p-4 md:col-span-2">
      <legend className="sr-only">Consumo mês a mês (kWh)</legend>
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        <p className="text-sm font-semibold text-texto">Consumo mês a mês (kWh)</p>
        <span className="rounded-full bg-dourado/25 px-2.5 py-0.5 text-xs font-medium text-texto">Novo</span>
        <span className="rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs font-medium text-texto-2">opcional</span>
      </div>
      <p className="text-xs leading-relaxed text-texto-2">
        Copie o histórico de 12 meses da fatura. Serve só para o gráfico &quot;Geração e consumo mês a mês&quot; da proposta;
        economia e retorno continuam pelo consumo médio. Preencha os 12 ou deixe todos vazios (mês sem consumo = 0).
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {MESES_ABREV.map((mes, i) => (
          <label key={mes} className="flex flex-col gap-1 text-xs font-semibold text-texto-2">
            {mes}
            <input
              name={`consumo_mes_${String(i + 1).padStart(2, "0")}`}
              inputMode="decimal"
              value={valores[i]}
              onChange={(ev) => setValores((v) => v.map((x, j) => (j === i ? ev.target.value : x)))}
              className="min-h-11 w-full rounded-lg border border-linha bg-superficie px-2.5 text-base tabular-nums text-texto"
            />
          </label>
        ))}
      </div>
      {completos && (
        <p data-testid="consumo-mes-a-mes-media" className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-superficie px-3 py-2 text-sm text-texto-2">
          <span>
            Média dos 12 meses: <b className="tabular-nums text-texto">{mediaDosMeses(completos).toLocaleString("pt-BR")} kWh</b>
          </span>
          {consumoMedio != null && (
            <span>
              Consumo médio informado: <b className="tabular-nums text-texto">{Number(consumoMedio).toLocaleString("pt-BR")} kWh</b>
            </span>
          )}
        </p>
      )}
    </fieldset>
  );
}
