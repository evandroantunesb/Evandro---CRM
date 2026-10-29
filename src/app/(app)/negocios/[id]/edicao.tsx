"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CampoArquivo } from "@/components/campo-arquivo";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { registrarAnexo } from "@/lib/acoes/anexos";
import { editarNegocio } from "@/lib/acoes/negocios";
import { enviarArquivos } from "@/lib/anexos-navegador";
import { arquivosEscolhidos, metaArquivo, problemaArquivo } from "@/lib/anexos-regras";
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
    unidadeConsumidora: string | null;
    padraoCliente: string | null;
    consumoMedioKwh: number | null;
    consumoEstimadoKwh: number | null;
    tarifaEfetivaKwh: number | null;
    valorContaEnergia: number | null;
    /** AAAA-MM-01 ou nulo. */
    fechamentoPrevisto: string | null;
  };
  origens: Opcao[];
  responsaveis: Opcao[];
  /** SDR não pode alterar o valor financeiro do negócio (spec RAION_SDR_REGRAS_PERMISSOES §39). */
  podeEditarValor?: boolean;
  /** Eletroposto: sem os campos de energia solar, e o valor fica opcional até o cliente escolher o modelo. */
  eletroposto?: boolean;
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
          <Campo
            rotulo="Valor (R$)"
            name="valor"
            inputMode="decimal"
            required={!eletroposto}
            readOnly={!podeEditarValor}
            placeholder={eletroposto ? "Vazio até o cliente escolher o modelo" : undefined}
            defaultValue={negocio.valor != null ? String(negocio.valor).replace(".", ",") : ""}
          />
          <MesPrevisto inicial={negocio.fechamentoPrevisto?.slice(0, 7) ?? ""} />
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

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Mês e ano em duas listas, em vez do `type="month"` (que no Firefox e no Safari vira um texto "aaaa-mm").
 * Envia AAAA-MM no mesmo campo de antes; mês em branco limpa a previsão.
 */
function MesPrevisto({ inicial }: { inicial: string }) {
  const [ano, setAno] = useState(inicial.slice(0, 4));
  const [mes, setMes] = useState(inicial.slice(5, 7));
  const anoAtual = new Date().getFullYear();
  const primeiro = Math.min(anoAtual, Number(ano) || anoAtual);
  const anos = Array.from({ length: anoAtual + 3 - primeiro + 1 }, (_, i) => String(primeiro + i));
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-texto-2">Mês previsto de fechamento</legend>
      <input type="hidden" name="fechamento_previsto" value={ano && mes ? `${ano}-${mes}` : ""} />
      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
        <Selecao
          aria-label="Mês previsto"
          value={mes}
          onChange={(e) => {
            setMes(e.target.value);
            if (e.target.value && !ano) setAno(String(anoAtual));
          }}
        >
          <option value="">Sem previsão</option>
          {MESES.map((nome, i) => (
            <option key={nome} value={String(i + 1).padStart(2, "0")}>
              {nome}
            </option>
          ))}
        </Selecao>
        <Selecao aria-label="Ano previsto" value={ano} onChange={(e) => setAno(e.target.value)} disabled={!mes}>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Selecao>
      </div>
    </fieldset>
  );
}
