"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { EditorComponentesKit, linhasParaComponentes, type LinhaComponente } from "@/components/kit-componentes";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { buscarContatos, criarNegocio, verificarDuplicado, type Duplicado } from "@/lib/acoes/negocios";
import { calcular, DISPONIBILIDADE_PADRAO_CAMEL, potenciaKitPersonalizadoKwp } from "@/lib/calculadora";
import { formatarMoeda } from "@/lib/formatacao";
import { ROTULO_TIPO_LIGACAO, TIPOS_LIGACAO, type TipoLigacao } from "@/lib/tipos";

type Opcao = { id: string; nome: string };
type ContatoEncontrado = { id: string; nome: string; telefone: string | null; email: string | null };
type Parametros = {
  produtividadeKwhKwpMes: number;
  percentualFioB: number;
  disponibilidadeMonoKwh: number;
  disponibilidadeBiKwh: number;
  disponibilidadeTriKwh: number;
};

/** Aceita "450", "450,5" e "1.234,56"; string vazia ou inválida vira null. */
function numero(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function FormularioNegocio({
  funilId,
  origens,
  responsaveis,
  meuMembroId,
  parametros,
}: {
  funilId: string;
  origens: Opcao[];
  /** Vazio quando quem cria é vendedor: ele sempre fica como responsável. */
  responsaveis: Opcao[];
  meuMembroId: string;
  parametros: Parametros | null;
}) {
  const [resultado, acao, pendente] = useActionState(criarNegocio, null);
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [contato, setContato] = useState<ContatoEncontrado | null>(null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<ContatoEncontrado[]>([]);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [, iniciar] = useTransition();

  // Passo 1 (negócio): a calculadora roda no backend a partir daqui — sem
  // aparecer como um passo separado. Potência, consumo e tarifa ficam no
  // negócio, não no contato (que é só dado pessoal/residência do cliente).
  const [valor, setValor] = useState("");
  const [tipoLigacao, setTipoLigacao] = useState<TipoLigacao>("trifasico");
  const [consumoMedioKwh, setConsumoMedioKwh] = useState("");
  const [valorFaturaMedio, setValorFaturaMedio] = useState("");
  const [tarifaKwh, setTarifaKwh] = useState("");

  // Passo 3 (depois de "Avançar"): personalização do kit.
  const [mostrarKit, setMostrarKit] = useState(false);
  const [linhas, setLinhas] = useState<LinhaComponente[]>([]);
  const [estruturaTelhado, setEstruturaTelhado] = useState("");

  const componentes = useMemo(() => linhasParaComponentes(linhas), [linhas]);
  const potenciaKwp = potenciaKitPersonalizadoKwp(componentes);

  const previa = useMemo(() => {
    const tarifa = numero(tarifaKwh);
    const consumo = numero(consumoMedioKwh);
    const fatura = numero(valorFaturaMedio);
    const precoKit = numero(valor);
    if (!parametros || potenciaKwp <= 0 || !tarifa || (!consumo && !fatura)) return null;
    const consumoMedioFinal = consumo ?? fatura! / tarifa;
    return calcular({
      potenciaKwp,
      precoKit: precoKit ?? 0,
      tipoLigacao,
      consumoMedioKwh: consumoMedioFinal,
      tarifaKwh: tarifa,
      produtividadeKwhKwpMes: parametros.produtividadeKwhKwpMes,
      percentualFioB: parametros.percentualFioB,
      disponibilidadeKwh: parametros[DISPONIBILIDADE_PADRAO_CAMEL[tipoLigacao]],
    });
  }, [parametros, tipoLigacao, consumoMedioKwh, valorFaturaMedio, tarifaKwh, potenciaKwp, valor]);

  function pesquisar(termo: string) {
    setBusca(termo);
    iniciar(async () => setEncontrados(await buscarContatos(termo)));
  }

  function conferirDuplicado(form: HTMLFormElement) {
    const tel = (form.elements.namedItem("contato_telefone") as HTMLInputElement)?.value ?? "";
    const email = (form.elements.namedItem("contato_email") as HTMLInputElement)?.value ?? "";
    if (tel.replace(/\D/g, "").length < 8 && !email.includes("@")) return setDuplicados([]);
    iniciar(async () => setDuplicados(await verificarDuplicado(tel, email)));
  }

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="funil_id" value={funilId} />
      <input type="hidden" name="tipo_ligacao" value={tipoLigacao} />
      <input type="hidden" name="componentes" value={JSON.stringify(componentes)} />

      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-zinc-900">Negócio</legend>
        <Selecao rotulo="Origem" name="origem_id" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {origens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Selecao>
        {responsaveis.length > 0 && (
          <Selecao rotulo="Responsável" name="responsavel_id" defaultValue={meuMembroId}>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        )}
        <Campo rotulo="Nome do negócio" name="titulo" placeholder="Ex.: Residência 5 kWp" required />
        <Campo
          rotulo="Valor estimado (R$)"
          name="valor"
          inputMode="decimal"
          placeholder="Opcional"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <Campo
          rotulo="Consumo médio (12 meses, kWh)"
          name="consumo_medio_kwh"
          inputMode="decimal"
          placeholder="ex.: 450"
          value={consumoMedioKwh}
          onChange={(e) => setConsumoMedioKwh(e.target.value)}
        />
        <Campo
          rotulo="Ou valor médio da fatura (R$)"
          name="valor_fatura_medio"
          inputMode="decimal"
          placeholder="ex.: 450,00"
          value={valorFaturaMedio}
          onChange={(e) => setValorFaturaMedio(e.target.value)}
        />
        <Campo
          rotulo="Tarifa (R$/kWh)"
          name="tarifa_kwh"
          inputMode="decimal"
          placeholder="ex.: 0,95"
          value={tarifaKwh}
          onChange={(e) => setTarifaKwh(e.target.value)}
        />
        <Selecao
          rotulo="Tipo de ligação"
          value={tipoLigacao}
          onChange={(e) => setTipoLigacao(e.target.value as TipoLigacao)}
        >
          {TIPOS_LIGACAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_LIGACAO[t]}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Unidade consumidora" name="unidade_consumidora" placeholder="Opcional" />
        <Campo rotulo="Padrão do cliente" name="padrao_cliente" placeholder="Opcional" />
        <Campo rotulo="Tipo do telhado" name="tipo_telhado" placeholder="Ex.: cerâmico, metálico, laje, solo" />
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">CNH (opcional)</span>
          <input type="file" name="anexo_cnh_negocio" accept="image/*,.pdf" className="text-sm" />
        </div>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-zinc-700">Descrição</span>
          <textarea name="descricao" rows={2} className="rounded-md border border-zinc-300 px-3 py-2" />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold text-zinc-900">Contato</legend>
        <div className="flex gap-2">
          <Botao type="button" variante={modo === "novo" ? "primario" : "secundario"} onClick={() => setModo("novo")}>
            Novo contato
          </Botao>
          <Botao
            type="button"
            variante={modo === "existente" ? "primario" : "secundario"}
            onClick={() => setModo("existente")}
          >
            Contato existente
          </Botao>
        </div>

        {modo === "existente" ? (
          <div className="flex flex-col gap-2">
            {contato ? (
              <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <span>
                  <strong>{contato.nome}</strong> {contato.telefone ?? contato.email}
                </span>
                <button type="button" className="text-zinc-600 hover:underline" onClick={() => setContato(null)}>
                  Trocar
                </button>
                <input type="hidden" name="contato_id" value={contato.id} />
              </div>
            ) : (
              <>
                <Campo
                  rotulo="Buscar por nome, telefone ou e-mail"
                  value={busca}
                  onChange={(e) => pesquisar(e.target.value)}
                />
                <ul className="flex flex-col">
                  {encontrados.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setContato(c)}
                        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                      >
                        <strong>{c.nome}</strong> <span className="text-zinc-500">{c.telefone ?? c.email}</span>
                      </button>
                    </li>
                  ))}
                  {busca.length >= 2 && !encontrados.length && (
                    <li className="px-3 py-2 text-sm text-zinc-500">Nenhum contato encontrado.</li>
                  )}
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Selecao rotulo="Tipo" name="contato_tipo" defaultValue="pf">
              <option value="pf">Pessoa física</option>
              <option value="pj">Empresa</option>
            </Selecao>
            <Campo rotulo="Nome / razão social" name="contato_nome" required />
            <Campo
              rotulo="Telefone / WhatsApp"
              name="contato_telefone"
              type="tel"
              onBlur={(e) => conferirDuplicado(e.currentTarget.form!)}
            />
            <Campo
              rotulo="E-mail"
              name="contato_email"
              type="email"
              onBlur={(e) => conferirDuplicado(e.currentTarget.form!)}
            />
            <div className="md:col-span-2">
              <Campo rotulo="Endereço" name="contato_endereco" placeholder="Rua, número, bairro" />
            </div>
            {duplicados.map((d) => (
              <div key={d.contatoId} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2">
                {d.visivel ? (
                  <>
                    Já existe o contato <strong>{d.nome}</strong> com esses dados.{" "}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => {
                        setContato({ id: d.contatoId, nome: d.nome, telefone: null, email: null });
                        setModo("existente");
                      }}
                    >
                      Usar este contato
                    </button>
                  </>
                ) : (
                  <>
                    Esse telefone ou e-mail já é de um cliente
                    {d.responsavel ? (
                      <>
                        {" "}
                        de <strong>{d.responsavel}</strong>
                      </>
                    ) : null}
                    . Fale com o seu gestor antes de seguir.
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">CNH / documento do cliente (opcional)</span>
            <input type="file" name="anexo_cnh_contato" accept="image/*,.pdf" className="text-sm" />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Fatura do gerador (opcional)</span>
            <input type="file" name="anexo_fatura_gerador" accept="image/*,.pdf" className="text-sm" />
          </div>
          <div className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium text-zinc-700">Fatura dos beneficiários (quando aplicável)</span>
            <input type="file" name="anexo_fatura_beneficiario" accept="image/*,.pdf" multiple className="text-sm" />
          </div>
        </div>
      </fieldset>

      {!mostrarKit && (
        <Botao type="button" onClick={() => setMostrarKit(true)} className="self-start">
          Avançar
        </Botao>
      )}

      {mostrarKit && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-zinc-900">Kit personalizado</legend>
          <EditorComponentesKit linhas={linhas} onChange={setLinhas} />
          <Campo
            rotulo="Estrutura do telhado"
            name="estrutura_telhado"
            value={estruturaTelhado}
            onChange={(e) => setEstruturaTelhado(e.target.value)}
            placeholder="Ex.: perfil de alumínio, gancho"
          />
          {previa && (
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm md:grid-cols-4">
              <div>
                <dt className="text-zinc-500">Potência do kit</dt>
                <dd className="font-medium text-zinc-900">{potenciaKwp.toLocaleString("pt-BR")} kWp</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Geração estimada</dt>
                <dd className="font-medium text-zinc-900">{previa.geracaoEstimadaKwhMes.toLocaleString("pt-BR")} kWh/mês</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Economia estimada</dt>
                <dd className="font-medium text-green-700">{formatarMoeda(previa.economiaMensal)}/mês</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Payback estimado</dt>
                <dd className="font-medium text-zinc-900">
                  {previa.paybackMeses != null ? `${previa.paybackMeses.toLocaleString("pt-BR")} meses` : "—"}
                </dd>
              </div>
            </dl>
          )}

          <Mensagem resultado={resultado} />
          <Botao type="submit" disabled={pendente || (modo === "existente" && !contato)} className="self-start">
            {pendente ? "Salvando..." : "Salvar negócio"}
          </Botao>
        </fieldset>
      )}
    </form>
  );
}
