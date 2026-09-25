"use client";

import { useActionState, useState, useTransition } from "react";
import { Botao, Campo, Mensagem, Selecao } from "@/components/ui";
import { buscarContatos, criarNegocio, verificarDuplicado, type Duplicado } from "@/lib/acoes/negocios";

type Opcao = { id: string; nome: string };
type ContatoEncontrado = { id: string; nome: string; telefone: string | null; email: string | null };

export function FormularioNegocio({
  funilId,
  origens,
  responsaveis,
  meuMembroId,
}: {
  funilId: string;
  origens: Opcao[];
  /** Vazio quando quem cria é vendedor: ele sempre fica como responsável. */
  responsaveis: Opcao[];
  meuMembroId: string;
}) {
  const [resultado, acao, pendente] = useActionState(criarNegocio, null);
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [contato, setContato] = useState<ContatoEncontrado | null>(null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<ContatoEncontrado[]>([]);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [, iniciar] = useTransition();

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
        <Campo rotulo="Valor estimado (R$)" name="valor" inputMode="decimal" placeholder="Opcional" />
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
      </fieldset>

      <Mensagem resultado={resultado} />
      <Botao type="submit" disabled={pendente || (modo === "existente" && !contato)} className="self-start">
        {pendente ? "Salvando..." : "Salvar negócio"}
      </Botao>
    </form>
  );
}
