"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Botao, CLASSE_ENTRADA, Mensagem } from "@/components/ui";
import { criarMaterialCompra, editarMaterialCompra, lancarPrecoCompra } from "@/lib/acoes/compras-precos";
import { CATEGORIAS_MATERIAL, ROTULO_CATEGORIA_MATERIAL, type CategoriaMaterial, type MaterialVM } from "@/lib/compras/precos";
import { lerNumeroBr } from "@/lib/formatacao";
import type { ResultadoAcao } from "@/lib/tipos";

/** Cadastrar ou editar material (nome, categoria e unidade). O banco valida de novo. */
export function FormularioMaterial({ material }: { material?: MaterialVM }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dados = {
      nome: String(f.get("nome") ?? ""),
      categoria: String(f.get("categoria") ?? "") as CategoriaMaterial,
      unidade: String(f.get("unidade") ?? ""),
    };
    setEnviando(true);
    setResultado(null);
    if (material) {
      const r = await editarMaterialCompra({ ...dados, materialId: material.id });
      setResultado(r);
      if (r?.ok) router.refresh();
    } else {
      const r = await criarMaterialCompra(dados);
      setResultado(r);
      if (r?.ok && r.id) router.push(`/compras/precos/material/${r.id}`);
    }
    setEnviando(false);
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_7rem]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Nome</span>
          <input name="nome" required minLength={2} maxLength={120} defaultValue={material?.nome} placeholder="Ex.: Módulo 550 W" className={CLASSE_ENTRADA} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Categoria</span>
          <select name="categoria" defaultValue={material?.categoria ?? "outros"} className={CLASSE_ENTRADA}>
            {CATEGORIAS_MATERIAL.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA_MATERIAL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Unidade</span>
          <input name="unidade" required maxLength={20} defaultValue={material?.unidade ?? "un"} className={CLASSE_ENTRADA} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando..." : material ? "Salvar material" : "Cadastrar material"}
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}

/** Preço lançado à mão (fornecedor que não manda tabela): entra no histórico como "lançado à mão". */
export function FormularioPrecoManual({ materialId, fornecedores, hoje }: { materialId: string; fornecedores: string[]; hoje: string }) {
  const id = useId();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAcao>(null);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const preco = lerNumeroBr(String(f.get("preco") ?? ""));
    if (preco == null || Number.isNaN(preco)) {
      setResultado({ ok: false, mensagem: "Confira o preço (ex.: 1.234,56)." });
      return;
    }
    setEnviando(true);
    setResultado(null);
    const r = await lancarPrecoCompra({
      materialId,
      fornecedor: String(f.get("fornecedor") ?? ""),
      preco,
      data: String(f.get("data") ?? ""),
      codigo: String(f.get("codigo") ?? ""),
    });
    setEnviando(false);
    setResultado(r);
    if (r?.ok) {
      form.reset();
      router.refresh();
    }
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Fornecedor</span>
          <input name="fornecedor" required minLength={2} maxLength={120} list={`${id}-fornecedores`} autoComplete="off" className={CLASSE_ENTRADA} />
          <datalist id={`${id}-fornecedores`}>
            {fornecedores.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Preço de custo (R$)</span>
          <input name="preco" required inputMode="decimal" placeholder="0,00" className={`${CLASSE_ENTRADA} tabular-nums`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Data do preço</span>
          <input name="data" type="date" required max={hoje} defaultValue={hoje} className={CLASSE_ENTRADA} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-texto-2">Código no fornecedor (opcional)</span>
          <input name="codigo" maxLength={60} className={CLASSE_ENTRADA} />
        </label>
      </div>
      <div>
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Lançando..." : "Lançar preço"}
        </Botao>
      </div>
      <Mensagem resultado={resultado} />
    </form>
  );
}
